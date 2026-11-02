// The one place that decides what the panel may do to Dokploy (D8). It fails closed: only a positive answer
// "this does not belong to a protected project" lets a mutation through.
//  - READS and MUTATIONS are allowlists; any other procedure is refused.
//  - Each mutation declares where its target ids are in the arguments; the owning project is resolved from Dokploy
//    (never from the request) by id -> environment -> project, and checked by id AND by name.
import { PanelError } from "./errors.js";
import { DB_TYPES } from "./dokploy-shapes.js";
import { normalizeName } from "./config.js";

// Read procedures the panel may call. application.one / compose.one / <db>.one carry env values and are only used
// inside this module to resolve owners; their output never leaves it.
export const READS = Object.freeze(new Set([
  "project.all", "project.one", "settings.health", "user.haveRootAccess", "user.get", "user.session",
  "docker.getServerHealth", "swarm.getContainerStats", "docker.getContainers", "dockerDiskUsage.getDiskUsage",
  "overview.services", "overview.domains", "domain.byApplicationId",
  "docker.getContainersByAppNameMatch", "dockerImage.getImages", "application.readLogs", "deployment.all", "deployment.readLogs",
]));

export const RESERVED_SUBDOMAINS = Object.freeze(["panel", "mcp", "www", "root", "api", "dokploy", "traefik", "admin", "mail", "ns1", "ns2", "ftp", "smtp"]);
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const T = (type, arg) => ({ type, arg });
const lifecycle = (type, idArg, verbs) => Object.fromEntries(verbs.map(v => [`${type}.${v}`, { targets: [T(type, idArg)] }]));

export const MUTATIONS = Object.freeze({
  "project.create": { targets: [], projectName: "name" },
  "project.update": { targets: [T("project", "projectId")], renameTo: "name" },
  "project.remove": { targets: [T("project", "projectId")] },
  "project.duplicate": { targets: [T("project", "sourceProjectId")], renameTo: "name" },
  ...lifecycle("application", "applicationId", ["deploy", "redeploy", "start", "stop", "reload", "delete"]),
  "application.move": { targets: [T("application", "applicationId"), T("environment", "targetEnvironmentId")] },
  ...lifecycle("compose", "composeId", ["deploy", "redeploy", "start", "stop", "delete"]),
  "compose.move": { targets: [T("compose", "composeId"), T("environment", "targetEnvironmentId")] },
  ...Object.assign({}, ...DB_TYPES.map(t => lifecycle(t, `${t}Id`, ["deploy", "start", "stop", "reload", "rebuild", "remove"]))),
  // Creating and configuring a site for a hosting account. Only the listed fields may be sent, and some must have one value:
  // nothing else of an app (source, registry, swarm settings, commands) can be set through the panel.
  "application.create": { targets: [T("environment", "environmentId")], allowedFields: ["name", "environmentId", "sourceType", "description"], fixed: { sourceType: "drop" } },
  "application.update": { targets: [T("application", "applicationId")], allowedFields: ["applicationId", "memoryLimit", "cpuLimit"] },
  "application.saveBuildType": { targets: [T("application", "applicationId")], allowedFields: ["applicationId", "buildType", "dockerfile", "dockerContextPath", "dockerBuildStage", "herokuVersion", "railpackVersion"], fixed: { buildType: "dockerfile", dockerfile: "Dockerfile" } },
  "application.saveEnvironment": { targets: [T("application", "applicationId")], allowedFields: ["applicationId", "env", "buildArgs", "buildSecrets", "createEnvFile"] },
  // The image a deleted site built. Only an app-* repository (Dokploy's names for apps) can be named, and the caller derives
  // it from the app it just deleted, never from a request.
  "dockerImage.removeImage": { targets: [], allowedFields: ["repository", "tag", "id", "force"], imageRepository: "repository" },
  "application.dropDeployment": { targets: [T("application", "applicationId")], allowedFields: ["applicationId"] },
  "domain.create": { targets: [], oneOf: [T("application", "applicationId"), T("compose", "composeId")] },
  "domain.update": { targets: [T("domain", "domainId")] },
  "domain.delete": { targets: [T("domain", "domainId")] },
  "user.createApiKey": { targets: [], newKeyName: "name" },
  "user.deleteApiKey": { targets: [], deleteKeyId: "apiKeyId" },
});

const upstreamCodes = new Set(["upstream_auth_failed", "upstream_unreachable", "upstream_timeout", "upstream_error"]);

export class ProtectionPolicy {
  #client; #projectNames; #keyNames; #protectedIds = new Set(); #baseDomain; #reserved;

  constructor({ client, projectNames, keyNames, baseDomain = "talabq.com", reservedSubdomains = RESERVED_SUBDOMAINS }) {
    this.#baseDomain = baseDomain.toLowerCase();
    this.#reserved = new Set(reservedSubdomains);
    this.#client = client;
    this.#projectNames = projectNames;
    this.#keyNames = keyNames;
  }

  // Builds the protected id set from the names at startup. The name check at call time also covers a protected
  // project that is deleted and recreated with a new id.
  async init() {
    const all = await this.#client.get("project.all");
    this.#protectedIds = new Set((Array.isArray(all) ? all : []).filter(p => this.#projectNames.has(normalizeName(p.name))).map(p => p.projectId));
    return this.#protectedIds.size;
  }

  isReadAllowed(procedure) { return READS.has(procedure); }
  isProtectedOwner({ projectId, name }) { return this.#protectedIds.has(projectId) || this.#projectNames.has(normalizeName(name)); }
  isProtectedKeyName(name) { return this.#keyNames.has(normalizeName(name)); }

  async owningProject(type, id) {
    const unresolved = why => new PanelError("policy_unresolved", `Cannot determine which project owns this ${type}; refusing (${why}).`);
    try {
      switch (type) {
        case "project": {
          const p = await this.#client.get("project.one", { projectId: id });
          return this.#owner(p?.projectId, p?.name, unresolved);
        }
        case "environment": {
          const e = await this.#client.get("environment.one", { environmentId: id });
          if (e?.projectId && !e?.project?.name) return this.owningProject("project", e.projectId); // name not embedded: ask for it
          return this.#owner(e?.projectId, e?.project?.name, unresolved);
        }
        case "application": {
          const a = await this.#client.get("application.one", { applicationId: id });
          return this.owningProject("environment", this.#need(a?.environmentId, unresolved));
        }
        case "compose": {
          const c = await this.#client.get("compose.one", { composeId: id });
          return this.owningProject("environment", this.#need(c?.environmentId, unresolved));
        }
        case "domain": {
          const d = await this.#client.get("domain.one", { domainId: id });
          if (d?.applicationId) return this.owningProject("application", d.applicationId);
          if (d?.composeId) return this.owningProject("compose", d.composeId);
          throw unresolved("domain has no application or compose");
        }
        default: {
          if (!DB_TYPES.includes(type)) throw unresolved("unknown item type");
          const r = await this.#client.get(`${type}.one`, { [`${type}Id`]: id });
          return this.owningProject("environment", this.#need(r?.environmentId, unresolved));
        }
      }
    } catch (e) {
      if (e?.code === "upstream_not_found") throw unresolved("not found"); // fail closed, not a 404
      if (e instanceof PanelError && (e.code === "policy_unresolved" || upstreamCodes.has(e.code))) throw e;
      throw e instanceof PanelError ? e : unresolved("unexpected answer");
    }
  }

  #need(value, unresolved) { if (!value) throw unresolved("missing link"); return value; }
  #owner(projectId, name, unresolved) {
    if (!projectId || !name) throw unresolved("incomplete project data");
    return { projectId, name };
  }

  // Domain rules: HTTPS off and no certificate (Cloudflare terminates TLS), and a host that is exactly one label under
  // the base domain, not reserved and not used by anything else (so a protected service's host cannot be claimed).
  async #checkDomain(procedure, args) {
    if (args.https === true) throw new PanelError("policy_refused", "Domains must use HTTPS off: Cloudflare terminates TLS.");
    if (args.certificateType !== undefined && args.certificateType !== "none") throw new PanelError("policy_refused", "Domains must use certificate none.");
    if (args.host === undefined && procedure === "domain.update") return;
    if (typeof args.host !== "string" || args.host.trim() === "") throw new PanelError("invalid_request", "host is required.");
    const host = args.host.trim().toLowerCase();
    const base = this.#baseDomain;
    if (host === base) throw new PanelError("policy_refused", "The root domain cannot be changed from the panel.");
    if (!host.endsWith(`.${base}`)) throw new PanelError("policy_refused", `Hosts must be under ${base}.`);
    const label = host.slice(0, -(base.length + 1));
    if (label.includes(".")) throw new PanelError("policy_refused", "Only single-level subdomains work with the wildcard.");
    if (!LABEL.test(label)) throw new PanelError("invalid_request", "That is not a valid subdomain.");
    if (this.#reserved.has(label)) throw new PanelError("policy_refused", `The subdomain "${label}" is reserved.`);
    let used;
    try {
      const re = new RegExp("[a-z0-9-]+\\." + base.replaceAll(".", "\\."), "gi");
      used = new Set((JSON.stringify(await this.#client.get("overview.domains")).match(re) ?? []).map(h => h.toLowerCase()));
      if (procedure === "domain.update" && typeof args.domainId === "string") used.delete(String((await this.#client.get("domain.one", { domainId: args.domainId }))?.host ?? "").toLowerCase());
    } catch (e) { throw e instanceof PanelError && e.code !== "upstream_not_found" ? e : new PanelError("policy_unresolved", "Cannot list the hosts in use; refusing."); }
    if (used.has(host)) throw new PanelError("policy_refused", `The host ${host} is already in use.`);
  }

  // Throws unless the mutation is allowed. Returns the owners it checked.
  async check(procedure, args) {
    const spec = MUTATIONS[procedure];
    if (!spec) throw new PanelError("procedure_not_allowed", `The panel does not allow ${procedure}.`);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new PanelError("invalid_request", "The request body must be an object.");
    const str = k => { const v = args[k]; if (typeof v !== "string" || v.trim() === "") throw new PanelError("invalid_request", `${k} is required.`); return v; };

    if (spec.allowedFields) for (const key of Object.keys(args)) if (!spec.allowedFields.includes(key)) throw new PanelError("policy_refused", `The panel does not set "${key}" through ${procedure}.`);
    if (spec.imageRepository && !/^app-[a-z0-9-]{3,60}$/.test(String(args[spec.imageRepository] ?? ""))) throw new PanelError("policy_refused", "Only the image of an app can be removed.");
    for (const [key, value] of Object.entries(spec.fixed ?? {})) if (args[key] !== value) throw new PanelError("policy_refused", `${procedure} only accepts ${key} = ${value}.`);
    if (spec.projectName && this.#projectNames.has(normalizeName(str(spec.projectName)))) throw new PanelError("policy_refused", "That project name is protected.");
    // A rename or duplicate must not give a normal project a protected name (it would spoof the real one).
    if (spec.renameTo && typeof args[spec.renameTo] === "string" && this.#projectNames.has(normalizeName(args[spec.renameTo]))) throw new PanelError("policy_refused", "That project name is protected.");
    if (spec.newKeyName) {
      if (this.isProtectedKeyName(str(spec.newKeyName))) throw new PanelError("policy_refused", "That key name is protected.");
      if (args.rateLimitEnabled !== false) throw new PanelError("policy_refused", "Keys must be created with rateLimitEnabled:false (D7).");
    }
    if (spec.deleteKeyId) {
      const id = str(spec.deleteKeyId);
      const keys = (await this.#client.get("user.get"))?.user?.apiKeys ?? [];
      const key = keys.find(k => k.id === id);
      if (!key) throw new PanelError("policy_unresolved", "Cannot find that key; refusing.");
      if (this.isProtectedKeyName(key.name)) throw new PanelError("policy_refused", `Key "${key.name}" is protected.`);
    }

    if (procedure === "domain.create" || procedure === "domain.update") await this.#checkDomain(procedure, args);

    const targets = [...spec.targets];
    if (spec.oneOf) {
      const present = spec.oneOf.filter(t => typeof args[t.arg] === "string" && args[t.arg] !== "");
      if (present.length !== 1) throw new PanelError("invalid_request", `Exactly one of ${spec.oneOf.map(t => t.arg).join(", ")} is required.`);
      targets.push(present[0]);
    }
    const owners = [];
    for (const t of targets) owners.push(await this.owningProject(t.type, str(t.arg)));
    for (const o of owners) {
      if (this.isProtectedOwner(o)) throw new PanelError("policy_refused", `Project "${o.name}" is protected.`);
    }
    return owners;
  }
}
