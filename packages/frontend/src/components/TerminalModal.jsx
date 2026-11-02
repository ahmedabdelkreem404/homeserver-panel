import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";
import Dialog from "./Dialog.jsx";
import Explainer from "./Explainer.jsx";
import Icon from "./Icon.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { useToast } from "../lib/toast.jsx";
import { t } from "../i18n/index.js";

export default function TerminalModal({ site, scope = "my", onClose }) {
  const api = useApi();
  const toast = useToast();
  const terminalRef = useRef(null);
  const termInstance = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);

  const [status, setStatus] = useState("connecting"); // "connecting" | "connected" | "disconnected" | "error"
  const [containerId, setContainerId] = useState("");
  const [commands, setCommands] = useState([]);
  const [runningCmd, setRunningCmd] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const basePath = scope === "my" ? `/api/my/sites/${site.applicationId}` : `/api/projects/apps/${site.applicationId}`;

  // Load quick commands
  useEffect(() => {
    let active = true;
    api.get(`${basePath}/commands?template=${encodeURIComponent(site.template || "node")}`)
      .then(res => {
        if (active && Array.isArray(res.commands)) setCommands(res.commands);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [basePath, site.template, api]);

  // Connect terminal
  const connect = async () => {
    setStatus("connecting");
    setErrorMsg("");

    let ticketData;
    try {
      ticketData = await api.post(`${basePath}/terminal/ticket`);
    } catch (e) {
      const msg = e?.message?.includes("rate_limited") ? t("terminal.rateLimited") : (e?.message || t("terminal.notRunning"));
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    setContainerId(ticketData.containerId);

    const term = termInstance.current;
    if (!term) return;

    term.reset();
    term.write(`\x1b[36m${t("terminal.connecting")}\x1b[0m\r\n`);

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${proto}//${host}/api/terminal/ws?ticket=${ticketData.ticket}&cols=${term.cols || 80}&rows=${term.rows || 24}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        term.write(`\x1b[32m[${t("terminal.connected")}]\x1b[0m\r\n\r\n`);
      };

      ws.onmessage = event => {
        term.write(event.data);
      };

      ws.onclose = () => {
        setStatus("disconnected");
        term.write(`\r\n\x1b[33m[${t("terminal.disconnected")}]\x1b[0m\r\n`);
      };

      ws.onerror = () => {
        setStatus("error");
        setErrorMsg(t("common.unknownError"));
      };
    } catch {
      setStatus("error");
      setErrorMsg(t("common.unknownError"));
    }

  };

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, monospace",
      theme: {
        background: "#0c0e14",
        foreground: "#f3f4f6",
        cursor: "#38bdf8",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.onData(data => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      try { fitAddon.fit(); } catch {}
    };
    window.addEventListener("resize", handleResize);

    connect();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
      term.dispose();
    };
  }, []);

  const handleRunCommand = async cmd => {
    if (runningCmd || !cmd) return;
    setRunningCmd(cmd.id);
    const term = termInstance.current;
    if (term) term.write(`\r\n\x1b[36m> ${cmd.label} (${cmd.command})\x1b[0m\r\n`);

    try {
      const res = await api.post(`${basePath}/commands/run`, { commandId: cmd.id, template: site.template });
      if (term) {
        term.write(`\r\n${res.output}\r\n\x1b[32m[${t("terminal.commandSuccess")}]\x1b[0m\r\n`);
      }
      toast.success(t("terminal.commandSuccess"));
    } catch (e) {
      if (term) {
        term.write(`\r\n\x1b[31m[${t("terminal.commandFailed")}: ${e.message}]\x1b[0m\r\n`);
      }
      toast.error(t("terminal.commandFailed"));
    } finally {
      setRunningCmd(null);
    }
  };

  const statusBadge = (
    <span className={`badge ${status === "connected" ? "badge-success" : status === "connecting" ? "badge-info" : status === "error" ? "badge-danger" : "badge-warning"}`}>
      {t(`terminal.${status}`)}
    </span>
  );

  return (
    <Dialog title={t("terminal.title", { name: site.name })} onClose={onClose} wide>
      <div className="stack" style={{ gap: "var(--space-3)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
            {statusBadge}
            {containerId && <span className="badge font-mono" title={containerId}>{t("terminal.container", { id: containerId.slice(0, 12) })}</span>}
            <Explainer text={t("terminal.explain")} />
          </div>
          <div className="row" style={{ gap: "var(--space-2)" }}>
            {status !== "connected" && status !== "connecting" && (
              <Button size="sm" onClick={connect}>
                <Icon name="refresh" className="nav-icon" size={14} />
                {t("terminal.reconnect")}
              </Button>
            )}
          </div>
        </div>

        {errorMsg && <p className="alert alert-danger">{errorMsg}</p>}

        <div
          ref={terminalRef}
          className="terminal-body"
          data-testid="terminal-container"
          style={{ minHeight: "320px", height: "380px", borderRadius: "var(--radius-md)" }}
        />

        {commands.length > 0 && (
          <div className="card" style={{ padding: "var(--space-3)", background: "var(--surface-2)" }}>
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span className="hint" style={{ fontWeight: 600 }}>{t("terminal.quickCommands")}:</span>
              </div>
              <div className="row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
                {commands.map(cmd => (
                  <Button
                    key={cmd.id}
                    size="sm"
                    variant="ghost"
                    style={{ border: "1px solid var(--border-strong)" }}
                    disabled={status !== "connected" || runningCmd !== null}
                    busy={runningCmd === cmd.id}
                    onClick={() => handleRunCommand(cmd)}
                  >
                    {cmd.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
