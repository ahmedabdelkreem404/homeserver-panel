import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import CopyButton from "../../components/CopyButton.jsx";
import Dialog from "../../components/Dialog.jsx";
import { t } from "../../i18n/index.js";

// A temporary password is shown once, here. The dialog cannot be dismissed before the owner confirms it was passed on.
export default function PasswordResult({ email, password, title, onDone }) {
  const [saved, setSaved] = useState(false);
  return (
    <Dialog title={title} onClose={onDone} dismissible={false}>
      <div className="stack">
        <Alert kind="warning">{t("users.passwordOnce")}</Alert>
        <p className="mono">{email}</p>
        <div className="secret-box">
          <span className="label">{t("users.temporaryPassword")}</span>
          <code className="code-block" data-testid="temporary-password">{password}</code>
          <div><CopyButton text={password} /></div>
        </div>
        <p className="hint">{t("users.passwordHint")}</p>
        <label className="checkbox"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /><span>{t("users.passwordSaved")}</span></label>
        <div className="form-actions"><Button variant="primary" disabled={!saved} onClick={onDone}>{t("mcp.create.done")}</Button></div>
      </div>
    </Dialog>
  );
}
