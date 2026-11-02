import { useEffect } from "react";
import Icon from "../components/Icon.jsx";
import { t } from "../i18n/index.js";

export function BrandMark() {
  return (
    <div className="brand">
      <span className="brand-mark"><Icon name="server" className="nav-icon" /></span>
      <span>{t("app.name")}</span>
    </div>
  );
}

// The frame for every sign-in screen. The main heading takes focus so screen readers announce each new step.
export default function AuthLayout({ title, subtitle, children, wide = false }) {
  useEffect(() => { document.querySelector("[data-page-title]")?.focus(); }, [title]);
  return (
    <main className="auth-page">
      <div className="auth-card" style={wide ? { inlineSize: "min(560px, 100%)" } : undefined}>
        <BrandMark />
        <div className="card stack-lg">
          <div className="stack">
            <h1 tabIndex={-1} data-page-title>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
