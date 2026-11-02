import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { authApp, Browser, firstLogin } from "./auth-helpers.js";
import { migrate, openDatabase } from "../src/db.js";
import { createBackups } from "../src/services/backup.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "panel-backup-"));
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

function sourceDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  db.prepare("INSERT INTO audit_log (at, actor, action, target, result, detail) VALUES (?, ?, ?, ?, ?, ?)").run("2026-11-02T10:00:00Z", "t", "probe", null, "ok", "{}");
  return db;
}

test("a backup is a consistent copy of the live database, owner-only, with the newest seven kept", async () => {
  const dir = tmp(), clock = { t: Date.parse("2026-11-02T03:00:00Z") };
  const backups = createBackups({ db: sourceDb(), dir, now: () => new Date(clock.t), keep: 7 });
  const first = await backups.run();
  assert.match(first.file, /^panel-20261102-030000\.db$/);
  assert.equal(fs.readFileSync(first.path).subarray(0, 16).compare(SQLITE_MAGIC), 0);
  if (process.platform !== "win32") assert.equal(fs.statSync(first.path).mode & 0o777, 0o600);
  const copy = new DatabaseSync(first.path, { readOnly: true });
  assert.equal(copy.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'probe'").get().n, 1);
  copy.close();
  for (let i = 1; i <= 9; i++) { clock.t += 86_400_000; await backups.run(); }
  const names = backups.list().map(b => b.file);
  assert.equal(names.length, 7);
  assert.equal(names[0], "panel-20261111-030000.db", "newest first");
  assert.ok(!fs.readdirSync(dir).some(f => f.endsWith(".part")), "no half-written file is left behind");
});

test("the daily job makes one backup per day and none while today already has one", async () => {
  const dir = tmp(), clock = { t: Date.parse("2026-11-02T01:00:00Z") };
  const backups = createBackups({ db: sourceDb(), dir, now: () => new Date(clock.t) });
  assert.ok(await backups.runIfDue());
  clock.t += 5 * 3_600_000;
  assert.equal(await backups.runIfDue(), null);
  clock.t += 24 * 3_600_000;
  assert.ok(await backups.runIfDue());
  assert.equal(backups.list().length, 2);
  assert.deepEqual(createBackups({ db: sourceDb(), dir: path.join(dir, "missing") }).list(), []);
});

test("the download route: needs a full session, makes a fresh backup, streams the database and is audited", async () => {
  const dir = tmp();
  const ctx = await authApp({ env: { DATA_DIR: dir } });
  const anonymous = await new Browser(ctx.app).get("/api/settings/backup");
  assert.equal(anonymous.status, 401);
  assert.equal((await new Browser(ctx.app).get("/api/settings/backups")).status, 401);

  const { browser } = await firstLogin(ctx.app, ctx.clock);
  const res = await ctx.app.inject({ method: "GET", url: "/api/settings/backup", headers: { cookie: browser.cookieHeader() } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-disposition"], /^attachment; filename="panel-\d{8}-\d{6}\.db"$/);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.rawPayload.subarray(0, 16).compare(SQLITE_MAGIC), 0);

  const list = await browser.get("/api/settings/backups");
  assert.equal(list.body.backups.length, 1);
  assert.deepEqual(Object.keys(list.body.backups[0]).sort(), ["at", "file", "size"], "names and sizes only, never a path");
  const audit = await browser.get("/api/audit?action=backup");
  assert.ok(audit.body.items.some(r => r.action === "backup.download" && r.result === "ok"));
  fs.rmSync(dir, { recursive: true, force: true });
});
