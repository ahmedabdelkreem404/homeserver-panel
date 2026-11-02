import { useMemo, useRef } from "react";
import { Loading } from "./components/States.jsx";
import Shell from "./layout/Shell.jsx";
import { createApi } from "./lib/api.js";
import { ApiProvider } from "./lib/apiContext.jsx";
import { RouterProvider, useRouter } from "./lib/router.jsx";
import { SessionProvider, useSession } from "./lib/session.jsx";
import { ToastProvider } from "./lib/toast.jsx";
import AuditPage from "./pages/AuditPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DevicesPage from "./pages/DevicesPage.jsx";
import FirstLoginPage from "./pages/FirstLoginPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import McpPage from "./pages/McpPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ServerPage from "./pages/ServerPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import TotpPage from "./pages/TotpPage.jsx";
import { t } from "./i18n/index.js";

const ROUTES = { "/": DashboardPage, "/projects": ProjectsPage, "/mcp": McpPage, "/devices": DevicesPage, "/server": ServerPage, "/audit": AuditPage, "/settings": SettingsPage };

function Routes() {
  const { path } = useRouter();
  const Page = ROUTES[path.replace(/\/+$/, "") || "/"] ?? NotFoundPage;
  return <Shell><Page /></Shell>;
}

// Which screen shows depends only on how far the sign-in got.
function Gate() {
  const session = useSession();
  if (session.status === "loading") return <main className="auth-page"><div className="auth-card"><Loading lines={3} /></div></main>;
  if (session.recoveryCodes) return <FirstLoginPage />;
  if (session.status === "anon") return <LoginPage />;
  if (session.status === "pending") return session.next === "totp_verify" ? <TotpPage /> : <FirstLoginPage />;
  return <Routes />;
}

// api and fetchImpl exist for tests: the real app passes neither.
export default function App({ api: providedApi, fetchImpl }) {
  const unauthenticated = useRef(() => {});
  const api = useMemo(() => providedApi ?? createApi({ fetchImpl, onUnauthenticated: () => unauthenticated.current() }), [providedApi, fetchImpl]);
  const register = useMemo(() => handler => { unauthenticated.current = handler; return () => { unauthenticated.current = () => {}; }; }, []);
  document.title = t("app.name");
  return (
    <ApiProvider value={api}>
      <ToastProvider>
        <RouterProvider>
          <SessionProvider api={api} registerUnauthenticated={register}><Gate /></SessionProvider>
        </RouterProvider>
      </ToastProvider>
    </ApiProvider>
  );
}
