import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Dialog from "../../components/Dialog.jsx";
import Explainer from "../../components/Explainer.jsx";
import Field from "../../components/Field.jsx";
import RecoveryCodesView from "../../components/RecoveryCodesView.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";

function RegenerateDialog({ onClose }) {
  const api = useApi();
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null);
  const [saved, setSaved] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (!password) { setFailure(new Error("empty")); return; }
    setBusy(true); setFailure(null);
    try { setCodes((await api.post("/api/auth/recovery-codes/regenerate", { password })).recoveryCodes); } catch (error) { setFailure(error); setPassword(""); } finally { setBusy(false); }
  };

  if (codes) {
    return (
      <Dialog title={t("settings.recovery.done")} onClose={onClose} dismissible={false}>
        <Alert kind="warning">{t("first.recovery.intro")}</Alert>
        <RecoveryCodesView codes={codes} />
        <label className="checkbox"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /><span>{t("first.recovery.saved")}</span></label>
        <div className="form-actions"><Button variant="primary" disabled={!saved} onClick={onClose}>{t("mcp.create.done")}</Button></div>
      </Dialog>
    );
  }
  return (
    <Dialog title={t("settings.recovery.regenerate")} onClose={() => !busy && onClose()}>
      <form className="form" onSubmit={submit} noValidate>
        <Alert kind="warning">{t("settings.recovery.warn")}</Alert>
        {failure && <Alert>{failure.message === "empty" ? t("login.passwordRequired") : errorMessage(failure)}</Alert>}
        <Field label={t("settings.recovery.password")} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" dir="ltr" data-autofocus />
        <div className="form-actions">
          <Button type="submit" variant="danger" busy={busy}>{t("settings.recovery.submit")}</Button>
          <Button onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function RecoveryCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card stack">
      <div className="card-title"><div className="row"><h2>{t("settings.recovery.title")}</h2><Explainer text={t("settings.recovery.explain")} /></div></div>
      <p className="muted">{t("settings.recovery.text")}</p>
      <div><Button onClick={() => setOpen(true)}>{t("settings.recovery.regenerate")}</Button></div>
      {open && <RegenerateDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
