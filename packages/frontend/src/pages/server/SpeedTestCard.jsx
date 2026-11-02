import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Explainer from "../../components/Explainer.jsx";
import { ApiError, errorMessage, formatWait } from "../../lib/api.js";
import { formatDateTime, formatNumber } from "../../lib/format.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";

// Speed test on demand: the backend allows one run per 10 minutes and stores the result, so the last one is always shown.
export default function SpeedTestCard({ last, onDone }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const run = async () => {
    setBusy(true); setFailure(null);
    try { await api.post("/api/server/speedtest"); await onDone(); } catch (error) { setFailure(error); } finally { setBusy(false); }
  };

  const limited = failure instanceof ApiError && failure.code === "rate_limited";
  return (
    <div className="card stack">
      <div className="card-title"><h2>{t("server.speed.title")}</h2><Explainer text={t("server.speed.explain")} /></div>
      {last ? (
        <dl className="kv">
          <dt>{t("server.speed.download")}</dt><dd>{last.error ? "—" : `${formatNumber(last.downMbps, 1)} ${t("server.speed.mbps")}`}</dd>
          <dt>{t("server.speed.upload")}</dt><dd>{last.error ? "—" : `${formatNumber(last.upMbps, 1)} ${t("server.speed.mbps")}`}</dd>
          <dt>{t("server.speed.at")}</dt><dd>{formatDateTime(last.at)}</dd>
        </dl>
      ) : <p className="muted">{t("server.speed.never")}</p>}
      {last?.error && <Alert kind="warning">{t("server.speed.failed", { reason: last.error })}</Alert>}
      {failure && <Alert kind={limited ? "info" : "danger"}>{limited && failure.retryAfterSec ? t("server.speed.wait", { wait: formatWait(failure.retryAfterSec) }) : errorMessage(failure)}</Alert>}
      <Button variant="primary" onClick={run} busy={busy}>{busy ? t("server.speed.running") : t("server.speed.run")}</Button>
    </div>
  );
}
