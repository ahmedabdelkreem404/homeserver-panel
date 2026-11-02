import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, FULL_SESSION, fakeApi, OWNER, renderApp, signedInRoutes } from "./fakes.jsx";

const QUOTA = { maxApps: 2, maxDatabases: 1, maxMemoryMb: 512, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 };
const USERS = {
  users: [
    { id: 1, email: "owner@example.test", role: "owner", disabled: false, totpEnabled: true, mustChangePassword: false, createdAt: "2026-11-01T10:00:00Z", tenant: null },
    { id: 2, email: "acme@example.test", role: "tenant", disabled: false, totpEnabled: true, mustChangePassword: false, createdAt: "2026-11-02T10:00:00Z", tenant: { id: 1, slug: "acme", name: "Acme Shop", quota: QUOTA } },
    { id: 3, email: "frozen@example.test", role: "tenant", disabled: true, totpEnabled: false, mustChangePassword: true, createdAt: "2026-11-02T11:00:00Z", tenant: { id: 2, slug: "frozen", name: "Frozen", quota: QUOTA } },
  ],
};
const routes = extra => signedInRoutes({ "GET /api/users": USERS, ...extra });

describe("users page (owner)", () => {
  it("lists every account with its role, allowance and state; the owner row has no actions", async () => {
    renderApp(fakeApi(routes()), "/users");
    await screen.findByRole("heading", { name: "المستخدمين" });
    const acme = await screen.findByTestId("user-acme@example.test");
    expect(within(acme).getByText("عميل استضافة")).toBeInTheDocument();
    expect(within(acme).getByText(/2 تطبيق، 1 قاعدة بيانات، 512 MB رام، 1 CPU/)).toBeInTheDocument();
    expect(within(acme).getByText("نشط")).toBeInTheDocument();
    expect(within(screen.getByTestId("user-frozen@example.test")).getByText("موقوف")).toBeInTheDocument();
    expect(within(screen.getByTestId("user-owner@example.test")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("validates before sending, creates a tenant account and shows the temporary password once", async () => {
    const api = fakeApi(routes({ "POST /api/users": { user: { id: 9, email: "new@example.test", role: "tenant" }, temporaryPassword: "ABCDE-FGHJK-MNPQR-STVWX" } }));
    renderApp(api, "/users");
    await userEvent.click(await screen.findByRole("button", { name: "حساب جديد" }));
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    expect(await screen.findByText("اكتب بريد إلكتروني صحيح.")).toBeInTheDocument();
    expect(screen.getByText(/من 3 لـ 24 حرف/)).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/users")).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "new@example.test");
    await userEvent.type(screen.getByLabelText("اسم الحساب القصير"), "Panel");
    expect(screen.getByLabelText("اسم الحساب القصير")).toHaveValue("panel");
    await userEvent.type(screen.getByLabelText("اسم الحساب"), "New Customer");
    await userEvent.clear(screen.getByLabelText("عدد التطبيقات"));
    await userEvent.type(screen.getByLabelText("عدد التطبيقات"), "99");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    expect(await screen.findByText("اكتب رقم من 0 لـ 50.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("عدد التطبيقات"));
    await userEvent.type(screen.getByLabelText("عدد التطبيقات"), "3");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    expect(await screen.findByTestId("temporary-password")).toHaveTextContent("ABCDE-FGHJK-MNPQR-STVWX");
    expect(api.callsTo("POST", "/api/users")[0].body).toEqual({ email: "new@example.test", role: "tenant", tenant: { slug: "panel", name: "New Customer" }, quota: { ...QUOTA, maxApps: 3 } });
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("temporary-password")).toBeInTheDocument(); // cannot be dismissed unseen
    const done = screen.getByRole("button", { name: "تم" });
    expect(done).toBeDisabled();
    await userEvent.click(screen.getByLabelText("نسخت كلمة المرور وسلمتها"));
    await userEvent.click(done);
    await waitFor(() => expect(screen.queryByTestId("temporary-password")).not.toBeInTheDocument());
    expect(api.callsTo("GET", "/api/users").length).toBeGreaterThan(1); // the list reloaded
  });

  it("an admin or viewer account has no slug or quota fields", async () => {
    const api = fakeApi(routes({ "POST /api/users": { user: { id: 9, email: "a@example.test", role: "admin" }, temporaryPassword: "ABCDE-FGHJK-MNPQR-STVWX" } }));
    renderApp(api, "/users");
    await userEvent.click(await screen.findByRole("button", { name: "حساب جديد" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /الدور/ }), "admin");
    expect(screen.queryByLabelText("اسم الحساب القصير")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "a@example.test");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    await screen.findByTestId("temporary-password");
    expect(api.callsTo("POST", "/api/users")[0].body).toEqual({ email: "a@example.test", role: "admin" });
  });

  it("a refusal from the server is shown in the dialog and nothing is created", async () => {
    renderApp(fakeApi(routes({ "POST /api/users": apiError("invalid_request", 400) })), "/users");
    await userEvent.click(await screen.findByRole("button", { name: "حساب جديد" }));
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "dup@example.test");
    await userEvent.type(screen.getByLabelText("اسم الحساب القصير"), "dup-shop");
    await userEvent.type(screen.getByLabelText("اسم الحساب"), "Dup");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("temporary-password")).not.toBeInTheDocument();
  });

  it("reset password: one confirmation, then the new password once", async () => {
    const api = fakeApi(routes({ "POST /api/users/2/reset-password": { temporaryPassword: "RESET-RESET-RESET-RESET" } }));
    renderApp(api, "/users");
    const row = await screen.findByTestId("user-acme@example.test");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "إعادة تعيين كلمة المرور" }));
    expect(api.callsTo("POST", "/api/users/2/reset-password")).toHaveLength(0);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إعادة تعيين كلمة المرور" }));
    expect(await screen.findByTestId("temporary-password")).toHaveTextContent("RESET-RESET-RESET-RESET");
  });

  it("suspend asks first and calls the server; a suspended account offers resume", async () => {
    const api = fakeApi(routes({ "POST /api/users/2/suspend": { ok: true }, "POST /api/users/3/resume": { ok: true } }));
    renderApp(api, "/users");
    const row = await screen.findByTestId("user-acme@example.test");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "إيقاف الحساب" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إيقاف الحساب" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/users/2/suspend")).toHaveLength(1));
    const frozen = screen.getByTestId("user-frozen@example.test");
    await userEvent.click(within(frozen).getByRole("button", { name: /إجراءات/ }));
    expect(screen.queryByRole("menuitem", { name: "إيقاف الحساب" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "تشغيل الحساب" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تشغيل الحساب" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/users/3/resume")).toHaveLength(1));
  });

  it("quota dialog starts from the current allowance and sends numbers", async () => {
    const api = fakeApi(routes({ "PUT /api/users/2/quota": { quota: QUOTA } }));
    renderApp(api, "/users");
    const row = await screen.findByTestId("user-acme@example.test");
    await userEvent.click(within(row).getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "تعديل الحدود" }));
    expect(screen.getByLabelText("الرام الكلية (MB)")).toHaveValue(512);
    await userEvent.clear(screen.getByLabelText("الرام الكلية (MB)"));
    await userEvent.type(screen.getByLabelText("الرام الكلية (MB)"), "768");
    await userEvent.click(screen.getByRole("button", { name: "حفظ الحدود" }));
    await waitFor(() => expect(api.callsTo("PUT", "/api/users/2/quota")).toHaveLength(1));
    expect(api.callsTo("PUT", "/api/users/2/quota")[0].body).toEqual({ ...QUOTA, maxMemoryMb: 768 });
  });
});

describe("menu by role", () => {
  const as = role => signedInRoutes({ "GET /api/auth/session": { ...FULL_SESSION, user: { ...OWNER, role } }, "GET /api/auth/sessions": { sessions: [] } });

  it("a tenant sees only Settings and lands there, even on the owner's pages", async () => {
    for (const path of ["/", "/users", "/server"]) {
      const { unmount } = renderApp(fakeApi(as("tenant")), path);
      await screen.findByRole("heading", { name: "الإعدادات" });
      const nav = screen.getByRole("navigation", { name: "التنقل الرئيسي" });
      expect(within(nav).getAllByRole("link").map(a => a.textContent)).toEqual(["الإعدادات"]);
      unmount();
    }
  });

  it("an admin sees the server pages but not Users; the owner sees Users", async () => {
    const admin = renderApp(fakeApi(as("admin")), "/");
    await screen.findByRole("heading", { name: "نظرة عامة" });
    expect(within(screen.getByRole("navigation", { name: "التنقل الرئيسي" })).queryByRole("link", { name: "المستخدمين" })).not.toBeInTheDocument();
    admin.unmount();
    renderApp(fakeApi(as("owner")), "/");
    await screen.findByRole("heading", { name: "نظرة عامة" });
    expect(within(screen.getByRole("navigation", { name: "التنقل الرئيسي" })).getByRole("link", { name: "المستخدمين" })).toBeInTheDocument();
  });
});
