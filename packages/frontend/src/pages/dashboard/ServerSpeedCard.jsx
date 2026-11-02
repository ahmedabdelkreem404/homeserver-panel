import { useEffect, useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Icon from "../../components/Icon.jsx";
import { ApiError, errorMessage, formatWait } from "../../lib/api.js";
import { formatDateTime, formatNumber, formatRate } from "../../lib/format.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";

// Mini SVG sparkline chart for speed history
function SpeedHistoryChart({ history }) {
  if (!history || history.length === 0) {
    return <p className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "center", padding: "var(--space-2)" }}>{t("dashboard.serverSpeed.noHistory")}</p>;
  }

  const validPoints = history.filter(h => !h.error && h.downMbps != null);
  if (validPoints.length === 0) {
    return <p className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "center", padding: "var(--space-2)" }}>{t("dashboard.serverSpeed.noHistory")}</p>;
  }

  // Width & height of chart
  const width = 280;
  const height = 60;
  const padding = 10;

  const maxDown = Math.max(...validPoints.map(p => p.downMbps), 10);
  const minDown = 0;

  // Generate points coordinates
  const pts = validPoints.map((p, idx) => {
    const x = validPoints.length === 1 ? width / 2 : padding + (idx / (validPoints.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((p.downMbps - minDown) / (maxDown - minDown)) * (height - 2 * padding);
    return { x, y, ...p };
  });

  const polylineStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div style={{ marginTop: "var(--space-2)", background: "var(--surface-sunken)", padding: "var(--space-2)", borderRadius: "var(--radius-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px" }}>
        <span>{t("dashboard.serverSpeed.history")}</span>
        <span><bdi dir="ltr">Max: {Math.round(maxDown)} Mbps</bdi></span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "60px", overflow: "visible" }}>
        <defs>
          <linearGradient id="speedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {pts.length > 1 && (
          <polygon
            points={`${pts[0].x},${height - padding} ${polylineStr} ${pts[pts.length - 1].x},${height - padding}`}
            fill="url(#speedGrad)"
          />
        )}
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylineStr}
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth="1.5">
            <title>{`${p.downMbps} Mbps (${formatDateTime(p.at)})`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export default function ServerSpeedCard({ network }) {
  const api = useApi();
  const [speedData, setSpeedData] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const fetchSpeedInfo = async () => {
    try {
      const latest = await api.get("/api/server/speedtest");
      setSpeedData(latest);
    } catch {
      // ignore initial speed load error
    }
    try {
      const hist = await api.get("/api/server/speedtest/history");
      if (Array.isArray(hist)) setHistory(hist);
    } catch {
      // ignore history error
    }
  };

  useEffect(() => {
    fetchSpeedInfo();
  }, []);

  const runTest = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api.post("/api/server/speedtest");
      await fetchSpeedInfo();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const limited = failure instanceof ApiError && failure.code === "rate_limited";
  const last = speedData?.last;

  return (
    <div className="card stack">
      <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>{t("dashboard.serverSpeed.title")}</h2>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("dashboard.serverSpeed.subtitle")}</span>
        </div>
        <Button variant="ghost" className="btn-sm" onClick={runTest} busy={busy}>
          <Icon name="refresh" size={14} className="nav-icon" />
          {busy ? t("server.speed.running") : t("server.speed.run")}
        </Button>
      </div>

      {network?.rate && (
        <div style={{ display: "flex", justifyContent: "space-between", background: "var(--surface-sunken)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-xs)" }}>
          <span className="muted">{t("dashboard.serverSpeed.liveRate")}:</span>
          <span>
            ↓ <bdi dir="ltr">{formatRate(network.rate.rxBytesPerSec)}</bdi> · ↑ <bdi dir="ltr">{formatRate(network.rate.txBytesPerSec)}</bdi>
          </span>
        </div>
      )}

      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: "var(--space-2)" }}>
        <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div className="stat-label" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-1)" }}>
            {t("server.speed.download")}
          </div>
          <div className="stat-value" style={{ fontSize: "var(--text-lg)", fontWeight: "bold", color: "var(--accent)" }}>
            <bdi dir="ltr">{last?.downMbps != null ? `${formatNumber(last.downMbps, 1)} Mbps` : "—"}</bdi>
          </div>
        </div>

        <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div className="stat-label" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-1)" }}>
            {t("server.speed.upload")}
          </div>
          <div className="stat-value" style={{ fontSize: "var(--text-lg)", fontWeight: "bold" }}>
            <bdi dir="ltr">{last?.upMbps != null ? `${formatNumber(last.upMbps, 1)} Mbps` : "—"}</bdi>
          </div>
        </div>
      </div>

      <SpeedHistoryChart history={history} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)" }}>
        <span className="muted">
          {last?.at ? t("server.speed.at") + ": " + formatDateTime(last.at) : t("server.speed.never")}
        </span>
      </div>

      {last?.error && <Alert kind="warning">{t("server.speed.failed", { reason: last.error })}</Alert>}
      {failure && (
        <Alert kind={limited ? "info" : "danger"}>
          {limited && failure.retryAfterSec ? t("server.speed.wait", { wait: formatWait(failure.retryAfterSec) }) : errorMessage(failure)}
        </Alert>
      )}
    </div>
  );
}
