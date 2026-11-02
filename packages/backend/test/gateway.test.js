import test from "node:test";
import assert from "node:assert/strict";
import { createAudit } from "../src/audit.js";
import { BUILT_IN_PROTECTED_KEYS, BUILT_IN_PROTECTED_PROJECTS } from "../src/config.js";
import { openDatabase, migrate } from "../src/db.js";
import { createGateway } from "../src/gateway.js";
import { PanelError } from "../src/errors.js";
import { ProtectionPolicy } from "../src/protection-policy.js";
import { fakeDokploy, makeWorld } from "./helpers.js";

async function setup() {
  const world = makeWorld();
  const client = fakeDokploy(world);
  const db = openDatabase(":memory:");
  migrate(db);
  const audit = createAudit(db);
  const policy = new ProtectionPolicy({ client, projectNames: new Set(BUILT_IN_PROTECTED_PROJECTS), keyNames: new Set(BUILT_IN_PROTECTED_KEYS) });
  await policy.init();
  const gateway = createGateway({ client, policy, audit, protectedKeyNames: new Set(BUILT_IN_PROTECTED_KEYS) });
  return { world, client, db, audit, policy, gateway };
}
const ctx = { actor: "owner@example.test" };
const rows = db => db.prepare("SELECT action, target, result, detail FROM audit_log ORDER BY id").all();

test("every mutating call writes exactly one audit row: ok, refused and error", async () => {
  const { gateway, client, db, world } = await setup();
  await gateway.call(ctx, "application.redeploy", { applicationId: "a-hs" });                                  // ok
  await assert.rejects(gateway.call(ctx, "application.delete", { applicationId: "a-mcp" }), e => e.code === "policy_refused"); // refused
  await assert.rejects(gateway.call(ctx, "settings.cleanAll", {}), e => e.code === "procedure_not_allowed");
  world.postErrors["application.stop"] = new PanelError("upstream_error", "boom");
  await assert.rejects(gateway.call(ctx, "application.stop", { applicationId: "a-hs" }), e => e.code === "upstream_error");   // error
  assert.deepEqual(rows(db).map(r => [r.action, r.result]), [
    ["application.redeploy", "ok"], ["application.delete", "refused"], ["settings.cleanAll", "refused"], ["application.stop", "error"],
  ]);
  assert.equal(client.mutations.length, 2, "only the allowed and attempted calls reached Dokploy (redeploy, stop)");
  assert.ok(rows(db).every(r => r.result !== "pending"), "no row is left pending");
});

test("a refused mutation never reaches Dokploy", async () => {
  const { gateway, client } = await setup();
  for (const [proc, args] of [["application.delete", { applicationId: "a-infra" }], ["project.remove", { projectId: "p-panel" }], ["user.deleteApiKey", { apiKeyId: "k-dc" }], ["postgres.remove", { postgresId: "postgres-mcp" }]]) {
    await assert.rejects(gateway.call(ctx, proc, args), e => e.code === "policy_refused", proc);
  }
  assert.deepEqual(client.mutations, []);
});

test("if the audit row cannot be written, the mutation does not run (fail closed)", async () => {
  const { client, policy } = await setup();
  const brokenAudit = { begin() { throw new Error("disk full"); }, finish() {} };
  const gateway = createGateway({ client, policy, audit: brokenAudit });
  await assert.rejects(gateway.call(ctx, "application.redeploy", { applicationId: "a-hs" }), /disk full/);
  assert.deepEqual(client.mutations, []);
});

test("the audit row holds identifiers and codes, never bodies or env", async () => {
  const { gateway, db } = await setup();
  await gateway.call(ctx, "application.redeploy", { applicationId: "a-hs", env: "TOP_SECRET=abc123abc123", title: "x" });
  const [row] = rows(db);
  assert.equal(row.target, "applicationId=a-hs");
  assert.ok(!JSON.stringify(row).includes("abc123"));
});

test("output is scrubbed and raw env readers do not exist", async () => {
  const { gateway } = await setup();
  const out = await gateway.call(ctx, "application.redeploy", { applicationId: "a-hs" });
  assert.equal(out.env, "[REDACTED]");
  const all = await gateway.read("project.all");
  assert.ok(all.every(p => p.env === "[REDACTED]"));
  await assert.rejects(gateway.read("application.one", { applicationId: "a-hs" }), e => e.code === "procedure_not_allowed");
  await assert.rejects(gateway.read("compose.one", { composeId: "c-hs" }), e => e.code === "procedure_not_allowed");
  const projects = await gateway.listProjects();
  assert.ok(!JSON.stringify(projects).includes("PROJECT_SECRET"));
});

test("createApiKey forces rateLimitEnabled:false, adds the organization, returns the key once and never audits it", async () => {
  const { gateway, client, db } = await setup();
  const created = await gateway.createApiKey(ctx, { name: "new-tool" });
  assert.equal(created.key, "NEWKEY-SECRET-VALUE-0123456789");
  const post = client.mutations.at(-1);
  assert.equal(post.body.rateLimitEnabled, false);
  assert.deepEqual(post.body.metadata, { organizationId: "org-1" });
  assert.ok(!JSON.stringify(rows(db)).includes("NEWKEY-SECRET"));
  await assert.rejects(gateway.createApiKey(ctx, { name: "claude-code" }), e => e.code === "policy_refused");
});

test("listApiKeys marks protected keys and never carries the owner profile", async () => {
  const { gateway } = await setup();
  const keys = await gateway.listApiKeys();
  assert.deepEqual(keys.filter(k => k.protected).map(k => k.name).sort(), ["claude-code", "deploy-cli", "homeserver-panel", "remote-test"]);
  assert.equal(keys.find(k => k.name === "my-tool").protected, false);
  assert.ok(!JSON.stringify(keys).includes("owner@example.test"));
  await gateway.deleteApiKey(ctx, { apiKeyId: "k-user" });
  await assert.rejects(gateway.deleteApiKey(ctx, { apiKeyId: "k-hp" }), e => e.code === "policy_refused");
});

test("a Dokploy 401 during a mutation is reported as upstream_auth_failed, audited as an error", async () => {
  const { gateway, world, db } = await setup();
  world.postErrors["application.deploy"] = new PanelError("upstream_auth_failed", "key rejected");
  await assert.rejects(gateway.call(ctx, "application.deploy", { applicationId: "a-hs" }), e => e.code === "upstream_auth_failed" && e.status === 502);
  assert.equal(rows(db)[0].result, "error");
});

test("known secret values are removed from any string in Dokploy answers, whatever the field is called", async () => {
  const { client, policy, audit } = await setup();
  const SECRET = "panel-secret-value-0123456789";
  const original = client.get.bind(client);
  client.get = async (p, q) => (p === "overview.services" ? { message: `pasted ${SECRET} here`, nested: [{ note: SECRET }] } : original(p, q));
  const gateway = createGateway({ client, policy, audit, secrets: [SECRET] });
  const out = await gateway.read("overview.services");
  assert.ok(!JSON.stringify(out).includes(SECRET));
  assert.equal(out.message, "pasted [REDACTED] here");
});
