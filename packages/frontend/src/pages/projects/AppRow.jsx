import Badge from "../../components/Badge.jsx";
import Menu from "../../components/Menu.jsx";
import ProtectedBadge from "../../components/ProtectedBadge.jsx";
import { formatBytes, formatMegabytes, formatNumber, formatPercent } from "../../lib/format.js";
import { t } from "../../i18n/index.js";

const STATUS_KIND = { done: "info", running: "success", idle: "neutral", error: "danger" };
const LIFECYCLE = ["deploy", "redeploy", "start", "stop", "restart"];

function statusBadge(app, live) {
  if (live?.watching) return <Badge kind="info"><span className="spinner" aria-hidden="true" />{t("projects.waiting")}</Badge>;
  if (live?.verdict) return <Badge kind={live.running ? "success" : live.verdict === "created-not-running" ? "warning" : "danger"}>{t(`projects.verdict.${live.verdict}`)}</Badge>;
  const key = app.status in STATUS_KIND ? app.status : "unknown";
  return <Badge kind={STATUS_KIND[key] ?? "neutral"}>{t(`projects.status.${key}`)}</Badge>;
}

export default function AppRow({ app, locked, live, onAction, onState, onLogs, onTerminal, onDelete }) {
  const items = [
    { key: "state", label: t("projects.actions.state"), onSelect: onState },
    { key: "logs", label: t("projects.actions.logs"), onSelect: onLogs },
    ...(onTerminal ? [{ key: "terminal", label: t("terminal.button"), disabled: locked, title: locked ? t("common.protectedWhy") : undefined, onSelect: onTerminal }] : []),
    ...LIFECYCLE.map(action => ({ key: action, label: t(`projects.actions.${action}`), disabled: locked, title: locked ? t("common.protectedWhy") : undefined, onSelect: () => onAction(action) })),
    { key: "delete", label: t("projects.actions.delete"), danger: true, disabled: locked, title: locked ? t("projects.lockedDelete") : undefined, onSelect: onDelete },
  ];

  const usage = app.usage;
  return (
    <div className="app-row" data-testid={`app-${app.name}`}>
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <h3 className="mono">{app.name}</h3>
        <div className="row">{statusBadge(app, live)}{locked && <ProtectedBadge />}</div>
      </div>
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        {app.urls.length ? app.urls.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: "var(--text-sm)", overflowWrap: "anywhere" }}>{url.replace(/^https?:\/\//, "")}</a>) : <span className="muted">{t("projects.noUrls")}</span>}
        <span className="hint">
          {usage ? `${t("projects.cpu")}: ${formatPercent(usage.cpuPercent)} · ${t("projects.memory")}: ${formatMegabytes(usage.memMb)}` : t("projects.notRunning")}
          {app.memoryLimit ? ` / ${formatBytes(app.memoryLimit)}` : ""}{app.cpuLimit ? ` · ${t("projects.limit")} CPU: ${formatNumber(app.cpuLimit)}` : ""}
        </span>
      </div>
      <Menu label={t("projects.actions.menu")} items={items} />
    </div>
  );
}
