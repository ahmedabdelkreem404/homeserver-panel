// Test harness for the auth flows: a clock you can move, and a "browser" that keeps cookies and sends the CSRF header.
import { Writable } from "node:stream";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { totpAt } from "../src/auth/totp.js";
import { base32Decode } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { migrate, openDatabase } from "../src/db.js";
import { fakeDokploy, makeWorld } from "./helpers.js";

export const KEY = "dk-0123456789abcdef0123456789abcdef";
export const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
export const OWNER_EMAIL = "owner@example.test";
export const FIRST_PASSWORD = "First-Password-12345";
export const NEW_PASSWORD = "Another-Strong-Pass-678";

export async function authApp({ owner = true, env = {}, world = makeWorld(), fetchImpl, hostfs } = {}) {
  const clock = { t: Date.parse("2026-11-02T10:00:00Z") };
  const lines = [];
  const logDestination = new Writable({ write(c, _e, cb) { lines.push(c.toString()); cb(); } });
  const db = openDatabase(":memory:");
  migrate(db);
  const config = loadConfig({
    DOKPLOY_API_KEY: KEY, PANEL_SECRET_KEY: SECRET_KEY, LOG_LEVEL: "info",
    ...(owner ? { OWNER_EMAIL: OWNER_EMAIL, OWNER_PASSWORD_HASH: hashPassword(FIRST_PASSWORD) } : {}),
    ...env,
  });
  const client = fakeDokploy(world);
  const app = await buildApp({ config, db, client, logDestination, now: () => new Date(clock.t), fetchImpl, hostfs, statusSampleMs: 0 });
  return { app, db, clock, config, lines, client, world };
}

export class Browser {
  constructor(app, { ip = "203.0.113.7", userAgent = "test-browser" } = {}) { this.app = app; this.cookies = {}; this.ip = ip; this.userAgent = userAgent; }

  cookieHeader() { return Object.entries(this.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); }
  absorb(res) {
    for (const line of [].concat(res.headers["set-cookie"] ?? [])) {
      const [pair, ...attrs] = line.split(";").map(s => s.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), value = decodeURIComponent(pair.slice(i + 1));
      if (attrs.some(a => a.toLowerCase() === "max-age=0")) delete this.cookies[name]; else this.cookies[name] = value;
    }
  }

  async send(method, url, { body, csrf = true, headers = {}, ip } = {}) {
    if (csrf && !this.cookies["__Host-panel_csrf"]) { const r = await this.app.inject({ method: "GET", url: "/api/auth/csrf", headers: { cookie: this.cookieHeader() } }); this.absorb(r); }
    const h = { cookie: this.cookieHeader(), "user-agent": this.userAgent, "cf-connecting-ip": ip ?? this.ip, ...headers };
    if (csrf && this.cookies["__Host-panel_csrf"] && !("x-csrf-token" in h)) h["x-csrf-token"] = this.cookies["__Host-panel_csrf"];
    if (body !== undefined) h["content-type"] = "application/json";
    const res = await this.app.inject({ method, url, headers: h, payload: body === undefined ? undefined : JSON.stringify(body) });
    this.absorb(res);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, headers: res.headers, raw: res };
  }
  get(url, opts) { return this.send("GET", url, opts); }
  post(url, body, opts) { return this.send("POST", url, { ...opts, body: body ?? {} }); }
  put(url, body, opts) { return this.send("PUT", url, { ...opts, body: body ?? {} }); }
  delete(url, body, opts) { return this.send("DELETE", url, { ...opts, body: body ?? {} }); }
}

export const currentCode = (secretBase32, clock, offsetSteps = 0) => totpAt(base32Decode(secretBase32), clock.t + offsetSteps * 30_000);

// Walks a browser through the whole first login and returns what the owner would keep.
export async function firstLogin(app, clock, browser = new Browser(app)) {
  await browser.post("/api/auth/login", { email: OWNER_EMAIL, password: FIRST_PASSWORD });
  await browser.post("/api/auth/change-password", { currentPassword: FIRST_PASSWORD, newPassword: NEW_PASSWORD });
  const start = await browser.post("/api/auth/totp/enroll/start");
  const confirm = await browser.post("/api/auth/totp/enroll/confirm", { code: currentCode(start.body.secret, clock) });
  return { browser, secret: start.body.secret, recoveryCodes: confirm.body.recoveryCodes };
}

// A later sign-in from a new browser: password, then a TOTP code from the next time step.
export async function signIn(app, clock, secret, browser = new Browser(app), { password = NEW_PASSWORD } = {}) {
  clock.t += 31_000; // move to the next time step so the code differs from the one used last
  const login = await browser.post("/api/auth/login", { email: OWNER_EMAIL, password });
  if (login.status !== 200) return { browser, login };
  const verify = await browser.post("/api/auth/totp/verify", { code: currentCode(secret, clock) });
  return { browser, login, verify };
}
