import { levelOf } from "../lib/format.js";

// A bar for a value out of 100. The accessible name says what it measures.
export default function Meter({ percent, label, warnAt = 75, dangerAt = 90 }) {
  const value = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const level = levelOf(value, warnAt, dangerAt);
  return (
    <div className={`meter ${level === "warn" ? "meter-warn" : level === "danger" ? "meter-danger" : ""}`.trim()} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <span style={{ inlineSize: `${value}%` }} />
    </div>
  );
}
