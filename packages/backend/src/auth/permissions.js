// The ONLY permission check (D16). Roles are data here; adding "admin", "operator" or "viewer" later is a change
// to ROLES, not to the schema or to any route. Every route names the action it needs and a single hook calls can().
export const ROLES = Object.freeze({
  owner: Object.freeze(new Set(["*"])),
});

export const KNOWN_ROLES = Object.freeze(Object.keys(ROLES));

export function can(user, action) {
  const granted = ROLES[user?.role];
  return Boolean(granted) && (granted.has("*") || granted.has(action));
}
