import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate, openDatabase } from "../src/db.js";
import { PanelError } from "../src/errors.js";
import { normalizeApiKeys, normalizeProjects } from "../src/dokploy-shapes.js";
import { ProtectionPolicy } from "../src/protection-policy.js";
import { fakeDokploy, makeWorld } from "./helpers.js";

const KEY = "dk-0123456789abcdef0123456789abcdef";
const SK = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = name => JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), "utf8"));

async function app(world = makeWorld(), { ttl = 10_000 } = {}) {
  const lines = [];
  const logDestination = new Writable({ write(c, _e, cb) { lines.push(c.toString()); cb(); } });
  const client = fakeDokploy(world);
  const db = openDatabase(":memory:");
  migrate(db);
  const a = await buildApp({ config: loadConfig({ DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SK, LOG_LEVEL: "info" }), db, client, logDestination, healthTtlMs: ttl });
  return { a, client, db, lines, world };
}

test("GET /api/health: ok, with coarse states only and no secrets", async () => {
  const { a } = await app();
  const res = await a.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok", process: "ok", db: "ok", dokploy: "ok" });
  assert.ok(!res.body.includes(KEY) && !res.body.includes("dokploy:3000"));
  await a.close();
});

test("GET /api/health: a Dokploy problem degrades the answer and never becomes the panel's 401", async () => {
  for (const [error, expected] of [[new PanelError("upstream_auth_failed", "x"), "auth_failed"], [new PanelError("upstream_unreachable", "x"), "unreachable"], [new PanelError("upstream_timeout", "x"), "unreachable"], [new PanelError("upstream_error", "x"), "error"]]) {
    const world = makeWorld();
    world.getErrors["user.haveRootAccess"] = error;
    const { a } = await app(world);
    const res = await a.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200, "the panel itself is up");
    assert.deepEqual(res.json(), { status: "degraded", process: "ok", db: "ok", dokploy: expected });
    await a.close();
  }
});

test("GET /api/health: 503 when the database is broken; the Dokploy check is cached", async () => {
  const { a, client, db } = await app(makeWorld(), { ttl: 60_000 });
  await a.inject({ method: "GET", url: "/api/health" });
  await a.inject({ method: "GET", url: "/api/health" });
  assert.equal(client.calls.filter(c => c.procedure === "settings.health").length, 1, "cached for the ttl");
  db.close();
  const res = await a.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().db, "error");
  assert.equal(res.json().status, "error");
});

test("unknown routes answer with a JSON 404 and nothing else is public", async () => {
  const { a } = await app();
  for (const url of ["/", "/api/projects", "/api/audit", "/api/gateway"]) {
    const res = await a.inject({ method: "GET", url });
    assert.equal(res.statusCode, 404, url);
    assert.equal(res.json().error.code, "not_found");
  }
});

test("request logs never contain secret values or credential headers", async () => {
  const { a, lines } = await app();
  await a.inject({ method: "GET", url: "/api/health", headers: { "x-api-key": KEY, authorization: `Bearer ${KEY}`, cookie: `s=${KEY}` } });
  await a.close();
  const logged = lines.join("");
  assert.ok(logged.length > 0, "something was logged");
  assert.ok(!logged.includes(KEY), "the key value never reaches the log");
});

test("contract: the recorded project.all fixture is a summary and normalizes without env or appName", () => {
  const raw = fixture("project.all");
  const projects = normalizeProjects(raw);
  assert.ok(projects.some(p => p.name === "mcp-gateway") && projects.some(p => p.name === "infra"));
  const app0 = projects.find(p => p.name === "mcp-gateway").environments[0].applications[0];
  assert.deepEqual(Object.keys(app0).sort(), ["applicationId", "name", "status"]);
  assert.ok(!JSON.stringify(projects).includes("appName"));
  assert.ok(raw.every(p => p.env === "" || p.env === "[REDACTED]"), "the recording itself carries no env values");
});

test("contract: owner resolution works on the recorded shapes (application -> environment -> project name)", async () => {
  const ao = fixture("application.one"), eo = fixture("environment.one"), po = fixture("project.one");
  assert.ok(ao.environmentId && eo.projectId && eo.project.name, "the recorded shapes carry the links the policy needs");
  const client = {
    async get(procedure) {
      if (procedure === "application.one") return ao;
      if (procedure === "environment.one") return eo;
      if (procedure === "project.one") return po;
      if (procedure === "project.all") return fixture("project.all");
      throw new Error(procedure);
    },
  };
  const policy = new ProtectionPolicy({ client, projectNames: new Set(["infra", "mcp-gateway", "homeserver-panel"]), keyNames: new Set() });
  await policy.init();
  assert.deepEqual(await policy.owningProject("application", ao.applicationId), { projectId: eo.projectId, name: eo.project.name });
  await assert.rejects(policy.check("application.delete", { applicationId: ao.applicationId }), e => e.code === "policy_refused", "the recorded mcp-gateway app is protected");
});

test("contract: user.get fixture yields the key list with protection flags and no profile", () => {
  const keys = normalizeApiKeys(fixture("user.get"), new Set(["claude-code", "remote-test", "homeserver-panel", "deploy-cli"]));
  assert.ok(keys.length >= 3);
  assert.ok(keys.filter(k => k.protected).length >= 3);
  assert.ok(keys.every(k => !("key" in k)));
  assert.deepEqual(fixture("settings.health"), { status: "ok" });
  assert.equal(fixture("user.haveRootAccess"), false);
  assert.ok(Array.isArray(fixture("docker.getContainersByAppNameMatch")));
});
