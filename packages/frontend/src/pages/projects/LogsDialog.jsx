import { useEffect, useRef, useState } from "react";
import Badge from "../../components/Badge.jsx";
import Button from "../../components/Button.jsx";
import Dialog from "../../components/Dialog.jsx";
import Field from "../../components/Field.jsx";
import { ErrorState, Loading } from "../../components/States.jsx";
import { useApi } from "../../lib/apiContext.jsx";
import { useResource } from "../../lib/useResource.js";
import { t } from "../../i18n/index.js";

const TAILS = [100, 200, 500, 1000];
const SINCE = [["", "projects.logs.all"], ["10m", "projects.logs.last10m"], ["1h", "projects.logs.last1h"], ["1d", "projects.logs.last1d"]];

// Runtime and build logs of one app, read only. The backend clamps the line count.
export default function LogsDialog({ app, onClose, basePath = "/api/projects/apps" }) {
  const api = useApi();
  const [type, setType] = useState("runtime");
  const [tail, setTail] = useState(200);
  const [since, setSince] = useState("");
  const view = useRef(null);

  const query = new URLSearchParams({ type, tail: String(tail), ...(type === "runtime" && since ? { since } : {}) }).toString();
  const { data, error, loading, refresh } = useResource(() => api.get(`${basePath}/${app.applicationId}/logs?${query}`), { deps: [query] });
  useEffect(() => { if (view.current) view.current.scrollTop = view.current.scrollHeight; }, [data]);

  return (
    <Dialog title={t("projects.logs.title", { name: app.name })} onClose={onClose} wide>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t("projects.logs.title", { name: app.name })}>
          {["runtime", "build"].map(key => <button key={key} type="button" aria-pressed={type === key} onClick={() => setType(key)}>{t(`projects.logs.${key}`)}</button>)}
        </div>
        <div style={{ inlineSize: 140 }}>
          <Field as="select" label={t("projects.logs.tail")} value={tail} onChange={event => setTail(Number(event.target.value))}>{TAILS.map(n => <option key={n} value={n}>{n}</option>)}</Field>
        </div>
        {type === "runtime" && (
          <div style={{ inlineSize: 170 }}>
            <Field as="select" label={t("projects.logs.since")} value={since} onChange={event => setSince(event.target.value)}>{SINCE.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</Field>
          </div>
        )}
        <Button onClick={refresh} busy={loading && !!data}>{t("common.refresh")}</Button>
        {type === "build" && data?.deploymentStatus && <Badge kind={data.deploymentStatus === "done" ? "success" : data.deploymentStatus === "error" ? "danger" : "info"}>{t("projects.logs.deployStatus")}: {data.deploymentStatus}</Badge>}
      </div>
      {error && !data ? <ErrorState error={error} onRetry={refresh} /> : !data ? <Loading lines={6} /> : (
        <pre className="code-block code-block-log" ref={view} tabIndex={0} aria-label={t("projects.logs.title", { name: app.name })}>{data.text.trim() ? data.text : t("projects.logs.empty")}</pre>
      )}
    </Dialog>
  );
}
