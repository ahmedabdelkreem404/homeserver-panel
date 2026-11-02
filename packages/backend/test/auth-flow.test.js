import test from "node:test";
import assert from "node:assert/strict";
import { ABSOLUTE_MS, IDLE_MS } from "../src/auth/sessions.js";
import { open, parseSecretKey } from "../src/auth/secretbox.js";
import { Browser, FIRST_PASSWORD, NEW_PASSWORD, OWNER_EMAIL, SECRET_KEY, authApp, currentCode, firstLogin, signIn } from "./auth-helpers.js";

const fill = url => url.replace(/:[A-Za-z]+/g, "x");

test("every /api route except the public ones answers 401 without a session (and a pre-MFA session reaches only its own steps)", async () => {
  const { app } = await authApp();
  const routes = app.routeTable;
  assert.ok(routes.length >= 12, `route table has ${routes.length} routes`);
  const publicRoutes = routes.filter(r => r.access === "public").map(r => `${r.method} ${r.url}`).sort();
  assert.deepEqual(publicRoutes, ["GET /api/auth/csrf", "GET /api/auth/session", "GET /api/health", "POST /api/auth/login", "POST /api/auth/logout"]);
  const b = new Browser(app);
  for (const r of routes.filter(x => x.access !== "public")) {
    const res = await b.send(r.method, fill(r.url), { body: r.method === "POST" ? {} : undefined });
    assert.equal(res.status, 401, `${r.method} ${r.url} must be 401 without a session`);
    assert.equal(res.body.error.code, "unauthenticated");
  }
  assert.equal((await b.get("/api/does-not-exist")).status, 404);
});

test("CSRF: state-changing requests need the header to match the cookie; a foreign Origin is refused", async () => {
  const { app } = await authApp();
  const b = new Browser(app);
  const body = { email: OWNER_EMAIL, password: "x" };
  const missing = await b.post("/api/auth/login", body, { csrf: false });
  assert.deepEqual([missing.status, missing.body.error.code], [403, "csrf_failed"]);
  await b.get("/api/auth/csrf");
  const wrong = await b.post("/api/auth/login", body, { headers: { "x-csrf-token": "x".repeat(43) } });
  assert.equal(wrong.body.error.code, "csrf_failed");
  const shortToken = await b.post("/api/auth/login", body, { headers: { "x-csrf-token": "abc" } });
  assert.equal(shortToken.body.error.code, "csrf_failed");
  const foreign = await b.post("/api/auth/login", body, { headers: { origin: "https://evil.example" } });
  assert.equal(foreign.body.error.code, "csrf_failed");
  const sameOrigin = await b.post("/api/auth/login", body, { headers: { origin: "http://localhost" } });
  assert.equal(sameOrigin.body.error.code, "invalid_credentials", "same origin and token reach the login logic");
  assert.equal((await b.get("/api/auth/session")).status, 200, "reads need no token");
});

test("login failures look the same for an unknown account and a wrong password, and are audited without secrets", async () => {
  const { app, db } = await authApp();
  const b = new Browser(app);
  const unknown = await b.post("/api/auth/login", { email: "nobody@example.test", password: "Some-Password-1234" });
  const wrong = await b.post("/api/auth/login", { email: OWNER_EMAIL, password: "Some-Password-1234" });
  assert.deepEqual([unknown.status, unknown.body], [wrong.status, wrong.body]);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, "invalid_credentials");
  const rows = db.prepare("SELECT actor, action, result, detail FROM audit_log WHERE action = 'auth.login' ORDER BY id").all();
  assert.deepEqual(rows.map(r => r.result), ["refused", "refused"]);
  assert.ok(!JSON.stringify(rows).includes("Some-Password-1234"));
  assert.equal((await b.post("/api/auth/login", { email: OWNER_EMAIL })).status, 400);
  assert.equal((await b.post("/api/auth/login", { email: 5, password: [] })).status, 400);
});

test("lockout: five wrong passwords lock the account (known or unknown) with a retry time, even the right password waits", async () => {
  const { app, clock, db } = await authApp();
  const b = new Browser(app);
  for (const email of [OWNER_EMAIL, "ghost@example.test"]) {
    for (let i = 0; i < 5; i++) assert.equal((await b.post("/api/auth/login", { email, password: "Wrong-Password-123" })).status, 401);
    const locked = await b.post("/api/auth/login", { email, password: FIRST_PASSWORD });
    assert.equal(locked.status, 429, `${email} is locked`);
    assert.ok(locked.body.error.retryAfterSec > 0 && Number(locked.headers["retry-after"]) > 0);
  }
  clock.t += 30_000;
  const later = await new Browser(app, { ip: "198.51.100.9" }).post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  assert.equal(later.status, 429, "a different IP does not escape the account lock");
  clock.t += 40_000; // the first lock lasts one minute from the last failure
  assert.equal((await new Browser(app, { ip: "198.51.100.9" }).post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD })).status, 200, "after the wait the right password works");
  const blocked = db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'auth.blocked'").get().n;
  assert.ok(blocked >= 2 && blocked <= 4, `blocked attempts are audited but throttled (${blocked} rows)`);
});

test("first login: password change, TOTP enrollment with a local QR, recovery codes, then a full session", async () => {
  const { app, db, clock } = await authApp();
  const b = new Browser(app);
  const login = await b.post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  assert.deepEqual([login.status, login.body.stage, login.body.next], [200, "password_ok", "change_password"]);
  assert.equal((await b.get("/api/auth/sessions")).body.error.code, "mfa_incomplete");
  assert.equal((await b.post("/api/auth/totp/enroll/start")).body.error.code, "password_change_required", "cannot skip the password change");

  assert.equal((await b.post("/api/auth/change-password", { currentPassword: "Not-The-Password-1", newPassword: NEW_PASSWORD })).body.error.code, "invalid_credentials");
  assert.equal((await b.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: "short" })).status, 400);
  assert.equal((await b.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: FIRST_PASSWORD })).status, 400, "same password again");
  const changed = await b.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: NEW_PASSWORD });
  assert.deepEqual([changed.status, changed.body.next], [200, "totp_enroll"]);

  const start = await b.post("/api/auth/totp/enroll/start");
  assert.equal(start.status, 200);
  assert.match(start.body.qrSvg, /^<svg[\s\S]*<\/svg>$/, "QR drawn locally as SVG");
  assert.match(start.body.otpauthUri, /^otpauth:\/\/totp\//);
  assert.match(start.body.secret, /^[A-Z2-7]{32}$/);
  const stored = db.prepare("SELECT totp_secret_enc FROM users").get().totp_secret_enc;
  assert.ok(!stored.includes(start.body.secret) && stored.split(".").length === 3, "the TOTP secret is encrypted at rest");
  assert.equal(open(parseSecretKey(SECRET_KEY), stored).length, 20);

  assert.equal((await b.post("/api/auth/totp/enroll/confirm", { code: "000000" })).body.error.code, "invalid_code");
  const confirm = await b.post("/api/auth/totp/enroll/confirm", { code: currentCode(start.body.secret, clock) });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.recoveryCodes.length, 10);
  assert.ok(new Set(confirm.body.recoveryCodes).size === 10 && confirm.body.recoveryCodes.every(c => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)));
  assert.equal((await b.get("/api/auth/sessions")).status, 200, "now a full session");
  const dump = JSON.stringify(db.prepare("SELECT * FROM recovery_codes").all());
  assert.ok(confirm.body.recoveryCodes.every(c => !dump.includes(c) && !dump.includes(c.replace("-", ""))), "recovery codes are stored hashed");
  const everything = JSON.stringify([db.prepare("SELECT * FROM users").all(), db.prepare("SELECT * FROM audit_log").all()]);
  assert.ok(!everything.includes(FIRST_PASSWORD) && !everything.includes(NEW_PASSWORD));
});

test("later sign-ins: TOTP window, replay rejected, wrong code rejected, full access only after both factors", async () => {
  const { app, clock } = await authApp();
  const { secret } = await firstLogin(app, clock);
  clock.t += 31_000;
  const b = new Browser(app);
  const login = await b.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal(login.body.next, "totp_verify");
  assert.equal((await b.get("/api/auth/sessions")).body.error.code, "mfa_incomplete");
  assert.equal((await b.post("/api/auth/totp/verify", { code: "123456" })).body.error.code, "invalid_code");
  assert.equal((await b.post("/api/auth/totp/verify", { code: currentCode(secret, clock, -3) })).body.error.code, "invalid_code", "three steps old");
  const ok = await b.post("/api/auth/totp/verify", { code: currentCode(secret, clock) });
  assert.equal(ok.status, 200);
  assert.equal((await b.get("/api/auth/sessions")).status, 200);

  const replay = new Browser(app);
  await replay.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal((await replay.post("/api/auth/totp/verify", { code: currentCode(secret, clock) })).body.error.code, "invalid_code", "the same code cannot be used twice");
  clock.t += 31_000;
  assert.equal((await replay.post("/api/auth/totp/verify", { code: currentCode(secret, clock) })).status, 200, "the next code works");

  clock.t += 31_000;
  const early = new Browser(app);
  await early.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal((await early.post("/api/auth/totp/verify", { code: currentCode(secret, clock, 1) })).status, 200, "a code one step ahead is inside the window");
});

test("recovery codes work once each, can be regenerated with the password, and old ones die", async () => {
  const { app, clock } = await authApp();
  const { secret, recoveryCodes } = await firstLogin(app, clock);
  const lowercase = recoveryCodes[0].toLowerCase().replace("-", " ");
  const b = new Browser(app);
  await b.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  const used = await b.post("/api/auth/recovery", { code: lowercase });
  assert.equal(used.status, 200);
  assert.equal(used.body.recoveryCodesLeft, 9);
  const again = new Browser(app);
  await again.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal((await again.post("/api/auth/recovery", { code: recoveryCodes[0] })).body.error.code, "invalid_code", "single use");
  assert.equal((await again.post("/api/auth/recovery", { code: "AAAAA-BBBBB" })).body.error.code, "invalid_code");
  assert.equal((await again.post("/api/auth/recovery", { code: recoveryCodes[1] })).status, 200);

  assert.equal((await b.post("/api/auth/recovery-codes/regenerate", { password: "Wrong-Password-123" })).body.error.code, "invalid_credentials");
  const fresh = await b.post("/api/auth/recovery-codes/regenerate", { password: NEW_PASSWORD });
  assert.equal(fresh.body.recoveryCodes.length, 10);
  const third = new Browser(app);
  await third.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal((await third.post("/api/auth/recovery", { code: recoveryCodes[2] })).body.error.code, "invalid_code", "old codes no longer work");
  assert.equal((await third.post("/api/auth/recovery", { code: fresh.body.recoveryCodes[0] })).status, 200);
  assert.ok(secret);
});

test("wrong TOTP and recovery guesses count toward the lockout", async () => {
  const { app, clock } = await authApp();
  await firstLogin(app, clock);
  const b = new Browser(app);
  await b.post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  for (let i = 0; i < 5; i++) assert.equal((await b.post("/api/auth/totp/verify", { code: "000000" })).status, 401);
  assert.equal((await b.post("/api/auth/totp/verify", { code: "000000" })).status, 429);
  assert.equal((await b.post("/api/auth/recovery", { code: "AAAAA-AAAAA" })).status, 429);
});

test("sessions: idle and absolute expiry, list, revoke one, revoke others, logout", async () => {
  const { app, clock } = await authApp();
  const { secret, browser: a } = await firstLogin(app, clock);
  const { browser: b } = await signIn(app, clock, secret);
  const listed = await a.get("/api/auth/sessions");
  assert.equal(listed.body.sessions.length, 2);
  assert.equal(listed.body.sessions.filter(s => s.current).length, 1);
  assert.ok(listed.body.sessions.every(s => !("id_hash" in s) && !("idHash" in s)));
  const other = listed.body.sessions.find(s => !s.current);
  assert.equal((await a.post("/api/auth/sessions/revoke", { id: other.id })).body.revoked, 1);
  assert.equal((await b.get("/api/auth/sessions")).status, 401, "the revoked browser is out");
  assert.equal((await a.post("/api/auth/sessions/revoke", { id: "nope" })).status, 400);

  const { browser: c } = await signIn(app, clock, secret);
  const { browser: d } = await signIn(app, clock, secret);
  assert.equal((await a.post("/api/auth/sessions/revoke", { others: true })).body.revoked, 2);
  assert.equal((await c.get("/api/auth/sessions")).status, 401);
  assert.equal((await d.get("/api/auth/sessions")).status, 401);
  assert.equal((await a.get("/api/auth/sessions")).status, 200);

  clock.t += IDLE_MS + 60_000;
  assert.equal((await a.get("/api/auth/sessions")).status, 401, "idle for more than 12 hours");

  const { browser: e } = await signIn(app, clock, secret);
  const start = clock.t;
  while (clock.t - start < ABSOLUTE_MS - 11 * 3600_000) { clock.t += 11 * 3600_000; assert.equal((await e.get("/api/auth/sessions")).status, 200, "used every 11 hours stays alive"); }
  clock.t = start + ABSOLUTE_MS + 1;
  assert.equal((await e.get("/api/auth/sessions")).status, 401, "but never beyond 7 days");

  const { browser: f } = await signIn(app, clock, secret);
  assert.equal((await f.post("/api/auth/logout")).status, 200);
  assert.equal((await f.get("/api/auth/sessions")).status, 401);
});

test("session and CSRF cookies are hardened, and the token changes at every stage and on password change", async () => {
  const { app, clock } = await authApp();
  const b = new Browser(app);
  const login = await b.post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  const cookies = [].concat(login.headers["set-cookie"]);
  const session = cookies.find(c => c.startsWith("__Host-panel_session="));
  assert.ok(/; Path=\//.test(session) && /; Secure/.test(session) && /; HttpOnly/.test(session) && /; SameSite=Strict/.test(session) && !/Domain=/i.test(session));
  const csrf = [].concat((await new Browser(app).get("/api/auth/csrf", { csrf: false })).headers["set-cookie"]).find(c => c.startsWith("__Host-panel_csrf="));
  assert.ok(/Secure/.test(csrf) && /SameSite=Strict/.test(csrf) && !/HttpOnly/.test(csrf), "the CSRF cookie must be readable by the page");

  const t0 = b.cookies["__Host-panel_session"];
  await b.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: NEW_PASSWORD });
  const t1 = b.cookies["__Host-panel_session"];
  const start = await b.post("/api/auth/totp/enroll/start");
  await b.post("/api/auth/totp/enroll/confirm", { code: currentCode(start.body.secret, clock) });
  const t2 = b.cookies["__Host-panel_session"];
  assert.equal(new Set([t0, t1, t2]).size, 3, "new token at password change and at the move to a full session");
  const stale = new Browser(app);
  stale.cookies = { "__Host-panel_session": t0, "__Host-panel_csrf": b.cookies["__Host-panel_csrf"] };
  assert.equal((await stale.get("/api/auth/sessions")).status, 401, "an old token is useless");
  assert.ok(t2.length >= 43, "256-bit token");
});

test("changing the password signs out the other browsers", async () => {
  const { app, clock } = await authApp();
  const { secret, browser: a } = await firstLogin(app, clock);
  const { browser: b } = await signIn(app, clock, secret);
  const changed = await a.post("/api/auth/change-password", { currentPassword: NEW_PASSWORD, newPassword: "Yet-Another-Pass-9911" });
  assert.deepEqual([changed.status, changed.body.otherSessionsRevoked, changed.body.next], [200, 1, null]);
  assert.equal((await b.get("/api/auth/sessions")).status, 401);
  assert.equal((await a.get("/api/auth/sessions")).status, 200);
  const old = await new Browser(app).post("/api/auth/login", { email: OWNER_EMAIL, password: NEW_PASSWORD });
  assert.equal(old.status, 401, "the old password is dead");
});

test("must_change_password blocks every full-session route, and a role without rights gets 403 from the single permission check", async () => {
  const { app, db, clock } = await authApp();
  const { browser } = await firstLogin(app, clock);
  assert.equal((await browser.get("/api/auth/sessions")).status, 200);
  db.prepare("UPDATE users SET must_change_password = 1").run();
  assert.equal((await browser.get("/api/auth/sessions")).body.error.code, "password_change_required");
  db.prepare("UPDATE users SET must_change_password = 0, role = 'viewer'").run();
  const denied = await browser.get("/api/auth/sessions");
  assert.deepEqual([denied.status, denied.body.error.code], [403, "forbidden"]);
  db.prepare("UPDATE users SET role = 'owner'").run();
  assert.equal((await browser.get("/api/auth/sessions")).status, 200);
});

test("owner bootstrap: created once from the environment, no signup route, nothing secret in responses", async () => {
  const first = await authApp();
  assert.equal(first.app.users.count(), 1);
  const row = first.db.prepare("SELECT * FROM users").get();
  assert.deepEqual([row.email, row.role, row.must_change_password, row.totp_enabled], [OWNER_EMAIL, "owner", 1, 0]);
  assert.ok(row.password_hash.startsWith("argon2id:") && !row.password_hash.includes(FIRST_PASSWORD));
  const b = new Browser(first.app);
  for (const url of ["/api/auth/signup", "/api/auth/register", "/api/users"]) assert.equal((await b.post(url, { email: "x@y.test", password: "Whatever-Pass-123" })).status, 404, url);
  const res = await b.post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  const text = JSON.stringify(res.body);
  assert.ok(!/argon2id|password_hash|totp_secret/.test(text));
  assert.equal(first.lines.join("").includes(FIRST_PASSWORD), false, "the password never reaches the log");
  assert.equal(first.lines.join("").includes(row.password_hash), false, "nor the hash");

  const none = await authApp({ owner: false });
  assert.equal(none.app.users.count(), 0);
  assert.ok(none.lines.join("").includes("nobody can log in"));
  const stranger = await new Browser(none.app).post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  assert.equal(stranger.status, 401);
});

test("session endpoint reports the right state at every stage", async () => {
  const { app, clock } = await authApp();
  const b = new Browser(app);
  assert.deepEqual(Object.keys((await b.get("/api/auth/session")).body).sort(), ["authenticated", "csrfToken"]);
  await b.post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  let s = (await b.get("/api/auth/session")).body;
  assert.deepEqual([s.authenticated, s.stage, s.next], [false, "password_ok", "change_password"]);
  await b.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal((await b.get("/api/auth/session")).body.next, "totp_enroll");
  const start = await b.post("/api/auth/totp/enroll/start");
  await b.post("/api/auth/totp/enroll/confirm", { code: currentCode(start.body.secret, clock) });
  s = (await b.get("/api/auth/session")).body;
  assert.deepEqual([s.authenticated, s.stage, s.next, s.user.email, s.user.role], [true, "full", null, OWNER_EMAIL, "owner"]);
});
