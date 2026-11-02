// Audit log: one row per mutating call. begin() writes a 'pending' row BEFORE the call, finish() sets the outcome,
// so a crash in between still leaves exactly one row. Retention: 90 days and at most 50,000 rows.
import { scrub } from "./redact.js";

export function createAudit(db, { retentionDays = 90, maxRows = 50_000, now = () => new Date(), pruneEvery = 100 } = {}) {
  const insert = db.prepare("INSERT INTO audit_log (at, actor, action, target, result, detail) VALUES (?, ?, ?, ?, 'pending', NULL)");
  const update = db.prepare("UPDATE audit_log SET result = ?, detail = ? WHERE id = ?");
  const byAge = db.prepare("DELETE FROM audit_log WHERE at < ?");
  const countAll = db.prepare("SELECT count(*) AS n FROM audit_log");
  const byCount = db.prepare("DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log ORDER BY id ASC LIMIT ?)");
  let sinceLastPrune = 0;

  function prune() {
    const cutoff = new Date(now().getTime() - retentionDays * 86_400_000).toISOString();
    let removed = Number(byAge.run(cutoff).changes);
    const over = Number(countAll.get().n) - maxRows;
    if (over > 0) removed += Number(byCount.run(over).changes);
    return removed;
  }
  prune();

  return {
    begin({ actor, action, target }) {
      if (++sinceLastPrune >= pruneEvery) { sinceLastPrune = 0; prune(); }
      return Number(insert.run(now().toISOString(), String(actor), String(action), target == null ? null : String(target)).lastInsertRowid);
    },
    finish(id, result, detail) {
      update.run(result, detail === undefined ? null : JSON.stringify(scrub(detail)), id);
    },
    list({ limit = 100 } = {}) {
      return db.prepare("SELECT id, at, actor, action, target, result, detail FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
    },
    prune,
    count: () => Number(countAll.get().n),
  };
}
