import test from "node:test";
import assert from "node:assert/strict";
import { authApp, firstLogin, Browser, OWNER_EMAIL } from "./auth-helpers.js";
import { clientConfigs, createMcp, newMcpPath } from "../src/services/mcp.js";
import { createAudit } from "../src/audit.js";
import { migrate, openDatabase } from "../src/db.js";
import { fakeDokploy, makeWorld } from "./helpers.js";

// Values that must never appear in any answer the panel gives: they are what the fake Dokploy holds as secrets.
const FORBIDDEN = ["hunter2-hunter2", "secretbuildarg", "refresh-token-value", "PROJECT_SECRET", "db-secret-secret", "LEAK=should-be-scrubbed", "OLDPATHOLDPATH", "DOKPLOY_MCP_HTTP_HOST", "npm_config_yes"];
const TS_ID = "ts-client-id-for-tests", TS_SECRET = "ts-client-secret-for-tests-0123456789";

// One fake for every outside host the panel talks to; each answer can be changed per test.
function fakeFetch(overrides = {}) {
  const calls = [];
  const state = { mcpHealthy: true, tsTokenStatus: 200, tsDevicesStatus: 200, offline: false, tokens: 0, ...overrides };
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const impl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? "GET", body: init.body ? String(init.body) : null, headers: init.headers ?? {} });
    if (state.offline) throw new TypeError("offline");
    if (u.endsWith("/oauth/token")) { state.tokens++; return state.tsTokenStatus === 200 ? json(200, { access_token: `tok-${state.tokens}`, expires_in: 3600 }) : json(state.tsTokenStatus, {}); }
    if (u.endsWith("/tailnet/-/devices")) return json(state.tsDevicesStatus, { devices: [
      { hostname: "homeserver", os: "linux", connectedToControl: true, lastSeen: "2026-11-02T10:00:00Z", addresses: ["100.114.91.58", "fd7a:115c::1"], tags: ["tag:server"], nodeKey: "nodekey:secret-node-key", user: "ahmed@example.com" },
      { hostname: "phone", os: "android", connectedToControl: false, lastSeen: "2026-11-01T08:00:00Z", addresses: ["100.64.0.2"], nodeKey: "nodekey:other", user: "ahmed@example.com" },
    ] });
    if (u.endsWith("/health")) return state.mcpHealthy ? json(200, { ok: true }) : json(503, { ok: false });
    if (u.includes("__down")) return { ok: true, body: (async function* () { yield new Uint8Array(1_000_000); })() };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { impl, calls, state };
}

async function owner(options = {}) {
  const fetchLog = fakeFetch(options.fetch);
  const ctx = await authApp({ ...options, fetchImpl: fetchLog.impl });
  const { browser } = await firstLogin(ctx.app, ctx.clock);
  const seen = [];
  const track = async (method, url, body) => { const r = await browser.send(method, url, { body }); seen.push(JSON.stringify(r.body)); return r; };
  return { ...ctx, audit: ctx.app.audit, browser, fetchLog, seen, track };
}
const noForbidden = (texts, extra = []) => { for (const t of texts) for (const f of [...FORBIDDEN, ...extra]) assert.ok(!t.includes(f), `an answer contained ${JSON.stringify(f)}`); };
const mutationsOf = ctx => ctx.client.calls.filter(c => c.method === "POST").map(c => c.procedure);

test("every new route exists in the route table and none answers without a session", async () => {
  const { app } = await authApp();
  const want = ["GET /api/projects", "GET /api/projects/apps/:id/state", "GET /api/projects/apps/:id/logs", "POST /api/projects/apps/:id/actions", "DELETE /api/projects/apps/:id", "DELETE /api/projects/:projectId", "GET /api/mcp/keys", "GET /api/mcp/url", "POST /api/mcp/keys", "DELETE /api/mcp/keys/:id", "POST /api/mcp/rotate-path", "GET /api/devices", "GET /api/server/status", "GET /api/server/containers", "GET /api/server/speedtest", "POST /api/server/speedtest", "GET /api/audit"];
  const table = new Set(app.routeTable.map(r => `${r.method} ${r.url}`));
  for (const w of want) assert.ok(table.has(w), `missing ${w}`);
  const anonymous = new Browser(app);
  for (const w of want) {
    const [method, url] = w.split(" ");
    const res = await anonymous.send(method, url.replace(":id", "app-abc123").replace(":projectId", "proj-abc123"), { body: method === "GET" ? undefined : {} });
    assert.ok([401, 403].includes(res.status), `${w} answered ${res.status} without a session`);
    assert.notEqual(res.status, 200);
  }
});

test("project list: usage and urls per app, protected flags, and no secret anywhere in the answer", async () => {
  const t = await owner();
  const res = await t.track("GET", "/api/projects");
  assert.equal(res.status, 200);
  const byName = Object.fromEntries(res.body.projects.map(p => [p.name, p]));
  assert.equal(byName.infra.protected, true);
  assert.equal(byName["mcp-gateway"].protected, true);
  assert.equal(byName["homeserver-panel"].protected, true);
  assert.equal(byName["hs-demo"].protected, false);
  const site = byName["hs-demo"].environments[0].applications[0];
  assert.deepEqual([site.name, site.appName, site.urls, site.usage], ["site", "app-hs-x", ["https://hs-site.talabq.com"], { cpuPercent: 0.6, memMb: 65.8 }]);
  assert.equal(byName["hs-demo"].environments[0].composeCount, 1);
  noForbidden(t.seen);
  const first = t.client.calls.length;
  await t.track("GET", "/api/projects");
  assert.equal(t.client.calls.length, first, "a second list within 10 seconds is served from the cache");
  await t.track("GET", "/api/projects?fresh=1");
  assert.ok(t.client.calls.length > first, "fresh=1 asks Dokploy again");
});

test("app state says whether a container really runs, not just that Dokploy created the service", async () => {
  const t = await owner();
  const running = await t.track("GET", "/api/projects/apps/a-hs/state");
  assert.deepEqual([running.body.running, running.body.verdict, running.body.dokployStatus], [true, "running", "done"]);
  t.world.containers = { "app-hs-x": [{ name: "app-hs-x.1.dead", state: "exited", status: "Exited (1)" }] };
  const stopped = await t.track("GET", "/api/projects/apps/a-hs/state");
  assert.deepEqual([stopped.body.running, stopped.body.verdict], [false, "created-not-running"]);
  t.world.containers = { "app-hs-x": [] };
  assert.equal((await t.track("GET", "/api/projects/apps/a-hs/state")).body.verdict, "created-not-running");
  assert.equal((await t.track("GET", "/api/projects/apps/bad!/state")).status, 400);
  assert.equal((await t.track("GET", "/api/projects/apps/does-not-exist/state")).status >= 400, true);
  noForbidden(t.seen);
});

test("actions: allowed on a normal app, refused on protected apps with no call made, unknown actions rejected", async () => {
  const t = await owner();
  for (const action of ["deploy", "redeploy", "start", "stop"]) {
    const r = await t.track("POST", "/api/projects/apps/a-hs/actions", { action });
    assert.equal(r.status, 200, action);
  }
  assert.deepEqual(mutationsOf(t), ["application.deploy", "application.redeploy", "application.start", "application.stop"]);
  assert.equal((await t.track("POST", "/api/projects/apps/a-hs/actions", { action: "restart" })).status, 200);
  const reload = t.client.calls.filter(c => c.procedure === "application.reload").at(-1);
  assert.deepEqual(reload.body, { applicationId: "a-hs", appName: "app-hs-x" }, "restart reloads the running service by its app name");
  const before = mutationsOf(t).length;
  for (const id of ["a-infra", "a-mcp", "a-panel"]) for (const action of ["deploy", "stop", "restart"]) {
    const r = await t.track("POST", `/api/projects/apps/${id}/actions`, { action });
    assert.equal(r.status, 403, `${id} ${action}`);
    assert.equal(r.body.error.code, "policy_refused");
  }
  assert.equal(mutationsOf(t).length, before, "protected apps were never reached");
  assert.equal((await t.track("POST", "/api/projects/apps/a-hs/actions", { action: "delete" })).status, 400, "delete is not a lifecycle action");
  assert.equal((await t.track("POST", "/api/projects/apps/a-hs/actions", {})).status, 400);
  assert.equal(mutationsOf(t).length, before + 0, "nothing ran for rejected actions");
});

test("logs: runtime and build, tail is clamped, bad type rejected", async () => {
  const t = await owner();
  const rt = await t.track("GET", "/api/projects/apps/a-hs/logs?tail=99999");
  assert.equal(rt.status, 200);
  assert.match(rt.body.text, /tail=1000$/);
  assert.match((await t.track("GET", "/api/projects/apps/a-hs/logs?tail=-5")).body.text, /tail=1$/);
  assert.match((await t.track("GET", "/api/projects/apps/a-hs/logs?tail=abc")).body.text, /tail=200$/, "default");
  const since = t.client.calls.filter(c => c.procedure === "application.readLogs");
  assert.equal("since" in since[0].query, false);
  await t.track("GET", "/api/projects/apps/a-hs/logs?since=10m");
  await t.track("GET", "/api/projects/apps/a-hs/logs?since=;rm");
  const sinceCalls = t.client.calls.filter(c => c.procedure === "application.readLogs").slice(-2);
  assert.equal(sinceCalls[0].query.since, "10m");
  assert.equal("since" in sinceCalls[1].query, false, "a malformed since is dropped, never forwarded");
  const build = await t.track("GET", "/api/projects/apps/a-hs/logs?type=build");
  assert.deepEqual([build.body.deploymentStatus, build.body.text], ["done", "build line 1\nbuild line 2"]);
  assert.equal((await t.track("GET", "/api/projects/apps/a-hs/logs?type=env")).status, 400);
  noForbidden(t.seen);
});

test("typed-name delete: the exact name is required; protected items are refused even with the right name", async () => {
  const t = await owner();
  assert.equal((await t.track("DELETE", "/api/projects/apps/a-hs", {})).status, 400);
  assert.equal((await t.track("DELETE", "/api/projects/apps/a-hs", { confirmName: "SITE" })).status, 400, "case matters");
  assert.equal((await t.track("DELETE", "/api/projects/apps/a-hs", { confirmName: "wrong" })).status, 400);
  assert.deepEqual(mutationsOf(t), []);
  const protectedApp = await t.track("DELETE", "/api/projects/apps/a-panel", { confirmName: "panel" });
  assert.deepEqual([protectedApp.status, protectedApp.body.error.code], [403, "policy_refused"]);
  const protectedProject = await t.track("DELETE", "/api/projects/p-infra", { confirmName: "infra" });
  assert.deepEqual([protectedProject.status, protectedProject.body.error.code], [403, "policy_refused"]);
  assert.deepEqual(mutationsOf(t), [], "no delete reached Dokploy");
  assert.equal((await t.track("DELETE", "/api/projects/apps/a-hs", { confirmName: "site" })).status, 200);
  assert.equal((await t.track("DELETE", "/api/projects/p-hs", { confirmName: "hs-demo" })).status, 200);
  assert.deepEqual(mutationsOf(t), ["application.delete", "project.remove"]);
  const projectsAfter = (await t.track("GET", "/api/projects")).body.projects;
  assert.ok(projectsAfter.length >= 1, "the list still answers after deletes");
  const rows = t.audit.query({ action: "application" }).items;
  assert.ok(rows.some(r => r.action === "application.delete" && r.result === "refused"), "the refusal is audited");
  assert.ok(rows.some(r => r.action === "application.delete" && r.result === "ok"), "the success is audited");
});

test("MCP keys: list marks protected ones; create returns the secret once with ready client configs; revoke follows the policy", async () => {
  const t = await owner();
  const list = await t.track("GET", "/api/mcp/keys");
  const protectedNames = list.body.keys.filter(k => k.protected).map(k => k.name).sort();
  assert.deepEqual(protectedNames, ["claude-code", "deploy-cli", "homeserver-panel", "remote-test"]);
  assert.ok(list.body.keys.every(k => !("key" in k) && !("secret" in k)), "listing never carries a secret");
  const created = await t.browser.send("POST", "/api/mcp/keys", { body: { name: "laptop 2", expiresInDays: 30 } });
  assert.equal(created.status, 200);
  assert.equal(created.body.secret, "NEWKEY-SECRET-VALUE-0123456789");
  assert.equal(created.body.url, "https://mcp.talabq.com/mcp-OLDPATHOLDPATHOLDPATHOLD");
  const post = t.client.calls.find(c => c.procedure === "user.createApiKey");
  assert.equal(post.body.rateLimitEnabled, false, "D7");
  assert.equal(post.body.expiresIn, 30 * 86_400);
  for (const k of ["claudeCode", "codex", "cursor"]) { assert.ok(created.body.configs[k].includes(created.body.url)); assert.ok(created.body.configs[k].includes("NEWKEY-SECRET-VALUE-0123456789")); }
  assert.match(created.body.configs.claudeCode, /^claude mcp add dokploy-remote https:\/\/mcp\.talabq\.com\/mcp-\S+ --transport http --header /, "name and URL come before the options");
  assert.deepEqual(Object.keys(JSON.parse(created.body.configs.cursor).mcpServers), ["dokploy-remote"]);
  // The secret is shown once: not in later answers, not in the audit log, not in the logs.
  const again = await t.track("GET", "/api/mcp/keys");
  assert.ok(!JSON.stringify(again.body).includes("NEWKEY-SECRET"));
  assert.ok(!JSON.stringify(t.audit.query({ limit: 200 }).items).includes("NEWKEY-SECRET"), "audit never stores the secret");
  assert.ok(!t.lines.join("").includes("NEWKEY-SECRET"), "logs never carry the secret");
  assert.equal((await t.track("DELETE", "/api/mcp/keys/k-cc")).status, 403, "claude-code is protected");
  assert.equal((await t.track("DELETE", "/api/mcp/keys/k-user")).status, 200);
  assert.equal(t.client.calls.at(-1).procedure, "user.deleteApiKey");
  for (const bad of [{ name: "" }, { name: "x".repeat(33) }, { name: "a/b" }, { name: 5 }, { name: "ok", expiresInDays: 0 }, { name: "ok", expiresInDays: 4000 }, { name: "ok", expiresInDays: "7" }, {}]) {
    assert.equal((await t.track("POST", "/api/mcp/keys", bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await t.track("POST", "/api/mcp/keys", { name: "deploy-cli" })).status, 403, "cannot take a protected name");
  assert.equal(mutationsOf(t).filter(p => p === "user.createApiKey").length, 1, "only the one valid key was created");
});

test("MCP url: only the path variable is read from the app's environment", async () => {
  const t = await owner();
  const r = await t.track("GET", "/api/mcp/url");
  assert.deepEqual(r.body, { url: "https://mcp.talabq.com/mcp-OLDPATHOLDPATHOLDPATHOLD" });
  t.world.apps.find(a => a.applicationId === "a-mcp").env = "OTHER=1";
  assert.deepEqual((await t.track("GET", "/api/mcp/url")).body, { url: null });
});

test("path rotation exception: typed ROTATE, changes only that env line, saves + redeploys only dokploy-mcp, waits for health, is audited", async () => {
  const t = await owner();
  const noConfirm = await t.track("POST", "/api/mcp/rotate-path", {});
  assert.equal(noConfirm.status, 400);
  assert.equal((await t.track("POST", "/api/mcp/rotate-path", { confirm: "rotate" })).status, 400, "exact word");
  assert.deepEqual(mutationsOf(t), [], "nothing happened without the typed word");
  const oldEnv = t.world.apps.find(a => a.applicationId === "a-mcp").env;
  const res = await t.track("POST", "/api/mcp/rotate-path", { confirm: "ROTATE" });
  assert.equal(res.status, 200);
  assert.match(res.body.url, /^https:\/\/mcp\.talabq\.com\/mcp-[A-Za-z0-9]{24}$/);
  assert.ok(!res.body.url.includes("OLDPATH"));
  assert.deepEqual(mutationsOf(t), ["application.saveEnvironment", "application.redeploy"], "exactly these two calls");
  const [save, redeploy] = t.client.calls.filter(c => c.method === "POST");
  assert.equal(save.body.applicationId, "a-mcp");
  assert.equal(redeploy.body.applicationId, "a-mcp");
  const oldLines = oldEnv.split("\n"), newLines = save.body.env.split("\n");
  assert.equal(newLines.length, oldLines.length);
  const changed = newLines.map((l, i) => [l, oldLines[i]]).filter(([a, b]) => a !== b);
  assert.equal(changed.length, 1, "one line changed");
  assert.ok(changed[0][0].startsWith("DOKPLOY_MCP_HTTP_PATH=/mcp-") && changed[0][1].startsWith("DOKPLOY_MCP_HTTP_PATH="));
  assert.equal(changed[0][0].split("=")[1], new URL(res.body.url).pathname, "the returned URL is the written path");
  assert.ok(t.fetchLog.calls.some(c => c.url === "https://mcp.talabq.com/health"), "waited for /health");
  const rows = t.audit.query({ action: "mcp" }).items;
  assert.deepEqual([rows[0].action, rows[0].result, rows[0].target], ["mcp.rotate_path", "ok", "mcp-gateway/dokploy-mcp"]);
  assert.ok(!JSON.stringify(rows).includes("/mcp-"), "audit holds no path");
  assert.ok(!t.lines.join("").includes(new URL(res.body.url).pathname), "logs hold no path");
  // The exception does not widen the policy: every other action on that app is still refused.
  for (const action of ["stop", "deploy", "redeploy"]) assert.equal((await t.track("POST", "/api/projects/apps/a-mcp/actions", { action })).status, 403, action);
});

test("rotation fails safe: unhealthy after the change reports the error and is audited; missing app or variable refuses before any call", async () => {
  const db = openDatabase(":memory:"); migrate(db);
  const audit = createAudit(db);
  const world = makeWorld();
  const client = fakeDokploy(world);
  const settings = { projectName: "mcp-gateway", appName: "dokploy-mcp", publicHost: "mcp.talabq.com", dokployUrl: "http://dokploy:3000", healthUrl: "https://mcp.talabq.com/health" };
  const gateway = { listApiKeys: async () => [], deleteApiKey: async () => ({}), createApiKey: async () => ({}) };
  let polls = 0;
  const sick = createMcp({ gateway, client, audit, mcp: settings, fetchImpl: async () => { polls++; return { ok: false, json: async () => ({ ok: false }) }; }, healthTimeoutMs: 30, healthPollMs: 5, wait: ms => new Promise(r => setTimeout(r, ms)) });
  await assert.rejects(sick.rotatePath({ actor: OWNER_EMAIL }, { confirm: "ROTATE" }), e => e.code === "upstream_timeout" && e.message.includes("DOKPLOY_MCP_HTTP_PATH") && !e.message.includes("/mcp-"));
  assert.ok(polls >= 2);
  assert.equal(audit.list({ limit: 1 })[0].result, "error");
  const before = client.calls.length;
  world.apps.find(a => a.applicationId === "a-mcp").env = "FOO=bar";
  await assert.rejects(sick.rotatePath({ actor: "x" }, { confirm: "ROTATE" }), e => e.code === "policy_refused");
  assert.equal(client.calls.slice(before).filter(c => c.method === "POST").length, 0, "no variable, no change");
  world.apps = world.apps.filter(a => a.applicationId !== "a-mcp");
  await assert.rejects(sick.rotatePath({ actor: "x" }, { confirm: "ROTATE" }), e => e.code === "policy_unresolved");
  assert.equal(client.calls.filter(c => c.method === "POST").length, 2, "only the first attempt wrote (save + redeploy)");
  assert.equal(audit.list({ limit: 1 })[0].result, "refused");
});

test("client configs and new path shape", () => {
  const c = clientConfigs({ url: "https://m.example/mcp-abc", apiKey: "K", dokployUrl: "http://d:3000", serverName: "srv" });
  assert.equal(c.claudeCode, 'claude mcp add srv https://m.example/mcp-abc --transport http --header "X-Dokploy-Url: http://d:3000" --header "X-Dokploy-Api-Key: K"');
  assert.match(c.codex, /^\[mcp_servers\.srv\]\nurl = "https:\/\/m\.example\/mcp-abc"\nhttp_headers = \{ "X-Dokploy-Url" = "http:\/\/d:3000", "X-Dokploy-Api-Key" = "K" \}\n$/);
  assert.deepEqual(JSON.parse(c.cursor), { mcpServers: { srv: { url: "https://m.example/mcp-abc", headers: { "X-Dokploy-Url": "http://d:3000", "X-Dokploy-Api-Key": "K" } } } });
  const paths = new Set(Array.from({ length: 50 }, newMcpPath));
  assert.equal(paths.size, 50);
  for (const p of paths) assert.match(p, /^\/mcp-[A-Za-z0-9]{24}$/);
});

test("devices: not configured is a normal answer; configured returns the list with only the server's own address and no secret", async () => {
  const plain = await owner();
  assert.deepEqual((await plain.track("GET", "/api/devices")).body, { configured: false, devices: [] });
  assert.equal(plain.fetchLog.calls.length, 0, "no outside call without credentials");
  const t = await owner({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID, TAILSCALE_OAUTH_CLIENT_SECRET: TS_SECRET } });
  const r = await t.track("GET", "/api/devices");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.devices.map(d => [d.name, d.os, d.online, d.ip]), [["homeserver", "linux", true, "100.114.91.58"], ["phone", "android", false, null]]);
  assert.deepEqual(r.body.devices[0].tags, ["tag:server"]);
  const text = JSON.stringify(r.body);
  for (const leak of [TS_SECRET, TS_ID, "nodekey", "ahmed@example.com", "100.64.0.2", "fd7a"]) assert.ok(!text.includes(leak), `leaked ${leak}`);
  const token = t.fetchLog.calls.find(c => c.url.endsWith("/oauth/token"));
  assert.equal(token.method, "POST");
  assert.match(token.body, /grant_type=client_credentials/);
  assert.match(token.body, /scope=devices%3Acore%3Aread/, "read only scope (D10)");
  assert.equal(t.fetchLog.calls.filter(c => c.method !== "GET" && !c.url.endsWith("/oauth/token")).length, 0, "no write call to Tailscale");
  await t.track("GET", "/api/devices");
  assert.equal(t.fetchLog.state.tokens, 1, "the token is reused until it expires");
  t.clock.t += 3_560_000; // 40 seconds left of the hour: inside the 60 second renewal margin
  await t.track("GET", "/api/devices");
  assert.equal(t.fetchLog.state.tokens, 2, "a token close to expiry is renewed");
  assert.ok(!t.lines.join("").includes(TS_SECRET), "logs never carry the client secret");
});

test("devices: Tailscale refusing the client is a 502, never a 401 that would sign the owner out; outages are reported", async () => {
  const bad = await owner({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID, TAILSCALE_OAUTH_CLIENT_SECRET: TS_SECRET }, fetch: { tsTokenStatus: 401 } });
  const r1 = await bad.browser.get("/api/devices");
  assert.deepEqual([r1.status, r1.body.error.code], [502, "upstream_auth_failed"]);
  assert.equal((await bad.browser.get("/api/auth/session")).status, 200, "the panel session is untouched");
  const rev = await owner({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID, TAILSCALE_OAUTH_CLIENT_SECRET: TS_SECRET }, fetch: { tsDevicesStatus: 401 } });
  assert.equal((await rev.browser.get("/api/devices")).status, 502);
  await rev.browser.get("/api/devices");
  assert.equal(rev.fetchLog.state.tokens, 2, "after a 401 the token is dropped and fetched again");
  const down = await owner({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID, TAILSCALE_OAUTH_CLIENT_SECRET: TS_SECRET }, fetch: { offline: true } });
  assert.equal((await down.browser.get("/api/devices")).body.error.code, "upstream_unreachable");
  await assert.rejects(authApp({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID } }), /must be set together/, "a half-configured client fails at startup");
});

test("server routes answer with whatever is available, and the speed test is limited and audited", async () => {
  const t = await owner();
  const status = await t.track("GET", "/api/server/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.network.available, false, "no /host/proc in the test");
  assert.equal(status.body.disk.available, true);
  assert.deepEqual([status.body.tunnel.running, status.body.internet.reachable], [true, true]);
  const containers = await t.track("GET", "/api/server/containers");
  assert.deepEqual(containers.body.containers[0], { name: "app-hs-x.1.abc", service: "app-hs-x", cpuPercent: 0.6, memMb: 65.8, memPercent: 1.7 });
  assert.deepEqual((await t.track("GET", "/api/server/speedtest")).body, { last: null });
  const run = await t.track("POST", "/api/server/speedtest");
  assert.equal(run.status, 200);
  assert.equal(run.body.error, null);
  assert.ok(run.body.downMbps > 0);
  const again = await t.browser.post("/api/server/speedtest");
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers["retry-after"]) > 0);
  assert.equal((await t.track("GET", "/api/server/speedtest")).body.last.downMbps, run.body.downMbps);
  const rows = t.audit.query({ action: "server" }).items;
  assert.deepEqual(rows.map(r => [r.action, r.result]), [["server.speedtest", "ok"]]);
  noForbidden(t.seen);
});

test("audit API: newest first, cursor pages, filters by action prefix, result and time", async () => {
  const t = await owner();
  for (let i = 0; i < 5; i++) await t.track("POST", "/api/projects/apps/a-hs/actions", { action: "deploy" });
  await t.track("POST", "/api/projects/apps/a-infra/actions", { action: "stop" });
  const page1 = await t.track("GET", "/api/audit?limit=3");
  assert.equal(page1.body.items.length, 3);
  assert.ok(page1.body.nextBefore);
  const ids1 = page1.body.items.map(r => r.id);
  assert.deepEqual(ids1, [...ids1].sort((a, b) => b - a), "newest first");
  const page2 = await t.track("GET", `/api/audit?limit=3&before=${page1.body.nextBefore}`);
  assert.ok(page2.body.items.every(r => r.id < page1.body.nextBefore));
  assert.ok(page2.body.items.length >= 1);
  const refused = await t.track("GET", "/api/audit?result=refused&limit=200");
  assert.ok(refused.body.items.length >= 1 && refused.body.items.every(r => r.result === "refused"));
  assert.ok(refused.body.items.some(r => r.action === "application.stop"));
  const deploys = await t.track("GET", "/api/audit?action=application.deploy&limit=200");
  assert.equal(deploys.body.items.length, 5);
  const prefix = await t.track("GET", "/api/audit?action=application&limit=200");
  assert.ok(prefix.body.items.length >= 6 && prefix.body.items.every(r => r.action.startsWith("application.")));
  const future = await t.track("GET", `/api/audit?from=${encodeURIComponent(new Date(t.clock.t + 3_600_000).toISOString())}`);
  assert.deepEqual(future.body.items, []);
  const garbage = await t.track("GET", "/api/audit?from=not-a-date&result=weird&limit=abc&before=zzz");
  assert.equal(garbage.status, 200, "bad filters are ignored, never an error");
  assert.ok(garbage.body.items.length > 0);
  assert.equal((await t.track("GET", "/api/audit?limit=100000")).body.items.length <= 200, true, "page size is capped");
  noForbidden(t.seen);
});

test("no answer from any new route leaks a secret value held by Dokploy", async () => {
  const t = await owner({ env: { TAILSCALE_OAUTH_CLIENT_ID: TS_ID, TAILSCALE_OAUTH_CLIENT_SECRET: TS_SECRET } });
  for (const url of ["/api/projects", "/api/projects/apps/a-hs/state", "/api/projects/apps/a-mcp/state", "/api/projects/apps/a-hs/logs", "/api/projects/apps/a-hs/logs?type=build", "/api/mcp/keys", "/api/devices", "/api/server/status", "/api/server/containers", "/api/audit"]) {
    const r = await t.track("GET", url);
    assert.equal(r.status, 200, url);
  }
  // The MCP url is the one answer that is meant to carry the secret path (owner only); it carries nothing else.
  const mcpUrl = await t.browser.get("/api/mcp/url");
  assert.deepEqual(Object.keys(mcpUrl.body), ["url"]);
  noForbidden([JSON.stringify(mcpUrl.body).replace("OLDPATHOLDPATHOLDPATHOLD", "")]);
  noForbidden(t.seen, [TS_SECRET, "NEWKEY"]);
  noForbidden([t.lines.join("")], [TS_SECRET]);
});
