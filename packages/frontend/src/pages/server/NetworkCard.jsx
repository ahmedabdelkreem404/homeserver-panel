import Badge from "../../components/Badge.jsx";
import Explainer from "../../components/Explainer.jsx";
import Icon from "../../components/Icon.jsx";
import { formatBytes, formatRate } from "../../lib/format.js";
import { t } from "../../i18n/index.js";

const KIND = { wifi: "server.network.wifi", ethernet: "server.network.ethernet", other: "server.network.other" };

// The network section: which connection the server uses, its signal, live speed and the day's traffic.
export default function NetworkCard({ network, compact = false }) {
  if (!network?.available) {
    return <div className="card"><div className="card-title"><h2>{t("server.network.title")}</h2></div><p className="muted">{t("common.unavailable")}</p>{network?.reason && <Explainer text={network.reason} />}</div>;
  }
  if (!network.interface) {
    return <div className="card"><div className="card-title"><h2>{t("server.network.title")}</h2></div><p>{t("server.network.noConnection")}</p></div>;
  }
  return (
    <div className="card stack">
      <div className="card-title">
        <h2>{t("server.network.title")}</h2>
        <Badge kind="info"><Icon name={network.kind === "wifi" ? "wifi" : "ethernet"} className="nav-icon" size={14} />{t(KIND[network.kind] ?? KIND.other)}</Badge>
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div><div className="stat-label">{t("server.network.download")}</div><div className="stat-value" style={{ fontSize: "var(--text-xl)" }}>{formatRate(network.rate?.rxBytesPerSec)}</div></div>
        <div><div className="stat-label">{t("server.network.upload")}</div><div className="stat-value" style={{ fontSize: "var(--text-xl)" }}>{formatRate(network.rate?.txBytesPerSec)}</div></div>
      </div>
      <dl className="kv">
        <dt>{t("server.network.interface")}</dt><dd className="mono">{network.interface}</dd>
        {network.signal && (<><dt>{t("server.network.signal")}</dt><dd>{network.signal.percent}% ({network.signal.dbm} dBm)</dd></>)}
        {!compact && network.localIpv4 && (<><dt>{t("server.network.localIp")}</dt><dd className="mono">{network.localIpv4}</dd></>)}
        {!compact && network.gateway && (<><dt>{t("server.network.gateway")}</dt><dd className="mono">{network.gateway}</dd></>)}
        {network.totals && (<>
          <dt>{t("server.network.today")} <Explainer text={t("server.network.explainToday")} /></dt>
          <dd>↓ {formatBytes(network.totals.today?.rx)} · ↑ {formatBytes(network.totals.today?.tx)}</dd>
          {!compact && (<><dt>{t("server.network.sinceBoot")}</dt><dd>↓ {formatBytes(network.totals.sinceBoot?.rx)} · ↑ {formatBytes(network.totals.sinceBoot?.tx)}</dd></>)}
        </>)}
        {!compact && network.otherInterfaces?.length > 0 && (<><dt>{t("server.network.otherInterfaces")}</dt><dd className="mono">{network.otherInterfaces.join(", ")}</dd></>)}
      </dl>
    </div>
  );
}
