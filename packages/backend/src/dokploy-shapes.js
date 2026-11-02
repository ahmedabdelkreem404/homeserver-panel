// Turns Dokploy answers into the small shapes the panel exposes. Built on the shapes verified in steps 0.1 to 0.3:
// project.all lists SUMMARIES only (apps: id, name, status; databases: id only; no appName, description or env).
const DB_TYPES = ["postgres", "mysql", "mariadb", "mongo", "redis", "libsql"];
export { DB_TYPES };

export function normalizeProjects(projectAll) {
  return (Array.isArray(projectAll) ? projectAll : []).map(p => ({
    projectId: p.projectId,
    name: p.name,
    description: p.description ?? null,
    environments: (p.environments ?? []).map(e => ({
      environmentId: e.environmentId,
      name: e.name,
      applications: (e.applications ?? []).map(a => ({ applicationId: a.applicationId, name: a.name, status: a.applicationStatus ?? null })),
      composeIds: (e.compose ?? []).map(c => c.composeId),
      databases: DB_TYPES.flatMap(t => (e[t] ?? []).map(d => ({ type: t, id: d[`${t}Id`] }))),
    })),
  }));
}

// user.get also carries the owner's profile; only the key list (never a key secret) is passed on.
export function normalizeApiKeys(userGet, protectedNames = new Set()) {
  return (userGet?.user?.apiKeys ?? []).map(k => ({
    id: k.id,
    name: k.name,
    enabled: k.enabled !== false,
    expiresAt: k.expiresAt ?? null,
    createdAt: k.createdAt ?? null,
    protected: protectedNames.has(String(k.name ?? "").trim().toLowerCase()),
  }));
}
