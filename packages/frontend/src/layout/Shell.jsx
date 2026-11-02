import { useEffect, useState } from "react";
import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import { BrandMark } from "./AuthLayout.jsx";
import { Link, useRouter } from "../lib/router.jsx";
import { useSession } from "../lib/session.jsx";
import { applyTheme, readTheme, THEMES } from "../lib/theme.js";
import { canOpen } from "../lib/access.js";
import { t } from "../i18n/index.js";

export const NAV = [
  { to: "/", key: "dashboard", icon: "dashboard" },
  { to: "/projects", key: "projects", icon: "projects" },
  { to: "/mcp", key: "mcp", icon: "key" },
  { to: "/devices", key: "devices", icon: "devices" },
  { to: "/server", key: "server", icon: "server" },
  { to: "/audit", key: "audit", icon: "audit" },
  { to: "/users", key: "users", icon: "users" },
  { to: "/settings", key: "settings", icon: "settings" },
];

const isActive = (path, to) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

function ThemeSwitch() {
  const [theme, setTheme] = useState(readTheme);
  const choose = next => { setTheme(next); applyTheme(next); };
  const labels = { system: t("common.themeSystem"), light: t("common.themeLight"), dark: t("common.themeDark") };
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <span className="hint">{t("common.theme")}</span>
      <div className="segmented" role="group" aria-label={t("common.theme")}>
        {THEMES.map(key => <button key={key} type="button" aria-pressed={theme === key} onClick={() => choose(key)}>{labels[key]}</button>)}
      </div>
    </div>
  );
}

// The frame around every signed-in page: sidebar on wide screens, a slide-over menu on phones.
export default function Shell({ children }) {
  const { path } = useRouter();
  const session = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); document.querySelector("[data-page-title]")?.focus({ preventScroll: true }); }, [path]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="shell">
      <a className="skip-link" href="#content">{t("app.skip")}</a>
      <div className="drawer-backdrop" data-open={open} onClick={() => setOpen(false)} />
      <aside className="sidebar" data-open={open} id="sidebar">
        <BrandMark />
        <nav className="nav" aria-label={t("nav.main")}>
          {NAV.filter(item => canOpen(session.user?.role, item.to)).map(item => (
            <Link key={item.to} to={item.to} aria-current={isActive(path, item.to) ? "page" : undefined}>
              <Icon name={item.icon} />{t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ThemeSwitch />
          <span className="muted ltr" title={session.user?.email}>{session.user?.email}</span>
          <Button onClick={() => session.logout()}><Icon name="logout" className="nav-icon" size={18} />{t("nav.logout")}</Button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <BrandMark />
          <Button icon variant="ghost" aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(o => !o)}><Icon name={open ? "close" : "menu"} /></Button>
        </header>
        <main className="content" id="content">{children}</main>
      </div>
    </div>
  );
}
