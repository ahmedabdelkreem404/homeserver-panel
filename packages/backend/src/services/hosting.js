// What a hosting account (tenant) may do with its own sites. Every call starts from resource_ownership: an id the client
// sends is only ever used after the database says this tenant owns it, and an id that is not theirs gets exactly the
// answer a missing one gets, so nobody can probe for other customers' sites. Dokploy calls still go through the gateway
// (protection policy and audit). Nothing internal (docker names, project names, other tenants) is returned.
import { PanelError } from "../errors.js";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const gone = () => new PanelError("upstream_not_found", "No such site.");
const id = value => { if (typeof value !== "string" || !ID.test(value)) throw gone(); return value; };

// Dokploy keeps memory in bytes and CPU in nanoCPUs, both as strings; a small number is read as whole cores.
const memoryMb = bytes => (bytes === null || bytes === undefined || bytes === "" ? null : Math.round(Number(bytes) / 1048576));
const cpuCores = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return n >= 1_000_000 ? n / 1e9 : n;
};

export function createHosting({ db, projects, audit, gateway, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => new Date() }) {
  const pending = new Set(); // image clean-ups that are still running
  const ownedIds = tenantId => new Set(db.prepare("SELECT dokploy_id FROM resource_ownership WHERE tenant_id = ? AND kind = 'application'").all(tenantId).map(r => r.dokploy_id));
  const assertOwns = (tenantId, applicationId) => {
    if (!db.prepare("SELECT 1 FROM resource_ownership WHERE tenant_id = ? AND kind = 'application' AND dokploy_id = ?").get(tenantId, id(applicationId))) throw gone();
    return applicationId;
  };
  const toSite = app => ({
    applicationId: app.applicationId, name: app.name, status: app.status, urls: app.urls,
    limits: { memoryMb: memoryMb(app.memoryLimit), cpu: cpuCores(app.cpuLimit) },
    usage: app.usage ? { cpuPercent: app.usage.cpuPercent, memMb: app.usage.memMb } : null,
  });

  async function sites(tenantId, { fresh = false } = {}) {
    const ids = ownedIds(tenantId);
    const out = [];
    for (const project of await projects.list({ fresh })) {
      if (project.protected) continue;
      for (const env of project.environments) for (const app of env.applications) if (ids.has(app.applicationId)) out.push(toSite(app));
    }
    return out;
  }

  // Swarm keeps stopped containers for a short while, and an image a container still uses cannot be removed: wait for them.
  async function removeBuiltImage(ctx, appName) {
    for (let i = 0; i < 20; i++) {
      const left = await gateway.read("docker.getContainersByAppNameMatch", { appName }).catch(() => []);
      if (!Array.isArray(left) || left.length === 0) break;
      await wait(3000);
    }
    const images = await gateway.read("dockerImage.getImages", {});
    for (const image of Array.isArray(images) ? images : []) {
      const repository = image.Repository ?? image.repository;
      if (repository !== appName) continue;
      await gateway.call(ctx, "dockerImage.removeImage", { repository, tag: image.Tag ?? image.tag ?? "latest", id: image.ID ?? image.id, force: true });
    }
  }

  async function audited(ctx, action, target, work) {
    const rowId = audit.begin({ actor: ctx.actor, action, target });
    try { const result = await work(); audit.finish(rowId, "ok", {}); return result; }
    catch (e) { audit.finish(rowId, e instanceof PanelError && e.code !== "internal_error" ? "refused" : "error", { code: e.code ?? "error" }); throw e; }
  }

  return {
    sites,

    // The allowance and what is used of it. An app with no limit is counted and flagged, never silently ignored.
    async overview(tenantId, quota) {
      const mine = await sites(tenantId);
      const databases = Number(db.prepare("SELECT count(*) AS n FROM resource_ownership WHERE tenant_id = ? AND kind = 'database'").get(tenantId).n);
      return {
        quota,
        usage: {
          apps: mine.length, databases,
          memoryMb: mine.reduce((sum, s) => sum + (s.limits.memoryMb ?? 0), 0),
          cpu: Math.round(mine.reduce((sum, s) => sum + (s.limits.cpu ?? 0), 0) * 100) / 100,
          subdomains: mine.reduce((sum, s) => sum + s.urls.length, 0),
          withoutLimits: mine.filter(s => s.limits.memoryMb === null || s.limits.cpu === null).length,
        },
      };
    },

    async state(tenantId, applicationId) {
      const s = await projects.state(assertOwns(tenantId, applicationId));
      return { applicationId: s.applicationId, name: s.name, running: s.running, verdict: s.verdict, containers: s.containers.map(c => ({ state: c.state, status: c.status })) };
    },
    logs: (tenantId, { applicationId, type, tail, since }) => projects.logs({ applicationId: assertOwns(tenantId, applicationId), type, tail, since }),
    async action(ctx, tenantId, applicationId, action) {
      await projects.action(ctx, assertOwns(tenantId, applicationId), action);
      return { ok: true };
    },
    async deleteSite(ctx, tenantId, { applicationId, confirmName }) {
      assertOwns(tenantId, applicationId);
      const appName = (await gateway.appDetails(applicationId).catch(() => null))?.appName;
      await projects.deleteApp(ctx, { applicationId, confirmName });
      db.prepare("DELETE FROM resource_ownership WHERE kind = 'application' AND dokploy_id = ?").run(applicationId);
      if (appName) {
        // The built image is removed in the background once the containers are gone; a failure only leaves an image behind.
        const task = removeBuiltImage(ctx, appName).catch(() => {}).finally(() => pending.delete(task));
        pending.add(task);
      }
      return { ok: true };
    },
    settled: () => Promise.all([...pending]),

    // Owner only: hands an existing app to a tenant. Apps in protected projects, and apps already owned, are refused.
    assign(ctx, tenantId, applicationId) {
      return audited(ctx, "hosting.assign", `app:${applicationId}`, async () => {
        const wanted = id(applicationId);
        let found = null;
        for (const project of await projects.list({ fresh: true })) for (const env of project.environments) for (const app of env.applications) {
          if (app.applicationId === wanted) found = { app, protectedProject: project.protected };
        }
        if (!found || found.protectedProject) throw new PanelError("invalid_request", "No such app, or it belongs to a protected project.");
        if (db.prepare("SELECT 1 FROM resource_ownership WHERE kind = 'application' AND dokploy_id = ?").get(wanted)) throw new PanelError("invalid_request", "That app already belongs to an account.");
        db.prepare("INSERT INTO resource_ownership (tenant_id, kind, dokploy_id, name, created_by, created_at) VALUES (?, 'application', ?, ?, ?, ?)").run(tenantId, wanted, found.app.name, ctx.userId ?? null, now().toISOString());
        return { ok: true, name: found.app.name };
      });
    },
    unassign(ctx, tenantId, applicationId) {
      return audited(ctx, "hosting.unassign", `app:${applicationId}`, async () => {
        const changes = Number(db.prepare("DELETE FROM resource_ownership WHERE tenant_id = ? AND kind = 'application' AND dokploy_id = ?").run(tenantId, id(applicationId)).changes);
        if (changes !== 1) throw gone();
        return { ok: true };
      });
    },
  };
}
