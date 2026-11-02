import test from "node:test";
import assert from "node:assert/strict";
import { ProtectionPolicy, MUTATIONS } from "../src/protection-policy.js";
import { BUILT_IN_PROTECTED_KEYS, BUILT_IN_PROTECTED_PROJECTS } from "../src/config.js";
import { DB_TYPES } from "../src/dokploy-shapes.js";
import { PanelError } from "../src/errors.js";
import { fakeDokploy, makeWorld } from "./helpers.js";

async function setup(mutateWorld) {
  const world = makeWorld();
  const client = fakeDokploy(world);
  const policy = new ProtectionPolicy({ client, projectNames: new Set(BUILT_IN_PROTECTED_PROJECTS), keyNames: new Set(BUILT_IN_PROTECTED_KEYS) });
  await policy.init();
  mutateWorld?.(world);
  return { world, client, policy };
}
const code = p => p.then(() => "allowed", e => e.code);

// Every lifecycle procedure per item type, with an id from a protected project and one from a normal project.
const LIFECYCLE = [
  ...["deploy", "redeploy", "start", "stop", "reload", "delete"].map(v => ({ proc: `application.${v}`, arg: "applicationId", protectedIds: ["a-infra", "a-mcp", "a-panel"], okId: "a-hs" })),
  ...["deploy", "redeploy", "start", "stop", "delete"].map(v => ({ proc: `compose.${v}`, arg: "composeId", protectedIds: ["c-infra", "c-mcp", "c-panel"], okId: "c-hs" })),
  ...DB_TYPES.flatMap(t => ["deploy", "start", "stop", "reload", "rebuild", "remove"].map(v => ({ proc: `${t}.${v}`, arg: `${t}Id`, protectedIds: [`${t}-infra`, `${t}-mcp`, `${t}-panel`], okId: `${t}-hs` }))),
  ...["update", "delete"].map(v => ({ proc: `domain.${v}`, arg: "domainId", protectedIds: ["d-mcp", "d-infra-compose", "d-panel"], okId: "d-hs" })),
  { proc: "project.update", arg: "projectId", protectedIds: ["p-infra", "p-mcp", "p-panel"], okId: "p-hs" },
  { proc: "project.remove", arg: "projectId", protectedIds: ["p-infra", "p-mcp", "p-panel"], okId: "p-hs" },
  { proc: "project.duplicate", arg: "sourceProjectId", protectedIds: ["p-infra", "p-mcp", "p-panel"], okId: "p-hs" },
];

test("every mutating procedure x every protected project is refused; a normal project is allowed", async () => {
  const { policy } = await setup();
  let checked = 0;
  for (const c of LIFECYCLE) {
    for (const id of c.protectedIds) { assert.equal(await code(policy.check(c.proc, { [c.arg]: id })), "policy_refused", `${c.proc} on ${id}`); checked++; }
    assert.equal(await code(policy.check(c.proc, { [c.arg]: c.okId })), "allowed", `${c.proc} on ${c.okId}`);
  }
  assert.ok(checked > 100, `expected a large table, got ${checked}`);
});

test("domain.create is checked through the application or compose it belongs to", async () => {
  const { policy } = await setup();
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-mcp", host: "x.talabq.com" })), "policy_refused");
  assert.equal(await code(policy.check("domain.create", { composeId: "c-infra", host: "y.talabq.com" })), "policy_refused");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs", host: "new-site.talabq.com" })), "allowed");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs", composeId: "c-hs", host: "z.talabq.com" })), "invalid_request");
  assert.equal(await code(policy.check("domain.create", {})), "invalid_request");
});

test("moves check source and destination", async () => {
  const { policy } = await setup();
  assert.equal(await code(policy.check("application.move", { applicationId: "a-hs", targetEnvironmentId: "e-mcp" })), "policy_refused", "into a protected project");
  assert.equal(await code(policy.check("application.move", { applicationId: "a-mcp", targetEnvironmentId: "e-hs" })), "policy_refused", "out of a protected project");
  assert.equal(await code(policy.check("application.move", { applicationId: "a-hs", targetEnvironmentId: "e-other" })), "allowed");
  assert.equal(await code(policy.check("compose.move", { composeId: "c-hs", targetEnvironmentId: "e-infra" })), "policy_refused");
  assert.equal(await code(policy.check("compose.move", { composeId: "c-infra", targetEnvironmentId: "e-hs" })), "policy_refused");
});

test("a protected project recreated with a new id is still protected (checked by name)", async () => {
  const { policy, world } = await setup(w => {
    w.projects = w.projects.filter(p => p.projectId !== "p-infra");
    w.environments = w.environments.filter(e => e.projectId !== "p-infra");
    w.projects.push({ projectId: "p-infra-NEW", name: "  Infra " });
    w.environments.push({ environmentId: "e-infra-NEW", projectId: "p-infra-NEW" });
    w.apps.push({ applicationId: "a-infra-NEW", name: "cloudflared", environmentId: "e-infra-NEW" });
  });
  assert.equal(await code(policy.check("application.delete", { applicationId: "a-infra-NEW" })), "policy_refused");
  assert.equal(await code(policy.check("project.remove", { projectId: "p-infra-NEW" })), "policy_refused");
  assert.ok(world.projects.some(p => p.projectId === "p-infra-NEW"));
});

test("it fails closed: unknown owners, broken answers and upstream trouble never allow a mutation", async () => {
  const { policy, world } = await setup();
  assert.equal(await code(policy.check("application.delete", { applicationId: "does-not-exist" })), "policy_unresolved");
  assert.equal(await code(policy.check("domain.delete", { domainId: "does-not-exist" })), "policy_unresolved");
  world.apps.push({ applicationId: "a-orphan", name: "orphan", environmentId: "e-missing" });
  assert.equal(await code(policy.check("application.delete", { applicationId: "a-orphan" })), "policy_unresolved", "environment cannot be found");
  world.domains.push({ domainId: "d-nowhere" });
  assert.equal(await code(policy.check("domain.delete", { domainId: "d-nowhere" })), "policy_unresolved", "domain with no owner");
  world.getErrors["application.one"] = new PanelError("upstream_timeout", "slow");
  assert.equal(await code(policy.check("application.delete", { applicationId: "a-hs" })), "upstream_timeout");
  world.getErrors["application.one"] = new PanelError("upstream_auth_failed", "nope");
  assert.equal(await code(policy.check("application.delete", { applicationId: "a-hs" })), "upstream_auth_failed");
  delete world.getErrors["application.one"];
  world.getErrors["environment.one"] = new Error("boom");
  assert.equal(await code(policy.check("application.delete", { applicationId: "a-hs" })), "policy_unresolved", "unexpected error type");
});

test("procedures outside the allowlist and malformed arguments are refused", async () => {
  const { policy } = await setup();
  for (const proc of ["application.update", "application.saveEnvironment", "application.one", "settings.cleanAll", "server.remove", "user.createUserWithCredentials", "project.all"]) {
    assert.equal(await code(policy.check(proc, { applicationId: "a-hs" })), "procedure_not_allowed", proc);
  }
  assert.equal(await code(policy.check("application.delete", {})), "invalid_request");
  assert.equal(await code(policy.check("application.delete", { applicationId: "" })), "invalid_request");
  assert.equal(await code(policy.check("application.delete", { applicationId: 123 })), "invalid_request");
  assert.equal(await code(policy.check("application.delete", null)), "invalid_request");
  assert.equal(await code(policy.check("application.delete", [])), "invalid_request");
});

test("project.create refuses a protected name in any spelling", async () => {
  const { policy } = await setup();
  for (const name of ["infra", "INFRA", "  mcp-gateway ", "Homeserver-Panel"]) assert.equal(await code(policy.check("project.create", { name })), "policy_refused", name);
  assert.equal(await code(policy.check("project.create", { name: "hs-new" })), "allowed");
  assert.equal(await code(policy.check("project.create", {})), "invalid_request");
});

test("renaming or duplicating a normal project to a protected name is refused; a missing embedded project name falls back to project.one", async () => {
  const { policy, world } = await setup();
  for (const [proc, args] of [["project.update", { projectId: "p-hs", name: "Infra" }], ["project.duplicate", { sourceProjectId: "p-hs", name: " mcp-gateway" }]]) assert.equal(await code(policy.check(proc, args)), "policy_refused", proc);
  assert.equal(await code(policy.check("project.update", { projectId: "p-hs", name: "hs-renamed" })), "allowed");
  assert.equal(await code(policy.check("project.update", { projectId: "p-hs" })), "allowed", "no new name given");
  // Dokploy stops embedding project.name in environment.one: still resolved (and still refused for a protected project)
  const realGet = world.getErrors;
  const client = fakeDokploy(world);
  const original = client.get.bind(client);
  client.get = async (p, q) => { const r = await original(p, q); return p === "environment.one" ? { environmentId: r.environmentId, projectId: r.projectId } : r; };
  const p2 = new ProtectionPolicy({ client, projectNames: new Set(BUILT_IN_PROTECTED_PROJECTS), keyNames: new Set() });
  await p2.init();
  assert.equal(await code(p2.check("application.delete", { applicationId: "a-mcp" })), "policy_refused");
  assert.equal(await code(p2.check("application.delete", { applicationId: "a-hs" })), "allowed");
  assert.equal(realGet, world.getErrors);
});

test("protected API key names cannot be deleted; new keys must use rateLimitEnabled:false and a free name", async () => {
  const { policy } = await setup();
  for (const id of ["k-cc", "k-rt", "k-hp", "k-dc"]) assert.equal(await code(policy.check("user.deleteApiKey", { apiKeyId: id })), "policy_refused", id);
  assert.equal(await code(policy.check("user.deleteApiKey", { apiKeyId: "k-user" })), "allowed");
  assert.equal(await code(policy.check("user.deleteApiKey", { apiKeyId: "k-ghost" })), "policy_unresolved");
  assert.equal(await code(policy.check("user.createApiKey", { name: "deploy-cli", rateLimitEnabled: false })), "policy_refused", "cannot shadow a protected key");
  assert.equal(await code(policy.check("user.createApiKey", { name: "new-tool" })), "policy_refused", "rate limit default is not allowed (D7)");
  assert.equal(await code(policy.check("user.createApiKey", { name: "new-tool", rateLimitEnabled: true })), "policy_refused");
  assert.equal(await code(policy.check("user.createApiKey", { name: "new-tool", rateLimitEnabled: false })), "allowed");
});

test("the allowlist stays closed: no raw env writer, no server or settings procedure", () => {
  const names = Object.keys(MUTATIONS);
  assert.ok(names.every(n => !/saveEnvironment|saveExternalPort|settings\.|server\.|cleanAll|prune|traefik/i.test(n)));
});

test("domain host rules: only a free single-level subdomain of the base domain, HTTPS off, certificate none", async () => {
  const { policy, world } = await setup();
  const create = host => code(policy.check("domain.create", { applicationId: "a-hs", host, https: false, certificateType: "none" }));
  assert.equal(await create("new-site.talabq.com"), "allowed");
  assert.equal(await create("  New-Site.TalabQ.com "), "allowed", "spelling and spaces are normalized");
  for (const host of ["panel.talabq.com", "MCP.talabq.com", "www.talabq.com", "traefik.talabq.com", "api.talabq.com"]) assert.equal(await create(host), "policy_refused", `${host} is reserved`);
  assert.equal(await create("talabq.com"), "policy_refused", "the root domain");
  assert.equal(await create("evil.example.com"), "policy_refused", "another domain");
  assert.equal(await create("a.b.talabq.com"), "policy_refused", "two levels do not work with the wildcard");
  assert.equal(await create("talabq.com.evil.io"), "policy_refused", "base domain only as a prefix");
  assert.equal(await create("nottalabq.com"), "policy_refused", "suffix must start at a dot");
  for (const host of ["-bad.talabq.com", "bad-.talabq.com", "ba_d.talabq.com", "b ad.talabq.com", ".talabq.com"]) assert.ok(["invalid_request", "policy_refused"].includes(await create(host)), host);
  assert.equal(await create("hs-site.talabq.com"), "policy_refused", "already used by another app");
  assert.equal(await create("hs-compose.talabq.com"), "policy_refused", "already used by a compose service");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs", host: "x.talabq.com", https: true })), "policy_refused", "Cloudflare terminates TLS");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs", host: "x.talabq.com", certificateType: "letsencrypt" })), "policy_refused");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs" })), "invalid_request", "host is required");
  assert.equal(await code(policy.check("domain.create", { applicationId: "a-hs", host: "  " })), "invalid_request");
  // Updating: keeping its own host is fine, taking another app's host is not, and an update without a host passes the host rules.
  assert.equal(await code(policy.check("domain.update", { domainId: "d-hs", host: "hs-site.talabq.com" })), "allowed", "its own host");
  assert.equal(await code(policy.check("domain.update", { domainId: "d-hs", host: "hs-compose.talabq.com" })), "policy_refused");
  assert.equal(await code(policy.check("domain.update", { domainId: "d-hs", host: "panel.talabq.com" })), "policy_refused");
  assert.equal(await code(policy.check("domain.update", { domainId: "d-hs", https: false })), "allowed");
  assert.equal(await code(policy.check("domain.update", { domainId: "d-hs", https: true })), "policy_refused");
  // If the list of used hosts cannot be read, nothing is allowed.
  world.getErrors["overview.domains"] = new Error("boom");
  assert.equal(await create("another.talabq.com"), "policy_unresolved");
  world.getErrors["overview.domains"] = new PanelError("upstream_timeout", "slow");
  assert.equal(await create("another.talabq.com"), "upstream_timeout");
});

test("the base domain is configurable and its reserved names still apply", async () => {
  const client = fakeDokploy(makeWorld());
  const policy = new ProtectionPolicy({ client, projectNames: new Set(BUILT_IN_PROTECTED_PROJECTS), keyNames: new Set(), baseDomain: "example.org" });
  await policy.init();
  const create = host => code(policy.check("domain.create", { applicationId: "a-hs", host, https: false, certificateType: "none" }));
  assert.equal(await create("site.example.org"), "allowed");
  assert.equal(await create("site.talabq.com"), "policy_refused");
  assert.equal(await create("panel.example.org"), "policy_refused");
});
