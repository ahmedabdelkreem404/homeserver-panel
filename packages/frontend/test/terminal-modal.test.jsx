import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TerminalModal from "../src/components/TerminalModal.jsx";
import { ApiProvider } from "../src/lib/apiContext.jsx";
import { ToastProvider } from "../src/lib/toast.jsx";

// Mock @xterm/xterm and @xterm/addon-fit for jsdom environment
vi.mock("@xterm/xterm", () => {
  return {
    Terminal: class {
      constructor() {
        this.cols = 80;
        this.rows = 24;
      }
      open() {}
      loadAddon() {}
      write() {}
      reset() {}
      dispose() {}
      onData() {}
    },
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: class {
      fit() {}
    },
  };
});

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }
  send() {}
  close() {
    if (this.onclose) this.onclose();
  }
}

globalThis.WebSocket = MockWebSocket;



describe("TerminalModal component", () => {
  const site = { applicationId: "app-test-1", name: "my-shop", template: "laravel" };

  it("renders modal, fetches commands and ticket, and shows status and container ID", async () => {
    const postCalls = [];
    const getCalls = [];

    const fakeApi = {
      get: async path => {
        getCalls.push(path);
        if (path.includes("/commands")) {
          return {
            commands: [
              { id: "migrate", label: "تشغيل الـ Migrations", command: "php artisan migrate --force" },
              { id: "cache-clear", label: "مسح الكاش", command: "php artisan cache:clear" },
            ],
          };
        }
        return {};
      },
      post: async (path, body) => {
        postCalls.push({ path, body });
        if (path.endsWith("/terminal/ticket")) {
          return { ticket: "tok-123456", containerId: "c1234567890abcdef", appName: "my-shop" };
        }
        if (path.endsWith("/commands/run")) {
          return { ok: true, output: "Migration table created successfully." };
        }
        return {};
      },
    };

    render(
      <ApiProvider value={fakeApi}>
        <ToastProvider>
          <TerminalModal site={site} scope="my" onClose={() => {}} />
        </ToastProvider>
      </ApiProvider>
    );

    // Modal title contains site name
    expect(screen.getByRole("heading", { name: /my-shop/ })).toBeInTheDocument();

    // Quick commands are rendered
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "تشغيل الـ Migrations" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "مسح الكاش" })).toBeInTheDocument();

    // Container ID badge rendered
    await waitFor(() => {
      expect(screen.getByText(/c1234567890a/)).toBeInTheDocument();
    });

    // Run quick command
    const migrateBtn = screen.getByRole("button", { name: "تشغيل الـ Migrations" });
    await userEvent.click(migrateBtn);

    await waitFor(() => {
      expect(postCalls.some(c => c.path.includes("/commands/run") && c.body.commandId === "migrate")).toBe(true);
    });
  });

  it("displays error message when ticket issuance fails", async () => {
    const fakeApi = {
      get: async () => ({ commands: [] }),
      post: async () => {
        throw new Error("Site not running");
      },
    };

    render(
      <ApiProvider value={fakeApi}>
        <ToastProvider>
          <TerminalModal site={site} scope="my" onClose={() => {}} />
        </ToastProvider>
      </ApiProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Site not running")[0]).toBeInTheDocument();
    });
  });
});

