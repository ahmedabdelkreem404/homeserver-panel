// Owner-only account management (hosting users, their roles and quotas). No other role holds users.read or users.manage.
import { PanelError } from "../errors.js";

const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
const userId = value => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new PanelError("invalid_request", "That identifier is not valid.");
  return n;
};
const at = permission => ({ config: { access: "full", permission } });

export function registerUserRoutes(app, { accounts }) {
  const ctx = req => ({ actor: req.auth.user.email, userId: req.auth.user.id });
  app.get("/api/users", at("users.read"), async () => ({ users: accounts.list() }));
  app.post("/api/users", at("users.manage"), async req => accounts.create(ctx(req), body(req)));
  app.post("/api/users/:id/reset-password", at("users.manage"), async req => accounts.resetPassword(ctx(req), userId(req.params.id)));
  app.post("/api/users/:id/suspend", at("users.manage"), async req => accounts.setSuspended(ctx(req), userId(req.params.id), true));
  app.post("/api/users/:id/resume", at("users.manage"), async req => accounts.setSuspended(ctx(req), userId(req.params.id), false));
  app.put("/api/users/:id/quota", at("users.manage"), async req => accounts.updateQuota(ctx(req), userId(req.params.id), body(req)));
}
