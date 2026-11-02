// Projects for the panel: list with usage, lifecycle actions, state check, logs, typed-name delete.
// Everything goes through the gateway, so the protection policy and the audit log apply to every action.
import { PanelError } from "../errors.js";

const ACTIONS = new Set(["deploy", "redeploy", "start", "stop", "restart"]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };

export function createProjects({ gateway, policy, containers, cacheMs = 10_000, now = () => new Date() }) {
  let cache;

  async function enrichApp(app, usageByService) {
    const [details, domains] = await Promise.all([gateway.appDetails(app.applicationId).catch(() => null), gateway.read("domain.byApplicationId", { applicationId: app.applicationId }).catch(() => [])]);
    const usage = details?.appName ? usageByService.get(details.appName) ?? null : null;
    return {
      applicationId: app.applicationId, name: app.name, status: app.status, appName: details?.appName ?? null,
      urls: (Array.isArray(domains) ? domains : []).map(d => `${d.https ? "https" : "http"}://${d.host}${d.path && d.path !== "/" ? d.path : ""}`.replace(/^http:/, "https:")),
      memoryLimit: details?.memoryLimit ?? null, cpuLimit: details?.cpuLimit ?? null, usage,
    };
  }

  return {
    async list({ fresh = false } = {}) {
      if (!fresh && cache && now().getTime() - cache.at < cacheMs) return cache.data;
      const projects = await gateway.listProjects();
      const stats = await containers.containers().catch(() => []);
      const usageByService = new Map(stats.map(s => [s.service, { cpuPercent: s.cpuPercent, memMb: s.memMb }]));
      const data = await Promise.all(projects.map(async p => ({
        projectId: p.projectId, name: p.name, description: p.description,
        protected: policy.isProtectedOwner({ projectId: p.projectId, name: p.name }),
        environments: await Promise.all(p.environments.map(async e => ({
          environmentId: e.environmentId, name: e.name,
          applications: await Promise.all(e.applications.map(a => enrichApp(a, usageByService))),
          composeCount: e.composeIds.length, databases: e.databases,
        }))),
      })));
      cache = { at: now().getTime(), data };
      return data;
    },

    // "done" in Dokploy only means the service was created: report whether a container really runs.
    async state(applicationId) {
      const d = await gateway.appDetails(applicationId);
      const list = d.appName ? await gateway.read("docker.getContainersByAppNameMatch", { appName: d.appName }) : [];
      const cs = (Array.isArray(list) ? list : []).map(c => ({ name: c.name, state: c.state, status: c.status }));
      const running = cs.some(c => c.state === "running");
      return { applicationId, name: d.name, dokployStatus: d.status, containers: cs, running, verdict: running ? "running" : d.status === "done" ? "created-not-running" : d.status ?? "unknown" };
    },

    async action(ctx, applicationId, action) {
      if (!ACTIONS.has(action)) throw new PanelError("invalid_request", `Unknown action. Use one of: ${[...ACTIONS].join(", ")}.`);
      cache = undefined;
      if (action === "restart") {
        const d = await gateway.appDetails(applicationId);
        return gateway.call(ctx, "application.reload", { applicationId, appName: d.appName });
      }
      return gateway.call(ctx, `application.${action}`, { applicationId });
    },

    async logs({ applicationId, type = "runtime", tail, since }) {
      const lines = clamp(tail, 1, 1000, 200);
      if (type === "runtime") return { type, text: String(await gateway.read("application.readLogs", { applicationId, tail: lines, ...(/^\d+[smhd]$/.test(since ?? "") ? { since } : {}) }) ?? "") };
      if (type !== "build") throw new PanelError("invalid_request", "type must be runtime or build.");
      const deployments = await gateway.read("deployment.all", { applicationId });
      const latest = Array.isArray(deployments) ? deployments[0] : null;
      if (!latest?.deploymentId) return { type, text: "", note: "No deployment yet." };
      return { type, deploymentStatus: latest.status ?? null, text: String(await gateway.read("deployment.readLogs", { deploymentId: latest.deploymentId, tail: lines }) ?? "") };
    },

    // The typed name must equal the real name; protected projects are refused by the policy.
    async deleteProject(ctx, { projectId, confirmName }) {
      const project = await gateway.read("project.one", { projectId });
      if (typeof confirmName !== "string" || confirmName !== project?.name) throw new PanelError("invalid_request", "Type the project name exactly to confirm.");
      cache = undefined;
      return gateway.call(ctx, "project.remove", { projectId });
    },
    async deleteApp(ctx, { applicationId, confirmName }) {
      const d = await gateway.appDetails(applicationId);
      if (typeof confirmName !== "string" || confirmName !== d.name) throw new PanelError("invalid_request", "Type the app name exactly to confirm.");
      cache = undefined;
      return gateway.call(ctx, "application.delete", { applicationId });
    },
    waitForRunning: async (applicationId, { timeoutMs = 120_000, pollMs = 3000, state } = {}) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) { const s = await state(applicationId); if (s.running) return s; await sleep(pollMs); }
      return state(applicationId);
    },
  };
}
