import { useState } from "react";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Dialog from "./Dialog.jsx";
import Field from "./Field.jsx";
import { errorMessage } from "../lib/api.js";
import { t } from "../i18n/index.js";

// For irreversible or far reaching actions: the button stays disabled until the exact expected text is typed.
export default function TypedConfirm({ title, warning, instruction, expected, label, mismatch, confirmLabel, busyLabel, onConfirm, onClose }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const matches = value === expected;

  const submit = async event => {
    event.preventDefault();
    if (!matches || busy) return;
    setBusy(true); setError(null);
    try { await onConfirm(value); onClose(true); } catch (e) { setError(e); setBusy(false); }
  };

  return (
    <Dialog title={title} onClose={() => !busy && onClose(false)}>
      <form className="form" onSubmit={submit} noValidate>
        {warning}
        <p>{instruction}</p>
        <Field label={label} value={value} onChange={event => setValue(event.target.value)} dir="auto" autoComplete="off" autoCapitalize="off" spellCheck={false} data-autofocus error={value && !matches ? mismatch : undefined} />
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={!matches} busy={busy}>{busy && busyLabel ? busyLabel : confirmLabel}</Button>
          <Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
