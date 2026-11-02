// SQLite through node:sqlite (D9): WAL, synchronous=NORMAL (the library default FULL is about 35x slower for
// autocommit writes), busy_timeout=5000, plus a tiny versioned migration runner.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function openDatabase(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  return db;
}

export function readPragmas(db) {
  const one = name => Object.values(db.prepare(`PRAGMA ${name}`).get())[0];
  return { journal_mode: one("journal_mode"), synchronous: one("synchronous"), busy_timeout: one("busy_timeout"), foreign_keys: one("foreign_keys") };
}

// Files are named NNN_description.sql and applied once, in order, each inside a transaction.
export function migrate(db, dir = DEFAULT_MIGRATIONS_DIR) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const done = new Set(db.prepare("SELECT version FROM schema_migrations").all().map(r => r.version));
  const files = fs.readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (done.has(version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(version, file, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(version);
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
  return applied;
}
