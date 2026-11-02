import Explainer from "./Explainer.jsx";
import Meter from "./Meter.jsx";

// One number with a label, an optional bar, and a quiet "unavailable" form that explains why.
export default function StatCard({ label, value, unit, percent, note, unavailableReason, warnAt, dangerAt, explainer }) {
  const missing = value === undefined || value === null || value === "—";
  return (
    <div className="card stack" style={{ gap: "var(--space-2)" }}>
      <div className="row" style={{ gap: "var(--space-2)" }}>
        <span className="stat-label">{label}</span>
        {explainer && <Explainer text={explainer} />}
        {missing && unavailableReason && <Explainer text={unavailableReason} />}
      </div>
      <div className="stat-value" aria-label={missing ? undefined : `${value} ${unit ?? ""}`.trim()}>
        {missing ? "—" : value}{!missing && unit && <span className="stat-unit">{unit}</span>}
      </div>
      {!missing && Number.isFinite(percent) && <Meter percent={percent} label={label} warnAt={warnAt} dangerAt={dangerAt} />}
      {note && <span className="hint">{note}</span>}
    </div>
  );
}
