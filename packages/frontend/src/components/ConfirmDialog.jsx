import { useState } from "react";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Dialog from "./Dialog.jsx";
import { errorMessage } from "../lib/api.js";
import { t } from "../i18n/index.js";

// Confirms one action. onConfirm may be async; a failure is shown inside the dialog and the dialog stays open.
export default function ConfirmDialog({ title, children, confirmLabel = t("projects.confirm.go"), danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(true); } catch (e) { setError(e); setBusy(false); }
  };

  return (
    <Dialog title={title} onClose={() => !busy && onClose(false)}>
      <div className="stack">{children}</div>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="form-actions">
        <Button variant={danger ? "danger" : "primary"} busy={busy} onClick={confirm} data-autofocus>{confirmLabel}</Button>
        <Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button>
      </div>
    </Dialog>
  );
}
