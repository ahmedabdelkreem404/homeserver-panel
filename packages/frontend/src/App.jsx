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
import UsersPage from "./pages/UsersPage.jsx";
import MySitesPage from "./pages/MySitesPage.jsx";
import NewSitePage from "./pages/NewSitePage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { isRootDomain } from "./lib/site.js";
import { canOpen, isHosting } from "./lib/access.js";
import { t } from "./i18n/index.js";

const ROUTES = { "/": DashboardPage, "/projects": ProjectsPage, "/mcp": McpPage, "/devices": DevicesPage, "/server": ServerPage, "/audit": AuditPage, "/users": UsersPage, "/settings": SettingsPage };

function Routes() {
  const { path } = useRouter();
  const { user } = useSession();
  const clean = path.replace(/\/+$/, "") || "/";
  // Hosting accounts have their sites, new site, MCP and Settings; any other role that cannot open a screen gets Settings.
  const Page = isHosting(user?.role) ? (clean === "/settings" ? SettingsPage : clean === "/new" && user?.role === "tenant" ? NewSitePage : clean === "/mcp" && user?.role === "tenant" ? McpPage : MySitesPage) : canOpen(user?.role, clean) ? ROUTES[clean] ?? NotFoundPage : SettingsPage;
  return <Shell><Page /></Shell>;
}

// Which screen shows depends only on how far the sign-in got.
function Gate() {
  const session = useSession();
  const { path } = useRouter();
  // The bare domain (and www) is the public storefront only: sign-in and the panel stay on the panel host.
  if (isRootDomain()) return <LandingPage />;
  if (session.status === "loading") return <main className="auth-page"><div className="auth-card"><Loading lines={3} /></div></main>;
  if (session.recoveryCodes) return <FirstLoginPage />;
  if (session.status === "anon") return path === "/landing" ? <LandingPage /> : <LoginPage />;
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
