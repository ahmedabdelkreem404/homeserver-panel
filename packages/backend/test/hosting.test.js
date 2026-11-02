import test from "node:test";
import assert from "node:assert/strict";
import { newAccount, ownerWithApp } from "./account-helpers.js";

// The fake Dokploy world: a-hs ("site", project hs-demo) and a-other ("other") are ordinary apps; a-infra, a-mcp and
// a-panel live in protected projects.
const mutations = ctx => ctx.client.calls.filter(c => c.method === "POST").map(c => `${c.procedure}:${JSON.stringify(c.body ?? c.args ?? {})}`);

async function twoTenants() {
  const ctx = await ownerWithApp();
  const a = await newAccount(ctx, { email: "a@example.test", slug: "shop-a", ip: "198.51.100.71" });
  const b = await newAccount(ctx, { email: "b@example.test", slug: "shop-b", ip: "198.51.100.72" });
  assert.equal((await ctx.owner.post(`/api/users/${a.made.user.id}/sites`, { applicationId: "a-hs" })).status, 200);
  assert.equal((await ctx.owner.post(`/api/users/${b.made.user.id}/sites`, { applicationId: "a-other" })).status, 200);
  return { ctx, a, b };
}

test("the owner hands an app to an account; protected, unknown, duplicate and non-tenant targets are refused", async () => {
  const ctx = await ownerWithApp();
  const a = await newAccount(ctx, { email: "a@example.test", slug: "shop-a", ip: "198.51.100.73" });
  const viewer = await newAccount(ctx, { email: "v@example.test", role: "viewer", ip: "198.51.100.74" });
  const url = `/api/users/${a.made.user.id}/sites`;
  for (const applicationId of ["a-infra", "a-mcp", "a-panel"]) assert.equal((await ctx.owner.post(url, { applicationId })).status, 400, `${applicationId} is in a protected project`);
  assert.equal((await ctx.owner.post(url, { applicationId: "a-nope" })).status, 400);
  assert.equal((await ctx.owner.post(url, { applicationId: "x y/z" })).status, 404);
  assert.equal((await ctx.owner.post(`/api/users/${viewer.made.user.id}/sites`, { applicationId: "a-hs" })).status, 400, "only tenant accounts own sites");
  assert.equal((await ctx.owner.post(url, { applicationId: "a-hs" })).status, 200);
  assert.equal((await ctx.owner.post(url, { applicationId: "a-hs" })).status, 400, "already owned");
  assert.equal((await ctx.owner.get(url)).body.sites.length, 1);
  const audit = (await ctx.owner.get("/api/audit?action=hosting")).body.items;
  assert.ok(audit.some(r => r.action === "hosting.assign" && r.result === "ok") && audit.some(r => r.result === "refused"));
  assert.equal(mutations(ctx).length, 0, "assigning changes nothing in Dokploy");
});

test("a tenant sees only its own sites, with nothing internal in the answer", async () => {
  const { a, b } = await twoTenants();
  const mine = await a.browser.get("/api/my/sites");
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.sites.map(s => s.applicationId), ["a-hs"]);
  assert.deepEqual(Object.keys(mine.body.sites[0]).sort(), ["applicationId", "limits", "name", "status", "urls", "usage"]);
  const text = JSON.stringify(mine.body);
  for (const secret of ["app-hs-x", "hs-demo", "a-other", "app-other-x", "hunter2", "APP_SECRET", "e-hs"]) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.deepEqual((await b.browser.get("/api/my/sites")).body.sites.map(s => s.applicationId), ["a-other"]);
});

test("IDOR: tenant A gets the same 404 for tenant B's site as for one that does not exist, on every route, and nothing changes in Dokploy", async () => {
  const { ctx, a } = await twoTenants();
  const before = mutations(ctx).length;
  const attempts = [
    ["GET", id => `/api/my/sites/${id}/state`], ["GET", id => `/api/my/sites/${id}/logs`], ["GET", id => `/api/my/sites/${id}/logs?type=build`],
    ["POST", id => `/api/my/sites/${id}/actions`, { action: "stop" }], ["POST", id => `/api/my/sites/${id}/actions`, { action: "redeploy" }],
    ["DELETE", id => `/api/my/sites/${id}`, { confirmName: "other" }],
  ];
  for (const [method, url, body] of attempts) {
    const theirs = await a.browser.send(method, url("a-other"), { body });
    const missing = await a.browser.send(method, url("a-does-not-exist"), { body });
    const weird = await a.browser.send(method, url("..%2Fa-other"), { body });
    assert.equal(theirs.status, 404, `${method} ${url("a-other")}`);
    assert.deepEqual(theirs.body, missing.body, "the answer cannot tell 'not yours' from 'does not exist'");
    assert.equal(weird.status, 404);
  }
  assert.equal(mutations(ctx).length, before, "no Dokploy call was made for any of them");
  // the same ids through the owner-only routes
  for (const [method, url, body] of [["GET", `/api/users/${a.made.user.id}/sites`], ["POST", `/api/users/${a.made.user.id}/sites`, { applicationId: "a-other" }], ["DELETE", `/api/users/${a.made.user.id}/sites/a-hs`], ["GET", "/api/projects"], ["POST", "/api/projects/apps/a-other/actions", { action: "stop" }]]) {
    assert.equal((await a.browser.send(method, url, { body })).status, 403, `${method} ${url}`);
  }
  assert.deepEqual((await a.browser.get("/api/my/sites")).body.sites.map(s => s.applicationId), ["a-hs"], "A still owns exactly its own site");
});

test("a tenant manages its own site: actions are audited under its email, the typed name guards deletion", async () => {
  const { ctx, a } = await twoTenants();
  assert.equal((await a.browser.post("/api/my/sites/a-hs/actions", { action: "teleport" })).status, 400);
  assert.equal((await a.browser.post("/api/my/sites/a-hs/actions", { action: "stop" })).status, 200);
  assert.equal((await a.browser.post("/api/my/sites/a-hs/actions", { action: "restart" })).status, 200);
  const done = mutations(ctx).join(" ");
  assert.match(done, /application\.stop/);
  assert.ok(!done.includes("a-other"));
  const state = await a.browser.get("/api/my/sites/a-hs/state");
  assert.deepEqual(Object.keys(state.body).sort(), ["applicationId", "containers", "name", "running", "verdict"]);
  assert.match((await a.browser.get("/api/my/sites/a-hs/logs")).body.text, /a-hs/);
  const audit = (await ctx.owner.get("/api/audit?action=application")).body.items;
  assert.ok(audit.some(r => r.actor === "a@example.test" && r.action === "application.stop" && r.result === "ok"));

  assert.equal((await a.browser.delete("/api/my/sites/a-hs", { confirmName: "wrong" })).status, 400);
  assert.equal((await a.browser.get("/api/my/sites")).body.sites.length, 1);
  assert.equal((await a.browser.delete("/api/my/sites/a-hs", { confirmName: "site" })).status, 200);
  assert.deepEqual((await a.browser.get("/api/my/sites")).body.sites, []);
  assert.equal((await a.browser.post("/api/my/sites/a-hs/actions", { action: "start" })).status, 404, "ownership is gone with the site");
});

test("overview: the allowance and what is used of it", async () => {
  const { a } = await twoTenants();
  const res = await a.browser.get("/api/my/overview");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.quota, { maxApps: 2, maxDatabases: 1, maxMemoryMb: 512, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 });
  assert.deepEqual(res.body.usage, { apps: 1, databases: 0, memoryMb: 256, cpu: 1, subdomains: 1, withoutLimits: 0 });
});

test("taking an app back, and the other roles: viewer reads only, the owner has no hosting space", async () => {
  const { ctx, a } = await twoTenants();
  assert.equal((await ctx.owner.delete(`/api/users/${a.made.user.id}/sites/a-hs`)).status, 200);
  assert.deepEqual((await a.browser.get("/api/my/sites")).body.sites, []);
  assert.equal((await a.browser.post("/api/my/sites/a-hs/actions", { action: "stop" })).status, 404);
  assert.equal((await ctx.owner.delete(`/api/users/${a.made.user.id}/sites/a-hs`)).status, 404, "nothing left to take back");

  const viewer = await newAccount(ctx, { email: "v@example.test", role: "viewer", ip: "198.51.100.75" });
  const read = await viewer.browser.get("/api/my/sites");
  assert.equal(read.status, 403);
  assert.equal(read.body.error.code, "forbidden", "a viewer has read access in principle but no hosting space");
  assert.equal((await viewer.browser.post("/api/my/sites/a-hs/actions", { action: "stop" })).body.error.code, "forbidden");
  assert.equal((await ctx.owner.get("/api/my/sites")).status, 403);
});

test("defense in depth: an ownership row pointing into a protected project is ignored, and the policy still refuses the call", async () => {
  const { ctx, a } = await twoTenants();
  const tenantId = ctx.db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(a.made.user.id).tenant_id;
  ctx.db.prepare("INSERT INTO resource_ownership (tenant_id, kind, dokploy_id, name, created_at) VALUES (?, 'application', 'a-infra', 'x', 'now')").run(tenantId);
  assert.deepEqual((await a.browser.get("/api/my/sites")).body.sites.map(s => s.applicationId), ["a-hs"], "never listed");
  const before = mutations(ctx).length;
  const res = await a.browser.post("/api/my/sites/a-infra/actions", { action: "stop" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "policy_refused");
  assert.equal(mutations(ctx).length, before);
});
