import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { Link } from "../lib/router.jsx";
import { useResource } from "../lib/useResource.js";
import ConnectivityCard from "./server/ConnectivityCard.jsx";
import NetworkCard from "./server/NetworkCard.jsx";
import { CpuCard, DiskCard, MemoryCard, PowerCard, TemperatureCard, UptimeCard } from "./server/SystemCards.jsx";
import VisitorSpeedCard from "./dashboard/VisitorSpeedCard.jsx";
import ServerSpeedCard from "./dashboard/ServerSpeedCard.jsx";
import { formatNumber } from "../lib/format.js";
import { t } from "../i18n/index.js";

function summarize(projects) {
  const apps = projects.flatMap(p => p.environments.flatMap(e => e.applications));
  return { projects: projects.length, apps: apps.length, protectedProjects: projects.filter(p => p.protected).length };
}

function ProjectsSummary({ resource }) {
  const { data, error, loading, refresh } = resource;
  const counts = data ? summarize(data.projects) : null;
  return (
    <div className="card stack">
      <div className="card-title"><h2>{t("dashboard.projects")}</h2></div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading lines={2} /> : !counts.projects ? <p className="muted">{t("dashboard.noProjects")}</p> : (
        <dl className="kv">
          <dt>{t("dashboard.projectsCount")}</dt><dd>{formatNumber(counts.projects)}</dd>
          <dt>{t("dashboard.appsCount")}</dt><dd>{formatNumber(counts.apps)}</dd>
          <dt>{t("dashboard.protectedCount")}</dt><dd>{formatNumber(counts.protectedProjects)}</dd>
        </dl>
      )}
      <Link className="btn btn-sm" to="/projects">{t("dashboard.viewProjects")}</Link>
    </div>
  );
}

// The overview: the numbers that tell you at a glance whether the server is fine.
export default function DashboardPage() {
  const api = useApi();
  const status = useResource(() => api.get("/api/server/status"), { pollMs: 15_000 });
  const projects = useResource(() => api.get("/api/projects"), { pollMs: 30_000 });

  return (
    <div className="stack-lg">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")}
        actions={<><Button onClick={() => { status.refresh(); projects.refresh(); }}><Icon name="refresh" className="nav-icon" size={16} />{t("common.refresh")}</Button><Link className="btn" to="/server">{t("dashboard.viewServer")}</Link></>} />
      {status.error && !status.data ? <div className="card"><ErrorState error={status.error} onRetry={status.refresh} /></div> : !status.data ? <div className="card"><Loading lines={4} /></div> : (
        <>
          <div className="grid-cards">
            <CpuCard cpu={status.data.cpu} /><MemoryCard memory={status.data.memory} /><DiskCard disk={status.data.disk} /><TemperatureCard temperature={status.data.temperature} />
            <PowerCard power={status.data.power} /><UptimeCard uptime={status.data.uptime} />
          </div>
          <div className="grid-cards grid-cards-wide">
            <VisitorSpeedCard />
            <ServerSpeedCard network={status.data.network} />
            <NetworkCard network={status.data.network} compact />
            <ConnectivityCard status={status.data} />
            <ProjectsSummary resource={projects} />
          </div>
        </>
      )}
    </div>
  );
}
