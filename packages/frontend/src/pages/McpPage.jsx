import { useState } from "react";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CopyButton from "../components/CopyButton.jsx";
import Explainer from "../components/Explainer.jsx";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import ProtectedBadge from "../components/ProtectedBadge.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { formatDateTime } from "../lib/format.js";
import { useToast } from "../lib/toast.jsx";
import { useResource } from "../lib/useResource.js";
import { useSession } from "../lib/session.jsx";
import CreateKeyDialog from "./mcp/CreateKeyDialog.jsx";
import RotateDialog from "./mcp/RotateDialog.jsx";
import { t } from "../i18n/index.js";

function UrlCard({ resource }) {
  const { data, error, loading, refresh } = resource;
  return (
    <div className="card stack">
      <div className="card-title"><h2>{t("mcp.url.title")}</h2><Explainer text={t("mcp.url.explain")} /></div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading lines={1} /> : data?.url ? (
        <>
          <code className="code-block" data-testid="mcp-url">{data.url}</code>
          <div className="row"><CopyButton text={data.url} /><span className="hint">{t("mcp.url.hint")}</span></div>
        </>
      ) : <p className="muted">{t("mcp.url.missing")}</p>}
    </div>
  );
}

function KeysCard({ resource, onCreate, onRevoke }) {
  const { data, error, loading, refresh } = resource;
  return (
    <div className="card stack">
      <div className="card-title">
        <div className="row"><h2>{t("mcp.keys.title")}</h2><Explainer text={t("mcp.keys.explain")} /></div>
        <Button variant="primary" onClick={onCreate}><Icon name="key" className="nav-icon" size={16} />{t("mcp.keys.create")}</Button>
      </div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading lines={4} /> : !data.keys.length ? <EmptyState icon="key" title={t("mcp.keys.empty")} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("mcp.keys.name")}</th><th>{t("mcp.keys.created")}</th><th>{t("mcp.keys.expires")}</th><th>{t("mcp.keys.status")}</th><th><span className="visually-hidden">{t("common.menu")}</span></th></tr></thead>
            <tbody>
              {data.keys.map(key => (
                <tr key={key.id}>
                  <td><span className="row"><span className="mono">{key.name}</span>{key.protected && <ProtectedBadge why={t("mcp.keys.protectedWhy")} />}</span></td>
                  <td>{formatDateTime(key.createdAt)}</td>
                  <td>{key.expiresAt ? formatDateTime(key.expiresAt) : t("common.never")}</td>
                  <td><Badge kind={key.enabled ? "success" : "neutral"}>{key.enabled ? t("common.enabled") : t("common.disabled")}</Badge></td>
                  <td>{!key.protected && <Button size="sm" variant="danger" onClick={() => onRevoke(key)}>{t("mcp.keys.revoke")}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function McpPage() {
  const api = useApi();
  const toast = useToast();
  const keys = useResource(() => api.get("/api/mcp/keys"));
  const url = useResource(() => api.get("/api/mcp/url"));
  const session = useSession();
  const [dialog, setDialog] = useState(null);
  const close = changed => { setDialog(null); if (changed) { keys.refresh(); url.refresh(); } };

  return (
    <div className="stack-lg">
      <PageHeader title={t("mcp.title")} subtitle={t("mcp.subtitle")} />
      <UrlCard resource={url} />
      <KeysCard resource={keys} onCreate={() => setDialog({ kind: "create" })} onRevoke={key => setDialog({ kind: "revoke", key })} />
      {session.user?.role !== "tenant" && (
        <div className="card stack" style={{ borderColor: "var(--danger)" }}>
          <div className="card-title"><div className="row"><h2>{t("mcp.rotate.title")}</h2><Explainer text={t("mcp.rotate.explain")} /></div></div>
          <p className="muted">{t("mcp.rotate.text")}</p>
          <div><Button variant="danger" onClick={() => setDialog({ kind: "rotate" })}>{t("mcp.rotate.title")}</Button></div>
        </div>
      )}
      {dialog?.kind === "create" && <CreateKeyDialog onClose={close} />}
      {dialog?.kind === "rotate" && <RotateDialog onClose={close} />}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog title={t("mcp.keys.revokeTitle")} danger confirmLabel={t("mcp.keys.revokeGo")} onClose={changed => close(changed)}
          onConfirm={async () => { await api.del(`/api/mcp/keys/${dialog.key.id}`); toast.success(t("mcp.keys.revoked")); }}>
          <p className="mono">{dialog.key.name}</p>
          <p className="muted">{t("mcp.keys.revokeWarn")}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
