import { render } from "@testing-library/react";
import App from "../src/App.jsx";
import { ApiError } from "../src/lib/api.js";
import { ApiProvider } from "../src/lib/apiContext.jsx";
import { RouterProvider } from "../src/lib/router.jsx";
import { SessionProvider } from "../src/lib/session.jsx";
import { ToastProvider } from "../src/lib/toast.jsx";

export const OWNER = { id: 1, email: "owner@example.test", role: "owner", totpEnabled: true, mustChangePassword: false };
export const FULL_SESSION = { authenticated: true, stage: "full", next: null, user: OWNER, csrfToken: "t" };
export const ANON_SESSION = { authenticated: false, csrfToken: "t" };

// A stand-in for the API: routes map "METHOD /path" to a value or a function; every call is recorded.
// A value that is an ApiError (or a function that throws one) simulates a failed answer.
export function fakeApi(routes = {}) {
  const calls = [];
  const table = { ...routes };
  const answer = async (method, path, body) => {
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    const handler = key in table ? table[key] : key.split("?")[0] in table ? table[key.split("?")[0]] : undefined;
    if (handler === undefined) throw new ApiError(404, "not_found", "no route in the test");
    const value = typeof handler === "function" ? await handler(body, path) : handler;
    if (value instanceof ApiError) throw value;
    return value;
  };
  return {
    calls,
    routes: table,
    get: path => answer("GET", path),
    post: (path, body = {}) => answer("POST", path, body),
    put: (path, body = {}) => answer("PUT", path, body),
    postFile: (path, file) => answer("POST", path, { file: { name: file.name, size: file.size } }),
    del: (path, body = {}) => answer("DELETE", path, body),
    setCsrfToken() {},
    callsTo: (method, path) => calls.filter(c => c.method === method && c.path.split("?")[0] === path),
  };
}

export const apiError = (code, status = 400, extra) => new ApiError(status, code, code, extra);

export function renderApp(api, path = "/") {
  window.history.replaceState(null, "", path);
  return render(<App api={api} />);
}

// For components that need the providers but not the whole app.
export function renderWithProviders(ui, api) {
  window.history.replaceState(null, "", "/");
  return render(
    <ApiProvider value={api}>
      <ToastProvider durationMs={60_000}>
        <RouterProvider><SessionProvider api={api}>{ui}</SessionProvider></RouterProvider>
      </ToastProvider>
    </ApiProvider>,
  );
}

export const STATUS_SAMPLE = {
  at: "2026-11-02T10:00:00.000Z",
  network: { available: true, interface: "wlp2s0b1", kind: "wifi", gateway: "192.168.1.1", localIpv4: "192.168.1.20", signal: { percent: 73, dbm: -57 }, rate: { rxBytesPerSec: 2048, txBytesPerSec: 512 }, totals: { sinceBoot: { rx: 5e9, tx: 1e9 }, today: { rx: 1e8, tx: 2e7 } }, otherInterfaces: ["eno1"] },
  cpu: { available: true, percent: 12, load: { one: 0.4, five: 0.3, fifteen: 0.2 } },
  memory: { available: true, source: "host", memTotalMb: 3860, memUsedMb: 1500, swapTotalMb: 2048, swapUsedMb: 10 },
  disk: { available: true, totalGb: 125.4, usedGb: 13, freeGb: 112.4, usedPercent: 10 },
  temperature: { available: true, sensors: [{ name: "acpitz", celsius: 46 }], maxCelsius: 46 },
  power: { available: true, battery: { name: "BAT1", capacityPct: 100, status: "Full", healthPct: 95 }, ac: { name: "ACAD", online: true } },
  uptime: { available: true, seconds: 93784 },
  tunnel: { available: true, running: true, status: "Up 2 hours" },
  internet: { available: true, reachable: true, latencyMs: 41 },
  speedTest: null,
};

export const PROJECTS_SAMPLE = {
  projects: [
    { projectId: "p-infra", name: "infra", description: null, protected: true, environments: [{ environmentId: "e1", name: "production", applications: [{ applicationId: "a-cf", name: "cloudflared", status: "done", appName: "infra-cf", urls: [], memoryLimit: null, cpuLimit: null, usage: { cpuPercent: 0.4, memMb: 20 } }], composeCount: 0, databases: [] }] },
    { projectId: "p-demo", name: "hs-demo", description: null, protected: false, environments: [{ environmentId: "e2", name: "production", applications: [{ applicationId: "a-site", name: "site", status: "done", appName: "app-site", urls: ["https://hs-site.talabq.com"], memoryLimit: 268435456, cpuLimit: 1, usage: null }], composeCount: 1, databases: [{ type: "postgres", id: "pg1" }] }] },
  ],
};

export function signedInRoutes(extra = {}) {
  return { "GET /api/auth/session": FULL_SESSION, "GET /api/server/status": STATUS_SAMPLE, "GET /api/server/containers": { containers: [] }, "GET /api/projects": PROJECTS_SAMPLE, ...extra };
}
