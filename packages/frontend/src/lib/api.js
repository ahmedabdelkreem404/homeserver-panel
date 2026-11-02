// The only place that talks to the backend. It keeps the CSRF token in memory (the backend returns it from
// /api/auth/session and the login steps), sends it on every state-changing request, and turns every failure into an ApiError.
import { t } from "../i18n/index.js";

export class ApiError extends Error {
  constructor(status, code, message, { retryAfterSec } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec ?? null;
  }
}

export const formatWait = seconds => {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return t("time.seconds", { n: s });
  if (s < 5400) return t("time.minutes", { n: Math.ceil(s / 60) });
  return t("time.hours", { n: Math.ceil(s / 3600) });
};

// The message shown to the owner, in Arabic, chosen by the error code (the backend's English text is never shown).
export function errorMessage(error) {
  if (!(error instanceof ApiError)) return t("common.unknownError");
  if (error.code === "rate_limited") return error.retryAfterSec ? t("errors.rate_limited", { wait: formatWait(error.retryAfterSec) }) : t("errors.rate_limited_plain");
  const key = `errors.${error.code}`;
  const translated = t(key);
  return translated === key ? t("common.unknownError") : translated;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApi({ baseUrl = import.meta.env?.VITE_API_BASE_URL ?? "", fetchImpl = (...args) => fetch(...args), onUnauthenticated = () => {} } = {}) {
  let csrfToken = null;

  // raw: a file sent as the body as it is (a project zip), instead of JSON.
  async function send(method, path, body, raw) {
    const headers = { accept: "application/json" };
    if (raw) headers["content-type"] = raw.contentType;
    else if (body !== undefined) headers["content-type"] = "application/json";
    if (MUTATING.has(method) && csrfToken) headers["x-csrf-token"] = csrfToken;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers, credentials: "same-origin", body: raw ? raw.data : body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, "network", "network");
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* an empty or non JSON answer */ }
    if (!response.ok) {
      const e = payload?.error ?? {};
      throw new ApiError(response.status, e.code ?? "internal_error", e.message ?? "", { retryAfterSec: e.retryAfterSec });
    }
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    return payload;
  }

  async function request(method, path, body, raw) {
    try {
      return await send(method, path, body, raw);
    } catch (error) {
      if (error instanceof ApiError && error.code === "csrf_failed" && MUTATING.has(method)) {
        await send("GET", "/api/auth/session"); // fetch a fresh token once, then retry the same request one time
        return send(method, path, body, raw);
      }
      if (error instanceof ApiError && error.code === "unauthenticated" && path !== "/api/auth/session" && !path.startsWith("/api/auth/login")) onUnauthenticated();
      throw error;
    }
  }

  return {
    get: path => request("GET", path),
    post: (path, body = {}) => request("POST", path, body),
    put: (path, body = {}) => request("PUT", path, body),
    postFile: (path, file) => request("POST", path, undefined, { data: file, contentType: "application/zip" }),
    del: (path, body) => request("DELETE", path, body ?? {}),
    setCsrfToken: token => { csrfToken = token; },
  };
}
