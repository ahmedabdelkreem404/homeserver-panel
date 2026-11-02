import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Dialog from "../../components/Dialog.jsx";
import Field from "../../components/Field.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { t } from "../../i18n/index.js";
import PasswordResult from "./PasswordResult.jsx";
import QuotaFields from "./QuotaFields.jsx";
import { asText, DEFAULT_QUOTA, readQuota } from "./quotaFields.js";

const ROLES = ["tenant", "admin", "viewer"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z][a-z0-9-]{1,22}[a-z0-9]$/;

export default function CreateUserDialog({ onClose }) {
  const api = useApi();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tenant");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [quota, setQuota] = useState(() => asText(DEFAULT_QUOTA));
  const [problems, setProblems] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  if (created) return <PasswordResult email={created.user.email} password={created.temporaryPassword} title={t("users.created")} onDone={() => onClose(true)} />;

  const submit = async event => {
    event.preventDefault();
    const found = {};
    if (!EMAIL.test(email.trim())) found.email = t("users.emailInvalid");
    let limits;
    if (role === "tenant") {
      if (!SLUG.test(slug.trim())) found.slug = t("users.slugInvalid");
      if (!name.trim()) found.name = t("users.nameRequired");
      const read = readQuota(quota);
      if (read.problem) found.quota = read.problem; else limits = read.quota;
    }
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true); setFailure(null);
    const body = { email: email.trim(), role, ...(role === "tenant" ? { tenant: { slug: slug.trim(), name: name.trim() }, quota: limits } : {}) };
    try { setCreated(await api.post("/api/users", body)); } catch (error) { setFailure(error); setBusy(false); }
  };

  return (
    <Dialog title={t("users.createTitle")} onClose={() => !busy && onClose(false)} wide>
      <form className="form" onSubmit={submit} noValidate>
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <Field label={t("users.email")} type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" data-autofocus error={problems.email} />
        <Field as="select" label={t("users.role")} value={role} onChange={event => setRole(event.target.value)} explainer={t(`users.roleHelp.${role}`)}>
          {ROLES.map(value => <option key={value} value={value}>{t(`users.roles.${value}`)}</option>)}
        </Field>
        {role === "tenant" && (
          <>
            <Field label={t("users.slug")} dir="ltr" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} maxLength={24} autoComplete="off" hint={t("users.slugHint")} error={problems.slug} />
            <Field label={t("users.accountName")} value={name} onChange={event => setName(event.target.value)} maxLength={80} autoComplete="off" error={problems.name} />
            <h3>{t("users.quotaHeading")}</h3>
            <QuotaFields values={quota} onChange={setQuota} problem={problems.quota} />
          </>
        )}
        <p className="hint">{t("users.createHint")}</p>
        <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>{t("users.createSubmit")}</Button><Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button></div>
      </form>
    </Dialog>
  );
}
