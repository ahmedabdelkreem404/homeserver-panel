// Sessions in SQLite. The browser holds a random 256-bit token; only its SHA-256 is stored.
// Idle timeout 12 h, absolute lifetime 7 days. Tokens are rotated whenever the stage or the password changes.
import crypto from "node:crypto";
import { sha256 } from "./secretbox.js";

export const IDLE_MS = 12 * 3600_000;
export const ABSOLUTE_MS = 7 * 24 * 3600_000;
const TOUCH_EVERY_MS = 60_000;

export function createSessions(db, { now = () => new Date() } = {}) {
  const at = () => now().getTime();
  const iso = ms => new Date(ms).toISOString();

  function create({ userId, stage, ip, userAgent }) {
    const token = crypto.randomBytes(32).toString("base64url");
    const publicId = crypto.randomBytes(8).toString("hex");
    db.prepare("INSERT INTO sessions (id_hash, public_id, user_id, stage, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(sha256(token), publicId, userId, stage, iso(at()), iso(at()), iso(at() + ABSOLUTE_MS), ip ?? null, String(userAgent ?? "").slice(0, 200) || null);
    return { token, publicId };
  }

  // Returns the live session row or null. Expired sessions are deleted on sight.
  function find(token) {
    if (typeof token !== "string" || token.length < 20) return null;
    const row = db.prepare("SELECT * FROM sessions WHERE id_hash = ?").get(sha256(token));
    if (!row) return null;
    const idleDead = at() - Date.parse(row.last_seen_at) > IDLE_MS;
    const absoluteDead = at() > Date.parse(row.expires_at);
    if (idleDead || absoluteDead) { db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(row.id_hash); return null; }
    if (at() - Date.parse(row.last_seen_at) > TOUCH_EVERY_MS) db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?").run(iso(at()), row.id_hash);
    return row;
  }

  // New token, same user, new stage: the old token stops working at once.
  function rotate(oldToken, { stage, ip, userAgent }) {
    const old = db.prepare("SELECT user_id FROM sessions WHERE id_hash = ?").get(sha256(oldToken));
    if (!old) return null;
    db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha256(oldToken));
    return create({ userId: old.user_id, stage, ip, userAgent });
  }

  return {
    create, find, rotate,
    destroy: token => db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha256(token)),
    list: userId => db.prepare("SELECT public_id, stage, created_at, last_seen_at, expires_at, ip, user_agent, id_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId),
    revoke: (userId, publicId) => Number(db.prepare("DELETE FROM sessions WHERE user_id = ? AND public_id = ?").run(userId, publicId).changes),
    revokeOthers: (userId, keepToken) => Number(db.prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?").run(userId, sha256(keepToken)).changes),
    revokeAll: userId => Number(db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes),
    count: () => Number(db.prepare("SELECT count(*) AS n FROM sessions").get().n),
  };
}
