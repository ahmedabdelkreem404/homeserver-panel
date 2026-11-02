// One deploy at a time on this machine (the server has little RAM).
import fs from "node:fs";
import path from "node:path";
import { HsError } from "./errors.js";

const STALE_MS = 30 * 60 * 1000;

const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

export function acquireLock(dir, { now = Date.now(), isAlive = alive } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "deploy.lock");
  const write = () => fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: now }), { flag: "wx" });
  try { write(); } catch (e) {
    if (e.code !== "EEXIST") throw e;
    let held = {};
    try { held = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* unreadable lock counts as stale */ }
    const stale = !held.pid || !isAlive(held.pid) || now - (held.startedAt ?? 0) > STALE_MS;
    if (!stale) throw new HsError("refused", `Another hsdeploy run is active (pid ${held.pid}). Wait for it to finish.`);
    fs.rmSync(file, { force: true });
    try { write(); } catch (e2) {
      if (e2.code === "EEXIST") throw new HsError("refused", "Another hsdeploy run just took the lock. Wait for it to finish.");
      throw e2;
    }
  }
  let released = false;
  const release = () => { if (!released) { released = true; fs.rmSync(file, { force: true }); } };
  process.once("exit", release);
  return release;
}
