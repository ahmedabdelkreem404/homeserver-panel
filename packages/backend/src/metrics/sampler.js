// A tiny sampler: once a minute it stores the byte counters of the physical interfaces (a few rows per minute,
// pruned after 40 days). "Today" totals are the sum of the increases since local midnight; a counter that went
// backwards means the server rebooted, so the new value counts as the increase.
import { parseNetDev } from "./parsers.js";

const PHYSICAL = /^(eth|en|em|wl)/;

export function startOfToday(now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = Math.round((asIfUtc - Math.floor(now.getTime() / 1000) * 1000) / 60_000) * 60_000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

export function sumIncreases(rows) {
  let rx = 0, tx = 0;
  for (let i = 1; i < rows.length; i++) {
    rx += rows[i].rx >= rows[i - 1].rx ? rows[i].rx - rows[i - 1].rx : rows[i].rx;
    tx += rows[i].tx >= rows[i - 1].tx ? rows[i].tx - rows[i - 1].tx : rows[i].tx;
  }
  return { rx, tx };
}

export function createNetSampler({ db, hostfs, now = () => new Date(), intervalMs = 60_000, retentionDays = 40 }) {
  const insert = db.prepare("INSERT INTO net_samples (at, iface, rx, tx) VALUES (?, ?, ?, ?)");
  let timer;

  function sampleOnce() {
    const devs = parseNetDev(hostfs.procNet("dev"));
    const at = now().toISOString();
    let n = 0;
    for (const [iface, c] of Object.entries(devs)) if (PHYSICAL.test(iface)) { insert.run(at, iface, c.rx, c.tx); n++; }
    return n;
  }
  function prune() { db.prepare("DELETE FROM net_samples WHERE at < ?").run(new Date(now().getTime() - retentionDays * 86_400_000).toISOString()); }

  return {
    sampleOnce, prune,
    start() { if (timer) return; sampleOnce(); timer = setInterval(() => { try { sampleOnce(); } catch { /* the next tick tries again */ } }, intervalMs); timer.unref(); setInterval(prune, 6 * 3600_000).unref(); },
    stop() { clearInterval(timer); timer = undefined; },
    // The row just before midnight is the baseline, so traffic around midnight is counted on the right day.
    today(iface, timeZone) {
      const start = startOfToday(now(), timeZone).toISOString();
      const before = db.prepare("SELECT rx, tx FROM net_samples WHERE iface = ? AND at < ? ORDER BY at DESC LIMIT 1").get(iface, start);
      const rows = db.prepare("SELECT rx, tx FROM net_samples WHERE iface = ? AND at >= ? ORDER BY at ASC").all(iface, start);
      return sumIncreases(before ? [before, ...rows] : rows);
    },
  };
}
