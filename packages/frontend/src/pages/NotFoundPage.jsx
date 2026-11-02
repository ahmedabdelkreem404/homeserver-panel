import { EmptyState } from "../components/States.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Link } from "../lib/router.jsx";
import { t } from "../i18n/index.js";

export default function NotFoundPage() {
  return (
    <div className="stack-lg">
      <PageHeader title={t("notFound.title")} />
      <div className="card"><EmptyState title={t("notFound.text")} action={<Link className="btn btn-primary" to="/">{t("notFound.home")}</Link>} /></div>
    </div>
  );
}
