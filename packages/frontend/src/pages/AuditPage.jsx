import { useCallback, useEffect, useState } from "react";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Explainer from "../components/Explainer.jsx";
import Field from "../components/Field.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { EmptyState, ErrorState, Loading } from "../components/States.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { formatDateTime } from "../lib/format.js";
import { t } from "../i18n/index.js";

const RESULT_KIND = { ok: "success", refused: "warning", error: "danger", pending: "info" };
const EMPTY_FILTERS = { action: "", result: "", from: "", to: "" };

function queryString(filters, before) {
  const params = new URLSearchParams({ limit: "50" });
  if (filters.action.trim()) params.set("action", filters.action.trim());
  if (filters.result) params.set("result", filters.result);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00+02:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59+02:00`).toISOString());
  if (before) params.set("before", String(before));
  return params.toString();
}

function detailText(detail) { return detail && Object.keys(detail).length ? JSON.stringify(detail) : "—"; }

// The audit log: newest first, filtered on the server, loaded 50 at a time.
export default function AuditPage() {
  const api = useApi();
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [state, setState] = useState({ items: [], nextBefore: null, loading: true, error: null });

  const load = useCallback(async (active, before) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const page = await api.get(`/api/audit?${queryString(active, before)}`);
      setState(s => ({ items: before ? [...s.items, ...page.items] : page.items, nextBefore: page.nextBefore, loading: false, error: null }));
    } catch (error) { setState(s => ({ ...s, loading: false, error })); }
  }, [api]);

  useEffect(() => { load(filters, null); }, [filters, load]);

  const set = key => event => setDraft(d => ({ ...d, [key]: event.target.value }));
  const apply = event => { event.preventDefault(); setFilters(draft); };
  const clear = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); };

  return (
    <div className="stack-lg">
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <form className="card toolbar" onSubmit={apply}>
        <div style={{ flex: "1 1 200px" }}><Field label={t("audit.filterAction")} value={draft.action} onChange={set("action")} dir="ltr" placeholder={t("audit.filterActionHint")} maxLength={64} /></div>
        <div style={{ flex: "0 1 160px" }}>
          <Field as="select" label={t("audit.filterResult")} value={draft.result} onChange={set("result")}>
            <option value="">{t("audit.allResults")}</option>
            {Object.keys(RESULT_KIND).map(key => <option key={key} value={key}>{t(`audit.results.${key}`)}</option>)}
          </Field>
        </div>
        <div style={{ flex: "0 1 170px" }}><Field label={t("audit.filterFrom")} type="date" value={draft.from} onChange={set("from")} dir="ltr" /></div>
        <div style={{ flex: "0 1 170px" }}><Field label={t("audit.filterTo")} type="date" value={draft.to} onChange={set("to")} dir="ltr" /></div>
        <Button type="submit" variant="primary">{t("audit.apply")}</Button>
        <Button onClick={clear}>{t("audit.clear")}</Button>
      </form>
      <div className="card stack">
        {state.error && !state.items.length ? <ErrorState error={state.error} onRetry={() => load(filters, null)} /> : !state.items.length && state.loading ? <Loading lines={5} /> : !state.items.length ? <EmptyState icon="audit" title={t("audit.empty")} /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("audit.time")}</th><th>{t("audit.actor")}</th><th>{t("audit.action")}</th><th>{t("audit.target")}</th><th>{t("audit.result")}</th><th>{t("audit.detail")}</th></tr></thead>
                <tbody>
                  {state.items.map(row => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.at)}</td>
                      <td className="mono">{row.actor}</td>
                      <td className="mono">{row.action}</td>
                      <td className="mono">{row.target ?? "—"}</td>
                      <td><span className="row" style={{ gap: "var(--space-1)" }}><Badge kind={RESULT_KIND[row.result] ?? "neutral"}>{t(`audit.results.${row.result}`)}</Badge>{row.result === "pending" && <Explainer text={t("audit.explainPending")} />}</span></td>
                      <td className="mono muted" style={{ maxInlineSize: 280, overflowWrap: "anywhere" }}>{detailText(row.detail)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state.error && <ErrorState error={state.error} onRetry={() => load(filters, state.nextBefore)} />}
            {state.nextBefore && <Button onClick={() => load(filters, state.nextBefore)} busy={state.loading}>{t("audit.loadMore")}</Button>}
          </>
        )}
      </div>
    </div>
  );
}
