import PageHeader from "../components/PageHeader.jsx";
import { useApi } from "../lib/apiContext.jsx";
import { useSession } from "../lib/session.jsx";
import { useResource } from "../lib/useResource.js";
import BackupCard from "./settings/BackupCard.jsx";
import PasswordCard from "./settings/PasswordCard.jsx";
import RecoveryCard from "./settings/RecoveryCard.jsx";
import SessionsCard from "./settings/SessionsCard.jsx";
import { t } from "../i18n/index.js";

export default function SettingsPage() {
  const api = useApi();
  const { user } = useSession();
  const sessions = useResource(() => api.get("/api/auth/sessions"));

  return (
    <div className="stack-lg">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="card stack">
        <div className="card-title"><h2>{t("settings.account.title")}</h2></div>
        <dl className="kv">
          <dt>{t("settings.account.email")}</dt><dd className="mono">{user.email}</dd>
          <dt>{t("settings.account.role")}</dt><dd>{user.role === "owner" ? t("settings.account.owner") : user.role}</dd>
        </dl>
      </div>
      <PasswordCard onChanged={sessions.refresh} />
      <SessionsCard resource={sessions} />
      <RecoveryCard />
      <BackupCard />
    </div>
  );
}
