// Which screens a role may open. The server refuses everything else anyway; this only keeps the menu honest.
export const ALL_ROLES = ["owner", "admin", "tenant", "viewer"];
export const HOSTING_ROLES = ["tenant", "viewer"]; // accounts that only see their own space
const ROUTE_ROLES = { "/users": ["owner"], "/settings": ALL_ROLES };
export const DEFAULT_ROLES = ["owner", "admin"];

export const isHosting = role => HOSTING_ROLES.includes(role);
export const rolesFor = path => ROUTE_ROLES[path] ?? DEFAULT_ROLES;
export const canOpen = (role, path) => rolesFor(path).includes(role);
