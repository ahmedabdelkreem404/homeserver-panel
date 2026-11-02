import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { useResource } from "../lib/useResource.js";
import ConnectivityCard from "./server/ConnectivityCard.jsx";
import ContainersCard from "./server/ContainersCard.jsx";
import NetworkCard from "./server/NetworkCard.jsx";
import SpeedTestCard from "./server/SpeedTestCard.jsx";
import { CpuCard, DiskCard, MemoryCard, PowerCard, TemperatureCard, UptimeCard } from "./server/SystemCards.jsx";
import { t } from "../i18n/index.js";

// Every number about the machine, refreshed every 15 seconds while this page is open.
export default function ServerPage() {
  const api = useApi();
  const status = useResource(() => api.get("/api/server/status"), { pollMs: 15_000 });
  const containers = useResource(() => api.get("/api/server/containers"), { pollMs: 15_000 });
  const refreshAll = () => { status.refresh(); containers.refresh(); };

  return (
    <div className="stack-lg">
      <PageHeader title={t("server.title")} subtitle={t("server.subtitle")}
        actions={<Button onClick={refreshAll} busy={status.loading && !!status.data}><Icon name="refresh" className="nav-icon" size={16} />{t("common.refresh")}</Button>} />
      {status.error && !status.data ? <div className="card"><ErrorState error={status.error} onRetry={status.refresh} /></div> : !status.data ? <div className="card"><Loading lines={5} /></div> : (
        <>
          <div className="grid-cards">
            <CpuCard cpu={status.data.cpu} /><MemoryCard memory={status.data.memory} /><DiskCard disk={status.data.disk} /><TemperatureCard temperature={status.data.temperature} />
            <PowerCard power={status.data.power} /><UptimeCard uptime={status.data.uptime} />
          </div>
          <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <NetworkCard network={status.data.network} />
            <ConnectivityCard status={status.data} />
            <SpeedTestCard last={status.data.speedTest} onDone={status.refresh} />
          </div>
          <ContainersCard resource={containers} />
        </>
      )}
    </div>
  );
}
