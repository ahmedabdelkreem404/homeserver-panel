import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POLL } from "../src/pages/NewSitePage.jsx";
import { apiError, FULL_SESSION, fakeApi, OWNER, renderApp } from "./fakes.jsx";

const QUOTA = { maxApps: 2, maxDatabases: 1, maxMemoryMb: 512, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 };
const OVERVIEW = { quota: QUOTA, usage: { apps: 0, databases: 0, memoryMb: 0, cpu: 0, subdomains: 0, withoutLimits: 0 }, account: { slug: "shop-a", name: "Shop A" }, baseDomain: "talabq.com" };
const INSPECT = { template: "static", reasons: ["index.html"], warnings: [], skipped: [".env"], files: 3, reserve: { memoryMb: 64, cpu: 0.25 }, uploadBytes: 1000 };
const session = role => ({ ...FULL_SESSION, user: { ...OWNER, role } });
const base = (extra = {}) => ({ "GET /api/auth/session": session("tenant"), "GET /api/my/overview": OVERVIEW, "GET /api/my/sites": { sites: [] }, "POST /api/my/sites/inspect": INSPECT, ...extra });
const zip = (name = "site.zip") => new File(["PK"], name, { type: "application/zip" });

beforeAll(() => { POLL.ms = 10; });
afterEach(() => { POLL.ms = 10; });

async function pickAndGoToName(api) {
  renderApp(api, "/new");
  await screen.findByRole("heading", { name: "موقع جديد" });
  await userEvent.upload(await screen.findByTestId("zip-input"), zip());
  await screen.findByText(/اتعرف تلقائياً/);
  await userEvent.click(screen.getByRole("button", { name: "التالي" }));
}

describe("new site wizard", () => {
  it("upload, review what was detected, name it, run it and follow the job to the end", async () => {
    // the job is already building when the page first sees it; the first poll says it is done
    const done = { id: "j1", name: "my-site", status: "done", phase: "done", result: { url: "https://shop-a-my-site.talabq.com", warnings: [] } };
    const api = fakeApi(base({ "POST /api/my/sites": { id: "j1", name: "my-site", status: "running", phase: "building" }, "GET /api/my/jobs/j1": done }));
    POLL.ms = 400; // slow enough to see the running phase before the first answer arrives
    renderApp(api, "/new");
    await screen.findByRole("heading", { name: "موقع جديد" });
    await userEvent.upload(await screen.findByTestId("zip-input"), zip());

    // review: the detected kind, why, what it reserves, what was left out
    expect(await screen.findAllByText("موقع ثابت (HTML)")).toHaveLength(2); // the badge and the option
    expect(screen.getByText(/اتعرف تلقائياً من: index.html/)).toBeInTheDocument();
    expect(screen.getByText(/64 MB رام و0.25 CPU/)).toBeInTheDocument();
    expect(screen.getByText(/اتجاهلنا: .env/)).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/my/sites/inspect")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "التالي" }));

    // name: validated, and the address is shown before anything is created
    const field = screen.getByLabelText("اسم الموقع");
    await userEvent.type(field, "Bad Name");
    expect(await screen.findByText(/من 3 لـ 30 حرف/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "شغّل الموقع" })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "MY-site");
    expect(screen.getByText("https://shop-a-my-site.talabq.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "شغّل الموقع" }));

    expect(await screen.findByText("بناء الموقع")).toBeInTheDocument();
    expect(await screen.findByText("الموقع شغال", {}, { timeout: 4000 })).toBeInTheDocument();
    const created = api.callsTo("POST", "/api/my/sites");
    expect(created).toHaveLength(1);
    expect(created[0].path).toBe("/api/my/sites?name=my-site");
    expect(screen.getByRole("link", { name: "https://shop-a-my-site.talabq.com" })).toHaveAttribute("href", "https://shop-a-my-site.talabq.com");
    for (const link of screen.getAllByRole("link", { name: "مواقعي" })) expect(link).toHaveAttribute("href", "/"); // the menu and the button
  });

  it("choosing another kind asks the server again for that kind, and sends it with the final request", async () => {
    const api = fakeApi(base({ "POST /api/my/sites": { id: "j2", name: "shop", status: "queued", phase: "queued" }, "GET /api/my/jobs/j2": { id: "j2", name: "shop", status: "running", phase: "uploading" } }));
    renderApp(api, "/new");
    await userEvent.upload(await screen.findByTestId("zip-input"), zip());
    await screen.findByText(/اتعرف تلقائياً/);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "تغيير النوع" }), "laravel");
    await waitFor(() => expect(api.callsTo("POST", "/api/my/sites/inspect")).toHaveLength(2));
    expect(api.calls.filter(c => c.path.startsWith("/api/my/sites/inspect")).map(c => c.path)).toEqual(["/api/my/sites/inspect", "/api/my/sites/inspect?template=laravel"]);
    await userEvent.click(screen.getByRole("button", { name: "التالي" }));
    await userEvent.type(screen.getByLabelText("اسم الموقع"), "shop");
    await userEvent.click(screen.getByRole("button", { name: "شغّل الموقع" }));
    await screen.findByText("رفع الملفات");
    expect(api.callsTo("POST", "/api/my/sites")[0].path).toBe("/api/my/sites?name=shop&template=laravel");
  });

  it("warnings from the server are shown before the owner commits", async () => {
    renderApp(fakeApi(base({ "POST /api/my/sites/inspect": { ...INSPECT, template: "laravel", warnings: ["There is no vendor folder."] } })), "/new");
    await userEvent.upload(await screen.findByTestId("zip-input"), zip());
    expect(await screen.findByText("There is no vendor folder.")).toBeInTheDocument();
  });

  it("refuses a file that is not a zip or is too big, without calling the server", async () => {
    const api = fakeApi(base());
    renderApp(api, "/new");
    const input = await screen.findByTestId("zip-input");
    await userEvent.upload(input, new File(["x"], "notes.txt"), { applyAccept: false });
    expect(await screen.findByText("الملف لازم يكون zip.")).toBeInTheDocument();
    const big = zip("big.zip");
    Object.defineProperty(big, "size", { value: 40 * 1048576 });
    await userEvent.upload(input, big);
    expect(await screen.findByText(/الملف أكبر من المسموح \(32 MB\)/)).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/my/sites/inspect")).toHaveLength(0);
  });

  it("a refusal at the review shows why and stays on the first step", async () => {
    const refusal = apiError("invalid_request", 400);
    refusal.message = "This account already has 2 of 2 sites.";
    renderApp(fakeApi(base({ "POST /api/my/sites/inspect": refusal })), "/new");
    await userEvent.upload(await screen.findByTestId("zip-input"), zip());
    expect(await screen.findByText("This account already has 2 of 2 sites.")).toBeInTheDocument();
    expect(screen.getByTestId("zip-input")).toBeInTheDocument();
  });

  it("a failed build explains that nothing was left behind, shows the details, and goes back to try again", async () => {
    const api = fakeApi(base({ "POST /api/my/sites": { id: "j3", name: "shop", status: "queued", phase: "queued" }, "GET /api/my/jobs/j3": { id: "j3", name: "shop", status: "failed", phase: "building", error: { code: "upstream_error", message: "The build failed (error). Last lines:\nnpm ERR! missing script" } } }));
    await pickAndGoToName(api);
    await userEvent.type(screen.getByLabelText("اسم الموقع"), "shop");
    await userEvent.click(screen.getByRole("button", { name: "شغّل الموقع" }));
    expect(await screen.findByText("الموقع ما اشتغلش")).toBeInTheDocument();
    expect(screen.getByText(/اللوحة مسحت اللي اتعمل/)).toBeInTheDocument();
    expect(screen.getByText(/npm ERR! missing script/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "حاول تاني" }));
    expect(screen.getByLabelText("اسم الموقع")).toBeInTheDocument();
  });

  it("only a tenant can open it: a viewer and the owner land elsewhere, and the menu offers it to tenants only", async () => {
    const viewer = renderApp(fakeApi(base({ "GET /api/auth/session": session("viewer") })), "/new");
    await screen.findByRole("heading", { name: "مواقعي" });
    expect(within(screen.getByRole("navigation", { name: "التنقل الرئيسي" })).queryByRole("link", { name: "موقع جديد" })).not.toBeInTheDocument();
    viewer.unmount();
    renderApp(fakeApi(base()), "/");
    await screen.findByRole("heading", { name: "مواقعي" });
    expect(within(screen.getByRole("navigation", { name: "التنقل الرئيسي" })).getByRole("link", { name: "موقع جديد" })).toBeInTheDocument();
  });
});
