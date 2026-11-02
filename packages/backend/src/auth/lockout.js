// Login throttling with backoff. Failures are counted per account (5) and per IP (20) over 15 minutes. Once over
// the limit, the lock lasts 1, 2, 4 ... up to 60 minutes after the latest failure. Unknown emails are counted
// like known ones, so the answer never tells whether an account exists.
export const WINDOW_MS = 15 * 60_000;
export const LIMITS = Object.freeze({ account: 5, ip: 20 });

export function createLockout(db, { now = () => new Date() } = {}) {
  const t = () => now().getTime();

  function status(scope, key) {
    const since = new Date(t() - WINDOW_MS).toISOString();
    const rows = db.prepare("SELECT at FROM auth_failures WHERE scope = ? AND key = ? AND at >= ? ORDER BY at DESC").all(scope, key, since);
    const over = rows.length - LIMITS[scope];
    if (over < 0) return { locked: false, retryAfterSec: 0, failures: rows.length };
    const lockMs = Math.min(60, 2 ** over) * 60_000;
    const until = Date.parse(rows[0].at) + lockMs;
    return until > t() ? { locked: true, retryAfterSec: Math.ceil((until - t()) / 1000), failures: rows.length } : { locked: false, retryAfterSec: 0, failures: rows.length };
  }

  return {
    status,
    // Locked if either the account or the IP is locked; the longer wait is reported.
    check(ip, email) {
      const a = status("account", email), i = status("ip", ip);
      return { locked: a.locked || i.locked, retryAfterSec: Math.max(a.retryAfterSec, i.retryAfterSec) };
    },
    recordFailure(ip, email) {
      const insert = db.prepare("INSERT INTO auth_failures (scope, key, at) VALUES (?, ?, ?)");
      insert.run("account", email, now().toISOString());
      insert.run("ip", ip, now().toISOString());
    },
    clearAccount: email => db.prepare("DELETE FROM auth_failures WHERE scope = 'account' AND key = ?").run(email),
    prune() { db.prepare("DELETE FROM auth_failures WHERE at < ?").run(new Date(t() - 24 * 3600_000).toISOString()); },
  };
}
