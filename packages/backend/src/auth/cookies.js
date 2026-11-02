// Minimal cookie helpers (no dependency).
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name && !(name in out)) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, { maxAgeSec, httpOnly = false } = {}) {
  // __Host- cookies must be Secure, Path=/ and carry no Domain: the browser then refuses to let another host overwrite them.
  const attrs = [`${name}=${encodeURIComponent(value)}`, "Path=/", "Secure", "SameSite=Strict"];
  if (httpOnly) attrs.push("HttpOnly");
  if (maxAgeSec !== undefined) attrs.push(`Max-Age=${maxAgeSec}`);
  return attrs.join("; ");
}

export const SESSION_COOKIE = "__Host-panel_session";
export const CSRF_COOKIE = "__Host-panel_csrf";
