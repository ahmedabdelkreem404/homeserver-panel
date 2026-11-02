// Which screens a role may open. The server refuses everything else anyway; this only keeps the menu honest.
export const ALL_ROLES = ["owner", "admin", "tenant", "viewer"];
const ROUTE_ROLES = { "/users": ["owner"], "/settings": ALL_ROLES };
export const DEFAULT_ROLES = ["owner", "admin"];

export const rolesFor = path => ROUTE_ROLES[path] ?? DEFAULT_ROLES;
export const canOpen = (role, path) => rolesFor(path).includes(role);
