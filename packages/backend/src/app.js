// Wires the modules together. Routes stay thin: they only talk to the gateway.
import path from "node:path";
import Fastify from "fastify";
import { createAudit } from "./audit.js";
import { secretsOf } from "./config.js";
import { DokployClient } from "./dokploy-client.js";
import { createGateway } from "./gateway.js";
import { createLoggerOptions } from "./logger.js";
import { ProtectionPolicy } from "./protection-policy.js";
import { toHttpError } from "./errors.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerAuth } from "./routes/auth.js";
import { registerPanelRoutes } from "./routes/panel.js";
import { registerUserRoutes } from "./routes/users.js";
import { createAccounts } from "./services/accounts.js";
import { createStaticHandler, registerSecurityHeaders } from "./static.js";
import { createHostFs } from "./metrics/hostfs.js";
import { createNetSampler } from "./metrics/sampler.js";
import { createSpeedTest } from "./metrics/speedtest.js";
import { createServerStatus } from "./metrics/status.js";
import { createBackups } from "./services/backup.js";
import { createProjects } from "./services/projects.js";
import { createMcp } from "./services/mcp.js";
import { createTailscale } from "./services/tailscale.js";
import { createLockout } from "./auth/lockout.js";
import { createSessions } from "./auth/sessions.js";
import { createUsers, ensureOwner } from "./auth/users.js";

export async function buildApp({ config, db, client, logDestination, healthTtlMs, now = () => new Date(), hostfs, fetchImpl = globalThis.fetch, background = false, statusSampleMs = 1000 }) {
  const app = Fastify({ bodyLimit: 64 * 1024, logger: createLoggerOptions({ level: config.logLevel, secrets: secretsOf(config), destination: logDestination }) });
  // Every registered route, so tests can prove that none is reachable without the right session.
  const routeTable = [];
  app.addHook("onRoute", r => {
    const method = [].concat(r.method).find(m => m !== "HEAD"); // Fastify adds a HEAD twin for every GET
    if (method && String(r.url).startsWith("/api/")) routeTable.push({ method, url: r.url, access: r.config?.access ?? "full", permission: r.config?.permission ?? null });
  });
  app.decorate("routeTable", routeTable);
  const dokploy = client ?? new DokployClient({ url: config.dokploy.url, key: config.dokploy.key, timeoutMs: config.dokploy.timeoutMs });
  const audit = createAudit(db, { retentionDays: config.audit.retentionDays, maxRows: config.audit.maxRows });
  const policy = new ProtectionPolicy({ client: dokploy, projectNames: config.protectedProjectNames, keyNames: config.protectedKeyNames, baseDomain: config.baseDomain });
  // Best effort and in the background: names are also checked on every call, so neither a slow nor a missing Dokploy
  // at boot delays or stops the panel.
  policy.init().catch(e => app.log.warn({ code: e?.code }, "could not load protected project ids at startup"));
  const gateway = createGateway({ client: dokploy, policy, audit, protectedKeyNames: config.protectedKeyNames, secrets: secretsOf(config) });

  const users = createUsers(db, { secretKey: config.secretKey, now });
  const sessions = createSessions(db, { now });
  const lockout = createLockout(db, { now });
  ensureOwner({ users, owner: config.owner, log: app.log });
  registerAuth(app, { users, sessions, lockout, audit, now });

  app.setErrorHandler((err, req, reply) => {
    const { status, body } = toHttpError(err);
    if (body.error.retryAfterSec) reply.header("retry-after", String(body.error.retryAfterSec));
    if (status >= 500) req.log.error({ code: err?.code }, "request failed");
    reply.code(status).send(body);
  });
  registerSecurityHeaders(app);
  const serveStatic = config.staticDir ? createStaticHandler({ dir: config.staticDir }) : null;
  app.setNotFoundHandler((req, reply) => {
    if (serveStatic?.(req, reply)) return reply;
    return reply.code(404).send({ error: { code: "not_found", message: "Not found." } });
  });

  const host = hostfs ?? createHostFs({ proc: config.hostProc, sys: config.hostSys });
  const sampler = createNetSampler({ db, hostfs: host, now });
  const speedTest = createSpeedTest({ db, now, fetchImpl });
  const serverStatus = createServerStatus({ hostfs: host, gateway, sampler, speedTest, timeZone: config.timeZone, fetchImpl, now, sampleWindowMs: statusSampleMs });
  const projects = createProjects({ gateway, policy, containers: serverStatus, now });
  const mcp = createMcp({ gateway, client: dokploy, audit, mcp: config.mcp, fetchImpl });
  const tailscale = createTailscale({ settings: config.tailscale, fetchImpl, now });
  const backups = createBackups({ db, dir: path.join(config.dataDir, "backups"), now });
  registerUserRoutes(app, { accounts: createAccounts({ db, users, sessions, audit, now }) });
  registerPanelRoutes(app, { projects, mcp, tailscale, serverStatus, speedTest, audit, backups });
  if (background) { sampler.start(); backups.start(); } // the sampler and the daily backup run only in the real server, not in tests
  app.addHook("onClose", async () => { sampler.stop(); backups.stop(); });

  registerHealthRoute(app, { gateway, db, ttlMs: healthTtlMs });
  app.decorate("gateway", gateway);
  app.decorate("audit", audit);
  app.decorate("policy", policy);
  app.decorate("users", users);
  app.decorate("sessions", sessions);
  app.decorate("lockout", lockout);
  return app;
}
