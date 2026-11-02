import { EmptyState, ErrorState, Loading } from "../../components/States.jsx";
import { formatMegabytes, formatPercent } from "../../lib/format.js";
import { t } from "../../i18n/index.js";

// CPU and memory per running container. Only loaded while the server page is open.
export default function ContainersCard({ resource }) {
  const { data, error, loading, refresh } = resource;
  return (
    <div className="card stack">
      <div className="card-title"><h2>{t("server.containers.title")}</h2></div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data && loading ? <Loading /> : !data?.containers?.length ? <EmptyState title={t("server.containers.empty")} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("server.containers.name")}</th><th>{t("server.containers.cpu")}</th><th>{t("server.containers.memory")}</th></tr></thead>
            <tbody>
              {data.containers.map(c => (
                <tr key={c.name}><td className="mono">{c.service || c.name}</td><td>{formatPercent(c.cpuPercent)}</td><td>{formatMegabytes(c.memMb)} <span className="muted">({formatPercent(c.memPercent)})</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
