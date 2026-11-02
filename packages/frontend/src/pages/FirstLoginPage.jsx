import { useEffect, useRef, useState } from "react";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import CopyButton from "../components/CopyButton.jsx";
import Field from "../components/Field.jsx";
import RecoveryCodesView from "../components/RecoveryCodesView.jsx";
import { Loading } from "../components/States.jsx";
import AuthLayout from "../layout/AuthLayout.jsx";
import { errorMessage } from "../lib/api.js";
import { useSession } from "../lib/session.jsx";
import { t } from "../i18n/index.js";

const STEPS = ["password", "twoStep", "recovery"];

function Steps({ current }) {
  return (
    <ol className="steps" aria-label={t("first.title")}>
      {STEPS.map((key, index) => <li key={key} aria-current={index === current ? "step" : undefined} data-done={index < current}>{t(`first.steps.${key}`)}</li>)}
    </ol>
  );
}

function PasswordStep() {
  const session = useSession();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [problems, setProblems] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = key => event => setForm(f => ({ ...f, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    const found = {};
    if (!form.current) found.current = t("login.passwordRequired");
    if (form.next.length < 12) found.next = t("first.password.tooShort");
    else if (form.next !== form.confirm) found.confirm = t("first.password.mismatch");
    setProblems(found);
    if (Object.keys(found).length) return;
    setBusy(true); setFailure(null);
    try { await session.changePassword(form.current, form.next); } catch (error) { setFailure(error); setBusy(false); }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="muted">{t("first.password.intro")}</p>
      {failure && <Alert>{errorMessage(failure)}</Alert>}
      <Field label={t("first.password.current")} type="password" value={form.current} onChange={set("current")} autoComplete="current-password" dir="ltr" error={problems.current} />
      <Field label={t("first.password.next")} type="password" value={form.next} onChange={set("next")} autoComplete="new-password" dir="ltr" hint={t("first.password.policy")} error={problems.next} />
      <Field label={t("first.password.confirm")} type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" dir="ltr" error={problems.confirm} />
      <Button type="submit" variant="primary" block busy={busy}>{busy ? t("first.password.submitting") : t("first.password.submit")}</Button>
    </form>
  );
}

const groupSecret = secret => secret.replace(/(.{4})/g, "$1 ").trim();

function TwoStepStep() {
  const session = useSession();
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // starting twice would replace the secret the owner already scanned
    started.current = true;
    session.enrollStart().then(setSetup, setLoadError);
  }, [session]);

  const submit = async event => {
    event.preventDefault();
    const value = code.replace(/\s/g, "");
    if (!value) { setFailure(new Error("empty")); return; }
    setBusy(true); setFailure(null);
    try { await session.enrollConfirm(value); } catch (error) { setFailure(error); setCode(""); setBusy(false); }
  };

  if (loadError) return <Alert>{errorMessage(loadError)}</Alert>;
  if (!setup) return <Loading lines={4} />;

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="muted">{t("first.totp.intro")}</p>
      <div className="qr"><img alt={t("first.totp.qrLabel")} src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} /></div>
      <div className="stack">
        <span className="hint">{t("first.totp.manual")}</span>
        <div className="row-between">
          <code className="code-block" style={{ flex: 1 }} data-testid="totp-secret">{groupSecret(setup.secret)}</code>
          <CopyButton text={setup.secret} />
        </div>
      </div>
      {failure && <Alert>{failure.message === "empty" ? t("totp.codeRequired") : errorMessage(failure)}</Alert>}
      <Field label={t("first.totp.code")} value={code} onChange={event => setCode(event.target.value.replace(/[^\d\s]/g, "").slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" className="input-code" dir="ltr" hint={t("first.totp.clock")} />
      <Button type="submit" variant="primary" block busy={busy}>{busy ? t("first.totp.submitting") : t("first.totp.submit")}</Button>
    </form>
  );
}

function RecoveryStep() {
  const session = useSession();
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack">
      <Alert kind="warning">{t("first.recovery.intro")}</Alert>
      <RecoveryCodesView codes={session.recoveryCodes} />
      <label className="checkbox"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /><span>{t("first.recovery.saved")}</span></label>
      <Button variant="primary" block disabled={!saved} onClick={() => session.finishRecovery()}>{t("first.recovery.finish")}</Button>
    </div>
  );
}

// The first sign-in: new password, then two-step setup, then the one time recovery codes. Which step shows follows the server's `next`.
export default function FirstLoginPage() {
  const session = useSession();
  const step = session.recoveryCodes ? 2 : session.next === "totp_enroll" ? 1 : 0;
  const titles = [t("first.password.title"), t("first.totp.title"), t("first.recovery.title")];
  return (
    <AuthLayout title={titles[step]} subtitle={t("first.subtitle")} wide>
      <Steps current={step} />
      {step === 0 && <PasswordStep />}
      {step === 1 && <TwoStepStep />}
      {step === 2 && <RecoveryStep />}
    </AuthLayout>
  );
}
