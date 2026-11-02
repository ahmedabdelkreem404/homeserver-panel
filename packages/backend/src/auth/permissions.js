// The ONLY permission check (D16). Roles are data here; adding a role later is a change to ROLES, not to the schema or
// to any route. Every route names the action it needs and a single hook calls can(). A route that names nothing is
// checked against an action nobody but the owner holds, so forgetting to name one fails closed.
//
// Tenant and viewer hold only self-service actions on purpose: the data routes (projects, MCP, server...) are global,
// and they get tenant-scoped versions with object-level ownership checks before any of those actions is granted.
const SELF_SERVICE = ["auth.manage", "sessions.manage"];
const ADMIN = [...SELF_SERVICE, "projects.read", "projects.manage", "projects.delete", "mcp.read", "mcp.manage", "devices.read", "server.read", "server.speedtest", "audit.read"];

export const ROLES = Object.freeze({
  owner: Object.freeze(new Set(["*"])),
  admin: Object.freeze(new Set(ADMIN)),
  tenant: Object.freeze(new Set(SELF_SERVICE)),
  viewer: Object.freeze(new Set(SELF_SERVICE)),
});

export const KNOWN_ROLES = Object.freeze(Object.keys(ROLES));
// The owner is created from the environment only; no route can make another one.
export const ASSIGNABLE_ROLES = Object.freeze(KNOWN_ROLES.filter(role => role !== "owner"));
export const UNLABELLED_ACTION = "unlabelled.route";

export function can(user, action) {
  const granted = ROLES[user?.role];
  return Boolean(granted) && (granted.has("*") || granted.has(action));
}
