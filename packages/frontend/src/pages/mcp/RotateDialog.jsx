import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import CopyButton from "../../components/CopyButton.jsx";
import Dialog from "../../components/Dialog.jsx";
import Field from "../../components/Field.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";

const WORD = "ROTATE";

// Changing the secret path disconnects every tool using the old URL, so it needs a strong warning and a typed word.
export default function RotateDialog({ onClose }) {
  const api = useApi();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [newUrl, setNewUrl] = useState(null);

  const rotate = async event => {
    event.preventDefault();
    if (typed !== WORD || busy) return;
    setBusy(true); setFailure(null);
    try { setNewUrl((await api.post("/api/mcp/rotate-path", { confirm: typed })).url); } catch (error) { setFailure(error); } finally { setBusy(false); }
  };

  if (newUrl) {
    return (
      <Dialog title={t("mcp.rotate.done")} onClose={() => onClose(true)} dismissible={false}>
        <div className="secret-box">
          <span className="label">{t("mcp.rotate.newUrl")}</span>
          <code className="code-block" data-testid="new-mcp-url">{newUrl}</code>
          <div><CopyButton text={newUrl} /></div>
        </div>
        <p className="muted">{t("mcp.rotate.newUrlHint")}</p>
        <div className="form-actions"><Button variant="primary" onClick={() => onClose(true)}>{t("mcp.create.done")}</Button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t("mcp.rotate.title")} onClose={() => !busy && onClose(false)}>
      <form className="form" onSubmit={rotate} noValidate>
        <Alert title={t("mcp.rotate.warnTitle")}>
          <ul style={{ margin: "var(--space-2) 0 0", paddingInlineStart: "var(--space-5)" }}>
            <li>{t("mcp.rotate.warn1")}</li><li>{t("mcp.rotate.warn2")}</li><li>{t("mcp.rotate.warn3")}</li>
          </ul>
        </Alert>
        <p>{t("mcp.rotate.type")}</p>
        <Field label={t("mcp.rotate.confirmLabel")} value={typed} onChange={event => setTyped(event.target.value)} dir="ltr" autoComplete="off" autoCapitalize="off" spellCheck={false} data-autofocus error={typed && typed !== WORD ? t("mcp.rotate.mismatch") : undefined} />
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={typed !== WORD} busy={busy}>{busy ? t("mcp.rotate.going") : t("mcp.rotate.go")}</Button>
          <Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
