import { useEffect, useRef, useState } from "react";
import Button from "../../components/Button.jsx";
import Icon from "../../components/Icon.jsx";
import { formatDateTime } from "../../lib/format.js";
import { testVisitorSpeed } from "../../lib/visitorSpeed.js";
import { t } from "../../i18n/index.js";

export default function VisitorSpeedCard() {
  const [data, setData] = useState(() => {
    try {
      const saved = sessionStorage.getItem("hs_visitor_speed");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(null);
  const mountedRef = useRef(true);
  const autoRanRef = useRef(false);

  const runTest = async () => {
    if (running) return;
    setRunning(true);
    setPhase("ping");
    try {
      const res = await testVisitorSpeed({
        onProgress: (p) => {
          if (mountedRef.current && p.phase) setPhase(p.phase);
        },
      });
      if (mountedRef.current) {
        setData(res);
        try {
          sessionStorage.setItem("hs_visitor_speed", JSON.stringify(res));
        } catch {
          // ignore storage quota
        }
      }
    } finally {
      if (mountedRef.current) {
        setRunning(false);
        setPhase(null);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!autoRanRef.current && !data) {
      autoRanRef.current = true;
      runTest();
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const phaseLabel = phase ? t(`dashboard.visitorSpeed.phases.${phase}`) : t("dashboard.visitorSpeed.testing");

  return (
    <div className="card stack">
      <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>{t("dashboard.visitorSpeed.title")}</h2>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("dashboard.visitorSpeed.subtitle")}</span>
        </div>
        <Button variant="ghost" className="btn-sm" onClick={runTest} busy={running} disabled={running}>
          <Icon name="refresh" size={14} className="nav-icon" />
          {running ? phaseLabel : t("dashboard.visitorSpeed.run")}
        </Button>
      </div>

      <div className="visitor-metrics-grid">
        <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div className="stat-label" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-1)" }}>
            {t("dashboard.visitorSpeed.ping")}
          </div>
          <div className="stat-value" style={{ fontSize: "var(--text-lg)", fontWeight: "bold" }}>
            <bdi dir="ltr">{data?.pingMs != null ? `${data.pingMs} ms` : "—"}</bdi>
          </div>
        </div>

        <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div className="stat-label" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-1)" }}>
            {t("dashboard.visitorSpeed.download")}
          </div>
          <div className="stat-value" style={{ fontSize: "var(--text-lg)", fontWeight: "bold", color: "var(--accent)" }}>
            <bdi dir="ltr">{data?.downMbps != null ? `${data.downMbps} Mbps` : "—"}</bdi>
          </div>
        </div>

        <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <div className="stat-label" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-1)" }}>
            {t("dashboard.visitorSpeed.upload")}
          </div>
          <div className="stat-value" style={{ fontSize: "var(--text-lg)", fontWeight: "bold" }}>
            <bdi dir="ltr">{data?.upMbps != null ? `${data.upMbps} Mbps` : "—"}</bdi>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)" }}>
        <span className="muted">
          {data?.testedAt ? t("dashboard.visitorSpeed.at", { when: formatDateTime(data.testedAt) }) : (running ? phaseLabel : "—")}
        </span>
        {data?.error && <span style={{ color: "var(--danger)" }}>{data.error}</span>}
      </div>
    </div>
  );
}
