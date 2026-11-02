// Authentication routes and the one global hook that guards every /api route.
// A route declares config.access: "public" | "pre" (password done, TOTP pending) | "session" (either stage) | "full".
// A route that declares nothing is treated as "full": deny by default. config.permission names the action for can().
import qrcode from "qrcode-generator";
import { PanelError } from "../errors.js";
import { can } from "../auth/permissions.js";
import { passwordProblem, hashPassword, verifyPassword, verifyAgainstDummy } from "../auth/password.js";
import { SESSION_COOKIE, parseCookies, serializeCookie } from "../auth/cookies.js";
import { SAFE_METHODS, ensureCsrfToken, verifyCsrf } from "../auth/csrf.js";
import { base32Encode, otpauthUri, verifyTotp } from "../auth/totp.js";
import { sha256 } from "../auth/secretbox.js";
import { ABSOLUTE_MS } from "../auth/sessions.js";

const ISSUER = "Homeserver Panel";
const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

export function registerAuth(app, { users, sessions, lockout, audit, now = () => new Date() }) {
  const blockedAuditAt = new Map();

  const clientIp = req => String(req.headers["cf-connecting-ip"] ?? req.ip ?? "unknown").slice(0, 64);
  const setSession = (reply, token) => reply.header("set-cookie", [...[].concat(reply.getHeader("set-cookie") ?? []), serializeCookie(SESSION_COOKIE, token, { httpOnly: true, maxAgeSec: ABSOLUTE_MS / 1000 })]);
  const clearSession = reply => reply.header("set-cookie", [...[].concat(reply.getHeader("set-cookie") ?? []), serializeCookie(SESSION_COOKIE, "", { httpOnly: true, maxAgeSec: 0 })]);
  const record = (actor, action, result, detail) => { const id = audit.begin({ actor, action, target: null }); audit.finish(id, result, detail); };
  const nextStep = u => (u.must_change_password ? "change_password" : u.totp_enabled ? "totp_verify" : "totp_enroll");
  const body = req => (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {});

  // Every failed secret guess (password, TOTP, recovery code) counts toward the same lockout.
  function guard(req, emailKey) {
    const lock = lockout.check(clientIp(req), emailKey);
    if (!lock.locked) return;
    const k = `${clientIp(req)}|${emailKey}`;
    if (now().getTime() - (blockedAuditAt.get(k) ?? 0) > 60_000) { blockedAuditAt.set(k, now().getTime()); record(emailKey, "auth.blocked", "refused", { retryAfterSec: lock.retryAfterSec }); }
    throw new PanelError("rate_limited", "Too many attempts. Wait and try again.", { details: { retryAfterSec: lock.retryAfterSec } });
  }
  function failed(req, user, emailKey, action, code, message) {
    lockout.recordFailure(clientIp(req), emailKey);
    record(user?.email ?? emailKey, action, "refused", { reason: code });
    throw new PanelError(code, message);
  }

  // ---- the guard for every /api route
  app.addHook("onRequest", async req => {
    const url = req.routeOptions?.url ?? "";
    if (!url.startsWith("/api/")) return;
    const cfg = req.routeOptions.config ?? {};
    if (!SAFE_METHODS.has(req.method)) verifyCsrf(req);
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const row = token ? sessions.find(token) : null;
    const user = row ? users.getById(row.user_id) : null;
    req.auth = row && user ? { token, session: row, user } : null;
    const access = cfg.access ?? "full";
    if (access === "public") return;
    if (!req.auth) throw new PanelError("unauthenticated", "Sign in first.");
    if (access === "session") return;
    if (access === "pre") {
      if (req.auth.session.stage !== "password_ok") throw new PanelError("forbidden", "This step is not available now.");
      return;
    }
    if (req.auth.session.stage !== "full") throw new PanelError("mfa_incomplete", "Finish the two-step sign-in first.");
    if (user.must_change_password) throw new PanelError("password_change_required", "Change your password first.");
    if (cfg.permission && !can(user, cfg.permission)) throw new PanelError("forbidden", "You are not allowed to do this.");
  });

  const publicAccess = { config: { access: "public" } };
  const sessionAccess = { config: { access: "session" } };
  const preAccess = { config: { access: "pre" } };
  const manageSessions = { config: { access: "full", permission: "sessions.manage" } };
  const manageAuth = { config: { access: "full", permission: "auth.manage" } };

  app.get("/api/auth/csrf", publicAccess, async (req, reply) => ({ csrfToken: ensureCsrfToken(req, reply) }));

  app.get("/api/auth/session", publicAccess, async (req, reply) => {
    const csrfToken = ensureCsrfToken(req, reply);
    if (!req.auth) return { authenticated: false, csrfToken };
    const u = req.auth.user;
    return { authenticated: req.auth.session.stage === "full" && !u.must_change_password, stage: req.auth.session.stage, next: req.auth.session.stage === "full" && !u.must_change_password ? null : nextStep(u), user: users.publicUser(u), csrfToken };
  });

  app.post("/api/auth/login", publicAccess, async (req, reply) => {
    const { email, password } = body(req);
    if (!text(email, 320) || !text(password, 200)) throw new PanelError("invalid_request", "Email and password are required.");
    const emailKey = email.trim().toLowerCase();
    guard(req, emailKey);
    const user = users.getByEmail(emailKey);
    const ok = user ? verifyPassword(password, user.password_hash) : verifyAgainstDummy(password); // same cost either way
    if (!user || !ok) failed(req, user, emailKey, "auth.login", "invalid_credentials", "The email or password is not correct.");
    lockout.clearAccount(emailKey);
    const oldToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (oldToken) sessions.destroy(oldToken);
    const s = sessions.create({ userId: user.id, stage: "password_ok", ip: clientIp(req), userAgent: req.headers["user-agent"] });
    setSession(reply, s.token);
    record(user.email, "auth.login", "ok", { stage: "password_ok" });
    return { stage: "password_ok", next: nextStep(user), user: users.publicUser(user), csrfToken: ensureCsrfToken(req, reply) };
  });

  app.post("/api/auth/change-password", sessionAccess, async (req, reply) => {
    const { currentPassword, newPassword } = body(req);
    const { user, token, session } = req.auth;
    if (!text(currentPassword, 200) || !text(newPassword, 200)) throw new PanelError("invalid_request", "Current and new password are required.");
    guard(req, user.email.toLowerCase());
    if (!verifyPassword(currentPassword, user.password_hash)) failed(req, user, user.email.toLowerCase(), "auth.change_password", "invalid_credentials", "The current password is not correct.");
    const problem = passwordProblem(newPassword, { email: user.email });
    if (problem) throw new PanelError("invalid_request", problem);
    if (verifyPassword(newPassword, user.password_hash)) throw new PanelError("invalid_request", "Choose a password you have not used before.");
    users.setPassword(user.id, hashPassword(newPassword));
    const revoked = sessions.revokeOthers(user.id, token);
    const s = sessions.rotate(token, { stage: session.stage, ip: clientIp(req), userAgent: req.headers["user-agent"] });
    setSession(reply, s.token);
    record(user.email, "auth.change_password", "ok", { otherSessionsRevoked: revoked });
    return { next: session.stage === "full" ? null : nextStep(users.getById(user.id)), otherSessionsRevoked: revoked };
  });

  app.post("/api/auth/totp/enroll/start", preAccess, async req => {
    const { user } = req.auth;
    if (user.must_change_password) throw new PanelError("password_change_required", "Change your password first.");
    if (user.totp_enabled) throw new PanelError("forbidden", "Two-step sign-in is already set up.");
    const secret = users.beginTotpEnrollment(user.id);
    const uri = otpauthUri({ secret, email: user.email, issuer: ISSUER });
    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    return { secret: base32Encode(secret), otpauthUri: uri, qrSvg: qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) };
  });

  app.post("/api/auth/totp/enroll/confirm", preAccess, async (req, reply) => {
    const { user, token } = req.auth;
    const emailKey = user.email.toLowerCase();
    if (user.must_change_password || user.totp_enabled) throw new PanelError("forbidden", "This step is not available now.");
    guard(req, emailKey);
    const secret = users.totpSecret(user);
    if (!secret) throw new PanelError("invalid_request", "Start the setup first.");
    const step = verifyTotp(secret, body(req).code, now().getTime(), 0);
    if (step === null) failed(req, user, emailKey, "auth.totp_enroll", "invalid_code", "The code is not valid. Check the clock on your phone.");
    users.enableTotp(user.id, step);
    const recoveryCodes = users.replaceRecoveryCodes(user.id);
    const s = sessions.rotate(token, { stage: "full", ip: clientIp(req), userAgent: req.headers["user-agent"] });
    setSession(reply, s.token);
    record(user.email, "auth.totp_enroll", "ok", {});
    return { recoveryCodes };
  });

  app.post("/api/auth/totp/verify", preAccess, async (req, reply) => {
    const { user, token } = req.auth;
    const emailKey = user.email.toLowerCase();
    if (user.must_change_password) throw new PanelError("password_change_required", "Change your password first.");
    if (!user.totp_enabled) throw new PanelError("forbidden", "Set up two-step sign-in first.");
    guard(req, emailKey);
    const secret = users.totpSecret(user);
    const step = secret ? verifyTotp(secret, body(req).code, now().getTime(), user.last_totp_step) : null;
    if (step === null || !users.acceptTotpStep(user.id, step)) failed(req, user, emailKey, "auth.totp_verify", "invalid_code", "The code is not valid or was already used.");
    lockout.clearAccount(emailKey);
    const s = sessions.rotate(token, { stage: "full", ip: clientIp(req), userAgent: req.headers["user-agent"] });
    setSession(reply, s.token);
    record(user.email, "auth.totp_verify", "ok", {});
    return { stage: "full", user: users.publicUser(user), csrfToken: ensureCsrfToken(req, reply) };
  });

  app.post("/api/auth/recovery", preAccess, async (req, reply) => {
    const { user, token } = req.auth;
    const emailKey = user.email.toLowerCase();
    if (user.must_change_password) throw new PanelError("password_change_required", "Change your password first.");
    if (!user.totp_enabled) throw new PanelError("forbidden", "Set up two-step sign-in first.");
    guard(req, emailKey);
    if (!text(body(req).code, 40) || !users.consumeRecoveryCode(user.id, body(req).code)) failed(req, user, emailKey, "auth.recovery", "invalid_code", "The recovery code is not valid or was already used.");
    lockout.clearAccount(emailKey);
    const s = sessions.rotate(token, { stage: "full", ip: clientIp(req), userAgent: req.headers["user-agent"] });
    setSession(reply, s.token);
    record(user.email, "auth.recovery", "ok", { left: users.recoveryCodesLeft(user.id) });
    return { stage: "full", user: users.publicUser(user), recoveryCodesLeft: users.recoveryCodesLeft(user.id), csrfToken: ensureCsrfToken(req, reply) };
  });

  app.post("/api/auth/logout", publicAccess, async (req, reply) => {
    if (req.auth) { sessions.destroy(req.auth.token); record(req.auth.user.email, "auth.logout", "ok", {}); }
    clearSession(reply);
    return { ok: true };
  });

  app.get("/api/auth/sessions", manageSessions, async req => {
    const mine = sha256(req.auth.token);
    return { sessions: sessions.list(req.auth.user.id).map(s => ({ id: s.public_id, current: s.id_hash === mine, stage: s.stage, createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at, ip: s.ip, userAgent: s.user_agent })) };
  });

  app.post("/api/auth/sessions/revoke", manageSessions, async req => {
    const { id, others } = body(req);
    const { user, token } = req.auth;
    if (others === true) { const n = sessions.revokeOthers(user.id, token); record(user.email, "auth.sessions_revoke", "ok", { others: n }); return { revoked: n }; }
    if (!text(id, 32)) throw new PanelError("invalid_request", "Say which session to revoke.");
    const n = sessions.revoke(user.id, id);
    if (n === 0) throw new PanelError("invalid_request", "No such session.");
    record(user.email, "auth.sessions_revoke", "ok", { id });
    return { revoked: n };
  });

  app.post("/api/auth/recovery-codes/regenerate", manageAuth, async req => {
    const { user } = req.auth;
    const emailKey = user.email.toLowerCase();
    guard(req, emailKey);
    if (!text(body(req).password, 200) || !verifyPassword(body(req).password, user.password_hash)) failed(req, user, emailKey, "auth.recovery_regenerate", "invalid_credentials", "The password is not correct.");
    const recoveryCodes = users.replaceRecoveryCodes(user.id);
    record(user.email, "auth.recovery_regenerate", "ok", {});
    return { recoveryCodes };
  });
}
