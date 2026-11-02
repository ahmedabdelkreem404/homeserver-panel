import { useState } from "react";
import Alert from "../components/Alert.jsx";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Dialog from "../components/Dialog.jsx";
import Explainer from "../components/Explainer.jsx";
import Menu from "../components/Menu.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { errorMessage } from "../lib/api.js";
import { useApi } from "../lib/apiContext.jsx";
import { formatDateTime } from "../lib/format.js";
import { useToast } from "../lib/toast.jsx";
import { useResource } from "../lib/useResource.js";
import CreateUserDialog from "./users/CreateUserDialog.jsx";
import PasswordResult from "./users/PasswordResult.jsx";
import QuotaDialog from "./users/QuotaDialog.jsx";
import { t } from "../i18n/index.js";

const quotaLine = quota => quota && t("users.quotaLine", { apps: quota.maxApps, databases: quota.maxDatabases, memory: quota.maxMemoryMb, cpu: quota.maxCpu });

// Owner only: the hosting accounts, their allowance, and the few things that can be done to an account.
export default function UsersPage() {
  const api = useApi();
  const toast = useToast();
  const users = useResource(() => api.get("/api/users"));
  const [dialog, setDialog] = useState(null);
  const close = changed => { setDialog(null); if (changed) users.refresh(); };

  const act = (user, kind) => setDialog({ kind, user });
  const items = user => user.role === "owner" ? [] : [
    { key: "reset", label: t("users.actions.reset"), onSelect: () => act(user, "reset") },
    ...(user.tenant ? [{ key: "quota", label: t("users.actions.quota"), onSelect: () => act(user, "quota") }] : []),
    user.disabled
      ? { key: "resume", label: t("users.actions.resume"), onSelect: () => act(user, "resume") }
      : { key: "suspend", label: t("users.actions.suspend"), danger: true, onSelect: () => act(user, "suspend") },
  ];

  return (
    <div className="stack-lg">
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle")} actions={<Button variant="primary" onClick={() => setDialog({ kind: "create" })}>{t("users.create")}</Button>} />
      <div className="card stack">
        <div className="card-title"><div className="row"><h2>{t("users.list")}</h2><Explainer text={t("users.explain")} /></div></div>
        {users.error && !users.data ? <ErrorState error={users.error} onRetry={users.refresh} /> : !users.data && users.loading ? <Loading lines={3} /> : !users.data?.users.length ? <EmptyState title={t("users.empty")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("users.email")}</th><th>{t("users.role")}</th><th>{t("users.account")}</th><th>{t("users.status")}</th><th>{t("users.created")}</th><th><span className="visually-hidden">{t("common.menu")}</span></th></tr></thead>
              <tbody>
                {users.data.users.map(user => (
                  <tr key={user.id} data-testid={`user-${user.email}`}>
                    <td className="mono">{user.email}</td>
                    <td>{t(`users.roles.${user.role}`)}</td>
                    <td>{user.tenant ? <span className="stack" style={{ gap: 2 }}><span>{user.tenant.name} <span className="mono muted">({user.tenant.slug})</span></span><span className="hint">{quotaLine(user.tenant.quota)}</span></span> : <span className="muted">—</span>}</td>
                    <td>{user.disabled ? <Badge kind="danger">{t("users.suspended")}</Badge> : user.mustChangePassword ? <Badge kind="warning">{t("users.pending")}</Badge> : <Badge kind="success">{t("users.active")}</Badge>}</td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>{items(user).length > 0 && <Menu label={t("users.actions.menu")} items={items(user)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "create" && <CreateUserDialog onClose={close} />}
      {dialog?.kind === "quota" && <QuotaDialog user={dialog.user} onClose={close} />}
      {dialog?.kind === "reset" && <ResetDialog user={dialog.user} onClose={close} />}
      {(dialog?.kind === "suspend" || dialog?.kind === "resume") && (
        <ConfirmDialog title={t(`users.${dialog.kind}Title`)} danger={dialog.kind === "suspend"} confirmLabel={t(`users.actions.${dialog.kind}`)} onClose={close}
          onConfirm={async () => { await api.post(`/api/users/${dialog.user.id}/${dialog.kind}`); toast.success(t(`users.${dialog.kind}Done`)); }}>
          <p>{dialog.user.email}</p>
          <p className="muted">{t(`users.${dialog.kind}Text`)}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

// A reset needs one confirmation, then the new temporary password is shown once.
function ResetDialog({ user, onClose }) {
  const api = useApi();
  const [password, setPassword] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (password) return <PasswordResult email={user.email} password={password} title={t("users.resetDone")} onDone={() => onClose(true)} />;
  const reset = async () => {
    setBusy(true); setError(null);
    try { setPassword((await api.post(`/api/users/${user.id}/reset-password`)).temporaryPassword); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Dialog title={t("users.resetTitle")} onClose={() => !busy && onClose(false)}>
      <div className="stack"><p>{user.email}</p><p className="muted">{t("users.resetText")}</p></div>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="form-actions"><Button variant="danger" busy={busy} onClick={reset} data-autofocus>{t("users.actions.reset")}</Button><Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button></div>
    </Dialog>
  );
}
