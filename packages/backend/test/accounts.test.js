import test from "node:test";
import assert from "node:assert/strict";
import { authApp, Browser, NEW_PASSWORD } from "./auth-helpers.js";
import { newAccount, ownerWithApp, signInAgain } from "./account-helpers.js";
import { can, KNOWN_ROLES, ROLES, UNLABELLED_ACTION } from "../src/auth/permissions.js";

test("roles are data: the owner holds everything, tenant and viewer only their own space, and an unlabelled route fails closed", () => {
  assert.deepEqual([...KNOWN_ROLES], ["owner", "admin", "tenant", "viewer"]);
  assert.deepEqual([...ROLES.tenant].sort(), ["auth.manage", "mcp.manage", "mcp.read", "my.create", "my.delete", "my.manage", "my.read", "sessions.manage"]);
  assert.deepEqual([...ROLES.viewer].sort(), ["auth.manage", "my.read", "sessions.manage"]);
  assert.equal(can({ role: "owner" }, "anything.at.all"), true);
  assert.equal(can({ role: "admin" }, "users.manage"), false, "admins never manage users");
  assert.equal(can({ role: "admin" }, "backup.download"), false);
  assert.equal(can({ role: "admin" }, "mcp.rotate"), false);
  assert.equal(can({ role: "admin" }, "projects.manage"), true);
  assert.equal(can({ role: "tenant" }, "projects.read"), false, "the global project routes show everything: tenants use /api/my instead");
  assert.equal(can({ role: "tenant" }, "my.manage"), true);
  assert.equal(can({ role: "viewer" }, "my.manage"), false);
  for (const role of ["admin", "tenant", "viewer"]) assert.equal(can({ role }, UNLABELLED_ACTION), false);
  assert.equal(can({ role: "ghost" }, "auth.manage"), false);
  assert.equal(can(null, "auth.manage"), false);
});

test("every /api route that needs a full session names its permission", async () => {
  const { app } = await authApp();
  const unlabelled = app.routeTable.filter(r => r.access === "full" && !r.permission).map(r => `${r.method} ${r.url}`);
  assert.deepEqual(unlabelled, []);
});

test("the owner creates a tenant account: a temporary password shown once, a quota with defaults, nothing secret stored in the audit", async () => {
  const ctx = await ownerWithApp();
  const made = await ctx.owner.post("/api/users", { email: "Tenant@Example.test", role: "tenant", tenant: { slug: "acme", name: "Acme Shop" }, quota: { maxApps: 3, maxMemoryMb: 768 } });
  assert.equal(made.status, 200);
  assert.match(made.body.temporaryPassword, /^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
  assert.equal(made.body.user.email, "tenant@example.test");
  assert.deepEqual(made.body.user.tenant.quota, { maxApps: 3, maxDatabases: 1, maxMemoryMb: 768, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 });
  const list = await ctx.owner.get("/api/users");
  const text = JSON.stringify(list.body);
  assert.ok(!text.includes(made.body.temporaryPassword) && !/password_hash|argon2id/.test(text), "the list never carries a password or a hash");
  assert.equal(list.body.users.length, 2);
  const audit = await ctx.owner.get("/api/audit?action=users");
  assert.ok(audit.body.items.some(r => r.action === "users.create" && r.result === "ok"));
  assert.ok(!JSON.stringify(audit.body).includes(made.body.temporaryPassword));
});

test("account creation is validated: email, role, slug, duplicates, quota fields and ranges", async () => {
  const ctx = await ownerWithApp();
  const tenant = { slug: "valid-one", name: "Valid" };
  const bad = async (body, status = 400) => assert.equal((await ctx.owner.post("/api/users", body)).status, status, JSON.stringify(body));
  await bad({ email: "nope", role: "tenant", tenant });
  await bad({ email: "a@example.test", role: "owner" });
  await bad({ email: "a@example.test", role: "wizard" });
  await bad({ email: "a@example.test", role: "tenant" });
  for (const slug of ["Panel", "panel", "ab", "9lives", "has space", "x".repeat(30), "mcp", "shared"]) await bad({ email: "a@example.test", role: "tenant", tenant: { slug, name: "N" } });
  await bad({ email: "a@example.test", role: "tenant", tenant, quota: { maxApps: -1 } });
  await bad({ email: "a@example.test", role: "tenant", tenant, quota: { maxApps: 1.5 } });
  await bad({ email: "a@example.test", role: "tenant", tenant, quota: { maxMemoryMb: 100000 } });
  await bad({ email: "a@example.test", role: "tenant", tenant, quota: { sneaky: 1 } });
  await bad({ email: "a@example.test", role: "viewer", tenant });
  assert.equal((await ctx.owner.get("/api/users")).body.users.length, 1, "nothing half-created by the refused attempts");
  assert.equal((await ctx.owner.post("/api/users", { email: "a@example.test", role: "tenant", tenant })).status, 200);
  await bad({ email: "A@Example.test", role: "viewer" });
  await bad({ email: "b@example.test", role: "tenant", tenant });
});

test("authorization matrix: a tenant, a viewer and an admin are refused exactly where their role has no permission, on every route", async () => {
  const ctx = await ownerWithApp();
  const people = {
    tenant: await newAccount(ctx, { email: "t@example.test", role: "tenant", slug: "acme", ip: "198.51.100.30" }),
    viewer: await newAccount(ctx, { email: "v@example.test", role: "viewer", ip: "198.51.100.31" }),
    admin: await newAccount(ctx, { email: "a@example.test", role: "admin", ip: "198.51.100.32" }),
  };
  const routes = ctx.app.routeTable.filter(r => r.access === "full");
  assert.ok(routes.length > 25);
  for (const [role, person] of Object.entries(people)) {
    for (const route of routes) {
      const url = route.url.replace(":id", "9").replace(":projectId", "proj-abc123");
      const res = await person.browser.send(route.method, url, { body: ["GET", "HEAD"].includes(route.method) ? undefined : {} });
      if (can({ role }, route.permission)) {
        // past the permission check: the only 403 allowed is "this account has no hosting space" from the /api/my handlers
        if (res.body?.error?.code === "forbidden") assert.match(res.body.error.message, /no hosting space/, `${role} should pass the permission check on ${route.method} ${route.url}`);
      }
      else {
        assert.equal(res.status, 403, `${role} on ${route.method} ${route.url}`);
        assert.equal(res.body.error.code, "forbidden", `${role} on ${route.method} ${route.url}`);
      }
    }
  }
  assert.equal((await people.tenant.browser.get("/api/auth/sessions")).status, 200, "self-service still works");
  assert.equal((await people.tenant.browser.get("/api/users")).status, 403);
});

test("suspending an account ends its sessions at once and blocks sign-in until it is resumed", async () => {
  const ctx = await ownerWithApp();
  const tenant = await newAccount(ctx, { email: "t@example.test", ip: "198.51.100.40" });
  const id = tenant.made.user.id;
  assert.equal((await tenant.browser.get("/api/auth/sessions")).status, 200);
  assert.equal((await ctx.owner.post(`/api/users/${id}/suspend`)).status, 200);
  assert.equal((await tenant.browser.get("/api/auth/sessions")).status, 401);
  const blocked = await signInAgain(ctx, tenant);
  assert.equal(blocked.login.status, 403);
  assert.equal(blocked.login.body.error.code, "account_suspended");
  assert.equal((await ctx.owner.post(`/api/users/${id}/resume`)).status, 200);
  const back = await signInAgain(ctx, tenant);
  assert.equal(back.verify.status, 200);
  const rows = (await ctx.owner.get("/api/audit?action=users")).body.items.map(r => r.action);
  assert.ok(rows.includes("users.suspend") && rows.includes("users.resume"));
});

test("the owner cannot be changed through these routes, and bad ids are refused", async () => {
  const ctx = await ownerWithApp();
  const ownerId = (await ctx.owner.get("/api/users")).body.users.find(u => u.role === "owner").id;
  for (const path of ["reset-password", "suspend", "resume"]) assert.equal((await ctx.owner.post(`/api/users/${ownerId}/${path}`)).status, 403, path);
  assert.equal((await ctx.owner.put(`/api/users/${ownerId}/quota`, { maxApps: 1 })).status, 403);
  assert.equal((await ctx.owner.post("/api/users/abc/suspend")).status, 400);
  assert.equal((await ctx.owner.post("/api/users/99999/suspend")).status, 404);
});

test("a password reset kills the old password and every session, and forces a new password at the next sign-in", async () => {
  const ctx = await ownerWithApp();
  const tenant = await newAccount(ctx, { email: "t@example.test", ip: "198.51.100.50" });
  const reset = await ctx.owner.post(`/api/users/${tenant.made.user.id}/reset-password`);
  assert.equal(reset.status, 200);
  assert.equal((await tenant.browser.get("/api/auth/sessions")).status, 401);
  const old = await signInAgain(ctx, tenant);
  assert.equal(old.login.status, 401);
  const fresh = new Browser(ctx.app, { ip: "198.51.100.52" });
  const login = await fresh.post("/api/auth/login", { email: tenant.email, password: reset.body.temporaryPassword });
  assert.equal(login.status, 200);
  assert.equal(login.body.next, "change_password");
});

test("quota changes: validated, tenant accounts only", async () => {
  const ctx = await ownerWithApp();
  const tenant = await newAccount(ctx, { email: "t@example.test", ip: "198.51.100.60" });
  const viewer = await newAccount(ctx, { email: "v@example.test", role: "viewer", ip: "198.51.100.61" });
  const ok = await ctx.owner.put(`/api/users/${tenant.made.user.id}/quota`, { maxApps: 5, maxCpu: 2 });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.quota.maxApps, ok.body.quota.maxCpu, ok.body.quota.maxDatabases], [5, 2, 1]);
  assert.equal((await ctx.owner.put(`/api/users/${tenant.made.user.id}/quota`, { maxApps: 500 })).status, 400);
  assert.equal((await ctx.owner.put(`/api/users/${tenant.made.user.id}/quota`, {})).status, 400);
  assert.equal((await ctx.owner.put(`/api/users/${viewer.made.user.id}/quota`, { maxApps: 1 })).status, 400);
});
