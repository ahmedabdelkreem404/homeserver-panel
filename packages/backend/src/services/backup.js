// Daily online backups of the panel database (SQLite backup API: safe while the panel keeps writing).
// Files live in <data dir>/backups, owner-only, and only the newest `keep` are retained.
import fs from "node:fs";
import path from "node:path";
import { backup } from "node:sqlite";

const FILE = /^panel-(\d{8})-\d{6}\.db$/;
const pad = n => String(n).padStart(2, "0");
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

export function createBackups({ db, dir, keep = 7, now = () => new Date(), intervalMs = 3_600_000 }) {
  let timer;

  function list() {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => FILE.test(f)).sort().reverse().map(file => {
      const st = fs.statSync(path.join(dir, file));
      return { file, size: st.size, at: st.mtime.toISOString() };
    });
  }

  async function run() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = `panel-${stamp(now())}.db`;
    const target = path.join(dir, file), partial = `${target}.part`;
    await backup(db, partial);
    fs.chmodSync(partial, 0o600);
    fs.renameSync(partial, target);
    for (const old of list().slice(keep)) fs.rmSync(path.join(dir, old.file), { force: true });
    return { file, path: target, size: fs.statSync(target).size };
  }

  // One backup per UTC day: the check runs hourly, the work only when today has none yet.
  async function runIfDue() {
    const today = stamp(now()).slice(0, 8);
    if (list().some(b => FILE.exec(b.file)[1] === today)) return null;
    return run();
  }

  return {
    list, run, runIfDue,
    start() {
      if (timer) return;
      runIfDue().catch(() => {});
      timer = setInterval(() => { runIfDue().catch(() => {}); }, intervalMs);
      timer.unref();
    },
    stop() { clearInterval(timer); timer = undefined; },
  };
}
