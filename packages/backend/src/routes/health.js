// GET /api/health is public, so it reports coarse states only: no versions, hosts, ids or secrets.
// The Dokploy check is cached for ttlMs so a probe loop cannot hammer Dokploy.
export function registerHealthRoute(app, { gateway, db, ttlMs = 10_000, now = Date.now }) {
  let cached;

  async function dokployState() {
    if (cached && now() - cached.at < ttlMs) return cached.state;
    let state = "ok";
    try {
      await gateway.read("settings.health");
      await gateway.read("user.haveRootAccess"); // answers 200 for a valid key, 401 otherwise
    } catch (e) {
      state = e?.code === "upstream_auth_failed" ? "auth_failed" : e?.code === "upstream_unreachable" || e?.code === "upstream_timeout" ? "unreachable" : "error";
    }
    cached = { at: now(), state };
    return state;
  }

  app.get("/api/health", async (_req, reply) => {
    let database = "ok";
    try { db.prepare("SELECT 1").get(); } catch { database = "error"; }
    const dokploy = await dokployState();
    reply.code(database === "ok" ? 200 : 503);
    return { status: database !== "ok" ? "error" : dokploy === "ok" ? "ok" : "degraded", process: "ok", db: database, dokploy };
  });
}
