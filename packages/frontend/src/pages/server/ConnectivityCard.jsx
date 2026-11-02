import Badge from "../../components/Badge.jsx";
import { t } from "../../i18n/index.js";

// Cloudflare tunnel and internet reachability: if either is down the panel's own address stops working for visitors.
export default function ConnectivityCard({ status }) {
  const tunnel = status?.tunnel, internet = status?.internet;
  return (
    <div className="card stack">
      <div className="card-title"><h2>{t("dashboard.tunnel")}</h2></div>
      <dl className="kv">
        <dt>{t("server.tunnel.title")}</dt>
        <dd>{tunnel?.available ? <Badge kind={tunnel.running ? "success" : "danger"}>{tunnel.running ? t("server.tunnel.running") : t("server.tunnel.stopped")}</Badge> : t("common.unavailable")}</dd>
        <dt>{t("server.internet.title")}</dt>
        <dd>{internet?.available ? <Badge kind={internet.reachable ? "success" : "danger"}>{internet.reachable ? t("server.internet.reachable") : t("server.internet.unreachable")}</Badge> : t("common.unavailable")}</dd>
        {internet?.reachable && Number.isFinite(internet.latencyMs) && (<><dt>{t("server.internet.latency")}</dt><dd>{internet.latencyMs} ms</dd></>)}
      </dl>
    </div>
  );
}
