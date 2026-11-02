// The ONLY permission check (D16). Roles are data here; adding a role later is a change to ROLES, not to the schema or
// to any route. Every route names the action it needs and a single hook calls can(). A route that names nothing is
// checked against an action nobody but the owner holds, so forgetting to name one fails closed.
//
// Tenant and viewer never hold the global data actions (projects, MCP, server...): those routes show everything. They get
// the "my.*" actions instead, whose routes resolve the tenant from the session and check ownership of every object.
const SELF_SERVICE = ["auth.manage", "sessions.manage"];
// A hosting account's own sites (routes under /api/my). Each one still checks ownership of the object it touches.
const OWN_SITES_READ = ["my.read"];
const OWN_SITES_FULL = ["my.read", "my.manage", "my.create", "my.delete"];
const ADMIN = [...SELF_SERVICE, "projects.read", "projects.manage", "projects.delete", "mcp.read", "mcp.manage", "devices.read", "server.read", "server.speedtest", "audit.read"];

export const ROLES = Object.freeze({
  owner: Object.freeze(new Set(["*"])),
  admin: Object.freeze(new Set(ADMIN)),
  tenant: Object.freeze(new Set([...SELF_SERVICE, ...OWN_SITES_FULL])),
  viewer: Object.freeze(new Set([...SELF_SERVICE, ...OWN_SITES_READ])),
});

export const KNOWN_ROLES = Object.freeze(Object.keys(ROLES));
// The owner is created from the environment only; no route can make another one.
export const ASSIGNABLE_ROLES = Object.freeze(KNOWN_ROLES.filter(role => role !== "owner"));
export const UNLABELLED_ACTION = "unlabelled.route";

export function can(user, action) {
  const granted = ROLES[user?.role];
  return Boolean(granted) && (granted.has("*") || granted.has(action));
}
