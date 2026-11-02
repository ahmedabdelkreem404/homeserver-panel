import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Dialog from "../../components/Dialog.jsx";
import Field from "../../components/Field.jsx";
import { EmptyState, ErrorState, Loading } from "../../components/States.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { useToast } from "../../lib/toast.jsx";
import { useResource } from "../../lib/useResource.js";
import { t } from "../../i18n/index.js";

// Owner only: the sites an account owns, handing an existing app over, and taking one back. Apps in protected projects
// are not offered (the server refuses them too).
export default function SitesDialog({ user, onClose }) {
  const api = useApi();
  const toast = useToast();
  const owned = useResource(() => api.get(`/api/users/${user.id}/sites`));
  const projects = useResource(() => api.get("/api/projects"));
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const ownedIds = new Set((owned.data?.sites ?? []).map(s => s.applicationId));
  const candidates = (projects.data?.projects ?? []).filter(p => !p.protected).flatMap(p => p.environments.flatMap(e => e.applications.map(a => ({ id: a.applicationId, label: `${p.name} / ${a.name}` })))).filter(a => !ownedIds.has(a.id));

  const change = async (work, message) => {
    setBusy(true); setFailure(null);
    try { await work(); toast.success(message); setChoice(""); owned.refresh(); } catch (error) { setFailure(error); } finally { setBusy(false); }
  };

  return (
    <Dialog title={t("users.sitesTitle", { email: user.email })} onClose={() => !busy && onClose()} wide>
      <div className="stack">
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        {owned.error && !owned.data ? <ErrorState error={owned.error} onRetry={owned.refresh} /> : !owned.data ? <Loading lines={2} /> : !owned.data.sites.length ? <EmptyState title={t("users.sitesEmpty")} /> : (
          <ul className="plain-list">
            {owned.data.sites.map(site => (
              <li key={site.applicationId} className="row-between" data-testid={`owned-${site.applicationId}`}>
                <span className="mono">{site.name}</span>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => change(() => api.del(`/api/users/${user.id}/sites/${site.applicationId}`), t("users.sitesTaken"))}>{t("users.sitesTake")}</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <Field as="select" label={t("users.sitesAssign")} value={choice} onChange={event => setChoice(event.target.value)} hint={t("users.sitesHint")}>
              <option value="">{t("users.sitesPick")}</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Field>
          </div>
          <Button variant="primary" disabled={!choice} busy={busy} onClick={() => change(() => api.post(`/api/users/${user.id}/sites`, { applicationId: choice }), t("users.sitesGiven"))}>{t("users.sitesGive")}</Button>
        </div>
        <div className="form-actions"><Button onClick={() => onClose()}>{t("common.close")}</Button></div>
      </div>
    </Dialog>
  );
}
