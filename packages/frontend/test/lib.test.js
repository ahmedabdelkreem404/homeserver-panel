import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, errorMessage, formatWait } from "../src/lib/api.js";
import { formatAgo, formatBytes, formatDuration, formatMegabytes, formatPercent, formatRate, levelOf } from "../src/lib/format.js";

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

describe("api client", () => {
  it("sends the CSRF token on state changing requests only, after learning it from the session answer", async () => {
    const fetchImpl = vi.fn(async (url) => (url.endsWith("/session") ? json(200, { authenticated: false, csrfToken: "tok-1" }) : json(200, { ok: true })));
    const api = createApi({ baseUrl: "", fetchImpl });
    await api.get("/api/auth/session");
    await api.get("/api/projects");
    await api.post("/api/projects/apps/a/actions", { action: "stop" });
    await api.del("/api/projects/apps/a", { confirmName: "x" });
    const headers = fetchImpl.mock.calls.map(([, init]) => init.headers);
    expect(headers[0]["x-csrf-token"]).toBeUndefined();
    expect(headers[1]["x-csrf-token"]).toBeUndefined();
    expect(headers[2]["x-csrf-token"]).toBe("tok-1");
    expect(headers[3]["x-csrf-token"]).toBe("tok-1");
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: "POST", credentials: "same-origin", body: JSON.stringify({ action: "stop" }) });
  });

  it("on csrf_failed it fetches a fresh token once and retries the request once", async () => {
    let token = "stale";
    const fetchImpl = vi.fn(async (url, init) => {
      if (url.endsWith("/session")) { token = "fresh"; return json(200, { csrfToken: "fresh" }); }
      return init.headers["x-csrf-token"] === "fresh" ? json(200, { ok: true }) : json(403, { error: { code: "csrf_failed", message: "x" } });
    });
    const api = createApi({ fetchImpl });
    api.setCsrfToken(token);
    await expect(api.post("/api/x")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const always = createApi({ fetchImpl: async () => json(403, { error: { code: "csrf_failed", message: "x" } }) });
    await expect(always.post("/api/x")).rejects.toMatchObject({ code: "csrf_failed", status: 403 });
  });

  it("reports an expired session once, except for the session check and the login attempt themselves", async () => {
    const onUnauthenticated = vi.fn();
    const api = createApi({ fetchImpl: async () => json(401, { error: { code: "unauthenticated", message: "x" } }), onUnauthenticated });
    await expect(api.get("/api/projects")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await expect(api.get("/api/auth/session")).rejects.toBeInstanceOf(ApiError);
    await expect(api.post("/api/auth/login", {})).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("turns a network failure and a non JSON answer into ApiErrors", async () => {
    const offline = createApi({ fetchImpl: async () => { throw new TypeError("failed"); } });
    await expect(offline.get("/api/x")).rejects.toMatchObject({ code: "network", status: 0 });
    const odd = createApi({ fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }) });
    await expect(odd.get("/api/x")).rejects.toMatchObject({ code: "internal_error", status: 502 });
  });

  it("keeps the retry-after hint and shows Arabic messages by code, never the backend's English", () => {
    const limited = new ApiError(429, "rate_limited", "Too many attempts. Wait and try again.", { retryAfterSec: 300 });
    expect(errorMessage(limited)).toContain("5 دقيقة");
    expect(errorMessage(new ApiError(429, "rate_limited", "x"))).toMatch(/استنى/);
    expect(errorMessage(new ApiError(401, "invalid_credentials", "The email or password is not correct."))).toBe("البريد أو كلمة المرور غير صحيحة.");
    expect(errorMessage(new ApiError(500, "something_new", "English text"))).not.toContain("English");
    expect(errorMessage(new Error("boom"))).not.toContain("boom");
    expect(formatWait(30)).toContain("30");
    expect(formatWait(7200)).toContain("2");
  });
});

describe("formatters", () => {
  it("bytes, rates and megabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatRate(2048)).toBe("2.00 KB/s");
    expect(formatMegabytes(512)).toBe("512 MB");
    expect(formatMegabytes(2048)).toBe("2.0 GB");
    expect(formatMegabytes(null)).toBe("—");
  });

  it("percent, duration and relative time", () => {
    expect(formatPercent(0.6)).toBe("0.6%");
    expect(formatPercent(42)).toBe("42%");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatDuration(93784)).toBe("1 يوم و 2 ساعة");
    expect(formatDuration(59)).toBe("0 دقيقة");
    expect(formatDuration(-5)).toBe("—");
    const now = Date.parse("2026-11-02T10:00:00Z");
    expect(formatAgo("2026-11-02T09:59:50Z", now)).toBe("دلوقتي");
    expect(formatAgo("2026-11-02T09:30:00Z", now)).toContain("30 دقيقة");
    expect(formatAgo(null, now)).toBe("—");
    expect(formatAgo("garbage", now)).toBe("—");
  });

  it("level thresholds", () => {
    expect([levelOf(10), levelOf(80), levelOf(95)]).toEqual(["ok", "warn", "danger"]);
  });
});
