import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, FULL_SESSION, fakeApi, OWNER, renderApp } from "./fakes.jsx";

const QUOTA = { maxApps: 2, maxDatabases: 1, maxMemoryMb: 512, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 };
const SITE = { applicationId: "a-hs", name: "site", status: "done", urls: ["https://shop-site.talabq.com"], limits: { memoryMb: 256, cpu: 1 }, usage: { cpuPercent: 0.4, memMb: 40 } };
const OVERVIEW = { quota: QUOTA, usage: { apps: 1, databases: 0, memoryMb: 256, cpu: 1, subdomains: 1, withoutLimits: 0 } };
const session = role => ({ ...FULL_SESSION, user: { ...OWNER, role } });
const routes = (role, extra = {}) => ({ "GET /api/auth/session": session(role), "GET /api/my/overview": OVERVIEW, "GET /api/my/sites": { sites: [SITE] }, ...extra });

describe("my sites (hosting account)", () => {
  it("shows the allowance against the usage and only the account's own sites", async () => {
    renderApp(fakeApi(routes("tenant")), "/");
    await screen.findByRole("heading", { name: "مواقعي" });
    expect(await screen.findAllByText("1 من 2")).toHaveLength(2); // apps and links
    expect(screen.getByText("256 من 512")).toBeInTheDocument();
    expect(screen.getByText("0 من 1")).toBeInTheDocument();
    const row = await screen.findByTestId("app-site");
    expect(within(row).getByText("shop-site.talabq.com")).toBeInTheDocument();
    expect(within(row).getByText(/256 MB/)).toBeInTheDocument();
    expect(screen.queryByText("homeserver-panel")).not.toBeInTheDocument();
  });

  it("an empty account explains what happens next", async () => {
    renderApp(fakeApi(routes("tenant", { "GET /api/my/sites": { sites: [] }, "GET /api/my/overview": { ...OVERVIEW, usage: { ...OVERVIEW.usage, apps: 0, memoryMb: 0, cpu: 0, subdomains: 0 } } })), "/");
    expect(await screen.findByText("لسه ما عندكش مواقع.")).toBeInTheDocument();
  });

  it("warns about sites with no limit set", async () => {
    renderApp(fakeApi(routes("tenant", { "GET /api/my/overview": { ...OVERVIEW, usage: { ...OVERVIEW.usage, withoutLimits: 2 } } })), "/");
    expect(await screen.findByText(/2 موقع مالوش حد رام/)).toBeInTheDocument();
  });

  it("runs an action through /api/my after a confirmation and reloads", async () => {
    const api = fakeApi(routes("tenant", { "POST /api/my/sites/a-hs/actions": { ok: true } }));
    renderApp(api, "/");
    const row = await screen.findByTestId("app-site");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "إيقاف" }));
    expect(api.callsTo("POST", "/api/my/sites/a-hs/actions")).toHaveLength(0);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إيقاف" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/my/sites/a-hs/actions")[0].body).toEqual({ action: "stop" }));
    expect(api.calls.some(c => c.path.startsWith("/api/projects"))).toBe(false);
  });

  it("deleting needs the exact name and calls the account's own route", async () => {
    const api = fakeApi(routes("tenant", { "DELETE /api/my/sites/a-hs": { ok: true } }));
    renderApp(api, "/");
    const row = await screen.findByTestId("app-site");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "حذف التطبيق" }));
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "احذف نهائياً" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(screen.getByRole("dialog")).getByRole("textbox"), "site");
    await userEvent.click(confirm);
    await waitFor(() => expect(api.callsTo("DELETE", "/api/my/sites/a-hs")[0].body).toEqual({ confirmName: "site" }));
  });

  it("logs come from the account's own route", async () => {
    const api = fakeApi(routes("tenant", { "GET /api/my/sites/a-hs/logs": { type: "runtime", text: "hello from my site" } }));
    renderApp(api, "/");
    const row = await screen.findByTestId("app-site");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "السجلات" }));
    expect(await screen.findByText("hello from my site")).toBeInTheDocument();
    expect(api.calls.some(c => c.path.startsWith("/api/projects"))).toBe(false);
  });

  it("a viewer can look but not change: the lifecycle and delete entries are disabled", async () => {
    renderApp(fakeApi(routes("viewer")), "/");
    const row = await screen.findByTestId("app-site");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    expect(screen.getByRole("menuitem", { name: "إيقاف" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "حذف التطبيق" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "السجلات" })).toBeEnabled();
  });

  it("a failed load shows the error instead of an empty list", async () => {
    renderApp(fakeApi(routes("tenant", { "GET /api/my/sites": apiError("internal_error", 500) })), "/");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
