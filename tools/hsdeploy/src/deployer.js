// Service layer: find-or-create, upload, wait, verify, clean up. Commands call this and add no logic of their own.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { HsError } from "./errors.js";
import { MANAGED_MARKER, ProtectionPolicy, reservedAllowedFor, validateSubdomain } from "./protection-policy.js";
import { SHARED_PROJECT, SHARED_SERVICE, dropSql, provisionSql, psqlCommand, sharedNames, slug } from "./shared-postgres.js";
import { buildZip, collectFiles } from "./zip.js";
import { STATIC_DOCKERFILE, STATIC_SERVER_JS } from "./templates.js";
import { mergeEnv, parseEnv } from "./env-file.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
// SQL goes over stdin, never into the command line.
const sshRun = (host, command, input) => execFileSync("ssh", ["-o", "BatchMode=yes", host, command], { input, encoding: "utf8", timeout: 90_000, stdio: ["pipe", "pipe", "pipe"] });
const asArray = v => (Array.isArray(v) ? v : v?.images ?? v?.data ?? []);

export class Deployer {
  constructor({ client, user, projectDir, cfg, log = console.log, sleepFn = sleep, panelRepo = false, runSsh = sshRun }) {
    Object.assign(this, { client, user, projectDir, cfg, log, sleep: sleepFn, panelRepo, runSsh });
  }

  async load() {
    this.projects = await this.client.listProjects();
    this.policy = new ProtectionPolicy(this.projects, { panelRepo: this.panelRepo });
    this.policy.assertProjectName(this.cfg.dokployProject, { panelOp: true }); // down and db create re-check strictly
    return this;
  }

  #project() { return this.projects.find(p => p.name.toLowerCase() === this.cfg.dokployProject.toLowerCase()); }
  #env(project) {
    const env = (project.environments ?? []).find(e => e.name === "production") ?? project.environments?.[0];
    if (!env) throw new HsError("failed", `Project "${project.name}" has no environment. Open it once in the Dokploy UI or delete and let hsdeploy recreate it.`);
    return env;
  }

  async ensureProject({ panelOp = false } = {}) {
    let project = this.#project();
    if (!project) {
      this.log(`Creating project "${this.cfg.dokployProject}"`);
      await this.client.createProject(this.cfg.dokployProject, MANAGED_MARKER);
      this.projects = await this.client.listProjects();
      this.policy = new ProtectionPolicy(this.projects, { panelRepo: this.panelRepo });
      project = this.#project();
    }
    this.policy.assertProjectId(project.projectId, { panelOp });
    return project;
  }

  async ensureApp({ panelOp = false } = {}) {
    const project = await this.ensureProject({ panelOp });
    const env = this.#env(project);
    let app = (env.applications ?? []).find(a => a.name === this.cfg.app);
    if (app) {
      // project.all only carries a summary (no appName, no description): read the full app before judging it
      app = await this.client.getApp(app.applicationId);
      this.policy.assertManagedApp(app, project.projectId, { panelOp });
    } else {
      this.log(`Creating app "${this.cfg.app}"`);
      app = await this.client.createApp({ name: this.cfg.app, environmentId: env.environmentId, description: MANAGED_MARKER });
    }
    this.project = project;
    this.app = app;
    return app;
  }

  async usedHosts() {
    const res = await this.client.get("overview.domains");
    return [...new Set(JSON.stringify(res ?? []).match(/[a-z0-9.-]+\.[a-z0-9-]+\.[a-z]{2,}/gi) ?? [])];
  }

  async ensureDomain(app) {
    const own = await this.client.domainsOf(app.applicationId);
    const ownHosts = own.map(d => d.host);
    const host = validateSubdomain(this.cfg.subdomain, { baseDomain: this.user.baseDomain, usedHosts: await this.usedHosts(), ownHosts, allowReserved: reservedAllowedFor(this.cfg.dokployProject, this.panelRepo) });
    const wanted = [host];
    if (this.cfg.rootDomain) {
      if (!(this.panelRepo && this.cfg.dokployProject === "homeserver-panel")) throw new HsError("refused", "\"rootDomain\" is reserved for the panel itself (homeserver-panel from its own repository).");
      wanted.push(this.user.baseDomain, `www.${this.user.baseDomain}`);
    }
    for (const d of own) if (!wanted.includes(d.host) || d.port !== this.cfg.port) await this.client.deleteDomain(d.domainId);
    for (const h of wanted) {
      if (own.some(d => d.host === h && d.port === this.cfg.port)) continue;
      this.log(`Creating domain ${h} (port ${this.cfg.port}, HTTPS off, certificate none)`);
      await this.client.createDomain({ host: h, port: this.cfg.port, applicationId: app.applicationId });
    }
    return host;
  }

  // Every app gets a memory and CPU ceiling (Dokploy wants bytes and nanoCPUs as strings). Unchanged values are not re-sent.
  async applyLimits(app) {
    const memoryLimit = String(this.cfg.memoryLimitMb * 1048576), cpuLimit = String(Math.round(this.cfg.cpuLimit * 1e9));
    if (String(app.memoryLimit ?? "") === memoryLimit && String(app.cpuLimit ?? "") === cpuLimit) return;
    this.log(`Setting limits: ${this.cfg.memoryLimitMb} MB memory, ${this.cfg.cpuLimit} CPU`);
    await this.client.updateApp(app.applicationId, { memoryLimit, cpuLimit });
  }

  runBuild() {
    if (!this.cfg.buildCommand) return;
    this.log(`Running local build: ${this.cfg.buildCommand}`);
    const r = spawnSync(this.cfg.buildCommand, { cwd: this.projectDir, shell: true, stdio: "inherit" });
    if (r.status !== 0) throw new HsError("failed", `Build command failed with exit code ${r.status}.`);
  }

  prepareZip() {
    let entries;
    if (this.cfg.mode === "static") {
      this.runBuild();
      const out = path.resolve(this.projectDir, this.cfg.outputDir);
      if (!fs.existsSync(out)) throw new HsError("failed", `outputDir "${this.cfg.outputDir}" does not exist after the build.`);
      const files = collectFiles(out, { useDockerignore: false });
      if (files.length === 0) throw new HsError("failed", `outputDir "${this.cfg.outputDir}" is empty.`);
      entries = [
        ...files.map(f => ({ name: `public/${f.name}`, abs: f.abs })),
        { name: "server.js", data: Buffer.from(STATIC_SERVER_JS) },
        { name: "Dockerfile", data: Buffer.from(STATIC_DOCKERFILE) },
      ];
    } else {
      if (!fs.existsSync(path.join(this.projectDir, "Dockerfile"))) throw new HsError("failed", "dockerfile mode needs a Dockerfile in the project root.");
      entries = collectFiles(this.projectDir).map(f => ({ name: f.name, abs: f.abs }));
    }
    const buffer = buildZip(entries);
    this.log(`Packed ${entries.length} files into a ${(buffer.length / 1048576).toFixed(2)} MB zip`);
    return { buffer, count: entries.length };
  }

  async deploy(app, buffer, { timeoutMs = 900_000, pollMs = 2000 } = {}) {
    const before = (await this.client.deployments(app.applicationId))?.[0]?.deploymentId;
    const t0 = Date.now();
    this.log("Uploading with application.dropDeployment");
    await this.client.dropDeploy(app.applicationId, buffer, `${this.cfg.app}.zip`);
    while (Date.now() - t0 < timeoutMs) {
      const latest = (await this.client.deployments(app.applicationId))?.[0];
      if (latest && latest.deploymentId !== before && latest.status !== "running") {
        if (latest.status === "done") { this.log(`Build and deploy finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`); return latest; }
        const tail = await this.client.deploymentLogs(latest.deploymentId, 30).catch(() => "");
        throw new HsError("failed", `Deployment ended with status "${latest.status}". Last log lines:\n${String(tail).trim()}`);
      }
      await this.sleep(pollMs);
    }
    throw new HsError("timeout", `Deployment did not finish within ${timeoutMs / 1000}s.`);
  }

  // "done" only means the service was created. Require a running container that stays the same container.
  async verifyRunning(app, { timeoutMs = 120_000, settleMs = 6000, pollMs = 3000 } = {}) {
    const t0 = Date.now();
    let first;
    while (Date.now() - t0 < timeoutMs) {
      const list = asArray(await this.client.containersOf(app.appName).catch(() => []));
      const running = list.find(c => c.state === "running");
      if (running && !first) { first = running.containerId; await this.sleep(settleMs); continue; }
      if (running && first) {
        if (running.containerId === first) { this.log(`Container ${running.name} is running and stable`); return running; }
        first = running.containerId; // it restarted: keep watching
        await this.sleep(settleMs);
        continue;
      }
      first = undefined;
      await this.sleep(pollMs);
    }
    const logs = await this.client.appLogs(app.applicationId, 30).catch(() => "");
    throw new HsError("failed", `No stable running container within ${timeoutMs / 1000}s (possible crash loop). Last app log lines:\n${String(logs).trim()}`);
  }

  async waitPublic(host, { expect, timeoutMs = 120_000 } = {}) {
    const url = `https://${host}`;
    const t0 = Date.now();
    let last = "no response";
    while (Date.now() - t0 < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        last = `HTTP ${res.status}`;
        if (res.status === 200) {
          const body = expect ? await res.text() : "";
          if (!expect || body.includes(expect)) return { url, seconds: (Date.now() - t0) / 1000 };
          last = `HTTP 200 but the page does not contain "${expect}"`;
        }
      } catch (e) { last = e?.cause?.code ?? e?.message ?? "error"; }
      await this.sleep(2000);
    }
    throw new HsError("timeout", `${url} did not return 200 within ${timeoutMs / 1000}s (last: ${last}).`);
  }

  async up({ expect, noVerify = false } = {}) {
    const app = await this.ensureApp({ panelOp: true });
    await this.client.saveBuildType(app.applicationId);
    await this.applyLimits(app);
    const host = await this.ensureDomain(app);
    const { buffer } = this.prepareZip();
    const previousImage = app.appName ? await this.imageIdOf(app.appName) : undefined;
    await this.deploy(app, buffer);
    const full = await this.client.getApp(app.applicationId);
    this.app = { ...app, appName: full.appName ?? app.appName };
    if (!noVerify) {
      await this.verifyRunning(this.app);
      const r = await this.waitPublic(host, { expect });
      this.log(`Public check passed in ${r.seconds.toFixed(1)} s`);
    }
    await this.removePreviousImage(previousImage, this.app.appName);
    return `https://${host}`;
  }

  async status() {
    const project = this.#project();
    const env = project && this.#env(project);
    const summary = env?.applications?.find(a => a.name === this.cfg.app);
    if (!summary) return { exists: false };
    const full = await this.client.getApp(summary.applicationId);
    this.policy.assertManagedApp(full, project.projectId, { panelOp: true });
    const app = full;
    const [domains, deps, containers] = await Promise.all([
      this.client.domainsOf(app.applicationId), this.client.deployments(app.applicationId), this.client.containersOf(app.appName).catch(() => []),
    ]);
    const hosts = domains.map(d => d.host);
    let http = "n/a";
    if (hosts[0]) http = await fetch(`https://${hosts[0]}`, { signal: AbortSignal.timeout(8000) }).then(r => `HTTP ${r.status}`).catch(() => "no response");
    return { exists: true, status: full.applicationStatus, hosts, lastDeployment: deps?.[0] ? { status: deps[0].status, title: deps[0].title, createdAt: deps[0].createdAt } : null, containers: asArray(containers).map(c => ({ name: c.name, state: c.state, status: c.status })), public: http };
  }

  async logs(tail) {
    const app = await this.#managedApp();
    return this.client.appLogs(app.applicationId, tail);
  }

  // project.all lists databases as {postgresId} only (no name): read each one to match by name.
  async #findDb(env, type, name) {
    for (const summary of env[type] ?? []) {
      const id = summary.postgresId ?? summary.mysqlId;
      const full = type === "postgres" ? await this.client.getPostgres(id) : await this.client.getMysql(id);
      if (full?.name === name) return full;
    }
    return undefined;
  }

  async #managedApp() {
    const project = this.#project();
    const summary = project && this.#env(project)?.applications?.find(a => a.name === this.cfg.app);
    if (!summary) throw new HsError("notfound", `App "${this.cfg.app}" does not exist in project "${this.cfg.dokployProject}". Run \`hsdeploy up\`.`);
    const app = await this.client.getApp(summary.applicationId);
    this.policy.assertManagedApp(app, project.projectId, { panelOp: true });
    return app;
  }

  async envPush() {
    if (!this.cfg.envFile) throw new HsError("usage", 'Set "envFile" in .hsdeploy.json first.');
    const file = path.resolve(this.projectDir, this.cfg.envFile);
    if (!fs.existsSync(file)) throw new HsError("usage", `envFile "${this.cfg.envFile}" does not exist.`);
    const updates = parseEnv(fs.readFileSync(file, "utf8"));
    const app = await this.ensureApp({ panelOp: true });
    const current = (await this.client.getApp(app.applicationId)).env ?? "";
    await this.client.saveEnvironment(app.applicationId, mergeEnv(current, updates));
    return [...updates.keys()];
  }

  // The shared Postgres service lives in the protected project "shared-services", created and kept by hsdeploy alone.
  async ensureSharedPostgres(image) {
    let projects = await this.client.listProjects();
    let project = projects.find(p => p.name.toLowerCase() === SHARED_PROJECT);
    if (!project) {
      this.log(`Creating project "${SHARED_PROJECT}"`);
      await this.client.createProject(SHARED_PROJECT, MANAGED_MARKER);
      projects = await this.client.listProjects();
      project = projects.find(p => p.name.toLowerCase() === SHARED_PROJECT);
    }
    if (!String(project.description ?? "").includes(MANAGED_MARKER)) throw new HsError("refused", `Project "${SHARED_PROJECT}" exists but was not created by hsdeploy.`);
    const env = this.#env(project);
    let svc = await this.#findDb(env, "postgres", SHARED_SERVICE);
    if (svc) this.policy.assertManagedService(svc);
    else {
      this.log(`Creating the shared postgres service "${SHARED_SERVICE}"`);
      const body = { name: SHARED_SERVICE, databaseName: "postgres", databaseUser: "hs_admin", databasePassword: crypto.randomBytes(18).toString("hex"), environmentId: env.environmentId, description: MANAGED_MARKER, dockerImage: image ?? "postgres:16" };
      svc = await this.client.createPostgres(body);
      await this.client.deployPostgres(svc.postgresId);
    }
    const full = await this.client.getPostgres(svc.postgresId);
    await this.verifyRunning({ appName: full.appName, applicationId: svc.postgresId }, { timeoutMs: 300_000 }).catch(e => { throw new HsError("failed", `The shared postgres did not become healthy: ${e.message.split("\n")[0]}`); });
    return { appName: full.appName, user: full.databaseUser };
  }

  async findSharedPostgres() {
    const project = (await this.client.listProjects()).find(p => p.name.toLowerCase() === SHARED_PROJECT);
    if (!project) return undefined;
    const svc = await this.#findDb(this.#env(project), "postgres", SHARED_SERVICE);
    if (!svc) return undefined;
    this.policy.assertManagedService(svc);
    const full = await this.client.getPostgres(svc.postgresId);
    return { appName: full.appName, user: full.databaseUser };
  }

  async dbCreateShared({ image } = {}) {
    const app = await this.ensureApp();
    const shared = await this.ensureSharedPostgres(image);
    const { database, role } = sharedNames(this.cfg.dokployProject, this.cfg.app);
    const password = crypto.randomBytes(18).toString("hex");
    this.log(`Creating database "${database}" and its role in the shared postgres`);
    this.runSsh(this.user.sshHost, psqlCommand(shared.appName, shared.user), provisionSql({ database, role, password }));
    const url = `postgresql://${role}:${password}@${shared.appName}:5432/${database}`;
    const current = (await this.client.getApp(app.applicationId)).env ?? "";
    await this.client.saveEnvironment(app.applicationId, mergeEnv(current, new Map([["DATABASE_URL", url]])));
    this.log("DATABASE_URL was written to the app environment (value not shown). Run `hsdeploy up` to apply it.");
    return { service: SHARED_SERVICE, host: shared.appName, database };
  }

  async dbCreate(type, { image, shared = false } = {}) {
    if (!["postgres", "mysql"].includes(type)) throw new HsError("usage", "db type must be postgres or mysql.");
    this.policy.assertProjectName(this.cfg.dokployProject); // strict: the panel exception never covers databases
    if (shared) {
      if (type !== "postgres") throw new HsError("usage", "--shared only exists for postgres.");
      return this.dbCreateShared({ image });
    }
    const app = await this.ensureApp();
    const env = this.#env(this.project);
    const name = `${this.cfg.app}-db`;
    let svc = await this.#findDb(env, type, name);
    const dbName = slug(this.cfg.app) || "app";
    const user = `${dbName}_user`.slice(0, 30);
    if (svc) this.policy.assertManagedService(svc, this.project.projectId);
    else {
      const password = crypto.randomBytes(18).toString("hex");
      const body = { name, databaseName: dbName, databaseUser: user, databasePassword: password, environmentId: env.environmentId, description: MANAGED_MARKER, dockerImage: image ?? (type === "postgres" ? "postgres:16" : "mysql:8") };
      if (type === "mysql") body.databaseRootPassword = crypto.randomBytes(18).toString("hex");
      this.log(`Creating ${type} service "${name}"`);
      svc = type === "postgres" ? await this.client.createPostgres(body) : await this.client.createMysql(body);
      type === "postgres" ? await this.client.deployPostgres(svc.postgresId) : await this.client.deployMysql(svc.mysqlId);
    }
    const id = svc.postgresId ?? svc.mysqlId;
    const full = type === "postgres" ? await this.client.getPostgres(id) : await this.client.getMysql(id);
    await this.verifyRunning({ appName: full.appName, applicationId: id }, { timeoutMs: 300_000 }).catch(e => { throw new HsError("failed", `Database service did not become healthy: ${e.message.split("\n")[0]}`); });
    const scheme = type === "postgres" ? "postgresql" : "mysql";
    const port = type === "postgres" ? 5432 : 3306;
    const url = `${scheme}://${full.databaseUser}:${full.databasePassword}@${full.appName}:${port}/${full.databaseName}`;
    const current = (await this.client.getApp(app.applicationId)).env ?? "";
    await this.client.saveEnvironment(app.applicationId, mergeEnv(current, new Map([["DATABASE_URL", url]])));
    this.log("DATABASE_URL was written to the app environment (value not shown). Run `hsdeploy up` to apply it.");
    return { service: name, host: full.appName };
  }

  async down({ withDb = false, rmProject = false } = {}) {
    const project = this.#project();
    if (!project) throw new HsError("notfound", `Project "${this.cfg.dokployProject}" does not exist; nothing to remove.`);
    this.policy.assertProjectId(project.projectId);
    const env = this.#env(project);
    const summary = (env.applications ?? []).find(a => a.name === this.cfg.app);
    const app = summary ? await this.client.getApp(summary.applicationId) : undefined;
    const failures = [];
    const step = async (label, fn) => { try { await fn(); this.log(`OK   ${label}`); } catch (e) { failures.push(label); this.log(`FAIL ${label}: ${e.message.split("\n")[0]}`); } };
    if (app) {
      this.policy.assertManagedApp(app, project.projectId);
      for (const d of await this.client.domainsOf(app.applicationId)) await step(`delete domain ${d.host}`, () => this.client.deleteDomain(d.domainId));
      await step(`delete app ${app.name}`, () => this.client.deleteApp(app.applicationId));
      // Swarm keeps the stopped containers for a short while; an image or volume still used by one cannot be removed.
      await step("wait for the app's containers to disappear", () => this.waitContainersGone(app.appName));
      await step("remove built image", () => this.removeImage(app.appName));
    } else this.log(`App "${this.cfg.app}" not found; skipping app removal.`);
    if (withDb) {
      for (const [type, remove] of [["postgres", id => this.client.removePostgres(id)], ["mysql", id => this.client.removeMysql(id)]]) {
        const svc = await this.#findDb(env, type, `${this.cfg.app}-db`);
        if (!svc) continue;
        this.policy.assertManagedService(svc, project.projectId);
        await step(`delete ${type} service ${svc.name}`, () => remove(svc.postgresId ?? svc.mysqlId));
        // Dokploy leaves the data volume behind (verified in Step 0.3); remove it by its name.
        await step("wait for the database containers to disappear", () => this.waitContainersGone(svc.appName));
        await step(`remove data volume ${svc.appName}-data`, () => this.removeVolume(`${svc.appName}-data`));
      }
    }
    if (withDb) {
      const shared = await this.findSharedPostgres().catch(() => undefined);
      if (shared) {
        const names = sharedNames(this.cfg.dokployProject, this.cfg.app);
        await step(`drop shared database ${names.database} and its role`, async () => { this.runSsh(this.user.sshHost, psqlCommand(shared.appName, shared.user), dropSql(names)); });
      }
    }
    if (rmProject) {
      await step("delete empty project", async () => {
        const fresh = (await this.client.listProjects()).find(p => p.projectId === project.projectId);
        if (!String(fresh?.description ?? "").includes(MANAGED_MARKER)) throw new HsError("refused", "project was not created by hsdeploy");
        const left = (fresh.environments ?? []).flatMap(e => [...(e.applications ?? []), ...(e.postgres ?? []), ...(e.mysql ?? []), ...(e.mariadb ?? []), ...(e.mongo ?? []), ...(e.redis ?? []), ...(e.compose ?? [])]);
        if (left.length) throw new HsError("refused", `project still has ${left.length} service(s)`);
        await this.client.post("project.remove", { projectId: project.projectId });
      });
    }
    if (failures.length) throw new HsError("failed", `down finished with ${failures.length} failed step(s): ${failures.join("; ")}`);
  }

  async waitContainersGone(appName, { timeoutMs = 120_000, pollMs = 3000 } = {}) {
    if (!appName) return;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (asArray(await this.client.containersOf(appName).catch(() => [])).length === 0) return;
      await this.sleep(pollMs);
    }
    throw new HsError("timeout", `Containers of ${appName} were still present after ${timeoutMs / 1000}s.`);
  }

  async removeVolume(name) {
    try { await this.client.removeVolume(name); return; } catch (e) { this.log(`dockerVolume.removeVolume failed (${e.kind}); trying ssh docker volume rm`); }
    execFileSync("ssh", ["-o", "BatchMode=yes", this.user.sshHost, "docker", "volume", "rm", name], { stdio: "ignore", timeout: 30_000 });
  }

  async imageIdOf(appName) {
    const hit = asArray(await this.client.images().catch(() => [])).find(i => (i.Repository ?? i.repository) === appName);
    return hit?.ID ?? hit?.id;
  }

  // A rebuild moves the tag to the new image and leaves the previous one as <none>:<none>. Remove exactly that one id.
  async removePreviousImage(previousId, appName) {
    const current = await this.imageIdOf(appName);
    if (!previousId || !current || previousId === current) return;
    // The old task's container can linger for a few seconds after the new one is up, so retry before giving up.
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { await this.client.removeImage({ repository: "<none>", tag: "<none>", id: previousId }); this.log("Removed the previous build's image"); return; }
      catch (e) { if (attempt < 4) await this.sleep(6000); else this.log(`Could not remove the previous build's image (${e.kind}); it stays as an untagged image.`); }
    }
  }

  // Targeted removal by image id (dockerImage.removeImage); the global prune would also drop cached base images.
  async removeImage(appName) {
    const matches = asArray(await this.client.images()).filter(i => (i.repository ?? i.Repository ?? "") === appName);
    let removed = 0;
    for (const img of matches) {
      try {
        await this.client.removeImage({ repository: img.Repository ?? img.repository, tag: img.Tag ?? img.tag ?? "latest", id: img.ID ?? img.id });
        removed++;
      } catch (e) { this.log(`dockerImage.removeImage failed (${e.kind}); will try ssh`); }
    }
    if (matches.length && removed === matches.length) return;
    if (!matches.length) this.log("No image found through the API; trying ssh docker rmi");
    try { execFileSync("ssh", ["-o", "BatchMode=yes", this.user.sshHost, "docker", "rmi", `${appName}:latest`], { stdio: "ignore", timeout: 30_000 }); } catch { /* nothing to remove or no ssh */ }
  }
}
