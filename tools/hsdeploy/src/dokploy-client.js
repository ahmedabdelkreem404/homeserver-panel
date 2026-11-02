// The only module that talks to Dokploy. Every call has a timeout; the key never appears in errors.
import { HsError, errorFromHttp } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 300_000;

export class DokployClient {
  #key;
  constructor({ url, key, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (!url || !key) throw new HsError("usage", "Dokploy url and key are required. Run `hsdeploy login` or set HSDEPLOY_URL and HSDEPLOY_KEY.");
    this.baseUrl = url.replace(/\/+$/, "");
    this.#key = key;
    this.timeoutMs = timeoutMs;
  }

  async request(method, procedure, { query, body, form, timeoutMs } = {}) {
    const url = new URL(`${this.baseUrl}/api/${procedure}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const headers = { "x-api-key": this.#key };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(timeoutMs ?? this.timeoutMs) });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new HsError("timeout", `Timed out calling ${procedure} after ${(timeoutMs ?? this.timeoutMs) / 1000}s.`, { cause: e });
      throw new HsError("network", `Cannot reach Dokploy at ${this.baseUrl} (${e?.cause?.code ?? e?.message ?? "network error"}).`, { cause: e });
    }
    const text = await res.text();
    if (!res.ok) throw errorFromHttp(res.status, procedure, text);
    if (text === "") return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  get(procedure, query, opts) { return this.request("GET", procedure, { query, ...opts }); }
  post(procedure, body, opts) { return this.request("POST", procedure, { body, ...opts }); }

  // ---- typed helpers used by the commands
  listProjects() { return this.get("project.all"); }
  session() { return this.get("user.session"); }
  createProject(name, description) { return this.post("project.create", { name, description }); }
  createApp({ name, environmentId, description }) { return this.post("application.create", { name, environmentId, sourceType: "drop", description }); }
  getApp(applicationId) { return this.get("application.one", { applicationId }); }
  deleteApp(applicationId) { return this.post("application.delete", { applicationId }); }
  saveBuildType(applicationId) {
    return this.post("application.saveBuildType", { applicationId, buildType: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "", dockerBuildStage: "", herokuVersion: null, railpackVersion: null });
  }
  saveEnvironment(applicationId, env) { return this.post("application.saveEnvironment", { applicationId, env, buildArgs: null, buildSecrets: null, createEnvFile: false }); }
  domainsOf(applicationId) { return this.get("domain.byApplicationId", { applicationId }); }
  createDomain({ host, port, applicationId }) { return this.post("domain.create", { host, path: "/", port, https: false, certificateType: "none", applicationId, domainType: "application" }); }
  deleteDomain(domainId) { return this.post("domain.delete", { domainId }); }
  deployments(applicationId) { return this.get("deployment.all", { applicationId }); }
  deploymentLogs(deploymentId, tail = 40) { return this.get("deployment.readLogs", { deploymentId, tail }); }
  appLogs(applicationId, tail = 100) { return this.get("application.readLogs", { applicationId, tail }); }
  // No appType: with appType "stack" Dokploy returns [] for swarm apps (verified against v0.30.10).
  containersOf(appName) { return this.get("docker.getContainersByAppNameMatch", { appName }); }
  images() { return this.get("dockerImage.getImages"); }
  removeImage({ repository, tag, id }) { return this.post("dockerImage.removeImage", { repository, tag, id, force: true }); }
  removeVolume(volumeName) { return this.post("dockerVolume.removeVolume", { volumeName }); }
  createPostgres(body) { return this.post("postgres.create", body); }
  deployPostgres(postgresId) { return this.post("postgres.deploy", { postgresId }); }
  getPostgres(postgresId) { return this.get("postgres.one", { postgresId }); }
  removePostgres(postgresId) { return this.post("postgres.remove", { postgresId }); }
  createMysql(body) { return this.post("mysql.create", body); }
  deployMysql(mysqlId) { return this.post("mysql.deploy", { mysqlId }); }
  getMysql(mysqlId) { return this.get("mysql.one", { mysqlId }); }
  removeMysql(mysqlId) { return this.post("mysql.remove", { mysqlId }); }
  dropDeploy(applicationId, zipBuffer, fileName = "project.zip") {
    const form = new FormData();
    form.append("applicationId", applicationId);
    form.append("zip", new Blob([zipBuffer], { type: "application/zip" }), fileName);
    return this.request("POST", "application.dropDeployment", { form, timeoutMs: UPLOAD_TIMEOUT_MS });
  }
}
