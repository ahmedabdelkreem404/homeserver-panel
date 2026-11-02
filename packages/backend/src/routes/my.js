// A hosting account's own space. Every route resolves the tenant from the signed-in user, never from the request.
import { PanelError } from "../errors.js";

const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
const at = permission => ({ config: { access: "full", permission } });

export function registerMyRoutes(app, { hosting, accounts }) {
  const tenantId = req => {
    const id = req.auth.user.tenant_id;
    if (!id) throw new PanelError("forbidden", "This account has no hosting space.");
    return id;
  };
  const ctx = req => ({ actor: req.auth.user.email, userId: req.auth.user.id });

  app.get("/api/my/overview", at("my.read"), async req => hosting.overview(tenantId(req), accounts.quotaOf(tenantId(req))));
  app.get("/api/my/sites", at("my.read"), async req => ({ sites: await hosting.sites(tenantId(req), { fresh: req.query?.fresh === "1" }) }));
  app.get("/api/my/sites/:id/state", at("my.read"), async req => hosting.state(tenantId(req), req.params.id));
  app.get("/api/my/sites/:id/logs", at("my.read"), async req => hosting.logs(tenantId(req), { applicationId: req.params.id, type: req.query?.type, tail: req.query?.tail, since: req.query?.since }));
  app.post("/api/my/sites/:id/actions", at("my.manage"), async req => hosting.action(ctx(req), tenantId(req), req.params.id, body(req).action));
  app.delete("/api/my/sites/:id", at("my.delete"), async req => hosting.deleteSite(ctx(req), tenantId(req), { applicationId: req.params.id, confirmName: body(req).confirmName }));
}
