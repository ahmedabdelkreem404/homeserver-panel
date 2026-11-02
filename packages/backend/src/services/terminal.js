import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { PanelError } from "../errors.js";

export const ALLOWED_COMMANDS = {
  laravel: [
    { id: "migrate", label: "تشغيل الـ Migrations", command: "php artisan migrate --force" },
    { id: "cache-clear", label: "مسح كاش التطبيق", command: "php artisan cache:clear" },
    { id: "config-clear", label: "مسح كاش الإعدادات", command: "php artisan config:clear" },
    { id: "route-clear", label: "مسح كاش المسارات", command: "php artisan route:clear" },
    { id: "optimize", label: "تحسين الأداء (Optimize)", command: "php artisan optimize" },
  ],
  node: [
    { id: "node-version", label: "إصدار Node.js", command: "node -v" },
    { id: "npm-version", label: "إصدار npm", command: "npm -v" },
  ],
  php: [
    { id: "php-version", label: "إصدار PHP", command: "php -v" },
  ],
};

export function createTerminalService({
  gateway,
  hosting,
  policy,
  audit,
  dokployUrl = "http://dokploy:3000",
  dokployApiKey = "",
  now = () => new Date(),
  ticketTtlMs = 30_000,
  idleTimeoutMs = 5 * 60 * 1000,
  maxLifetimeMs = 30 * 60 * 1000,
  maxConcurrentSessions = 2,
  maxInputBytes = 4096,
  WebSocketImpl = WebSocket,
}) {
  const tickets = new Map(); // ticketString -> ticketData
  const activeSessions = new Set(); // set of { id, userId, clientWs, upstreamWs, close }

  function cleanExpiredTickets() {
    const current = now().getTime();
    for (const [k, v] of tickets.entries()) {
      if (v.expiresAt <= current || v.used) tickets.delete(k);
    }
  }

  function userActiveCount(userId) {
    let count = 0;
    for (const s of activeSessions) {
      if (s.userId === userId) count++;
    }
    return count;
  }

  async function resolveAppContainer(applicationId) {
    const details = await gateway.appDetails(applicationId);
    if (!details?.appName) throw new PanelError("not_found", "Site not found.");
    const list = await gateway.read("docker.getContainersByAppNameMatch", { appName: details.appName }).catch(() => []);
    const running = (Array.isArray(list) ? list : []).find(c => c.state === "running");
    if (!running?.containerId) throw new PanelError("invalid_request", "No running container for this site.");
    return { appName: details.appName, containerId: running.containerId };
  }

  return {
    getCommandsFor(template) {
      return ALLOWED_COMMANDS[template] ?? [];
    },

    activeCount(userId) {
      return userActiveCount(userId);
    },

    async issueTicket(ctx, { applicationId, tenantId }) {
      cleanExpiredTickets();
      if (!ctx.userId) throw new PanelError("unauthenticated", "Authentication required.");
      if (tenantId) hosting.assertOwns(tenantId, applicationId);
      else if (policy.isProtectedOwner({ applicationId })) throw new PanelError("policy_refused", "Protected application.");

      if (userActiveCount(ctx.userId) >= maxConcurrentSessions) {
        throw new PanelError("rate_limited", "Maximum 2 concurrent terminal sessions reached.");
      }

      const { appName, containerId } = await resolveAppContainer(applicationId);
      const ticket = crypto.randomBytes(32).toString("hex");
      const current = now().getTime();

      tickets.set(ticket, {
        ticket,
        userId: ctx.userId,
        actor: ctx.actor,
        tenantId,
        applicationId,
        appName,
        containerId,
        createdAt: current,
        expiresAt: current + ticketTtlMs,
        used: false,
      });

      return { ticket, containerId, appName };
    },

    async runCommand(ctx, { applicationId, tenantId, commandId, template }) {
      if (!ctx.userId) throw new PanelError("unauthenticated", "Authentication required.");
      if (tenantId) hosting.assertOwns(tenantId, applicationId);
      else if (policy.isProtectedOwner({ applicationId })) throw new PanelError("policy_refused", "Protected application.");

      const allowedList = ALLOWED_COMMANDS[template] ?? [];
      const item = allowedList.find(c => c.id === commandId);
      if (!item) throw new PanelError("invalid_request", "Unknown or disallowed command for this template.");

      const { containerId } = await resolveAppContainer(applicationId);
      const auditId = audit.begin({ actor: ctx.actor, action: "command.run", target: `${applicationId}:${commandId}` });

      const dokployWsUrl = dokployUrl.replace(/^http/, "ws");
      const wsUrl = `${dokployWsUrl}/docker-container-terminal?containerId=${containerId}&cols=120&rows=40&activeWay=sh`;

      return new Promise((resolve, reject) => {
        let output = "";
        let timer;
        let finished = false;
        const ws = new WebSocketImpl(wsUrl, { headers: { "x-api-key": dokployApiKey } });

        const finish = (result, code = "ok") => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          audit.finish(auditId, code, { commandId });
          try { ws.close(); } catch {}
          resolve(result);
        };


        timer = setTimeout(() => {
          finish({ ok: false, output: output + "\n[timeout: command took longer than 30s]" }, "timeout");
        }, 30_000);

        ws.on("open", () => {
          // Send command followed by exit so the shell terminates
          ws.send(`${item.command}\nexit\n`);
        });

        ws.on("message", data => {
          output += data.toString("utf8");
        });

        ws.on("close", () => {
          finish({ ok: true, output: output.trim() });
        });

        ws.on("error", err => {
          clearTimeout(timer);
          audit.finish(auditId, "error", { error: err.message });
          reject(new PanelError("upstream_error", "Failed to execute command in container."));
        });
      });
    },

    attachServer(httpServer) {
      const wss = new WebSocketServer({ noServer: true });

      httpServer.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        if (url.pathname !== "/api/terminal/ws") return;

        // CSRF origin validation: when origin header exists, it must match host
        const origin = req.headers.origin;
        if (origin) {
          try {
            const originHost = new URL(origin).host;
            if (originHost !== req.headers.host) {
              socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
              socket.destroy();
              return;
            }
          } catch {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
          }
        }

        const ticketKey = url.searchParams.get("ticket");
        if (!ticketKey) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        cleanExpiredTickets();
        const ticketData = tickets.get(ticketKey);
        if (!ticketData || ticketData.used || ticketData.expiresAt <= now().getTime()) {
          tickets.delete(ticketKey);
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Single-use ticket: burn immediately
        ticketData.used = true;
        tickets.delete(ticketKey);

        if (userActiveCount(ticketData.userId) >= maxConcurrentSessions) {
          socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, clientWs => {
          this.handleConnection(clientWs, ticketData, url);
        });
      });

      return wss;
    },

    handleConnection(clientWs, ticket, url) {
      const cols = Math.min(Math.max(parseInt(url.searchParams.get("cols") || "80", 10), 10), 300);
      const rows = Math.min(Math.max(parseInt(url.searchParams.get("rows") || "24", 10), 5), 100);

      const auditRowId = audit.begin({ actor: ticket.actor, action: "terminal.open", target: ticket.applicationId });
      audit.finish(auditRowId, "ok", { containerId: ticket.containerId });

      const dokployWsUrl = dokployUrl.replace(/^http/, "ws");
      const wsUrl = `${dokployWsUrl}/docker-container-terminal?containerId=${ticket.containerId}&cols=${cols}&rows=${rows}&activeWay=sh`;
      const upstreamWs = new WebSocketImpl(wsUrl, { headers: { "x-api-key": dokployApiKey } });

      const startTime = now().getTime();
      let idleTimer = null;
      let lifetimeTimer = null;

      const session = {
        id: crypto.randomUUID(),
        userId: ticket.userId,
        close: () => {
          try { clientWs.close(); } catch {}
          try { upstreamWs.close(); } catch {}
        },
      };
      activeSessions.add(session);

      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          try {
            clientWs.send("\r\n\x1b[33m[الجلسة أغلقت تلقائياً لعدم النشاط لمدة 5 دقائق]\x1b[0m\r\n");
            clientWs.close();
          } catch {}
          try { upstreamWs.close(); } catch {}
        }, idleTimeoutMs);
      };

      resetIdle();

      lifetimeTimer = setTimeout(() => {
        try {
          clientWs.send("\r\n\x1b[33m[انتهت مدة الجلسة - الحد الأقصى 30 دقيقة]\x1b[0m\r\n");
          clientWs.close();
        } catch {}
        try { upstreamWs.close(); } catch {}
      }, maxLifetimeMs);

      // Bi-directional piping
      upstreamWs.on("open", () => {});

      upstreamWs.on("message", data => {
        try {
          if (clientWs.readyState === clientWs.OPEN) clientWs.send(data);
        } catch {}
      });

      upstreamWs.on("close", () => {
        try { clientWs.close(); } catch {}
      });

      upstreamWs.on("error", err => {
        try {
          if (clientWs.readyState === clientWs.OPEN) clientWs.send(`\r\n\x1b[31m[خطأ في الاتصال بالـ container: ${err.message}]\x1b[0m\r\n`);
          clientWs.close();
        } catch {}
      });

      clientWs.on("message", data => {
        resetIdle();
        // Size cap: input frame cannot exceed maxInputBytes
        if (data.length > maxInputBytes) {
          try { clientWs.send("\r\n\x1b[31m[تم رفض الإدخال: تجاوز الحجم المسموح 4KB]\x1b[0m\r\n"); } catch {}
          return;
        }
        try {
          if (upstreamWs.readyState === upstreamWs.OPEN) upstreamWs.send(data);
        } catch {}
      });

      const onClosed = () => {
        clearTimeout(idleTimer);
        clearTimeout(lifetimeTimer);
        activeSessions.delete(session);
        const durationSeconds = Math.max(0, Math.round((now().getTime() - startTime) / 1000));
        const closeAuditId = audit.begin({ actor: ticket.actor, action: "terminal.close", target: ticket.applicationId });
        audit.finish(closeAuditId, "ok", { durationSeconds });
      };

      clientWs.on("close", () => {
        try { upstreamWs.close(); } catch {}
        onClosed();
      });
    },

    closeAll() {
      for (const s of activeSessions) {
        s.close();
      }
      activeSessions.clear();
      tickets.clear();
    },
  };
}
