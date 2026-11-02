import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { createAudit } from "../src/audit.js";
import { loadConfig } from "../src/config.js";
import { DEFAULT_MIGRATIONS_DIR, migrate, openDatabase, readPragmas } from "../src/db.js";
import { DokployClient } from "../src/dokploy-client.js";
import { PanelError, toHttpError } from "../src/errors.js";
import { createRedactingStream } from "../src/logger.js";
import { REDACTED, redactString, scrub } from "../src/redact.js";

const KEY = "dk-0123456789abcdef0123456789abcdef";
const SK = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test("config: defaults, validation by variable name, values never echoed", () => {
  const cfg = loadConfig({ DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SK });
  assert.equal(cfg.dokploy.url, "http://dokploy:3000");
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.dataDir, "./data");
  assert.throws(() => loadConfig({}), e => e.code === "config_invalid" && /DOKPLOY_API_KEY is required/.test(e.message));
  assert.throws(() => loadConfig({ DOKPLOY_API_KEY: "short" }), /too short/);
  const bad = { DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SK, DOKPLOY_URL: "http://evil.example.com", PORT: "99999", LOG_LEVEL: "loud", DOKPLOY_TIMEOUT_MS: "5" };
  assert.throws(() => loadConfig(bad), e => /DOKPLOY_URL/.test(e.message) && /PORT/.test(e.message) && /LOG_LEVEL/.test(e.message) && /DOKPLOY_TIMEOUT_MS/.test(e.message) && !e.message.includes(KEY));
  for (const ok of ["http://100.114.91.58:3000", "http://dokploy:3000", "http://127.0.0.1:3000", "https://dokploy.example.com"]) assert.doesNotThrow(() => loadConfig({ DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SK, DOKPLOY_URL: ok }), ok);
});

test("config: built-in protected names are always there and the environment can only add", () => {
  const cfg = loadConfig({ DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SK, PROTECTED_PROJECT_NAMES: " Extra-One ,,extra-two", PROTECTED_KEY_NAMES: "" });
  for (const n of ["infra", "mcp-gateway", "homeserver-panel", "extra-one", "extra-two"]) assert.ok(cfg.protectedProjectNames.has(n), n);
  for (const n of ["claude-code", "remote-test", "homeserver-panel", "deploy-cli"]) assert.ok(cfg.protectedKeyNames.has(n), n);
  assert.throws(() => { cfg.dokploy.key = "x"; }, TypeError, "config is frozen");
});

test("db: the three pragmas are applied and the database is in WAL mode", () => {
  const dir = tmp("panel-db-");
  try {
    const db = openDatabase(path.join(dir, "nested", "panel.db"));
    assert.deepEqual(readPragmas(db), { journal_mode: "wal", synchronous: 1, busy_timeout: 5000, foreign_keys: 1 });
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("migrations: applied once, in order, idempotent; a failing one rolls back", () => {
  const db = openDatabase(":memory:");
  assert.deepEqual(migrate(db), [1, 2, 3]);
  assert.deepEqual(migrate(db), [], "second run applies nothing");
  assert.equal(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n, 3);
  const dir = tmp("panel-mig-");
  try {
    fs.writeFileSync(path.join(dir, "001_ok.sql"), "CREATE TABLE a (x INTEGER);");
    fs.writeFileSync(path.join(dir, "002_bad.sql"), "CREATE TABLE b (x INTEGER); THIS IS NOT SQL;");
    const db2 = openDatabase(":memory:");
    assert.throws(() => migrate(db2, dir), /002_bad\.sql failed/);
    assert.equal(db2.prepare("SELECT count(*) AS n FROM schema_migrations").get().n, 1, "001 stays applied");
    assert.equal(db2.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'b'").get().n, 0, "002 left no table behind");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(fs.existsSync(path.join(DEFAULT_MIGRATIONS_DIR, "001_audit_log.sql")));
});

test("audit: rows are bounded by age (90 days) and by count (50,000), oldest first", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const t0 = new Date("2026-11-02T00:00:00Z");
  const insert = db.prepare("INSERT INTO audit_log (at, actor, action, result) VALUES (?, 'a', 'x', 'ok')");
  insert.run(new Date(t0.getTime() - 91 * 86_400_000).toISOString());
  insert.run(new Date(t0.getTime() - 89 * 86_400_000).toISOString());
  const audit = createAudit(db, { now: () => t0 });
  assert.equal(audit.count(), 1, "the 91-day-old row was pruned at startup");
  const small = createAudit(db, { now: () => t0, maxRows: 5, pruneEvery: 1 });
  for (let i = 0; i < 12; i++) small.finish(small.begin({ actor: "u", action: `act-${i}`, target: null }), "ok");
  assert.ok(small.count() <= 6, `kept ${small.count()} rows`);
  assert.equal(small.list({ limit: 1 })[0].action, "act-11", "the newest row survives");
});

test("audit: begin writes a pending row and finish sets the result; details are scrubbed", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const audit = createAudit(db);
  const id = audit.begin({ actor: "me", action: "application.delete", target: "applicationId=a1" });
  assert.equal(audit.list()[0].result, "pending");
  audit.finish(id, "ok", { token: "very-secret-token-value", owners: ["hs-demo"] });
  const row = audit.list()[0];
  assert.equal(row.result, "ok");
  assert.ok(!row.detail.includes("very-secret"));
  assert.match(row.detail, /hs-demo/);
});

test("redaction: field based, deep, with an allow list; value based, ignoring short strings", () => {
  const input = { a: { env: "X=1", buildArgs: "Y=2", nested: [{ password: "p", ok: "fine" }] }, key: "k", note: "hello" };
  assert.deepEqual(scrub(input), { a: { env: REDACTED, buildArgs: REDACTED, nested: [{ password: REDACTED, ok: "fine" }] }, key: REDACTED, note: "hello" });
  assert.equal(scrub(input, { allow: ["key"] }).key, "k");
  assert.equal(scrub({ env: "" }).env, "", "empty values are not marked");
  assert.equal(redactString(`token ${KEY} and ab`, [KEY, "ab"]), `token ${REDACTED} and ab`);
});

test("logger stream removes secret values from every line", () => {
  const out = [];
  const sink = new Writable({ write(c, _e, cb) { out.push(c.toString()); cb(); } });
  const stream = createRedactingStream([KEY], sink);
  stream.write(`{"msg":"calling with ${KEY}","again":"${KEY}"}\n`);
  assert.equal(out.join(""), `{"msg":"calling with ${REDACTED}","again":"${REDACTED}"}\n`);
});

test("client: key header, timeout, network failure and every status are mapped; the key never leaks", async () => {
  const keepAlive = setInterval(() => {}, 20); // AbortSignal.timeout timers are unref'd
  try {
    const mk = fetchImpl => new DokployClient({ url: "http://dokploy.test/", key: KEY, timeoutMs: 40, fetchImpl });
    let seen;
    const ok = mk(async (url, init) => { seen = { url: String(url), key: init.headers["x-api-key"] }; return new Response('{"a":1}', { status: 200 }); });
    assert.deepEqual(await ok.get("project.all", { x: "1" }), { a: 1 });
    assert.deepEqual(seen, { url: "http://dokploy.test/api/project.all?x=1", key: KEY });
    assert.equal(await mk(async () => new Response("", { status: 200 })).get("x.y"), null);

    const hang = mk((url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "TimeoutError" })))));
    await assert.rejects(hang.get("x.y"), e => e.code === "upstream_timeout" && e.status === 504 && !e.message.includes(KEY));
    const down = mk(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); });
    await assert.rejects(down.get("x.y"), e => e.code === "upstream_unreachable" && /ECONNREFUSED/.test(e.message) && !e.message.includes(KEY));

    for (const [status, code, http] of [[401, "upstream_auth_failed", 502], [403, "upstream_auth_failed", 502], [404, "upstream_not_found", 404], [500, "upstream_error", 502], [418, "upstream_error", 502]]) {
      const c = mk(async () => new Response("nope", { status }));
      await assert.rejects(c.get("x.y"), e => e.code === code && e.status === http && !e.message.includes(KEY), `HTTP ${status}`);
    }
  } finally { clearInterval(keepAlive); }
});

test("a Dokploy 401 becomes the panel's 502, never the panel's own 401", () => {
  const upstream = new PanelError("upstream_auth_failed", "Dokploy rejected the panel's key for user.get.");
  const { status, body } = toHttpError(upstream);
  assert.equal(status, 502);
  assert.equal(body.error.code, "upstream_auth_failed");
  assert.notEqual(toHttpError(new PanelError("policy_refused", "x")).status, 401);
  assert.equal(toHttpError(new Error("secret internals")).body.error.message, "Something went wrong.");
});
