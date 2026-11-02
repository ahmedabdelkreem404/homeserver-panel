import { useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Field from "../components/Field.jsx";
import AuthLayout from "../layout/AuthLayout.jsx";
import { errorMessage } from "../lib/api.js";
import { useSession } from "../lib/session.jsx";
import { t } from "../i18n/index.js";

// Second step of every sign-in: the 6 digit code from the authenticator app, or one recovery code.
export default function TotpPage() {
  const session = useSession();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const value = recovery ? code.trim() : code.replace(/\s/g, "");
    if (!value) { setProblem(t("totp.codeRequired")); return; }
    setProblem(null); setBusy(true); setFailure(null);
    try { await (recovery ? session.useRecoveryCode(value) : session.verifyCode(value)); } catch (error) { setFailure(error); setCode(""); setBusy(false); }
  };

  const switchMode = () => { setRecovery(r => !r); setCode(""); setProblem(null); setFailure(null); };

  return (
    <AuthLayout title={t("totp.title")} subtitle={recovery ? t("totp.recoveryHint") : t("totp.subtitle")}>
      <form className="form" onSubmit={submit} noValidate>
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        {recovery
          ? <Field key="recovery" label={t("totp.recoveryCode")} value={code} onChange={event => setCode(event.target.value)} autoComplete="off" dir="ltr" autoFocus error={problem} />
          : <Field key="code" label={t("totp.code")} value={code} onChange={event => setCode(event.target.value.replace(/[^\d\s]/g, "").slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" className="input-code" dir="ltr" autoFocus error={problem} />}
        <Button type="submit" variant="primary" block busy={busy}>{busy ? t("totp.submitting") : t("totp.submit")}</Button>
      </form>
      <div className="row-between">
        <Button variant="ghost" size="sm" onClick={switchMode}>{recovery ? t("totp.useCode") : t("totp.useRecovery")}</Button>
        <Button variant="ghost" size="sm" onClick={() => session.logout()}>{t("totp.switchAccount")}</Button>
      </div>
    </AuthLayout>
  );
}
