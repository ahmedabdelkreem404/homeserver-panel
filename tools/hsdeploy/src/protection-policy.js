// The single place that decides what hsdeploy may touch. Commands call this before every mutation.
import { HsError } from "./errors.js";

export const PROTECTED_PROJECTS = Object.freeze(["infra", "mcp-gateway", "homeserver-panel", "shared-services"]);
// The one protected project hsdeploy may deploy into, and only from the panel's own repository.
export const PANEL_PROJECT = "homeserver-panel";
export const RESERVED_SUBDOMAINS = Object.freeze(["panel", "mcp", "www", "root", "api", "dokploy", "traefik", "admin", "mail", "ns1", "ns2", "ftp", "smtp"]);
export const MANAGED_MARKER = "managed-by:hsdeploy";
export const DEFAULT_BASE_DOMAIN = "talabq.com";

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateSubdomain(subdomain, { baseDomain = DEFAULT_BASE_DOMAIN, usedHosts = [], ownHosts = [] } = {}) {
  if (typeof subdomain !== "string" || subdomain === "") throw new HsError("usage", "subdomain is required.");
  if (subdomain !== subdomain.toLowerCase()) throw new HsError("usage", `subdomain "${subdomain}" must be lowercase.`);
  if (subdomain.includes(".")) throw new HsError("usage", `subdomain "${subdomain}" must be a single label (no dots): the wildcard only covers one level.`);
  if (!LABEL.test(subdomain)) throw new HsError("usage", `subdomain "${subdomain}" is not a valid label (a-z, 0-9, hyphen; not at the ends; max 63 chars).`);
  if (RESERVED_SUBDOMAINS.includes(subdomain)) throw new HsError("refused", `subdomain "${subdomain}" is reserved.`);
  const host = `${subdomain}.${baseDomain}`;
  const taken = new Set(usedHosts.map(h => h.toLowerCase()));
  for (const own of ownHosts) taken.delete(own.toLowerCase());
  if (taken.has(host)) throw new HsError("refused", `host ${host} is already used by another service.`);
  return host;
}

const norm = s => String(s ?? "").trim().toLowerCase();

export class ProtectionPolicy {
  #protectedIds = new Set();
  #panelRepo;
  #panelIds = new Set();

  // projects: the result of project.all. panelRepo: the current folder is this repository (see isPanelRepo).
  constructor(projects = [], { panelRepo = false } = {}) {
    this.#panelRepo = panelRepo;
    for (const p of projects) if (PROTECTED_PROJECTS.includes(norm(p.name))) this.#protectedIds.add(p.projectId);
    for (const p of projects) if (norm(p.name) === PANEL_PROJECT) this.#panelIds.add(p.projectId);
  }

  isProtectedName(name) { return PROTECTED_PROJECTS.includes(norm(name)); }
  isProtectedId(projectId) { return this.#protectedIds.has(projectId); }

  // panelOp is true only for up, status, logs and env push. down and db create never pass it.
  #panelAllowed(isPanel, panelOp) { return panelOp && this.#panelRepo && isPanel; }

  assertProjectName(name, { panelOp = false } = {}) {
    if (this.#panelAllowed(norm(name) === PANEL_PROJECT, panelOp)) return;
    if (this.isProtectedName(name)) throw new HsError("refused", `Project "${name}" is protected. hsdeploy never touches ${PROTECTED_PROJECTS.join(", ")}.`);
  }

  assertProjectId(projectId, { panelOp = false } = {}) {
    if (this.#panelAllowed(this.#panelIds.has(projectId), panelOp)) return;
    if (this.isProtectedId(projectId)) throw new HsError("refused", "That project is protected. hsdeploy never touches it.");
  }

  // An app may only be changed when it lives outside protected projects AND hsdeploy created it.
  assertManagedApp(app, projectId, opts) {
    if (projectId) this.assertProjectId(projectId, opts);
    if (!String(app?.description ?? "").includes(MANAGED_MARKER)) {
      throw new HsError("refused", `App "${app?.name}" was not created by hsdeploy (no ${MANAGED_MARKER} marker), so hsdeploy will not change it.`);
    }
  }

  // Database services created by `db create` carry the same marker in their description.
  assertManagedService(service, projectId) {
    if (projectId) this.assertProjectId(projectId);
    if (!String(service?.description ?? "").includes(MANAGED_MARKER)) {
      throw new HsError("refused", `Service "${service?.name}" was not created by hsdeploy, so hsdeploy will not change it.`);
    }
  }
}
