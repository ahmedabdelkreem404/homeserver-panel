import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Dialog from "../src/components/Dialog.jsx";
import Explainer from "../src/components/Explainer.jsx";
import Field from "../src/components/Field.jsx";
import Menu from "../src/components/Menu.jsx";
import TypedConfirm from "../src/components/TypedConfirm.jsx";
import CreateKeyDialog from "../src/pages/mcp/CreateKeyDialog.jsx";
import RotateDialog from "../src/pages/mcp/RotateDialog.jsx";
import { apiError, fakeApi, renderWithProviders } from "./fakes.jsx";

describe("TypedConfirm (typed-name delete)", () => {
  const setup = (onConfirm = vi.fn(async () => {}), onClose = vi.fn()) => {
    render(<TypedConfirm title="حذف" instruction="اكتب الاسم" expected="hs-demo" label="الاسم" mismatch="مش مطابق" confirmLabel="احذف نهائياً" onConfirm={onConfirm} onClose={onClose} />);
    return { onConfirm, onClose, button: screen.getByRole("button", { name: "احذف نهائياً" }), input: screen.getByLabelText("الاسم") };
  };

  it("stays disabled until the exact text is typed, case and spaces included", async () => {
    const { button, input, onConfirm } = setup();
    expect(button).toBeDisabled();
    for (const wrong of ["hs-dem", "HS-DEMO", "hs-demo ", " hs-demo"]) {
      await userEvent.clear(input);
      await userEvent.type(input, wrong);
      expect(button, wrong).toBeDisabled();
    }
    expect(screen.getByRole("alert")).toHaveTextContent("مش مطابق");
    await userEvent.clear(input);
    await userEvent.type(input, "hs-demo");
    expect(button).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms with the typed text, closes on success, and stays open showing the error on failure", async () => {
    const ok = setup();
    await userEvent.type(ok.input, "hs-demo");
    await userEvent.click(ok.button);
    await waitFor(() => expect(ok.onClose).toHaveBeenCalledWith(true));
    expect(ok.onConfirm).toHaveBeenCalledWith("hs-demo");
  });

  it("a refusal from the server is shown in Arabic and nothing closes", async () => {
    const onClose = vi.fn();
    const { input, button } = setup(vi.fn(async () => { throw apiError("policy_refused", 403); }), onClose);
    await userEvent.type(input, "hs-demo");
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("اللوحة رفضت العملية");
    expect(onClose).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });
});

describe("Dialog accessibility", () => {
  it("moves focus in, traps Tab, closes on Escape and gives focus back", async () => {
    const onClose = vi.fn();
    function Host() { return (<><button>فتح</button><Dialog title="عنوان" onClose={onClose}><button>أول</button><button>تاني</button></Dialog></>); }
    const { unmount } = render(<Host />);
    const dialog = screen.getByRole("dialog", { name: "عنوان" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) { await userEvent.tab(); expect(dialog.contains(document.activeElement)).toBe(true); }
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("returns focus to the opener when it closes", async () => {
    function Host() {
      const [open, setOpen] = (require("react")).useState(false);
      return (<><button onClick={() => setOpen(true)}>فتح</button>{open && <Dialog title="عنوان" onClose={() => setOpen(false)}><button>داخل</button></Dialog>}</>);
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "فتح" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("a dialog that must not be dismissed ignores Escape and has no close button", async () => {
    const onClose = vi.fn();
    render(<Dialog title="مهم" onClose={onClose} dismissible={false}><button>تمام</button></Dialog>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "إغلاق" })).not.toBeInTheDocument();
  });
});

describe("explainer (!) and menu", () => {
  it("the explainer opens with the keyboard, is described by its text and closes with Escape", async () => {
    render(<Explainer text="شرح قصير" />);
    const trigger = screen.getByRole("button", { name: "شرح" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("شرح قصير");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("the menu moves with arrow keys, skips disabled items, runs the choice and closes on Escape", async () => {
    const calls = [];
    render(<Menu label="إجراءات" items={[{ key: "a", label: "أول", onSelect: () => calls.push("a") }, { key: "b", label: "تاني", disabled: true, onSelect: () => calls.push("b") }, { key: "c", label: "تالت", onSelect: () => calls.push("c") }]} />);
    await userEvent.click(screen.getByRole("button", { name: /إجراءات/ }));
    expect(screen.getByRole("menuitem", { name: "أول" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "تالت" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "أول" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /إجراءات/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "تالت" }));
    expect(calls).toEqual(["c"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a field ties its label, hint and error to the input", () => {
    render(<Field label="الاسم" hint="تلميح" error="خطأ" />);
    const input = screen.getByLabelText("الاسم");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("خطأ تلميح");
  });
});

describe("MCP key creation shows the secret once", () => {
  const created = { id: "k1", name: "laptop", secret: "SECRET-VALUE-ABC123", url: "https://mcp.example/mcp-x", configs: { claudeCode: "claude mcp add dokploy-remote https://mcp.example/mcp-x", codex: "[mcp_servers.dokploy-remote]", cursor: "{ \"mcpServers\": {} }" } };

  it("validates the name, sends it with the expiry, then shows the secret and configs and refuses to close until it is marked as saved", async () => {
    const onClose = vi.fn();
    const api = fakeApi({ "POST /api/mcp/keys": created });
    renderWithProviders(<CreateKeyDialog onClose={onClose} />, api);
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "bad/name");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    expect(await screen.findByText(/الاسم من 1 إلى 32 حرف/)).toBeInTheDocument();
    expect(api.callsTo("POST", "/api/mcp/keys")).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText("اسم المفتاح"));
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "laptop");
    await userEvent.selectOptions(screen.getByLabelText("الصلاحية"), "30 يوم");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    expect(await screen.findByTestId("new-key-secret")).toHaveTextContent("SECRET-VALUE-ABC123");
    expect(api.callsTo("POST", "/api/mcp/keys")[0].body).toEqual({ name: "laptop", expiresInDays: 30 });
    expect(screen.getByText(/ده المفتاح الوحيد اللي هتشوفه/)).toBeInTheDocument();
    // one tab per client, each with its own ready-to-paste config
    expect(screen.getByText(/claude mcp add dokploy-remote/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Codex" }));
    expect(screen.getByText("[mcp_servers.dokploy-remote]")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(screen.getByText(/mcpServers/)).toBeInTheDocument();
    // cannot be dismissed by accident
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    const done = screen.getByRole("button", { name: "تم" });
    expect(done).toBeDisabled();
    await userEvent.click(screen.getByLabelText("نسخت المفتاح وحفظته"));
    await userEvent.click(done);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("a key created while the MCP url is unknown still shows the key, with a notice instead of configs", async () => {
    const api = fakeApi({ "POST /api/mcp/keys": { ...created, url: null, configs: null } });
    renderWithProviders(<CreateKeyDialog onClose={() => {}} />, api);
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "laptop");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    expect(await screen.findByTestId("new-key-secret")).toBeInTheDocument();
    expect(screen.getByText(/رابط الـ MCP غير متاح/)).toBeInTheDocument();
  });

  it("a protected name is refused by the server and the form stays open with the reason", async () => {
    const api = fakeApi({ "POST /api/mcp/keys": apiError("policy_refused", 403) });
    renderWithProviders(<CreateKeyDialog onClose={() => {}} />, api);
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "deploy-cli");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("اللوحة رفضت العملية");
    expect(screen.queryByTestId("new-key-secret")).not.toBeInTheDocument();
  });
});

describe("MCP path rotation warning", () => {
  it("warns that clients will disconnect, needs the typed word, and calls the server only then", async () => {
    const api = fakeApi({ "POST /api/mcp/rotate-path": { url: "https://mcp.example/mcp-NEW" } });
    renderWithProviders(<RotateDialog onClose={() => {}} />, api);
    expect(screen.getByText("كل الأدوات المتصلة هتفصل")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "غيّر المسار" });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText("كلمة التأكيد"), "rotate");
    expect(go).toBeDisabled();
    expect(screen.getAllByRole("alert").some(a => a.textContent.includes("ROTATE"))).toBe(true);
    expect(api.callsTo("POST", "/api/mcp/rotate-path")).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText("كلمة التأكيد"));
    await userEvent.type(screen.getByLabelText("كلمة التأكيد"), "ROTATE");
    await userEvent.click(go);
    expect(await screen.findByTestId("new-mcp-url")).toHaveTextContent("https://mcp.example/mcp-NEW");
    expect(api.callsTo("POST", "/api/mcp/rotate-path")[0].body).toEqual({ confirm: "ROTATE" });
  });

  it("a failure (the MCP did not become healthy) is shown and the dialog stays on the form", async () => {
    const api = fakeApi({ "POST /api/mcp/rotate-path": apiError("upstream_timeout", 504) });
    renderWithProviders(<RotateDialog onClose={() => {}} />, api);
    await userEvent.type(screen.getByLabelText("كلمة التأكيد"), "ROTATE");
    await userEvent.click(screen.getByRole("button", { name: "غيّر المسار" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some(a => a.textContent.includes("اتأخرت في الرد"))).toBe(true), { timeout: 3000 });
    expect(screen.queryByTestId("new-mcp-url")).not.toBeInTheDocument();
  });
});
