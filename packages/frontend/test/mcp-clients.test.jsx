import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import CreateKeyDialog from "../src/pages/mcp/CreateKeyDialog.jsx";
import { fakeApi, renderWithProviders } from "./fakes.jsx";

const CLIENTS = { claudeCode: "Claude Code", codex: "Codex", cursor: "Cursor", gemini: "Gemini CLI", antigravity: "Antigravity", windsurf: "Windsurf", vscode: "VS Code", cline: "Cline", zed: "Zed", claudeDesktop: "Claude Desktop", generic: "أي أداة تانية" };

describe("MCP client tabs", () => {
  it("offers one tab per supported tool, each with its own config and a hint about where to paste it, and says why ChatGPT and DeepSeek are missing", async () => {
    const configs = Object.fromEntries(Object.keys(CLIENTS).map(key => [key, `CONFIG-FOR-${key}`]));
    const api = fakeApi({ "POST /api/mcp/keys": { id: "k1", name: "laptop", secret: "SECRET-VALUE-ABC123", url: "https://mcp.example/mcp-x", configs } });
    renderWithProviders(<CreateKeyDialog onClose={() => {}} />, api);
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "laptop");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    await screen.findByTestId("new-key-secret");
    for (const [key, label] of Object.entries(CLIENTS)) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByText(`CONFIG-FOR-${key}`)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    }
    await userEvent.click(screen.getByRole("button", { name: "Cline" }));
    expect(screen.getByText(/streamableHttp/)).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT مش بيدعم/)).toHaveTextContent("DeepSeek");
  });

  it("only the tools the server sent are shown", async () => {
    const api = fakeApi({ "POST /api/mcp/keys": { id: "k1", name: "laptop", secret: "S", url: "https://m/x", configs: { claudeCode: "A", gemini: "B" } } });
    renderWithProviders(<CreateKeyDialog onClose={() => {}} />, api);
    await userEvent.type(screen.getByLabelText("اسم المفتاح"), "laptop");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء المفتاح" }));
    await screen.findByTestId("new-key-secret");
    expect(screen.getByRole("button", { name: "Gemini CLI" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zed" })).not.toBeInTheDocument();
  });
});
