import Button from "./Button.jsx";
import Icon from "./Icon.jsx";
import { errorMessage } from "../lib/api.js";
import { t } from "../i18n/index.js";

export function Loading({ lines = 3 }) {
  return (
    <div className="stack" role="status">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ inlineSize: `${90 - i * 15}%`, blockSize: "1.1em" }} />)}
      <span className="visually-hidden">{t("common.loading")}</span>
    </div>
  );
}

export function EmptyState({ icon = "empty", title, text, action }) {
  return (
    <div className="state">
      <Icon name={icon} className="state-icon" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state" role="alert">
      <Icon name="warning" className="state-icon" />
      <p>{errorMessage(error)}</p>
      {onRetry && <Button onClick={onRetry}><Icon name="refresh" className="nav-icon" size={16} />{t("common.retry")}</Button>}
    </div>
  );
}
