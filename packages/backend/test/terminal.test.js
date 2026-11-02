import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import EventEmitter from "node:events";
import { WebSocket } from "ws";
import { createTerminalService, ALLOWED_COMMANDS } from "../src/services/terminal.js";
import { PanelError } from "../src/errors.js";

class FakeUpstreamWs extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.sent = [];
    this.closed = false;
    process.nextTick(() => this.emit("open"));
  }
  send(data) {
    this.sent.push(data);
    if (String(data).includes("exit")) {
      process.nextTick(() => {
        this.emit("message", Buffer.from("command finished\n"));
        this.close();
      });
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    process.nextTick(() => this.emit("close"));
  }
}


function setupService({ now = () => new Date(), maxConcurrentSessions = 2, idleTimeoutMs = 500, maxLifetimeMs = 1000 } = {}) {
  const auditRows = [];
  const audit = {
    begin(row) {
      const id = auditRows.length + 1;
      auditRows.push({ id, ...row, status: "pending" });
      return id;
    },
    finish(id, result, details) {
      const row = auditRows.find(r => r.id === id);
      if (row) {
        row.status = result;
        row.details = details;
      }
    },
  };

  const apps = {
    "app-1": { name: "app-1", appName: "app-one" },
    "app-protected": { name: "app-protected", appName: "infra-one" },
  };

  const containers = {
    "app-one": [{ containerId: "c1", state: "running", name: "app-one.1" }],
    "infra-one": [{ containerId: "c-infra", state: "running", name: "infra-one.1" }],
  };

  const gateway = {
    appDetails: async id => apps[id] ?? null,
    read: async (proc, { appName }) => containers[appName] ?? [],
  };

  const owned = new Set(["app-1"]);
  const hosting = {
    assertOwns: (tenantId, appId) => {
      if (!owned.has(appId)) throw new PanelError("not_found", "Not found.");
    },
  };

  const policy = {
    isProtectedOwner: ({ applicationId }) => applicationId === "app-protected",
  };

  const service = createTerminalService({
    gateway,
    hosting,
    policy,
    audit,
    dokployUrl: "http://dokploy:3000",
    dokployApiKey: "test-key",
    now,
    maxConcurrentSessions,
    idleTimeoutMs,
    maxLifetimeMs,
    maxInputBytes: 64, // small for test
    ticketTtlMs: 500,
    WebSocketImpl: FakeUpstreamWs,
  });

  return { service, auditRows, containers };
}

test("terminal: allowed commands table per template", () => {
  assert.ok(ALLOWED_COMMANDS.laravel.some(c => c.id === "migrate"));
  assert.ok(ALLOWED_COMMANDS.node.some(c => c.id === "node-version"));
  assert.ok(ALLOWED_COMMANDS.php.some(c => c.id === "php-version"));
});

test("terminal: ticket issuance validates ownership and running container", async () => {
  const { service } = setupService();
  const ctx = { userId: "u1", actor: "tenant@example.com" };

  const res = await service.issueTicket(ctx, { applicationId: "app-1", tenantId: "t1" });
  assert.ok(res.ticket && res.ticket.length >= 32);
  assert.equal(res.containerId, "c1");
  assert.equal(res.appName, "app-one");

  // IDOR refusal
  await assert.rejects(
    service.issueTicket(ctx, { applicationId: "app-unknown", tenantId: "t1" }),
    /Not found/
  );

  // Protected app refusal
  await assert.rejects(
    service.issueTicket({ userId: "u-owner", actor: "owner@example.com" }, { applicationId: "app-protected" }),
    /Protected application/
  );
});

test("terminal: concurrency cap per user", async () => {
  const { service } = setupService({ maxConcurrentSessions: 1 });
  const server = http.createServer();
  service.attachServer(server);

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  const ctx = { userId: "u1", actor: "user@example.com" };
  const t1 = await service.issueTicket(ctx, { applicationId: "app-1" });

  const ws1 = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws?ticket=${t1.ticket}`);
  await new Promise((resolve, reject) => {
    ws1.on("open", resolve);
    ws1.on("error", reject);
  });

  // Second ticket cannot be issued when limit is 1
  await assert.rejects(
    service.issueTicket(ctx, { applicationId: "app-1" }),
    /Maximum 2 concurrent|rate_limited/
  );

  ws1.close();
  server.close();
  service.closeAll();
});

test("terminal: ticket reuse refused, origin check, and idle timeout", async () => {
  let currentTime = 1000;
  const now = () => new Date(currentTime);
  const { service, auditRows } = setupService({ now, idleTimeoutMs: 200, maxLifetimeMs: 5000 });

  const server = http.createServer();
  service.attachServer(server);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  const ctx = { userId: "u1", actor: "user@example.com" };
  const t = await service.issueTicket(ctx, { applicationId: "app-1" });

  // 1. Mismatched origin is refused (403)
  await new Promise(resolve => {
    const wsBadOrigin = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws?ticket=${t.ticket}`, {
      headers: { origin: "https://evil.attacker.com" },
    });
    wsBadOrigin.on("error", () => resolve());
    wsBadOrigin.on("close", resolve);
  });

  // 2. Connect cleanly with valid ticket
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws?ticket=${t.ticket}`, {
    headers: { origin: `http://127.0.0.1:${port}` },
  });
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  // Verify terminal.open was audited
  assert.ok(auditRows.some(r => r.action === "terminal.open" && r.actor === "user@example.com"));

  // 3. Ticket reuse is refused
  await new Promise(resolve => {
    const wsReuse = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws?ticket=${t.ticket}`);
    wsReuse.on("error", () => resolve());
    wsReuse.on("close", resolve);
  });

  // 4. Oversized input frame (> 64 bytes) sends warning
  const oversizedPromise = new Promise(resolve => {
    ws.on("message", msg => {
      if (String(msg).includes("تجاوز الحجم")) resolve(true);
    });
  });
  ws.send("x".repeat(100));
  await oversizedPromise;

  // 5. Idle timeout closes connection
  const closePromise = new Promise(resolve => ws.on("close", resolve));
  currentTime += 300; // advance beyond idleTimeoutMs (200)
  // trigger idle check
  await new Promise(r => setTimeout(r, 250));
  await closePromise;

  // Verify terminal.close was audited
  assert.ok(auditRows.some(r => r.action === "terminal.close" && r.actor === "user@example.com"));

  server.close();
  service.closeAll();
});

test("terminal: quick commands runner executes allowed command and refuses unknown", async () => {
  const { service, auditRows } = setupService();
  const ctx = { userId: "u1", actor: "tenant@example.com" };

  const res = await service.runCommand(ctx, { applicationId: "app-1", tenantId: "t1", commandId: "migrate", template: "laravel" });
  assert.equal(res.ok, true);
  assert.match(res.output, /command finished/);
  assert.ok(auditRows.some(r => r.action === "command.run" && r.target === "app-1:migrate"));

  // Unknown command rejected
  await assert.rejects(
    service.runCommand(ctx, { applicationId: "app-1", tenantId: "t1", commandId: "evil-rm", template: "laravel" }),
    /Unknown or disallowed command/
  );
});
