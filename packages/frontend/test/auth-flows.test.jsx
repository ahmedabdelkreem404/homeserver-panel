import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App.jsx";
import { ANON_SESSION, apiError, FULL_SESSION, fakeApi, OWNER, renderApp, signedInRoutes, STATUS_SAMPLE } from "./fakes.jsx";

const pending = next => ({ authenticated: false, stage: "password_ok", next, user: { ...OWNER, mustChangePassword: next === "change_password" }, csrfToken: "t" });

describe("login", () => {
  it("asks for both fields before calling the server", async () => {
    const api = fakeApi({ "GET /api/auth/session": ANON_SESSION });
    renderApp(api);
    await screen.findByRole("heading", { name: "تسجيل الدخول" });
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByText("اكتب البريد الإلكتروني.")).toBeInTheDocument();
    expect(screen.getByText("اكتب كلمة المرور.")).toBeInTheDocument();
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveAttribute("aria-invalid", "true");
    expect(api.callsTo("POST", "/api/auth/login")).toHaveLength(0);
  });

  it("shows a wrong password as an Arabic message without saying which field was wrong, and clears the password", async () => {
    const api = fakeApi({ "GET /api/auth/session": ANON_SESSION, "POST /api/auth/login": apiError("invalid_credentials", 401) });
    renderApp(api);
    await userEvent.type(await screen.findByLabelText("البريد الإلكتروني"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "wrong-password-123");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("البريد أو كلمة المرور غير صحيحة.");
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue("");
    expect(api.callsTo("POST", "/api/auth/login")[0].body).toEqual({ email: "owner@example.test", password: "wrong-password-123" });
  });

  it("tells the owner how long to wait when locked out", async () => {
    const api = fakeApi({ "GET /api/auth/session": ANON_SESSION, "POST /api/auth/login": apiError("rate_limited", 429, { retryAfterSec: 600 }) });
    renderApp(api);
    await userEvent.type(await screen.findByLabelText("البريد الإلكتروني"), "a@b.test");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "x");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("10 دقيقة");
  });

  it("every sign-in field has a label and the password field is a password field", async () => {
    renderApp(fakeApi({ "GET /api/auth/session": ANON_SESSION }));
    expect(await screen.findByLabelText("كلمة المرور")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveAttribute("autocomplete", "username");
  });
});

describe("two-step verification", () => {
  const routes = extra => ({ "GET /api/auth/session": ANON_SESSION, "POST /api/auth/login": { stage: "password_ok", next: "totp_verify", user: OWNER, csrfToken: "t" }, ...extra });

  async function signInUpToTotp(api) {
    renderApp(api);
    await userEvent.type(await screen.findByLabelText("البريد الإلكتروني"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "Correct-Horse-Battery-9");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    return screen.findByRole("heading", { name: "التحقق الثنائي" });
  }

  it("accepts digits only, submits the code and opens the app", async () => {
    const api = fakeApi(routes({ "POST /api/auth/totp/verify": { stage: "full", user: OWNER, csrfToken: "t" }, ...signedInRoutes({ "GET /api/auth/session": ANON_SESSION }) }));
    await signInUpToTotp(api);
    const code = screen.getByLabelText("كود التحقق");
    await userEvent.type(code, "12ab34 56");
    expect(code).toHaveValue("1234 56");
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/auth/totp/verify")[0].body).toEqual({ code: "123456" }));
    expect(await screen.findByRole("heading", { name: "نظرة عامة" })).toBeInTheDocument();
  });

  it("a wrong code shows an error and empties the field; the recovery code path works", async () => {
    const api = fakeApi(routes({ "POST /api/auth/totp/verify": apiError("invalid_code", 401), "POST /api/auth/recovery": { stage: "full", user: OWNER, csrfToken: "t" }, ...signedInRoutes({ "GET /api/auth/session": ANON_SESSION }) }));
    await signInUpToTotp(api);
    await userEvent.type(screen.getByLabelText("كود التحقق"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("الكود غير صحيح");
    expect(screen.getByLabelText("كود التحقق")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: /كود استرداد/ }));
    await userEvent.type(screen.getByLabelText("كود الاسترداد"), "ABCD-EFGH-IJKL");
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/auth/recovery")[0].body).toEqual({ code: "ABCD-EFGH-IJKL" }));
    expect(await screen.findByRole("heading", { name: "نظرة عامة" })).toBeInTheDocument();
  });

  it("an empty code is not sent", async () => {
    const api = fakeApi(routes());
    await signInUpToTotp(api);
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(await screen.findByText("اكتب الكود.")).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/auth/totp/verify")).toHaveLength(0);
  });
});

describe("first sign-in: new password, two-step setup, recovery codes", () => {
  it("walks through all three steps and only continues after the codes are marked as saved", async () => {
    let session = { ...ANON_SESSION };
    const api = fakeApi(signedInRoutes({
      "GET /api/auth/session": () => session,
      "POST /api/auth/login": () => { session = pending("change_password"); return { stage: "password_ok", next: "change_password", user: session.user, csrfToken: "t" }; },
      "POST /api/auth/change-password": () => { session = pending("totp_enroll"); return { next: "totp_enroll", otherSessionsRevoked: 0 }; },
      "POST /api/auth/totp/enroll/start": { secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/x", qrSvg: "<svg xmlns='http://www.w3.org/2000/svg'/>" },
      "POST /api/auth/totp/enroll/confirm": () => { session = FULL_SESSION; return { recoveryCodes: ["AAAA-1111-BBBB", "CCCC-2222-DDDD"] }; },
    }));
    renderApp(api);
    await userEvent.type(await screen.findByLabelText("البريد الإلكتروني"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "Temporary-First-Pass-1");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));

    // step 1: password
    await screen.findByRole("heading", { name: "اختار كلمة مرور جديدة" });
    await userEvent.type(screen.getByLabelText("كلمة المرور الحالية"), "Temporary-First-Pass-1");
    await userEvent.type(screen.getByLabelText("كلمة المرور الجديدة"), "short");
    await userEvent.type(screen.getByLabelText("أعد كتابة كلمة المرور الجديدة"), "short");
    await userEvent.click(screen.getByRole("button", { name: "حفظ ومتابعة" }));
    expect(await screen.findByText("كلمة المرور لازم تكون 12 حرف على الأقل.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("كلمة المرور الجديدة"));
    await userEvent.type(screen.getByLabelText("كلمة المرور الجديدة"), "A-Brand-New-Passphrase-7");
    await userEvent.click(screen.getByRole("button", { name: "حفظ ومتابعة" }));
    expect(await screen.findByText("كلمتا المرور غير متطابقتين.")).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/auth/change-password")).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText("أعد كتابة كلمة المرور الجديدة"));
    await userEvent.type(screen.getByLabelText("أعد كتابة كلمة المرور الجديدة"), "A-Brand-New-Passphrase-7");
    await userEvent.click(screen.getByRole("button", { name: "حفظ ومتابعة" }));
    expect(api.callsTo("POST", "/api/auth/change-password")[0].body).toEqual({ currentPassword: "Temporary-First-Pass-1", newPassword: "A-Brand-New-Passphrase-7" });

    // step 2: authenticator setup, local QR and the secret for manual entry
    await screen.findByRole("heading", { name: "فعّل التحقق الثنائي" });
    expect(screen.getByRole("img", { name: "رمز QR لإعداد تطبيق المصادقة" }).getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
    expect(api.callsTo("POST", "/api/auth/totp/enroll/start")).toHaveLength(1);
    await userEvent.type(screen.getByLabelText("الكود الحالي من التطبيق"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "تأكيد وتفعيل" }));

    // step 3: the one time recovery codes
    await screen.findByRole("heading", { name: "احفظ أكواد الاسترداد" });
    const list = screen.getByRole("list", { name: "احفظ أكواد الاسترداد" });
    expect(within(list).getAllByRole("listitem").map(li => li.textContent)).toEqual(["AAAA-1111-BBBB", "CCCC-2222-DDDD"]);
    const finish = screen.getByRole("button", { name: "إنهاء والدخول للوحة" });
    expect(finish).toBeDisabled();
    await userEvent.click(screen.getByLabelText("حفظت الأكواد في مكان آمن"));
    expect(finish).toBeEnabled();
    await userEvent.click(finish);
    expect(await screen.findByRole("heading", { name: "نظرة عامة" })).toBeInTheDocument();
    expect(screen.queryByText("AAAA-1111-BBBB")).not.toBeInTheDocument();
  });

  it("a rejected setup code shows an error and stays on the step", async () => {
    const api = fakeApi({
      "GET /api/auth/session": pending("totp_enroll"),
      "POST /api/auth/totp/enroll/start": { secret: "JBSWY3DPEHPK3PXP", otpauthUri: "x", qrSvg: "<svg/>" },
      "POST /api/auth/totp/enroll/confirm": apiError("invalid_code", 401),
    });
    renderApp(api);
    await screen.findByRole("heading", { name: "فعّل التحقق الثنائي" });
    await userEvent.type(await screen.findByLabelText("الكود الحالي من التطبيق"), "111111");
    await userEvent.click(screen.getByRole("button", { name: "تأكيد وتفعيل" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("الكود غير صحيح");
    expect(screen.getByRole("heading", { name: "فعّل التحقق الثنائي" })).toBeInTheDocument();
  });
});

describe("session handling", () => {
  it("an answer of unauthenticated while signed in returns to the login page with a notice", async () => {
    let expired = false;
    const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const fetchImpl = async url => {
      if (url === "/api/auth/session") return respond(200, expired ? ANON_SESSION : FULL_SESSION);
      if (url === "/api/projects") { expired = true; return respond(401, { error: { code: "unauthenticated", message: "x" } }); }
      return respond(200, url === "/api/server/status" ? STATUS_SAMPLE : {});
    };
    window.history.replaceState(null, "", "/projects");
    render(<App fetchImpl={fetchImpl} />);
    expect(await screen.findByRole("heading", { name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByText("انتهت الجلسة. سجّل الدخول من جديد.")).toBeInTheDocument();
  });

  it("signing out calls the server and shows the login page", async () => {
    let session = FULL_SESSION;
    const api = fakeApi(signedInRoutes({ "GET /api/auth/session": () => session, "POST /api/auth/logout": () => { session = ANON_SESSION; return { ok: true }; } }));
    renderApp(api);
    await screen.findByRole("heading", { name: "نظرة عامة" });
    await userEvent.click(screen.getByRole("button", { name: "تسجيل الخروج" }));
    expect(await screen.findByRole("heading", { name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/auth/logout")).toHaveLength(1);
  });
});
