import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import CopyButton from "../../components/CopyButton.jsx";
import Dialog from "../../components/Dialog.jsx";
import Field from "../../components/Field.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";

const NAME_PATTERN = /^[A-Za-z0-9._ -]{1,32}$/;
const EXPIRY = [["", "mcp.create.never"], ["30", "mcp.create.days30"], ["90", "mcp.create.days90"], ["365", "mcp.create.days365"]];
const CLIENTS = ["claudeCode", "codex", "cursor", "gemini", "antigravity", "windsurf", "vscode", "cline", "zed", "claudeDesktop", "generic"];

function Form({ onCreated }) {
  const api = useApi();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [problem, setProblem] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (!NAME_PATTERN.test(name.trim())) { setProblem(t("mcp.create.nameInvalid")); return; }
    setProblem(null); setBusy(true); setFailure(null);
    try { onCreated(await api.post("/api/mcp/keys", { name: name.trim(), ...(expiry ? { expiresInDays: Number(expiry) } : {}) })); } catch (error) { setFailure(error); setBusy(false); }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {failure && <Alert>{errorMessage(failure)}</Alert>}
      <Field label={t("mcp.create.name")} value={name} onChange={event => setName(event.target.value)} dir="ltr" maxLength={32} autoComplete="off" data-autofocus hint={t("mcp.create.nameHint")} error={problem} />
      <Field as="select" label={t("mcp.create.expiry")} value={expiry} onChange={event => setExpiry(event.target.value)}>{EXPIRY.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</Field>
      <p className="hint">{t("mcp.create.rateOff")}</p>
      <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>{busy ? t("mcp.create.submitting") : t("mcp.create.submit")}</Button></div>
    </form>
  );
}

// The key is shown once, here and nowhere else. The dialog cannot be dismissed until the owner confirms they copied it.
function Result({ created, onDone }) {
  const [client, setClient] = useState("claudeCode");
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack">
      <Alert kind="warning">{t("mcp.create.once")}</Alert>
      <div className="secret-box">
        <span className="label">{t("mcp.create.secret")}</span>
        <code className="code-block" data-testid="new-key-secret">{created.secret}</code>
        <div><CopyButton text={created.secret} /></div>
      </div>
      <h3>{t("mcp.create.configs")}</h3>
      {created.configs ? (
        <>
          <div className="segmented segmented-scroll" role="group" aria-label={t("mcp.create.configs")}>
            {CLIENTS.filter(key => created.configs[key]).map(key => <button key={key} type="button" aria-pressed={client === key} onClick={() => setClient(key)}>{t(`mcp.create.${key}`)}</button>)}
          </div>
          <p className="muted">{t(`mcp.create.where.${client}`)}</p>
          <pre className="code-block" tabIndex={0} aria-label={t(`mcp.create.${client}`)}>{created.configs[client]}</pre>
          <div><CopyButton text={created.configs[client]} /></div>
          <Alert kind="info">{t("mcp.create.noMcpNote")}</Alert>
        </>
      ) : <Alert kind="info">{t("mcp.create.noUrl")}</Alert>}
      <label className="checkbox"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /><span>{t("mcp.create.saved")}</span></label>
      <div className="form-actions"><Button variant="primary" disabled={!saved} onClick={onDone}>{t("mcp.create.done")}</Button></div>
    </div>
  );
}

export default function CreateKeyDialog({ onClose }) {
  const [created, setCreated] = useState(null);
  return (
    <Dialog title={created ? t("mcp.create.created") : t("mcp.create.title")} onClose={() => onClose(Boolean(created))} dismissible={!created} wide={Boolean(created)}>
      {created ? <Result created={created} onDone={() => onClose(true)} /> : <Form onCreated={setCreated} />}
    </Dialog>
  );
}
