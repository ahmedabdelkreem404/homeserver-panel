// Wires the modules together. Routes stay thin: they only talk to the gateway.
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
import { createLockout } from "./auth/lockout.js";
import { createSessions } from "./auth/sessions.js";
import { createUsers, ensureOwner } from "./auth/users.js";

export async function buildApp({ config, db, client, logDestination, healthTtlMs, now = () => new Date() }) {
  const app = Fastify({ bodyLimit: 64 * 1024, logger: createLoggerOptions({ level: config.logLevel, secrets: secretsOf(config), destination: logDestination }) });
  // Every registered route, so tests can prove that none is reachable without the right session.
  const routeTable = [];
  app.addHook("onRoute", r => {
    const method = [].concat(r.method).find(m => m !== "HEAD"); // Fastify adds a HEAD twin for every GET
    if (method && String(r.url).startsWith("/api/")) routeTable.push({ method, url: r.url, access: r.config?.access ?? "full" });
  });
  app.decorate("routeTable", routeTable);
  const dokploy = client ?? new DokployClient({ url: config.dokploy.url, key: config.dokploy.key, timeoutMs: config.dokploy.timeoutMs });
  const audit = createAudit(db, { retentionDays: config.audit.retentionDays, maxRows: config.audit.maxRows });
  const policy = new ProtectionPolicy({ client: dokploy, projectNames: config.protectedProjectNames, keyNames: config.protectedKeyNames });
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
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: "not_found", message: "Not found." } }));

  registerHealthRoute(app, { gateway, db, ttlMs: healthTtlMs });
  app.decorate("gateway", gateway);
  app.decorate("audit", audit);
  app.decorate("policy", policy);
  app.decorate("users", users);
  app.decorate("sessions", sessions);
  app.decorate("lockout", lockout);
  return app;
}
