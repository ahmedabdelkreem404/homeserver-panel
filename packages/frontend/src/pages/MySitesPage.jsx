import { useState } from "react";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Explainer from "../components/Explainer.jsx";
import Icon from "../components/Icon.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatCard from "../components/StatCard.jsx";
import TypedConfirm from "../components/TypedConfirm.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { Link } from "../lib/router.jsx";
import { useSession } from "../lib/session.jsx";
import { useToast } from "../lib/toast.jsx";
import { useResource } from "../lib/useResource.js";
import AppRow from "./projects/AppRow.jsx";
import LogsDialog from "./projects/LogsDialog.jsx";
import TerminalModal from "../components/TerminalModal.jsx";
import { t } from "../i18n/index.js";


const SITES = "/api/my/sites";
const percentOf = (used, max) => (max > 0 ? (used / max) * 100 : used > 0 ? 100 : 0);
const ofMax = (used, max) => t("mySites.of", { used, max });

// A hosting account's home: what it may use, what it uses, and its own sites. Everything comes from /api/my, which only
// ever returns sites this account owns.
export default function MySitesPage() {
  const api = useApi();
  const toast = useToast();
  const { user } = useSession();
  const canManage = user?.role === "tenant";
  const overview = useResource(() => api.get("/api/my/overview"), { pollMs: 60_000 });
  const sites = useResource(() => api.get(SITES), { pollMs: 30_000 });
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  const refresh = () => { overview.refresh(); sites.refresh(); };

  const showState = async site => {
    try { const state = await api.get(`${SITES}/${site.applicationId}/state`); toast.info(`${site.name}: ${t(`projects.verdict.${state.verdict}`)}`); } catch (e) { toast.error(e); }
  };
  const runAction = async (site, action) => {
    await api.post(`${SITES}/${site.applicationId}/actions`, { action });
    toast.success(`${site.name}: ${t(`projects.done.${action}`)}`);
    refresh();
  };
  // AppRow was built for the owner's project list: give it the shape it reads (bytes and cores).
  const asRow = site => ({ ...site, memoryLimit: site.limits.memoryMb === null ? null : site.limits.memoryMb * 1048576, cpuLimit: site.limits.cpu });

  const quota = overview.data?.quota, usage = overview.data?.usage;
  const cards = overview.error && !overview.data ? <div className="card"><ErrorState error={overview.error} onRetry={overview.refresh} /></div> : !overview.data ? <Loading lines={2} /> : (
    <div className="grid-cards">
      <StatCard label={t("mySites.apps")} value={usage.apps} note={ofMax(usage.apps, quota.maxApps)} percent={percentOf(usage.apps, quota.maxApps)} />
      <StatCard label={t("mySites.memory")} value={usage.memoryMb} unit="MB" note={ofMax(usage.memoryMb, quota.maxMemoryMb)} percent={percentOf(usage.memoryMb, quota.maxMemoryMb)} />
      <StatCard label={t("mySites.cpu")} value={usage.cpu} note={ofMax(usage.cpu, quota.maxCpu)} percent={percentOf(usage.cpu, quota.maxCpu)} />
      <StatCard label={t("mySites.databases")} value={usage.databases} note={ofMax(usage.databases, quota.maxDatabases)} percent={percentOf(usage.databases, quota.maxDatabases)} />
      <StatCard label={t("mySites.subdomains")} value={usage.subdomains} note={ofMax(usage.subdomains, quota.maxSubdomains)} percent={percentOf(usage.subdomains, quota.maxSubdomains)} />
    </div>
  );

  const list = sites.error && !sites.data ? <div className="card"><ErrorState error={sites.error} onRetry={sites.refresh} /></div> : !sites.data ? <div className="card"><Loading lines={3} /></div> : !sites.data.sites.length ? (
    <div className="card"><EmptyState icon="projects" title={t("mySites.empty")} text={t(canManage ? "mySites.emptyCanCreate" : "mySites.emptyHint")} action={canManage ? <Link to="/new" className="btn btn-primary">{t("newSite.title")}</Link> : undefined} /></div>
  ) : (
    <div className="card stack">
      <div className="card-title"><div className="row"><h2>{t("mySites.list")}</h2><Explainer text={t("mySites.explain")} /></div></div>
      {sites.data.sites.map(site => (
        <AppRow key={site.applicationId} app={asRow(site)} locked={!canManage} onState={() => showState(site)} onLogs={() => setDialog({ kind: "logs", site })}
          onTerminal={() => setDialog({ kind: "terminal", site })}
          onAction={action => setDialog({ kind: "action", site, action })} onDelete={() => setDialog({ kind: "delete", site })} />
      ))}
    </div>
  );

  return (
    <div className="stack-lg">
      <PageHeader title={t("mySites.title")} subtitle={t("mySites.subtitle")} actions={<>{canManage && <Link to="/new" className="btn btn-primary">{t("newSite.title")}</Link>}<Button onClick={refresh} busy={(overview.loading || sites.loading) && !!sites.data}><Icon name="refresh" className="nav-icon" size={16} />{t("common.refresh")}</Button></>} />
      {cards}
      {usage?.withoutLimits > 0 && <p className="alert alert-warning" role="status">{t("mySites.withoutLimits", { count: usage.withoutLimits })}</p>}
      {list}
      {dialog?.kind === "terminal" && <TerminalModal site={dialog.site} scope="my" onClose={close} />}
      {dialog?.kind === "logs" && <LogsDialog app={dialog.site} basePath={SITES} onClose={close} />}
      {dialog?.kind === "action" && (
        <ConfirmDialog title={t("projects.confirm.title", { action: t(`projects.actions.${dialog.action}`) })} danger={dialog.action === "stop"} confirmLabel={t(`projects.actions.${dialog.action}`)}
          onConfirm={() => runAction(dialog.site, dialog.action)} onClose={close}>
          <p>{t("projects.confirm.appLine", { name: dialog.site.name })}</p>
          <p className="muted">{t(`projects.confirm.${dialog.action}`)}</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "delete" && (
        <TypedConfirm title={t("projects.delete.appTitle")} warning={<p className="alert alert-danger" role="alert">{t("projects.delete.warning")}</p>} instruction={t("projects.delete.type", { name: dialog.site.name })} expected={dialog.site.name}
          label={t("projects.delete.confirmLabel")} mismatch={t("projects.delete.mismatch")} confirmLabel={t("projects.delete.go")}
          onConfirm={async name => { await api.del(`${SITES}/${dialog.site.applicationId}`, { confirmName: name }); toast.success(t("projects.done.delete")); refresh(); }} onClose={close} />
      )}
    </div>
  );

}
