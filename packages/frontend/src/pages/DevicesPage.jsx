import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Explainer from "../components/Explainer.jsx";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { formatAgo } from "../lib/format.js";
import { useResource } from "../lib/useResource.js";
import { t } from "../i18n/index.js";

const ADMIN_URL = "https://login.tailscale.com/admin/machines";

// Read only: the devices on the Tailscale network. Changes are made in Tailscale itself.
export default function DevicesPage() {
  const api = useApi();
  const { data, error, loading, refresh } = useResource(() => api.get("/api/devices"), { pollMs: 60_000 });
  const adminLink = <a className="btn" href={data?.adminUrl ?? ADMIN_URL} target="_blank" rel="noopener noreferrer"><Icon name="external" className="nav-icon" size={16} />{t("devices.admin")}<span className="visually-hidden"> ({t("common.openInNewTab")})</span></a>;

  return (
    <div className="stack-lg">
      <PageHeader title={t("devices.title")} subtitle={t("devices.subtitle")} actions={<><Button onClick={refresh}><Icon name="refresh" className="nav-icon" size={16} />{t("common.refresh")}</Button>{adminLink}</>} />
      <div className="card stack">
        <div className="row"><Badge kind="info">{t("devices.readOnly")}</Badge><Explainer text={t("devices.explainReadOnly")} /></div>
        {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading lines={4} /> : !data.configured ? (
          <EmptyState icon="devices" title={t("devices.notConfigured")} text={t("devices.notConfiguredHint")} />
        ) : !data.devices.length ? <EmptyState icon="devices" title={t("devices.empty")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("devices.name")}</th><th>{t("devices.os")}</th><th>{t("devices.online")}</th><th>{t("devices.lastSeen")}</th><th>{t("devices.ip")}</th><th>{t("devices.tags")}</th></tr></thead>
              <tbody>
                {data.devices.map(device => (
                  <tr key={device.name}>
                    <td className="mono">{device.name}</td>
                    <td>{device.os}</td>
                    <td><Badge kind={device.online ? "success" : "neutral"}>{device.online ? t("devices.onlineYes") : t("devices.onlineNo")}</Badge></td>
                    <td>{device.online ? t("time.now") : formatAgo(device.lastSeen)}</td>
                    <td className="mono">{device.ip ?? "—"}</td>
                    <td>{device.tags.length ? <span className="row">{device.tags.map(tag => <Badge key={tag}><span className="ltr">{tag}</span></Badge>)}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
