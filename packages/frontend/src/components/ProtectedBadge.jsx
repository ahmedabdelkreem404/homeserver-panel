import Badge from "./Badge.jsx";
import Explainer from "./Explainer.jsx";
import Icon from "./Icon.jsx";
import { t } from "../i18n/index.js";

// The lock on protected items, with the reason one tap away.
export default function ProtectedBadge({ why = t("common.protectedWhy") }) {
  return (
    <span className="row" style={{ gap: "var(--space-1)" }}>
      <Badge kind="lock"><Icon name="lock" className="nav-icon" size={14} />{t("common.protected")}</Badge>
      <Explainer text={why} />
    </span>
  );
}
