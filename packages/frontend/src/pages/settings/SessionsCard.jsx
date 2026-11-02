import Badge from "../../components/Badge.jsx";
import Button from "../../components/Button.jsx";
import Explainer from "../../components/Explainer.jsx";
import { EmptyState, ErrorState, Loading } from "../../components/States.jsx";
import { useApi } from "../../lib/apiContext.jsx";
import { formatDateTime } from "../../lib/format.js";
import { useToast } from "../../lib/toast.jsx";
import { t } from "../../i18n/index.js";

const shortAgent = agent => (agent ? agent.slice(0, 60) : "—");

// Every browser that is signed in. Ending one signs that browser out at once.
export default function SessionsCard({ resource }) {
  const api = useApi();
  const toast = useToast();
  const { data, error, loading, refresh } = resource;
  const others = data?.sessions.filter(s => !s.current).length ?? 0;

  const revoke = async body => {
    try {
      const result = await api.post("/api/auth/sessions/revoke", body);
      toast.success(body.others ? t("settings.sessions.doneOthers", { count: result.revoked }) : t("settings.sessions.done"));
      refresh();
    } catch (e) { toast.error(e); }
  };

  return (
    <div className="card stack">
      <div className="card-title">
        <div className="row"><h2>{t("settings.sessions.title")}</h2><Explainer text={t("settings.sessions.explain")} /></div>
        {others > 0 && <Button size="sm" variant="danger" onClick={() => revoke({ others: true })}>{t("settings.sessions.revokeOthers")}</Button>}
      </div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading lines={3} /> : !data.sessions.length ? <EmptyState title={t("settings.sessions.empty")} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("settings.sessions.device")}</th><th>{t("settings.sessions.ip")}</th><th>{t("settings.sessions.created")}</th><th>{t("settings.sessions.lastSeen")}</th><th><span className="visually-hidden">{t("common.menu")}</span></th></tr></thead>
            <tbody>
              {data.sessions.map(s => (
                <tr key={s.id}>
                  <td><span className="stack" style={{ gap: 2 }}><span className="mono" style={{ fontSize: "var(--text-xs)" }}>{shortAgent(s.userAgent)}</span>{s.current && <Badge kind="success">{t("settings.sessions.current")}</Badge>}</span></td>
                  <td className="mono">{s.ip ?? "—"}</td>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>{formatDateTime(s.lastSeenAt)}</td>
                  <td>{!s.current && <Button size="sm" onClick={() => revoke({ id: s.id })}>{t("settings.sessions.revoke")}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
