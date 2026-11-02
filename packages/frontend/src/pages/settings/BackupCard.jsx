import Explainer from "../../components/Explainer.jsx";
import { Loading, ErrorState } from "../../components/States.jsx";
import { useApi } from "../../lib/apiContext.jsx";
import { formatAgo, formatBytes } from "../../lib/format.js";
import { useResource } from "../../lib/useResource.js";
import { t } from "../../i18n/index.js";

// The download is a plain same-origin link: the browser sends the session cookie and saves the file.
export default function BackupCard() {
  const api = useApi();
  const backups = useResource(() => api.get("/api/settings/backups"));
  const latest = backups.data?.backups?.[0];
  return (
    <div className="card stack">
      <div className="card-title">
        <div className="row"><h2>{t("settings.backup.title")}</h2><Explainer text={t("settings.backup.explain")} /></div>
      </div>
      <p className="muted">{t("settings.backup.text")}</p>
      {backups.loading && !backups.data && <Loading lines={1} />}
      {backups.error && !backups.data && <ErrorState error={backups.error} onRetry={backups.refresh} />}
      {backups.data && <p>{latest ? t("settings.backup.last", { when: formatAgo(latest.at), size: formatBytes(latest.size) }) : t("settings.backup.none")}</p>}
      <div><a className="btn" href="/api/settings/backup" download onClick={() => setTimeout(backups.refresh, 2000)}>{t("settings.backup.download")}</a></div>
      <p className="muted">{t("settings.backup.keep")}</p>
    </div>
  );
}
