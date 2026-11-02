// Shared by the account and hosting tests: an owner session, and customers that went through their own first sign-in.
import assert from "node:assert/strict";
import { authApp, Browser, currentCode, firstLogin, NEW_PASSWORD } from "./auth-helpers.js";

export async function ownerWithApp(options = {}) {
  const ctx = await authApp(options);
  const { browser } = await firstLogin(ctx.app, ctx.clock);
  return { ...ctx, owner: browser };
}

// Creates an account as the owner and walks it through its own first sign-in (new password, authenticator), like a real customer.
export async function newAccount(ctx, { email, role = "tenant", slug = "acme", ip = "198.51.100.20" } = {}) {
  const body = role === "tenant" ? { email, role, tenant: { slug, name: `Account ${slug}` } } : { email, role };
  const made = await ctx.owner.post("/api/users", body);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const browser = new Browser(ctx.app, { ip });
  const temporaryPassword = made.body.temporaryPassword;
  const login = await browser.post("/api/auth/login", { email, password: temporaryPassword });
  assert.equal(login.body.next, "change_password");
  assert.equal((await browser.post("/api/auth/change-password", { currentPassword: temporaryPassword, newPassword: NEW_PASSWORD })).status, 200);
  const start = await browser.post("/api/auth/totp/enroll/start");
  assert.equal((await browser.post("/api/auth/totp/enroll/confirm", { code: currentCode(start.body.secret, ctx.clock) })).status, 200);
  return { browser, secret: start.body.secret, made: made.body, email };
}

export const signInAgain = async (ctx, account, password = NEW_PASSWORD, ip = "198.51.100.21") => {
  ctx.clock.t += 31_000;
  const browser = new Browser(ctx.app, { ip });
  const login = await browser.post("/api/auth/login", { email: account.email, password });
  if (login.status !== 200) return { browser, login };
  const verify = await browser.post("/api/auth/totp/verify", { code: currentCode(account.secret, ctx.clock) });
  return { browser, login, verify };
};
