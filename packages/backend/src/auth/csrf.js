// Double-submit CSRF: the readable cookie and the x-csrf-token header must match on every state-changing request,
// and a browser Origin, when present, must be this host. SameSite=Strict on the cookies is the second layer.
import crypto from "node:crypto";
import { PanelError } from "../errors.js";
import { CSRF_COOKIE, parseCookies, serializeCookie } from "./cookies.js";

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function currentCsrfToken(req) {
  const token = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  return typeof token === "string" && token.length >= 32 ? token : null;
}

// Returns the token, creating the cookie when the browser has none yet.
export function ensureCsrfToken(req, reply) {
  const existing = currentCsrfToken(req);
  if (existing) return existing;
  const token = crypto.randomBytes(32).toString("base64url");
  reply.header("set-cookie", [...[].concat(reply.getHeader("set-cookie") ?? []), serializeCookie(CSRF_COOKIE, token, { maxAgeSec: 7 * 24 * 3600 })]);
  return token;
}

export function verifyCsrf(req) {
  const fail = why => new PanelError("csrf_failed", `The request was blocked (${why}). Reload the page and try again.`);
  const origin = req.headers.origin;
  if (origin) {
    let originHost, requestHost;
    try {
      const o = new URL(origin);
      originHost = o.host;
      requestHost = new URL(`${o.protocol}//${req.headers.host}`).host; // normalizes default ports the same way
    } catch { throw fail("bad origin"); }
    if (originHost !== requestHost) throw fail("origin");
  }
  const cookie = currentCsrfToken(req);
  const header = req.headers["x-csrf-token"];
  if (!cookie || typeof header !== "string" || header.length !== cookie.length) throw fail("token");
  if (!crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) throw fail("token");
}
