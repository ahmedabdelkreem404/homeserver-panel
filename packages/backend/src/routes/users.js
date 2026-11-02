// Owner-only account management (hosting users, their roles and quotas). No other role holds users.read or users.manage.
import { PanelError } from "../errors.js";

const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
const userId = value => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new PanelError("invalid_request", "That identifier is not valid.");
  return n;
};
const at = permission => ({ config: { access: "full", permission } });

export function registerUserRoutes(app, { accounts, hosting }) {
  const ctx = req => ({ actor: req.auth.user.email, userId: req.auth.user.id });
  app.get("/api/users", at("users.read"), async () => ({ users: accounts.list() }));
  app.post("/api/users", at("users.manage"), async req => accounts.create(ctx(req), body(req)));
  app.post("/api/users/:id/reset-password", at("users.manage"), async req => accounts.resetPassword(ctx(req), userId(req.params.id)));
  app.post("/api/users/:id/suspend", at("users.manage"), async req => accounts.setSuspended(ctx(req), userId(req.params.id), true));
  app.post("/api/users/:id/resume", at("users.manage"), async req => accounts.setSuspended(ctx(req), userId(req.params.id), false));
  // Which sites an account owns, and handing an existing app to it or taking it back (owner only).
  app.get("/api/users/:id/sites", at("users.read"), async req => ({ sites: await hosting.sites(accounts.tenantIdOf(userId(req.params.id))) }));
  app.post("/api/users/:id/sites", at("users.manage"), async req => hosting.assign(ctx(req), accounts.tenantIdOf(userId(req.params.id)), body(req).applicationId));
  app.delete("/api/users/:id/sites/:applicationId", at("users.manage"), async req => hosting.unassign(ctx(req), accounts.tenantIdOf(userId(req.params.id)), req.params.applicationId));
  app.put("/api/users/:id/quota", at("users.manage"), async req => accounts.updateQuota(ctx(req), userId(req.params.id), body(req)));
}
