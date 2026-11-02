import { useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Field from "../components/Field.jsx";
import AuthLayout from "../layout/AuthLayout.jsx";
import { errorMessage } from "../lib/api.js";
import { useSession } from "../lib/session.jsx";
import { t } from "../i18n/index.js";

export default function LoginPage() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problems, setProblems] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const found = {};
    if (!email.trim()) found.email = t("login.emailRequired");
    if (!password) found.password = t("login.passwordRequired");
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true); setFailure(null);
    try { await session.login(email.trim(), password); } catch (error) { setFailure(error); setPassword(""); setBusy(false); }
  };

  return (
    <AuthLayout title={t("login.title")} subtitle={t("login.subtitle")}>
      <form className="form" onSubmit={submit} noValidate>
        {session.expired && !failure && <Alert kind="warning">{t("common.sessionExpired")}</Alert>}
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <Field label={t("login.email")} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" inputMode="email" dir="ltr" error={problems.email} />
        <Field label={t("login.password")} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" dir="ltr" error={problems.password} />
        <Button type="submit" variant="primary" block busy={busy}>{busy ? t("login.submitting") : t("login.submit")}</Button>
        <p className="hint" style={{ textAlign: "center", marginTop: "var(--space-3)" }}>
          <a href="/landing" style={{ color: "var(--accent)", textDecoration: "none" }}>{t("landing.badge")} &larr;</a>
        </p>
      </form>
    </AuthLayout>
  );
}
