import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PanelError } from "../src/errors.js";
import { readZip } from "../src/deploy/zip-read.js";
import { newAccount, ownerWithApp } from "./account-helpers.js";
import { makeZip } from "./zip-helpers.js";

const staticZip = () => makeZip([{ name: "site/index.html", data: "<h1>hello</h1>" }, { name: "site/app.css", data: "a{}" }, { name: "site/.env", data: "SECRET=1" }]);
const laravelZip = () => makeZip([{ name: "artisan", data: "#!/usr/bin/env php" }, { name: "composer.json", data: JSON.stringify({ require: { "laravel/framework": "^11" } }) }, { name: "public/index.php", data: "<?php" }]);
const procedures = ctx => ctx.client.calls.filter(c => c.method === "POST").map(c => c.procedure);

async function setup(quota) {
  const ctx = await ownerWithApp();
  const person = await newAccount(ctx, { email: "shop@example.test", slug: "shop-a", ip: "198.51.100.81" });
  if (quota) assert.equal((await ctx.owner.put(`/api/users/${person.made.user.id}/quota`, quota)).status, 200);
  return { ctx, person };
}

// The project goes up as the raw body of the request, like the browser does it.
async function upload({ ctx, person }, { name = "my-site", template, zip = staticZip(), who = person } = {}) {
  const query = `name=${name}${template ? `&template=${template}` : ""}`;
  const res = await ctx.app.inject({ method: "POST", url: `/api/my/sites?${query}`, payload: zip, headers: { cookie: who.browser.cookieHeader(), "x-csrf-token": who.browser.cookies["__Host-panel_csrf"], "content-type": "application/zip", "cf-connecting-ip": "198.51.100.81" } });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

test("a tenant creates a static site: project, app, limits, domain, upload, all within its own account", async () => {
  const s = await setup();
  const res = await upload(s);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.name, res.body.url, res.body.template, res.body.running], ["my-site", "https://shop-a-my-site.talabq.com", "static", true]);
  assert.deepEqual(procedures(s.ctx), ["project.create", "application.create", "application.update", "application.saveBuildType", "domain.create", "application.dropDeployment"]);
  const calls = Object.fromEntries(s.ctx.client.calls.filter(c => c.method === "POST").map(c => [c.procedure, c.body]));
  assert.equal(calls["project.create"].name, "t-shop-a");
  assert.deepEqual([calls["application.update"].memoryLimit, calls["application.update"].cpuLimit], ["67108864", "250000000"]);
  assert.deepEqual([calls["domain.create"].host, calls["domain.create"].https, calls["domain.create"].certificateType], ["shop-a-my-site.talabq.com", false, "none"]);
  const sent = readZip(s.ctx.world.uploads[0].bytes).map(e => e.path).sort();
  assert.deepEqual(sent, ["Dockerfile", "nginx.conf", "public/app.css", "public/index.html"], "a Dockerfile was added and the .env file never left the panel");

  const mine = (await s.person.browser.get("/api/my/sites")).body.sites;
  assert.deepEqual(mine.map(x => [x.name, x.urls[0], x.limits.memoryMb]), [["my-site", "https://shop-a-my-site.talabq.com", 64]]);
  const usage = (await s.person.browser.get("/api/my/overview")).body.usage;
  assert.deepEqual([usage.apps, usage.memoryMb, usage.cpu, usage.subdomains], [1, 64, 0.25, 1]);
  const rows = s.ctx.db.prepare("SELECT kind, name FROM resource_ownership ORDER BY id").all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ kind: "project", name: "t-shop-a" }, { kind: "application", name: "my-site" }]);
  const audit = (await s.ctx.owner.get("/api/audit?limit=100")).body.items;
  assert.ok(audit.some(r => r.action === "hosting.create_site" && r.result === "ok" && r.actor === "shop@example.test"));
  assert.ok(audit.some(r => r.action === "application.create" && r.actor === "shop@example.test" && r.result === "ok"));

  // a second site reuses the account's project
  const second = await upload(s, { name: "second-one" });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(procedures(s.ctx).filter(p => p === "project.create").length, 1);
});

test("a Laravel site gets its generated key stored as an environment variable and never in an answer", async () => {
  const s = await setup({ maxMemoryMb: 512 });
  const res = await upload(s, { name: "shop", zip: laravelZip() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.template, "laravel");
  assert.ok(res.body.warnings.some(w => /vendor/.test(w)));
  const env = s.ctx.client.calls.find(c => c.procedure === "application.saveEnvironment").body.env;
  assert.match(env, /^APP_KEY=base64:[A-Za-z0-9+/]{43}=$/m);
  assert.match(env, /APP_DEBUG=false/);
  assert.ok(!JSON.stringify(res.body).includes("APP_KEY"));
  assert.deepEqual(s.ctx.client.calls.find(c => c.procedure === "application.update").body, { applicationId: res.body.applicationId, memoryLimit: String(384 * 1048576), cpuLimit: "500000000" });
});

test("the allowance is checked first: sites, memory, CPU, links and upload size; a refusal touches nothing in Dokploy", async () => {
  const cases = [
    [{ maxApps: 0 }, /0 of 0 sites/], [{ maxMemoryMb: 32 }, /needs 64 MB/], [{ maxCpu: 0.2 }, /needs 0.25 CPU/], [{ maxSubdomains: 0 }, /0 of 0 links/],
  ];
  for (const [quota, message] of cases) {
    const s = await setup(quota);
    const res = await upload(s);
    assert.equal(res.status, 400, JSON.stringify(quota));
    assert.match(res.body.error.message, message);
    assert.deepEqual(procedures(s.ctx), [], `${JSON.stringify(quota)}: nothing was created`);
  }
  const s = await setup({ maxUploadMb: 1 });
  const big = makeZip([{ name: "index.html", data: crypto.randomBytes(1_300_000) }]);
  const res = await upload(s, { zip: big });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /larger than this account may send/);
  assert.deepEqual(procedures(s.ctx), []);
});

test("the allowance counts what is already there: the second site is refused when the first used the memory", async () => {
  const s = await setup({ maxMemoryMb: 100 });
  assert.equal((await upload(s, { name: "first-one" })).status, 200);
  const res = await upload(s, { name: "second-one" });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /36 MB are left/);
  assert.equal(procedures(s.ctx).filter(p => p === "application.create").length, 1);
});

test("bad input is refused before Dokploy: names, duplicates, hostile zips, custom Dockerfiles, unknown projects", async () => {
  const s = await setup();
  for (const name of ["Ab", "a", "9lives", "has space", "ends-", "x".repeat(40), "up/slash"]) assert.equal((await upload(s, { name })).status, 400, name);
  assert.equal((await upload(s, { zip: makeZip([{ name: "../evil.sh", data: "x" }]) })).status, 400);
  assert.equal((await upload(s, { zip: Buffer.from("not a zip at all, only some text") })).status, 400);
  assert.equal((await upload(s, { zip: makeZip([{ name: "Dockerfile", data: "FROM scratch" }, { name: "index.html", data: "x" }]) })).status, 400);
  assert.equal((await upload(s, { zip: makeZip([{ name: "notes.txt", data: "x" }]) })).status, 400);
  assert.equal((await upload(s, { template: "ruby" })).status, 400);
  assert.deepEqual(procedures(s.ctx), [], "none of that reached Dokploy");
  assert.equal((await upload(s, { name: "same-name" })).status, 200);
  const again = await upload(s, { name: "same-name" });
  assert.equal(again.status, 400);
  assert.match(again.body.error.message, /already has a site with that name/);
});

test("a step that fails removes everything the attempt made: the app, its ownership row, and the allowance is free again", async () => {
  for (const failure of ["domain", "build"]) {
    const s = await setup();
    if (failure === "domain") s.ctx.world.postErrors["domain.create"] = new PanelError("upstream_error", "Dokploy failed");
    else s.ctx.world.deployStatus = "error";
    const res = await upload(s);
    assert.equal(res.status, 502, failure);
    if (failure === "build") assert.match(res.body.error.message, /^Something went wrong|build failed|upstream/i);
    assert.ok(procedures(s.ctx).includes("application.delete"), `${failure}: the half-made app was deleted`);
    assert.equal(s.ctx.world.apps.some(a => a.name === "my-site"), false);
    assert.equal(s.ctx.db.prepare("SELECT count(*) AS n FROM resource_ownership WHERE kind = 'application'").get().n, 0);
    assert.deepEqual((await s.person.browser.get("/api/my/sites")).body.sites, []);
    assert.equal((await s.person.browser.get("/api/my/overview")).body.usage.apps, 0);
    const audit = (await s.ctx.owner.get("/api/audit?action=hosting")).body.items;
    assert.ok(audit.some(r => r.action === "hosting.create_site" && r.result !== "ok"));
  }
});

test("two uploads at the same time run one after the other", async () => {
  const s = await setup();
  const [a, b] = await Promise.all([upload(s, { name: "site-one" }), upload(s, { name: "site-two" })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  const order = procedures(s.ctx);
  const creates = order.map((p, i) => [p, i]).filter(([p]) => p === "application.create").map(([, i]) => i);
  const uploads = order.map((p, i) => [p, i]).filter(([p]) => p === "application.dropDeployment").map(([, i]) => i);
  assert.equal(creates.length, 2);
  assert.ok(creates[1] > uploads[0], "the second site starts only after the first one's build was handed over");
});

test("who may create: viewer and owner are refused, anonymous gets 401, an oversized body is cut off by the server", async () => {
  const s = await setup();
  const viewer = await newAccount(s.ctx, { email: "v@example.test", role: "viewer", ip: "198.51.100.82" });
  assert.equal((await upload(s, { who: viewer })).status, 403);
  const owner = { browser: s.ctx.owner };
  const asOwner = await upload(s, { who: owner });
  assert.equal(asOwner.status, 403);
  assert.match(asOwner.body.error.message, /no hosting space/);
  const anonymous = await s.ctx.app.inject({ method: "POST", url: "/api/my/sites?name=x", payload: staticZip(), headers: { "content-type": "application/zip" } });
  assert.ok([401, 403].includes(anonymous.statusCode));
  const huge = await upload(s, { zip: Buffer.alloc(33 * 1048576, 1) });
  assert.equal(huge.status, 413);
  assert.deepEqual(procedures(s.ctx), []);
});

test("the policy only lets site creation set what it needs: other fields, other build types and protected apps are refused", async () => {
  const s = await setup();
  const call = (procedure, args) => s.ctx.app.gateway.call({ actor: "test" }, procedure, args).then(() => null, e => e);
  assert.equal((await call("application.update", { applicationId: "a-hs", memoryLimit: "1", env: "X=1" })).code, "policy_refused");
  assert.equal((await call("application.update", { applicationId: "a-hs", dockerImage: "evil" })).code, "policy_refused");
  assert.equal((await call("application.saveBuildType", { applicationId: "a-hs", buildType: "nixpacks", dockerfile: "Dockerfile" })).code, "policy_refused");
  assert.equal((await call("application.create", { name: "x", environmentId: "e-hs", sourceType: "github" })).code, "policy_refused");
  assert.equal((await call("application.create", { name: "x", environmentId: "e-hs", sourceType: "drop", registryUrl: "evil" })).code, "policy_refused");
  assert.equal((await call("application.update", { applicationId: "a-infra", memoryLimit: "1" })).code, "policy_refused", "protected project");
  assert.equal((await call("application.create", { name: "x", environmentId: "e-infra", sourceType: "drop" })).code, "policy_refused", "protected environment");
  assert.equal((await call("application.dropDeployment", { applicationId: "a-mcp" })).code, "policy_refused");
  assert.equal((await call("application.update", { applicationId: "a-hs", memoryLimit: "1" })), null, "an ordinary app with allowed fields passes");
});
