import { useState } from "react";
import Alert from "../../components/Alert.jsx";
import Button from "../../components/Button.jsx";
import Dialog from "../../components/Dialog.jsx";
import { errorMessage } from "../../lib/api.js";
import { useApi } from "../../lib/apiContext.jsx";
import { useToast } from "../../lib/toast.jsx";
import { t } from "../../i18n/index.js";
import QuotaFields from "./QuotaFields.jsx";
import { asText, readQuota } from "./quotaFields.js";

export default function QuotaDialog({ user, onClose }) {
  const api = useApi();
  const toast = useToast();
  const [values, setValues] = useState(() => asText(user.tenant.quota));
  const [problem, setProblem] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const read = readQuota(values);
    if (read.problem) { setProblem(read.problem); return; }
    setProblem(null); setBusy(true); setFailure(null);
    try { await api.put(`/api/users/${user.id}/quota`, read.quota); toast.success(t("users.quotaDone")); onClose(true); } catch (error) { setFailure(error); setBusy(false); }
  };

  return (
    <Dialog title={t("users.quotaTitle")} onClose={() => !busy && onClose(false)} wide>
      <form className="form" onSubmit={submit} noValidate>
        <p className="mono">{user.email}</p>
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <QuotaFields values={values} onChange={setValues} problem={problem} />
        <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>{t("users.quotaSave")}</Button><Button onClick={() => onClose(false)} disabled={busy}>{t("common.cancel")}</Button></div>
      </form>
    </Dialog>
  );
}
