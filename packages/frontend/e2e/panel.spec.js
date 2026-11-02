import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_FIRST_PASSWORD, E2E_NEW_PASSWORD } from "./credentials.js";
import { makeZip } from "../../backend/test/zip-helpers.js";
import { createTotpSource } from "./totp.js";

const KEY_NAME = "e2e-temp";
const csrfOf = async context => decodeURIComponent((await context.cookies()).find(c => c.name === "__Host-panel_csrf").value);
let nextCode;
let page; // one browser context for the whole serial flow: the session cookie has to survive between the steps

async function fillLogin(page, email, password) {
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

test.describe.serial("panel against a real run", () => {
  test.beforeAll(async ({ browser }) => { page = await (await browser.newContext({ locale: "ar-EG", baseURL: "http://localhost:3100" })).newPage(); });
  test.afterAll(async () => { await page.context().close(); });

  test("first sign-in: new password, authenticator setup with a local QR, recovery codes, then the dashboard", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await fillLogin(page, E2E_EMAIL, E2E_FIRST_PASSWORD);

    await expect(page.getByRole("heading", { name: "اختار كلمة مرور جديدة" })).toBeVisible();
    await page.getByLabel("كلمة المرور الحالية").fill(E2E_FIRST_PASSWORD);
    await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(E2E_NEW_PASSWORD);
    await page.getByLabel("أعد كتابة كلمة المرور الجديدة").fill(E2E_NEW_PASSWORD);
    await page.getByRole("button", { name: "حفظ ومتابعة" }).click();

    await expect(page.getByRole("heading", { name: "فعّل التحقق الثنائي" })).toBeVisible();
    await expect(page.getByRole("img", { name: "رمز QR لإعداد تطبيق المصادقة" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
    nextCode = createTotpSource((await page.getByTestId("totp-secret").innerText()).replace(/\s/g, ""));
    await page.getByLabel("الكود الحالي من التطبيق").fill(await nextCode());
    await page.getByRole("button", { name: "تأكيد وتفعيل" }).click();

    await expect(page.getByRole("heading", { name: "احفظ أكواد الاسترداد" })).toBeVisible();
    await expect(page.getByRole("list", { name: "احفظ أكواد الاسترداد" }).getByRole("listitem")).toHaveCount(10);
    const finish = page.getByRole("button", { name: "إنهاء والدخول للوحة" });
    await expect(finish).toBeDisabled();
    await page.getByLabel("حفظت الأكواد في مكان آمن").check();
    await finish.click();
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
  });

  test("CSRF is enforced: a state-changing call without the header is refused, and anonymous calls get 401", async ({ request }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();

    const withoutHeader = await page.request.post("/api/mcp/keys", { data: { name: "csrf-probe" } });
    expect(withoutHeader.status()).toBe(403);
    expect((await withoutHeader.json()).error.code).toBe("csrf_failed");
    const anonymous = await request.get("/api/projects");
    expect(anonymous.status()).toBe(401);
  });

  test("projects come from the real Dokploy, and the protected ones carry the lock", async () => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible();
    await expect(page.getByText("infra", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("محمي").first()).toBeVisible();
  });

  test("a throwaway key is created, shown once with the three client configs, then revoked", async () => {
    await page.goto("/mcp");
    await page.getByRole("button", { name: "مفتاح جديد" }).click();
    await page.getByLabel("اسم المفتاح").fill(KEY_NAME);
    await page.getByLabel("الصلاحية").selectOption({ label: "30 يوم" });
    await page.getByRole("button", { name: "إنشاء المفتاح" }).click();
    await expect(page.getByTestId("new-key-secret")).not.toBeEmpty();
    await expect(page.getByText("ده المفتاح الوحيد اللي هتشوفه")).toBeVisible();
    for (const client of ["Codex", "Cursor", "Claude Code"]) await page.getByRole("button", { name: client }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible(); // it cannot be dismissed before the secret is marked as saved
    await page.getByLabel("نسخت المفتاح وحفظته").check();
    await page.getByRole("button", { name: "تم" }).click();

    const row = page.getByRole("row", { name: new RegExp(KEY_NAME) });
    await expect(row).toBeVisible();
    await expect(page.getByText("dk-")).toHaveCount(0); // the secret is gone from the page for good
    await row.getByRole("button", { name: "إلغاء المفتاح" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "إلغاء المفتاح" }).click();
    await expect(page.getByRole("row", { name: new RegExp(KEY_NAME) })).toHaveCount(0);
  });

  test("the audit log shows what was done, and signing out ends the session", async () => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "سجل النشاط" })).toBeVisible();
    const audit = await (await page.request.get("/api/audit?limit=50")).json();
    expect(audit.items.some(row => /apikey/i.test(row.action) && row.result === "ok")).toBe(true); // the throwaway key, created and revoked
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    expect((await page.request.get("/api/projects")).status()).toBe(401);
  });

  test("it works at phone width: the menu opens and nothing scrolls sideways", async () => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await fillLogin(page, E2E_EMAIL, E2E_NEW_PASSWORD);
    await page.getByLabel("كود التحقق").fill(await nextCode());
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "فتح القائمة" }).click();
    await expect(page.getByRole("navigation", { name: "التنقل الرئيسي" })).toBeVisible();
  });

  // The hosting flow end to end: the owner adds a customer in the UI, the customer signs in for the first time in a
  // separate browser, sees only Settings, and every server API is closed to that account.
  test("the owner adds a tenant account and the tenant sees and can do nothing else", async ({ browser }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/users");
    await page.getByRole("button", { name: "حساب جديد" }).click();
    await page.getByLabel("البريد الإلكتروني").fill("e2e-tenant@example.test");
    await page.getByLabel("اسم الحساب القصير").fill("e2e-shop");
    await page.getByLabel("اسم الحساب", { exact: true }).fill("E2E Shop");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    const temporary = (await page.getByTestId("temporary-password").innerText()).trim();
    await page.getByLabel("نسخت كلمة المرور وسلمتها").check();
    await page.getByRole("button", { name: "تم" }).click();
    await expect(page.getByTestId("user-e2e-tenant@example.test")).toBeVisible();

    const context = await browser.newContext({ locale: "ar-EG", baseURL: "http://localhost:3100" });
    const tenant = await context.newPage();
    await tenant.goto("/");
    await fillLogin(tenant, "e2e-tenant@example.test", temporary);
    await tenant.getByLabel("كلمة المرور الحالية").fill(temporary);
    await tenant.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("Tenant-Own-Password-4321");
    await tenant.getByLabel("أعد كتابة كلمة المرور الجديدة").fill("Tenant-Own-Password-4321");
    await tenant.getByRole("button", { name: "حفظ ومتابعة" }).click();
    await expect(tenant.getByRole("heading", { name: "فعّل التحقق الثنائي" })).toBeVisible();
    const tenantCode = createTotpSource((await tenant.getByTestId("totp-secret").innerText()).replace(/s/g, ""));
    await tenant.getByLabel("الكود الحالي من التطبيق").fill(await tenantCode());
    await tenant.getByRole("button", { name: "تأكيد وتفعيل" }).click();
    await tenant.getByLabel("حفظت الأكواد في مكان آمن").check();
    await tenant.getByRole("button", { name: "إنهاء والدخول للوحة" }).click();

    await expect(tenant.getByRole("heading", { name: "مواقعي" })).toBeVisible();
    await expect(tenant.getByText("لسه ما عندكش مواقع.")).toBeVisible();
    const links = tenant.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link");
    await expect(links).toHaveCount(2);
    for (const path of ["/api/projects", "/api/server/status", "/api/mcp/keys", "/api/users", "/api/audit", "/api/settings/backup"]) {
      const res = await tenant.request.get(path);
      expect([path, res.status()]).toEqual([path, 403]);
    }
    await tenant.goto("/users");
    await expect(tenant.getByRole("heading", { name: "مواقعي" })).toBeVisible();

    // A real site on the real server: upload, build, public answer, then remove everything this test made.
    test.setTimeout(600_000);
    const csrf = await csrfOf(context);
    const created = await tenant.request.post("/api/my/sites?name=hello-e2e", { data: makeZip([{ name: "index.html", data: "<h1>e2e hello</h1>" }]), headers: { "content-type": "application/zip", "x-csrf-token": csrf }, timeout: 500_000 });
    expect([created.status(), await created.text()].slice(0, 1)).toEqual([200]);
    const site = await created.json();
    expect(site.url).toBe("https://e2e-shop-hello-e2e.talabq.com");
    await expect.poll(async () => (await fetch(site.url).catch(() => ({ status: 0 }))).status, { timeout: 120_000, intervals: [2000] }).toBe(200);
    expect(await (await fetch(site.url)).text()).toContain("e2e hello");
    await tenant.goto("/");
    await expect(tenant.getByTestId("app-hello-e2e")).toBeVisible();
    const removed = await tenant.request.delete(`/api/my/sites/${site.applicationId}`, { data: { confirmName: "hello-e2e" }, headers: { "x-csrf-token": csrf } });
    expect(removed.status()).toBe(200);
    const listed = await (await page.request.get("/api/projects?fresh=1")).json();
    const accountProject = listed.projects.find(p => p.name === "t-e2e-shop");
    expect(accountProject).toBeTruthy();
    const projectRemoved = await page.request.delete(`/api/projects/${accountProject.projectId}`, { data: { confirmName: "t-e2e-shop" }, headers: { "x-csrf-token": await csrfOf(page.context()) } });
    expect(projectRemoved.status()).toBe(200);
    await context.close();
  });

  // Evidence: every screen at phone and desktop width. The MCP url holds a secret path, so it is masked.
  test("screenshots of every screen", async () => {
    const out = "../../docs/evidence/1.4/screens";
    for (const [name, size] of [["phone", { width: 360, height: 740 }], ["desktop", { width: 1280, height: 800 }]]) {
      await page.setViewportSize(size);
      for (const route of ["", "projects", "mcp", "devices", "server", "audit", "settings"]) {
        await page.goto("/" + route);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${out}/${name}-${route || "dashboard"}.png`, fullPage: true, mask: [page.getByTestId("mcp-url")] });
      }
    }
  });
});
