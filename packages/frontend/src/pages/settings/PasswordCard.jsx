import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Explainer from "../../components/Explainer.jsx";
import Field from "../../components/Field.jsx";
import { errorMessage } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { t } from "../../i18n/index.js";

const EMPTY = { current: "", next: "", confirm: "" };

export default function PasswordCard({ onChanged }) {
  const session = useSession();
  const [form, setForm] = useState(EMPTY);
  const [problems, setProblems] = useState({});
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = key => event => { setDone(false); setForm(f => ({ ...f, [key]: event.target.value })); };

  const submit = async event => {
    event.preventDefault();
    const found = {};
    if (!form.current) found.current = t("login.passwordRequired");
    if (form.next.length < 12) found.next = t("first.password.tooShort");
    else if (form.next !== form.confirm) found.confirm = t("first.password.mismatch");
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true); setFailure(null);
    try { await session.changePassword(form.current, form.next); setForm(EMPTY); setDone(true); onChanged?.(); } catch (error) { setFailure(error); } finally { setBusy(false); }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <div className="card-title"><div className="row"><h2>{t("settings.password.title")}</h2><Explainer text={t("settings.password.explain")} /></div></div>
      {done && <Alert kind="success">{t("settings.password.done")}</Alert>}
      {failure && <Alert>{errorMessage(failure)}</Alert>}
      <Field label={t("settings.password.current")} type="password" value={form.current} onChange={set("current")} autoComplete="current-password" dir="ltr" error={problems.current} />
      <Field label={t("settings.password.next")} type="password" value={form.next} onChange={set("next")} autoComplete="new-password" dir="ltr" hint={t("first.password.policy")} error={problems.next} />
      <Field label={t("settings.password.confirm")} type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" dir="ltr" error={problems.confirm} />
      <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>{t("settings.password.submit")}</Button></div>
    </form>
  );
}
