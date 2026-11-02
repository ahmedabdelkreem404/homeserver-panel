// The panel API (step 1.3). Every route needs a full session; each names the action that can() checks.
// Routes stay thin: validate the input, call a service, return its answer. Mutations go through the gateway (policy + audit).
import { PanelError } from "../errors.js";

const ID = /^[A-Za-z0-9_-]{1,64}$/; // Dokploy ids are nanoids; the charset and length cap keep anything else out of a query string
const KEY_NAME = /^[A-Za-z0-9._ -]{1,32}$/;
const id = v => { if (typeof v !== "string" || !ID.test(v)) throw new PanelError("invalid_request", "That identifier is not valid."); return v; };
const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});
const ctx = req => ({ actor: req.auth.user.email });
const at = permission => ({ config: { access: "full", permission } });

export function registerPanelRoutes(app, { projects, mcp, tailscale, serverStatus, speedTest, audit }) {
  // ---- projects
  app.get("/api/projects", at("projects.read"), async req => ({ projects: await projects.list({ fresh: req.query?.fresh === "1" }) }));
  app.get("/api/projects/apps/:id/state", at("projects.read"), async req => projects.state(id(req.params.id)));
  app.get("/api/projects/apps/:id/logs", at("projects.read"), async req => projects.logs({ applicationId: id(req.params.id), type: req.query?.type, tail: req.query?.tail, since: req.query?.since }));
  app.post("/api/projects/apps/:id/actions", at("projects.manage"), async req => { await projects.action(ctx(req), id(req.params.id), body(req).action); return { ok: true }; });
  app.delete("/api/projects/apps/:id", at("projects.delete"), async req => { await projects.deleteApp(ctx(req), { applicationId: id(req.params.id), confirmName: body(req).confirmName }); return { ok: true }; });
  app.delete("/api/projects/:projectId", at("projects.delete"), async req => { await projects.deleteProject(ctx(req), { projectId: id(req.params.projectId), confirmName: body(req).confirmName }); return { ok: true }; });

  // ---- MCP access keys and the hosted MCP
  app.get("/api/mcp/keys", at("mcp.read"), async () => ({ keys: await mcp.listKeys() }));
  app.get("/api/mcp/url", at("mcp.read"), async () => ({ url: await mcp.url() }));
  app.post("/api/mcp/keys", at("mcp.manage"), async req => {
    const { name, expiresInDays } = body(req);
    if (typeof name !== "string" || !KEY_NAME.test(name)) throw new PanelError("invalid_request", "The key name must be 1 to 32 letters, digits, spaces, dots, dashes or underscores.");
    if (expiresInDays !== undefined && !(Number.isFinite(expiresInDays) && expiresInDays >= 1 && expiresInDays <= 3650)) throw new PanelError("invalid_request", "Expiry must be between 1 and 3650 days.");
    return mcp.createKey(ctx(req), { name: name.trim(), expiresInDays });
  });
  app.delete("/api/mcp/keys/:id", at("mcp.manage"), async req => { await mcp.revokeKey(ctx(req), id(req.params.id)); return { ok: true }; });
  app.post("/api/mcp/rotate-path", at("mcp.rotate"), async req => mcp.rotatePath(ctx(req), { confirm: body(req).confirm }));

  // ---- Tailscale devices (read only)
  app.get("/api/devices", at("devices.read"), async () => tailscale.devices());

  // ---- server status
  app.get("/api/server/status", at("server.read"), async () => serverStatus.status());
  app.get("/api/server/containers", at("server.read"), async () => ({ containers: await serverStatus.containers() }));
  app.get("/api/server/speedtest", at("server.read"), async () => ({ last: speedTest.last() }));
  app.post("/api/server/speedtest", at("server.speedtest"), async req => {
    const result = await speedTest.run();
    const rowId = audit.begin({ actor: req.auth.user.email, action: "server.speedtest", target: null });
    audit.finish(rowId, result.error ? "error" : "ok", { downMbps: result.downMbps, upMbps: result.upMbps });
    return result;
  });

  // ---- audit log
  app.get("/api/audit", at("audit.read"), async req => {
    const q = req.query ?? {};
    const stamp = v => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
    return audit.query({ limit: q.limit, beforeId: q.before, action: typeof q.action === "string" ? q.action.slice(0, 64) : undefined, result: ["ok", "refused", "error", "pending"].includes(q.result) ? q.result : undefined, from: stamp(q.from), to: stamp(q.to) });
  });
}
