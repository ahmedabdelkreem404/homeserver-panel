import test from "node:test";
import assert from "node:assert/strict";
import { MANAGED_MARKER, ProtectionPolicy, validateSubdomain } from "../src/protection-policy.js";
import { HsError } from "../src/errors.js";

const projects = [
  { projectId: "p-infra", name: "infra" },
  { projectId: "p-mcp", name: "mcp-gateway" },
  { projectId: "p-panel", name: "homeserver-panel" },
  { projectId: "p-hs", name: "hs-demo" },
];

test("subdomain validation table", () => {
  const ok = ["hs-static", "a1", "my-app-2"];
  for (const s of ok) assert.equal(validateSubdomain(s), `${s}.talabq.com`);
  const bad = [
    ["Upper", "usage"], ["two.labels", "usage"], ["-start", "usage"], ["end-", "usage"], ["", "usage"], ["under_score", "usage"], ["x".repeat(64), "usage"],
    ["panel", "refused"], ["mcp", "refused"], ["www", "refused"], ["root", "refused"],
  ];
  for (const [s, kind] of bad) assert.throws(() => validateSubdomain(s), e => e instanceof HsError && e.kind === kind, `"${s}" should be ${kind}`);
});

test("a host used by another service is refused, but an app may keep its own host", () => {
  assert.throws(() => validateSubdomain("mcp2", { usedHosts: ["mcp2.talabq.com"] }), e => e.kind === "refused");
  assert.equal(validateSubdomain("mine", { usedHosts: ["mine.talabq.com"], ownHosts: ["mine.talabq.com"] }), "mine.talabq.com");
});

test("protected projects are refused by name (case-insensitive) and by id", () => {
  const policy = new ProtectionPolicy(projects);
  for (const n of ["infra", "MCP-Gateway", "Homeserver-Panel"]) assert.throws(() => policy.assertProjectName(n), e => e.kind === "refused");
  for (const id of ["p-infra", "p-mcp", "p-panel"]) assert.throws(() => policy.assertProjectId(id), e => e.kind === "refused");
  assert.doesNotThrow(() => policy.assertProjectName("hs-demo"));
  assert.doesNotThrow(() => policy.assertProjectId("p-hs"));
});

test("an app without the hsdeploy marker cannot be changed, even in a normal project", () => {
  const policy = new ProtectionPolicy(projects);
  assert.throws(() => policy.assertManagedApp({ name: "manual", description: "made by hand" }, "p-hs"), e => e.kind === "refused");
  assert.doesNotThrow(() => policy.assertManagedApp({ name: "mine", description: MANAGED_MARKER }, "p-hs"));
  assert.throws(() => policy.assertManagedApp({ name: "mine", description: MANAGED_MARKER }, "p-infra"), e => e.kind === "refused");
});
