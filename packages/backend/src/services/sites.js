// Creating a site for a hosting account: checks the allowance, turns the upload into a build context, then creates the
// Dokploy project (once per account), app, limits, domain and deployment, and removes everything again if any step fails.
// One build at a time for the whole server (it has 3.8 GiB of memory); a second request waits its turn.
import { PanelError } from "../errors.js";
import { readZip, unwrapRoot } from "../deploy/zip-read.js";
import { writeZip } from "../deploy/zip-write.js";
import { defaultEnv, prepareBuild } from "../deploy/templates.js";

// The panel holds the upload, the unpacked files and the rebuilt zip in memory inside a 256 MB container, so these
// ceilings sit below what the allowance could say. A bigger site needs a bigger panel container first.
export const MAX_UPLOAD_BYTES = 32 * 1048576;
const UNZIP_LIMITS = Object.freeze({ maxTotalBytes: 96 * 1048576, maxEntryBytes: 48 * 1048576, maxFiles: 5000 });

// What a new site reserves from the allowance (memory in MB, CPU in cores). Nothing is guessed from the upload.
export const TEMPLATE_RESOURCES = Object.freeze({ static: { memoryMb: 64, cpu: 0.25 }, node: { memoryMb: 256, cpu: 0.5 }, next: { memoryMb: 384, cpu: 0.5 }, php: { memoryMb: 256, cpu: 0.5 }, laravel: { memoryMb: 384, cpu: 0.5 } });

const NAME = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
const MARKER = "managed-by:panel";
const invalid = message => new PanelError("invalid_request", message);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A tiny FIFO lock: callers run one after another, and a failure never blocks the next one.
function createQueue() {
  let tail = Promise.resolve();
  return task => { const run = tail.then(task, task); tail = run.catch(() => {}); return run; };
}

export function createSites({ db, gateway, projects, hosting, accounts, audit, baseDomain, now = () => new Date(), buildTimeoutMs = 600_000, pollMs = 3000, wait = sleep }) {
  const queue = createQueue();

  async function audited(ctx, action, target, work) {
    const rowId = audit.begin({ actor: ctx.actor, action, target });
    try { const result = await work(); audit.finish(rowId, "ok", { template: result.template, warnings: result.warnings.length }); return result; }
    catch (e) { audit.finish(rowId, e instanceof PanelError && e.code !== "internal_error" ? "refused" : "error", { code: e.code ?? "error" }); throw e; }
  }

  // One Dokploy project per account, named from the account's slug. Its id is remembered in resource_ownership.
  async function tenantEnvironment(ctx, tenant) {
    const name = `t-${tenant.slug}`;
    const find = async () => (await projects.list({ fresh: true })).find(p => p.name === name && !p.protected);
    let project = await find();
    if (!project) {
      await gateway.call(ctx, "project.create", { name, description: `${MARKER} tenant:${tenant.slug}` });
      project = await find();
      if (!project) throw new PanelError("upstream_error", "The project for this account was not created.");
    }
    const known = db.prepare("SELECT 1 FROM resource_ownership WHERE kind = 'project' AND dokploy_id = ?").get(project.projectId);
    if (!known) db.prepare("INSERT OR IGNORE INTO resource_ownership (tenant_id, kind, dokploy_id, name, created_by, created_at) VALUES (?, 'project', ?, ?, ?, ?)").run(tenant.id, project.projectId, name, ctx.userId ?? null, now().toISOString());
    const environmentId = project.environments[0]?.environmentId;
    if (!environmentId) throw new PanelError("upstream_error", "The account's project has no environment.");
    return environmentId;
  }

  // The allowance check, against what the account really has now (not what it was a minute ago).
  async function checkAllowance(tenantId, quota, template, uploadBytes) {
    if (uploadBytes > Math.min(quota.maxUploadMb * 1048576, MAX_UPLOAD_BYTES)) throw invalid(`The upload is larger than this account may send (${Math.min(quota.maxUploadMb, MAX_UPLOAD_BYTES / 1048576)} MB).`);
    const mine = await hosting.sites(tenantId, { fresh: true });
    const need = TEMPLATE_RESOURCES[template];
    const memory = mine.reduce((sum, s) => sum + (s.limits.memoryMb ?? 0), 0), cpu = mine.reduce((sum, s) => sum + (s.limits.cpu ?? 0), 0);
    const links = mine.reduce((sum, s) => sum + s.urls.length, 0);
    if (mine.length + 1 > quota.maxApps) throw invalid(`This account already has ${mine.length} of ${quota.maxApps} sites.`);
    if (memory + need.memoryMb > quota.maxMemoryMb) throw invalid(`A ${template} site needs ${need.memoryMb} MB of memory; ${quota.maxMemoryMb - memory} MB are left in the allowance.`);
    if (cpu + need.cpu > quota.maxCpu + 1e-9) throw invalid(`A ${template} site needs ${need.cpu} CPU; ${Math.max(0, Math.round((quota.maxCpu - cpu) * 100) / 100)} are left in the allowance.`);
    if (links + 1 > quota.maxSubdomains) throw invalid(`This account already uses ${links} of ${quota.maxSubdomains} links.`);
    return mine;
  }

  async function waitForBuild(applicationId, before) {
    const t0 = Date.now();
    while (Date.now() - t0 < buildTimeoutMs) {
      const latest = (await gateway.read("deployment.all", { applicationId }))?.[0];
      if (latest && latest.deploymentId !== before && latest.status !== "running") {
        if (latest.status === "done") return;
        const tail = String(await gateway.read("deployment.readLogs", { deploymentId: latest.deploymentId, tail: 20 }).catch(() => "")).trim();
        throw new PanelError("upstream_error", `The build failed (${latest.status}). Last lines:\n${tail}`);
      }
      await wait(pollMs);
    }
    throw new PanelError("upstream_timeout", `The build did not finish within ${buildTimeoutMs / 60_000} minutes.`);
  }

  async function create(ctx, tenantId, { name, template, zip }) {
    const slugged = typeof name === "string" ? name.trim().toLowerCase() : "";
    if (!NAME.test(slugged)) throw invalid("The site name must be 3 to 30 lowercase letters, digits or dashes, start with a letter and not end with a dash.");
    if (!Buffer.isBuffer(zip) || zip.length === 0) throw invalid("Send the project as a zip file.");
    if (zip.length > MAX_UPLOAD_BYTES) throw invalid("The upload is too large for the panel.");
    const tenant = accounts.tenantInfo(tenantId);
    const quota = accounts.quotaOf(tenantId);

    // Everything that can be refused is checked before Dokploy is touched.
    const built = prepareBuild(unwrapRoot(readZip(zip, UNZIP_LIMITS)), { template: template || undefined });
    if (built.template === "custom") throw invalid("Projects with their own Dockerfile are not accepted here.");
    const mine = await checkAllowance(tenantId, quota, built.template, zip.length);
    if (mine.some(s => s.name === slugged)) throw invalid("This account already has a site with that name.");
    const host = `${tenant.slug}-${slugged}.${baseDomain}`;
    const buildZip = writeZip(built.entries);
    const env = defaultEnv(built.template);
    const need = TEMPLATE_RESOURCES[built.template];

    const environmentId = await tenantEnvironment(ctx, tenant);
    const app = await gateway.call(ctx, "application.create", { name: slugged, environmentId, sourceType: "drop", description: `${MARKER} tenant:${tenant.slug}` });
    projects.invalidate();
    const applicationId = app?.applicationId;
    if (!applicationId) throw new PanelError("upstream_error", "Dokploy did not return the new site.");
    db.prepare("INSERT INTO resource_ownership (tenant_id, kind, dokploy_id, name, created_by, created_at) VALUES (?, 'application', ?, ?, ?, ?)").run(tenantId, applicationId, slugged, ctx.userId ?? null, now().toISOString());
    try {
      await gateway.call(ctx, "application.update", { applicationId, memoryLimit: String(need.memoryMb * 1048576), cpuLimit: String(Math.round(need.cpu * 1e9)) });
      await gateway.call(ctx, "application.saveBuildType", { applicationId, buildType: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "", dockerBuildStage: "", herokuVersion: null, railpackVersion: null });
      if (Object.keys(env).length) await gateway.call(ctx, "application.saveEnvironment", { applicationId, env: Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n"), buildArgs: null, buildSecrets: null, createEnvFile: false });
      await gateway.call(ctx, "domain.create", { host, path: "/", port: built.port, https: false, certificateType: "none", applicationId, domainType: "application" });
      const before = (await gateway.read("deployment.all", { applicationId }))?.[0]?.deploymentId;
      await gateway.upload(ctx, "application.dropDeployment", { applicationId }, { file: buildZip, fileName: `${slugged}.zip` });
      await waitForBuild(applicationId, before);
      const state = await projects.waitForRunning(applicationId, { timeoutMs: 120_000, pollMs, state: id => projects.state(id) });
      return { applicationId, name: slugged, url: `https://${host}`, template: built.template, warnings: built.warnings, running: state.running };
    } catch (e) {
      // Nothing half-made is left behind: the app (and with it its domain) goes, and so does the ownership row.
      await gateway.call(ctx, "application.delete", { applicationId }).catch(() => {});
      db.prepare("DELETE FROM resource_ownership WHERE kind = 'application' AND dokploy_id = ?").run(applicationId);
      projects.invalidate();
      throw e;
    }
  }

  return { createSite: (ctx, tenantId, input) => queue(() => audited(ctx, "hosting.create_site", `tenant:${tenantId}`, () => create(ctx, tenantId, input))) };
}
