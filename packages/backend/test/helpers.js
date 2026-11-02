// In-memory stand-in for Dokploy, shaped like the answers recorded in steps 0.1 to 0.3:
// project.all returns summaries, application.one carries env, environment.one carries projectId and project.name.
import { PanelError } from "../src/errors.js";
import { DB_TYPES } from "../src/dokploy-shapes.js";

export function makeWorld() {
  const world = {
    projects: [
      { projectId: "p-infra", name: "infra" },
      { projectId: "p-mcp", name: "mcp-gateway" },
      { projectId: "p-panel", name: "homeserver-panel" },
      { projectId: "p-hs", name: "hs-demo" },
      { projectId: "p-other", name: "hs-other" },
    ],
    environments: [
      { environmentId: "e-infra", projectId: "p-infra" }, { environmentId: "e-mcp", projectId: "p-mcp" },
      { environmentId: "e-panel", projectId: "p-panel" }, { environmentId: "e-hs", projectId: "p-hs" }, { environmentId: "e-other", projectId: "p-other" },
    ],
    apps: [
      { applicationId: "a-infra", name: "cloudflared", environmentId: "e-infra" }, { applicationId: "a-mcp", name: "dokploy-mcp", environmentId: "e-mcp" },
      { applicationId: "a-panel", name: "panel", environmentId: "e-panel" }, { applicationId: "a-hs", name: "site", environmentId: "e-hs" },
      { applicationId: "a-other", name: "other", environmentId: "e-other" },
    ],
    composes: [{ composeId: "c-infra", environmentId: "e-infra" }, { composeId: "c-mcp", environmentId: "e-mcp" }, { composeId: "c-panel", environmentId: "e-panel" }, { composeId: "c-hs", environmentId: "e-hs" }],
    dbs: DB_TYPES.flatMap(t => [{ type: t, id: `${t}-mcp`, environmentId: "e-mcp" }, { type: t, id: `${t}-infra`, environmentId: "e-infra" }, { type: t, id: `${t}-panel`, environmentId: "e-panel" }, { type: t, id: `${t}-hs`, environmentId: "e-hs" }]),
    domains: [{ domainId: "d-mcp", applicationId: "a-mcp" }, { domainId: "d-infra-compose", composeId: "c-infra" }, { domainId: "d-panel", applicationId: "a-panel" }, { domainId: "d-hs", applicationId: "a-hs" }, { domainId: "d-hs-compose", composeId: "c-hs" }],
    apiKeys: [
      { id: "k-cc", name: "claude-code" }, { id: "k-rt", name: "remote-test" }, { id: "k-hp", name: "homeserver-panel" }, { id: "k-dc", name: "deploy-cli" }, { id: "k-user", name: "my-tool" },
    ],
    getErrors: {}, postErrors: {},
  };
  return world;
}

export function fakeDokploy(world) {
  const calls = [];
  const notFound = () => new PanelError("upstream_not_found", "not found");
  const find = (list, key, id) => list.find(x => x[key] === id) ?? (() => { throw notFound(); })();
  const client = {
    calls,
    get mutations() { return calls.filter(c => c.method === "POST"); },
    async get(procedure, query = {}) {
      calls.push({ method: "GET", procedure, query });
      if (world.getErrors[procedure]) throw world.getErrors[procedure];
      switch (procedure) {
        case "project.all":
          return world.projects.map(p => ({
            projectId: p.projectId, name: p.name, env: "PROJECT_SECRET=1",
            environments: world.environments.filter(e => e.projectId === p.projectId).map(e => ({
              environmentId: e.environmentId, name: "production",
              applications: world.apps.filter(a => a.environmentId === e.environmentId).map(a => ({ applicationId: a.applicationId, name: a.name, applicationStatus: "done" })),
              compose: world.composes.filter(c => c.environmentId === e.environmentId).map(c => ({ composeId: c.composeId })),
              ...Object.fromEntries(DB_TYPES.map(t => [t, world.dbs.filter(d => d.type === t && d.environmentId === e.environmentId).map(d => ({ [`${t}Id`]: d.id }))])),
            })),
          }));
        case "project.one": { const p = find(world.projects, "projectId", query.projectId); return { projectId: p.projectId, name: p.name, env: "X=1" }; }
        case "environment.one": { const e = find(world.environments, "environmentId", query.environmentId); const p = find(world.projects, "projectId", e.projectId); return { environmentId: e.environmentId, projectId: p.projectId, project: { projectId: p.projectId, name: p.name } }; }
        case "application.one": { const a = find(world.apps, "applicationId", query.applicationId); return { ...a, env: "APP_SECRET=hunter2-hunter2" }; }
        case "compose.one": return { ...find(world.composes, "composeId", query.composeId), env: "C=1" };
        case "domain.one": return find(world.domains, "domainId", query.domainId);
        case "user.get": return { user: { email: "owner@example.test", apiKeys: world.apiKeys.map(k => ({ ...k, enabled: true })) } };
        case "user.session": return { session: { activeOrganizationId: "org-1" } };
        case "settings.health": return { status: "ok" };
        case "user.haveRootAccess": return false;
        default: {
          const m = /^(\w+)\.one$/.exec(procedure);
          if (m && DB_TYPES.includes(m[1])) { const d = world.dbs.find(x => x.type === m[1] && x.id === query[`${m[1]}Id`]); if (!d) throw notFound(); return { environmentId: d.environmentId, databasePassword: "db-secret-secret" }; }
          throw new PanelError("upstream_error", `unexpected GET ${procedure}`);
        }
      }
    },
    async post(procedure, body) {
      calls.push({ method: "POST", procedure, body });
      if (world.postErrors[procedure]) throw world.postErrors[procedure];
      if (procedure === "user.createApiKey") return { id: "k-new", name: body.name, key: "NEWKEY-SECRET-VALUE-0123456789", prefix: null };
      return { ok: true, env: "LEAK=should-be-scrubbed" };
    },
  };
  return client;
}
