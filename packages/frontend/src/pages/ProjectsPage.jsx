import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Icon from "../components/Icon.jsx";
import Menu from "../components/Menu.jsx";
import PageHeader from "../components/PageHeader.jsx";
import ProtectedBadge from "../components/ProtectedBadge.jsx";
import TypedConfirm from "../components/TypedConfirm.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { useToast } from "../lib/toast.jsx";
import { useResource } from "../lib/useResource.js";
import AppRow from "./projects/AppRow.jsx";
import LogsDialog from "./projects/LogsDialog.jsx";
import { t } from "../i18n/index.js";

const WATCH_AFTER = new Set(["deploy", "redeploy", "start", "restart"]);
const WATCH_EVERY_MS = 3000, WATCH_TRIES = 30;

function DatabaseBadges({ databases }) {
  if (!databases.length) return null;
  return <span className="row">{databases.map(db => <Badge key={`${db.type}-${db.id}`}>{db.type}</Badge>)}</span>;
}

export default function ProjectsPage() {
  const api = useApi();
  const toast = useToast();
  const { data, error, loading, refresh } = useResource(() => api.get("/api/projects"), { pollMs: 30_000 });
  const [live, setLive] = useState({});
  const [dialog, setDialog] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const setLiveFor = useCallback((id, value) => setLive(l => ({ ...l, [id]: value })), []);

  // "done" in Dokploy only means the service was created, so after a start or deploy we ask whether a container really runs.
  const checkState = useCallback(async app => {
    const state = await api.get(`/api/projects/apps/${app.applicationId}/state`);
    setLiveFor(app.applicationId, { verdict: state.verdict, running: state.running });
    return state;
  }, [api, setLiveFor]);

  const watch = useCallback(async app => {
    setLiveFor(app.applicationId, { watching: true });
    for (let attempt = 0; attempt < WATCH_TRIES && alive.current; attempt++) {
      await new Promise(resolve => setTimeout(resolve, WATCH_EVERY_MS));
      if (!alive.current) return;
      try { const state = await checkState(app); if (state.running) return; } catch { /* keep trying until the time is up */ }
    }
    if (alive.current) setLiveFor(app.applicationId, { verdict: "created-not-running", running: false });
  }, [checkState, setLiveFor]);

  const runAction = async (app, action) => {
    await api.post(`/api/projects/apps/${app.applicationId}/actions`, { action });
    toast.success(`${app.name}: ${t(`projects.done.${action}`)}`);
    refresh();
    if (WATCH_AFTER.has(action)) watch(app);
  };

  const showState = async app => {
    try { const s = await checkState(app); toast.info(`${app.name}: ${t(`projects.verdict.${s.verdict}`)}`); } catch (e) { toast.error(e); }
  };

  const close = () => setDialog(null);
  const confirmAction = (app, action) => setDialog({ kind: "action", app, action });

  const body = error && !data ? <div className="card"><ErrorState error={error} onRetry={refresh} /></div> : !data && loading ? <div className="card"><Loading lines={5} /></div> : !data.projects.length ? (
    <div className="card"><EmptyState icon="projects" title={t("projects.empty")} text={t("projects.emptyHint")} /></div>
  ) : data.projects.map(project => (
    <section className="card project" key={project.projectId} aria-labelledby={`p-${project.projectId}`}>
      <div className="row-between">
        <div className="row"><h2 id={`p-${project.projectId}`} className="mono">{project.name}</h2>{project.protected && <ProtectedBadge />}<DatabaseBadges databases={project.environments.flatMap(e => e.databases)} /></div>
        {!project.protected && <Menu label={t("projects.actions.menu")} items={[{ key: "delete", label: t("projects.actions.deleteProject"), danger: true, onSelect: () => setDialog({ kind: "deleteProject", project }) }]} />}
      </div>
      {project.description && <p className="muted">{project.description}</p>}
      {project.environments.map(env => (
        <div className="stack" key={env.environmentId}>
          {env.composeCount > 0 && <span className="hint">{t("projects.compose")}: {env.composeCount}</span>}
          {env.applications.length ? env.applications.map(app => (
            <AppRow key={app.applicationId} app={app} locked={project.protected} live={live[app.applicationId]}
              onState={() => showState(app)} onLogs={() => setDialog({ kind: "logs", app })}
              onAction={action => confirmAction(app, action)} onDelete={() => setDialog({ kind: "deleteApp", app })} />
          )) : <p className="muted">{t("projects.noApps")}</p>}
        </div>
      ))}
    </section>
  ));

  return (
    <div className="stack-lg">
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle")} actions={<Button onClick={refresh} busy={loading && !!data}><Icon name="refresh" className="nav-icon" size={16} />{t("common.refresh")}</Button>} />
      {body}
      {dialog?.kind === "logs" && <LogsDialog app={dialog.app} onClose={close} />}
      {dialog?.kind === "action" && (
        <ConfirmDialog title={t("projects.confirm.title", { action: t(`projects.actions.${dialog.action}`) })} danger={dialog.action === "stop"} confirmLabel={t(`projects.actions.${dialog.action}`)}
          onConfirm={() => runAction(dialog.app, dialog.action)} onClose={close}>
          <p>{t("projects.confirm.appLine", { name: dialog.app.name })}</p>
          <p className="muted">{t(`projects.confirm.${dialog.action}`)}</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "deleteApp" && (
        <TypedConfirm title={t("projects.delete.appTitle")} warning={<p className="alert alert-danger" role="alert">{t("projects.delete.warning")}</p>} instruction={t("projects.delete.type", { name: dialog.app.name })} expected={dialog.app.name}
          label={t("projects.delete.confirmLabel")} mismatch={t("projects.delete.mismatch")} confirmLabel={t("projects.delete.go")}
          onConfirm={async name => { await api.del(`/api/projects/apps/${dialog.app.applicationId}`, { confirmName: name }); toast.success(t("projects.done.delete")); refresh(); }} onClose={close} />
      )}
      {dialog?.kind === "deleteProject" && (
        <TypedConfirm title={t("projects.delete.projectTitle")} warning={<p className="alert alert-danger" role="alert">{t("projects.delete.warning")}</p>} instruction={t("projects.delete.type", { name: dialog.project.name })} expected={dialog.project.name}
          label={t("projects.delete.confirmLabel")} mismatch={t("projects.delete.mismatch")} confirmLabel={t("projects.delete.go")}
          onConfirm={async name => { await api.del(`/api/projects/${dialog.project.projectId}`, { confirmName: name }); toast.success(t("projects.done.delete")); refresh(); }} onClose={close} />
      )}
    </div>
  );
}
