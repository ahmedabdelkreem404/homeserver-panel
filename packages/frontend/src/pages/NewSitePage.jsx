import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "../components/Alert.jsx";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Field from "../components/Field.jsx";
import Meter from "../components/Meter.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Loading } from "../components/States.jsx";
import { errorMessage } from "../lib/api.js";
import { useApi } from "../lib/apiContext.jsx";
import { Link } from "../lib/router.jsx";
import { useResource } from "../lib/useResource.js";
import { t } from "../i18n/index.js";

const TEMPLATES = ["static", "node", "next", "php", "laravel"];
const PHASES = ["queued", "checking", "creating", "configuring", "uploading", "building", "starting", "done"];
const NAME = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;
const SERVER_LIMIT_MB = 32; // the panel's own ceiling for an upload
export const POLL = { ms: 2000 }; // a test shortens it

// A refusal says why in Arabic by its code, and keeps the server's own sentence below it: that sentence names the rule.
function Problem({ error }) {
  return (
    <Alert>
      <span>{errorMessage(error)}</span>
      {error?.message && error.code !== "network" && <span className="muted mono" dir="ltr" style={{ display: "block" }}>{error.message}</span>}
    </Alert>
  );
}

function Steps({ step }) {
  const keys = ["upload", "check", "name", "deploy"];
  return (
    <ol className="steps" aria-label={t("newSite.title")}>
      {keys.map((key, i) => <li key={key} aria-current={step === i + 1 ? "step" : undefined} data-done={step > i + 1}><span className="steps-number">{i + 1}</span>{t(`newSite.steps.${key}`)}</li>)}
    </ol>
  );
}

export default function NewSitePage() {
  const api = useApi();
  const overview = useResource(() => api.get("/api/my/overview"));
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [template, setTemplate] = useState(null); // null = let the panel detect it
  const [found, setFound] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [job, setJob] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const limitMb = Math.min(overview.data?.quota.maxUploadMb ?? SERVER_LIMIT_MB, SERVER_LIMIT_MB);
  const account = overview.data?.account, baseDomain = overview.data?.baseDomain;
  const host = account && name ? `${account.slug}-${name}.${baseDomain}` : "";

  const inspect = useCallback(async (chosen, forced) => {
    setBusy(true); setProblem(null);
    try {
      const result = await api.postFile(`/api/my/sites/inspect${forced ? `?template=${forced}` : ""}`, chosen);
      if (!alive.current) return;
      setFound(result); setTemplate(forced ?? null); setStep(2);
    } catch (error) { if (alive.current) { setProblem(error); setFile(null); } } finally { if (alive.current) setBusy(false); }
  }, [api]);

  const pick = event => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!/\.zip$/i.test(chosen.name)) { setProblem({ message: t("newSite.notZip"), code: "client" }); return; }
    if (chosen.size > limitMb * 1048576) { setProblem({ message: t("newSite.tooBig", { mb: limitMb }), code: "client" }); return; }
    setFile(chosen);
    inspect(chosen, null);
  };

  // The job runs on the server; the page only asks how far it got. Closing the page does not stop it.
  const watch = useCallback(async id => {
    while (alive.current) {
      await new Promise(resolve => setTimeout(resolve, POLL.ms));
      if (!alive.current) return;
      try {
        const next = await api.get(`/api/my/jobs/${id}`);
        if (!alive.current) return;
        setJob(next);
        if (next.status === "done" || next.status === "failed") return;
      } catch (error) { if (alive.current) setProblem(error); }
    }
  }, [api]);

  const deploy = async () => {
    setBusy(true); setProblem(null);
    try {
      const started = await api.postFile(`/api/my/sites?name=${name}${template ? `&template=${template}` : ""}`, file);
      if (!alive.current) return;
      setJob(started); setStep(4);
      watch(started.id);
    } catch (error) { if (alive.current) setProblem(error); } finally { if (alive.current) setBusy(false); }
  };

  const restart = () => { setStep(1); setFile(null); setFound(null); setTemplate(null); setName(""); setJob(null); setProblem(null); };
  const nameProblem = name && !NAME.test(name) ? t("newSite.nameInvalid") : null;
  const chosenTemplate = found?.template;

  return (
    <div className="stack-lg">
      <PageHeader title={t("newSite.title")} subtitle={t("newSite.subtitle")} />
      <Steps step={step} />
      <div className="card stack">
        {overview.error && !overview.data ? <Problem error={overview.error} /> : !overview.data ? <Loading lines={2} /> : null}
        {problem && <Problem error={problem} />}

        {step === 1 && overview.data && (
          <>
            <label className="file-pick">
              <span className="btn btn-primary">{busy ? t("newSite.inspecting") : t("newSite.pick")}</span>
              <input type="file" accept=".zip,application/zip" onChange={pick} disabled={busy} data-testid="zip-input" />
            </label>
            <p className="hint">{t("newSite.pickHint", { mb: limitMb })}</p>
          </>
        )}

        {step === 2 && found && (
          <>
            <div className="row"><h2>{t("newSite.template")}</h2><Badge kind="info">{t(`newSite.templates.${chosenTemplate}`)}</Badge></div>
            <p className="muted">{t(`newSite.templateHelp.${chosenTemplate}`)}</p>
            <p className="hint">{found.reasons.length ? t("newSite.detected", { why: found.reasons.join(", ") }) : t("newSite.chosen")}</p>
            <Field as="select" label={t("newSite.override")} value={chosenTemplate} disabled={busy} onChange={event => inspect(file, event.target.value)}>
              {TEMPLATES.map(key => <option key={key} value={key}>{t(`newSite.templates.${key}`)}</option>)}
            </Field>
            <p>{t("newSite.reserve", { memory: found.reserve.memoryMb, cpu: found.reserve.cpu })}</p>
            {found.skipped.length > 0 && <p className="hint">{t("newSite.skipped", { files: found.skipped.slice(0, 6).join(", ") })}</p>}
            {found.warnings.length > 0 && <Alert kind="warning"><strong>{t("newSite.warnings")}</strong><ul>{found.warnings.map(w => <li key={w}>{w}</li>)}</ul></Alert>}
            <div className="form-actions"><Button variant="primary" onClick={() => setStep(3)}>{t("newSite.next")}</Button><Button onClick={restart}>{t("newSite.change")}</Button></div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label={t("newSite.name")} dir="ltr" value={name} onChange={event => setName(event.target.value.toLowerCase())} maxLength={30} autoComplete="off" data-autofocus hint={t("newSite.nameHint")} error={nameProblem} />
            {host && !nameProblem && <p><span className="muted">{t("newSite.url")}: </span><code className="mono" dir="ltr">https://{host}</code></p>}
            <p className="hint">{t("newSite.urlHint")}</p>
            <div className="form-actions">
              <Button variant="primary" busy={busy} disabled={!NAME.test(name)} onClick={deploy}>{busy ? t("newSite.deploying") : t("newSite.deploy")}</Button>
              <Button onClick={() => setStep(2)} disabled={busy}>{t("newSite.back")}</Button>
            </div>
          </>
        )}

        {step === 4 && job && (
          <>
            {job.status === "failed" ? (
              <>
                <Alert kind="danger"><strong>{t("newSite.failed")}</strong><span style={{ display: "block" }}>{t("newSite.failedText")}</span></Alert>
                {job.error && <details open><summary>{t("newSite.details")}</summary><pre className="code-block" dir="ltr" tabIndex={0}>{job.error.message}</pre></details>}
                <div className="form-actions"><Button variant="primary" onClick={() => { setJob(null); setStep(3); }}>{t("newSite.again")}</Button></div>
              </>
            ) : job.status === "done" ? (
              <>
                <Alert kind="success"><strong>{t("newSite.done")}</strong></Alert>
                <p><a href={job.result.url} target="_blank" rel="noopener noreferrer" className="mono" dir="ltr">{job.result.url}</a></p>
                {job.result.warnings?.length > 0 && <ul>{job.result.warnings.map(w => <li key={w} className="hint">{w}</li>)}</ul>}
                <div className="form-actions"><a className="btn btn-primary" href={job.result.url} target="_blank" rel="noopener noreferrer">{t("newSite.open")}</a><Link to="/" className="btn">{t("newSite.mySites")}</Link><Button onClick={restart}>{t("newSite.another")}</Button></div>
              </>
            ) : (
              <>
                <div className="row"><span className="spinner" aria-hidden="true" /><strong>{t(`newSite.phases.${job.phase}`)}</strong></div>
                <Meter percent={(PHASES.indexOf(job.phase) / (PHASES.length - 1)) * 100} label={t("newSite.deploying")} warnAt={101} dangerAt={101} />
                <p className="hint">{t("newSite.keepOpen")}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
