import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPanelRepo, parseProjectConfig } from "../src/config.js";
import { Deployer } from "../src/deployer.js";
import { MANAGED_MARKER, ProtectionPolicy } from "../src/protection-policy.js";
import { dropSql, provisionSql, psqlCommand, sharedNames } from "../src/shared-postgres.js";

const base = { dokployProject: "hs-demo", app: "site", subdomain: "site", mode: "dockerfile" };

test("limits: 256 MB and 1 CPU by default, overridable, and out-of-range values are refused", () => {
  const cfg = parseProjectConfig(base);
  assert.equal(cfg.memoryLimitMb, 256);
  assert.equal(cfg.cpuLimit, 1);
  const custom = parseProjectConfig({ ...base, memoryLimitMb: 512, cpuLimit: 0.5 });
  assert.deepEqual([custom.memoryLimitMb, custom.cpuLimit], [512, 0.5]);
  for (const bad of [{ memoryLimitMb: 8 }, { memoryLimitMb: 9000 }, { memoryLimitMb: "256" }, { cpuLimit: 0 }, { cpuLimit: 9 }, { cpuLimit: "1" }]) {
    assert.throws(() => parseProjectConfig({ ...base, ...bad }), e => e.kind === "usage", JSON.stringify(bad));
  }
});

function fakeClient({ apps = [], projects, extra = {} } = {}) {
  const calls = [];
  const rec = (name, result) => async (...args) => { calls.push([name, ...args]); return typeof result === "function" ? result(...args) : result; };
  const client = {
    calls,
    listProjects: rec("listProjects", () => (typeof projects === "function" ? projects() : projects)),
    getApp: rec("getApp", id => apps.find(a => a.applicationId === id)),
    createApp: rec("createApp", {}),
    updateApp: rec("updateApp", {}),
    saveEnvironment: rec("saveEnvironment", {}),
    containersOf: rec("containersOf", [{ state: "running", containerId: "c1", name: "svc.1" }]),
    ...Object.fromEntries(Object.entries(extra).map(([name, fn]) => [name, rec(name, fn)])),
  };
  return client;
}

const demoApp = { applicationId: "a1", name: "site", appName: "app-site", description: MANAGED_MARKER, env: "KEEP=1" };
const demoProjects = [{ projectId: "p-hs", name: "hs-demo", description: MANAGED_MARKER, environments: [{ environmentId: "e1", name: "production", applications: [{ applicationId: "a1", name: "site" }], postgres: [] }] }];
const deployer = (client, over = {}) => new Deployer({ client, user: { sshHost: "homeserver" }, projectDir: ".", cfg: { ...parseProjectConfig(base) }, log: () => {}, sleepFn: async () => {}, ...over });

test("applyLimits sends bytes and nanoCPUs as strings, and skips when they already match", async () => {
  const client = fakeClient({ apps: [demoApp], projects: demoProjects });
  const d = await deployer(client).load();
  await d.applyLimits(demoApp);
  assert.deepEqual(client.calls.find(c => c[0] === "updateApp").slice(1), ["a1", { memoryLimit: "268435456", cpuLimit: "1000000000" }]);
  client.calls.length = 0;
  await d.applyLimits({ ...demoApp, memoryLimit: "268435456", cpuLimit: 1000000000 });
  assert.equal(client.calls.filter(c => c[0] === "updateApp").length, 0);
  const small = deployer(client, { cfg: parseProjectConfig({ ...base, memoryLimitMb: 128, cpuLimit: 0.5 }) });
  await small.load();
  await small.applyLimits({ ...demoApp, memoryLimit: "268435456", cpuLimit: "1000000000" });
  assert.deepEqual(client.calls.at(-1).slice(2), [{ memoryLimit: "134217728", cpuLimit: "500000000" }]);
});

test("the shared database names are safe, per project and per app, and the SQL carries no surprises", () => {
  assert.deepEqual(sharedNames("hs-demo", "My App!"), { database: "hs_demo_my_app_db", role: "hs_demo_my_app_user" });
  assert.notDeepEqual(sharedNames("a", "web"), sharedNames("b", "web"));
  const long = sharedNames("p".repeat(60), "a".repeat(60));
  assert.ok(long.database.length <= 48 && /^[a-z0-9_]+$/.test(long.database));
  const sql = provisionSql({ database: "d_db", role: "d_user", password: "ab".repeat(18) });
  assert.match(sql, /CREATE ROLE "d_user" LOGIN/);
  assert.match(sql, /ALTER ROLE "d_user" WITH LOGIN PASSWORD '(ab){18}'/);
  assert.equal(sql.match(/\gexec/g)?.length, 1, "psql needs a real backslash before gexec");
  assert.equal(dropSql({ database: "d_db", role: "d_user" }).match(/\gexec/g)?.length, 2);
  assert.match(sql, /REVOKE ALL ON DATABASE "d_db" FROM PUBLIC/);
  assert.match(dropSql({ database: "d_db", role: "d_user" }), /DROP DATABASE "d_db" WITH \(FORCE\)' FROM pg_database d JOIN pg_roles r.*r\.rolname = 'd_user'/);
  for (const bad of [{ database: "x\"; DROP DATABASE postgres; --", role: "r", password: "ab".repeat(18) }, { database: "d", role: "r'x", password: "ab".repeat(18) }, { database: "d", role: "r", password: "x'; --" }]) {
    assert.throws(() => provisionSql(bad), e => e.kind === "failed");
  }
  assert.throws(() => dropSql({ database: "a b", role: "r" }), e => e.kind === "failed");
  assert.match(psqlCommand("shared-postgres-abc", "hs_admin"), /^docker exec -i "\$\(docker ps -q --filter name=shared-postgres-abc \| head -n 1\)" psql -U hs_admin/);
  assert.throws(() => psqlCommand("x; rm -rf /", "u"), e => e.kind === "failed");
  assert.throws(() => psqlCommand("ok", "u$(id)"), e => e.kind === "failed");
});

const sharedProject = (postgres = []) => ({ projectId: "p-shared", name: "shared-services", description: MANAGED_MARKER, environments: [{ environmentId: "es", name: "production", applications: [], postgres }] });
const sharedService = { postgresId: "pg1", name: "shared-postgres", description: MANAGED_MARKER, appName: "shared-postgres-xyz", databaseUser: "hs_admin" };

test("db create postgres --shared: creates the shared service once, then a database and role over ssh stdin, and sets DATABASE_URL", async () => {
  let created = false, pgCreated = false;
  const client = fakeClient({
    apps: [demoApp],
    projects: () => [...demoProjects, ...(created ? [sharedProject(pgCreated ? [{ postgresId: "pg1" }] : [])] : [])],
    extra: {
      createProject: async () => { created = true; return {}; },
      createPostgres: async () => { pgCreated = true; return { postgresId: "pg1" }; },
      deployPostgres: async () => ({}),
      getPostgres: async () => sharedService,
    },
  });
  const ssh = [];
  const d = await deployer(client, { runSsh: (host, command, input) => { ssh.push({ host, command, input }); return ""; } }).load();
  const result = await d.dbCreate("postgres", { shared: true });
  assert.equal(result.service, "shared-postgres");
  assert.equal(ssh.length, 1);
  assert.equal(ssh[0].host, "homeserver");
  assert.doesNotMatch(ssh[0].command, /PASSWORD|password/i, "no secret in the command line");
  assert.match(ssh[0].input, /CREATE ROLE "hs_demo_site_user"/);
  const saved = client.calls.find(c => c[0] === "saveEnvironment");
  const env = saved[2];
  const url = /DATABASE_URL=(\S+)/.exec(env)[1];
  assert.match(url, /^postgresql:\/\/hs_demo_site_user:[a-f0-9]{36}@shared-postgres-xyz:5432\/hs_demo_site_db$/);
  assert.match(env, /KEEP=1/, "existing variables are kept");
  assert.equal(client.calls.filter(c => c[0] === "createPostgres").length, 1);
  // a second run finds the service and creates nothing new
  client.calls.length = 0;
  await d.dbCreate("postgres", { shared: true });
  assert.equal(client.calls.filter(c => c[0] === "createPostgres").length, 0);
  assert.equal(ssh.length, 2);
});

test("shared mode refuses mysql, and an unmanaged project called shared-services", async () => {
  const client = fakeClient({ apps: [demoApp], projects: [...demoProjects, { ...sharedProject(), description: "made by hand" }] });
  const d = await deployer(client).load();
  await assert.rejects(d.dbCreate("mysql", { shared: true }), e => e.kind === "usage");
  await assert.rejects(d.dbCreate("postgres", { shared: true }), e => e.kind === "refused");
});

test("down --with-db drops only this project's database through ssh when a shared service exists", async () => {
  const client = fakeClient({
    apps: [demoApp],
    projects: [...demoProjects, sharedProject([{ postgresId: "pg1" }])],
    extra: {
      domainsOf: async () => [], deleteApp: async () => ({}), containersOf: async () => [], images: async () => [],
      getPostgres: async () => sharedService, getMysql: async () => ({}),
    },
  });
  const ssh = [];
  const d = await deployer(client, { runSsh: (host, command, input) => { ssh.push(input); return ""; } }).load();
  await d.down({ withDb: true });
  assert.equal(ssh.length, 1);
  assert.match(ssh[0], /DROP DATABASE "hs_demo_site_db"/);
  assert.doesNotMatch(ssh[0], /CREATE/);
});

const panelProjects = [{ projectId: "p-panel", name: "homeserver-panel", environments: [{ environmentId: "ep", name: "production", applications: [{ applicationId: "ap", name: "panel" }], postgres: [] }] }, ...demoProjects];
const panelApp = { applicationId: "ap", name: "panel", appName: "app-panel", description: MANAGED_MARKER };
const panelCfg = parseProjectConfig({ dokployProject: "homeserver-panel", app: "panel", subdomain: "panel", mode: "dockerfile" });

test("the protected homeserver-panel project accepts up, status, logs and env only from the panel repository", async () => {
  const policy = repo => new ProtectionPolicy(panelProjects, { panelRepo: repo });
  assert.doesNotThrow(() => policy(true).assertProjectName("homeserver-panel", { panelOp: true }));
  assert.doesNotThrow(() => policy(true).assertProjectId("p-panel", { panelOp: true }));
  assert.throws(() => policy(false).assertProjectName("homeserver-panel", { panelOp: true }), e => e.kind === "refused");
  assert.throws(() => policy(true).assertProjectName("homeserver-panel"), e => e.kind === "refused", "no panelOp, no exception");
  for (const other of ["infra", "mcp-gateway", "shared-services"]) assert.throws(() => policy(true).assertProjectName(other, { panelOp: true }), e => e.kind === "refused", other);

  const client = fakeClient({ apps: [panelApp], projects: panelProjects, extra: { domainsOf: async () => [], deployments: async () => [] } });
  const fromRepo = await deployer(client, { cfg: panelCfg, panelRepo: true }).load();
  const app = await fromRepo.ensureApp({ panelOp: true });
  assert.equal(app.applicationId, "ap");
  await fromRepo.applyLimits(app);
  assert.ok(client.calls.some(c => c[0] === "updateApp" && c[1] === "ap"), "limits apply to the panel too");
  await assert.rejects(deployer(client, { cfg: panelCfg, panelRepo: false }).load(), e => e.kind === "refused");
  await assert.rejects(fromRepo.down(), e => e.kind === "refused", "down stays refused even from the panel repository");
  await assert.rejects(fromRepo.dbCreate("postgres"), e => e.kind === "refused");
  await assert.rejects(fromRepo.dbCreate("postgres", { shared: true }), e => e.kind === "refused");
});

test("isPanelRepo recognises this repository's marker and nothing else", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-panel-"));
  try {
    assert.equal(isPanelRepo(root), false);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "homeserver-panel" }));
    assert.equal(isPanelRepo(root), false, "the name alone is not enough");
    fs.mkdirSync(path.join(root, "packages", "backend", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "backend", "src", "protection-policy.js"), "");
    assert.equal(isPanelRepo(root), true);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "other" }));
    assert.equal(isPanelRepo(root), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
