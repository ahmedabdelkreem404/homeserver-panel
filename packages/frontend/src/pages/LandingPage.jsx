import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import { useRouter } from "../lib/router.jsx";
import { panelLoginUrl } from "../lib/site.js";
import { t } from "../i18n/index.js";

export default function LandingPage() {
  const { navigate } = useRouter();

  const goLogin = () => {
    const target = panelLoginUrl();
    if (target.startsWith("http")) window.location.href = target;
    else navigate(target);
  };

  return (
    <div className="landing-wrap" dir="rtl" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Top Navbar */}
      <header className="landing-nav row" style={{ justifyContent: "space-between", alignItems: "center", padding: "var(--space-4) var(--space-6)", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ display: "inline-flex", padding: "6px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)", color: "var(--accent)" }}>
            <Icon name="server" size={24} />
          </span>
          <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.5px" }}>{t("landing.brand")}</span>
          <span className="badge badge-info font-mono" style={{ fontSize: "11px" }}>Cloud VPS</span>
        </div>
        <div className="row" style={{ gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={goLogin}>
            <Icon name="user" size={16} />
            {t("landing.ctaLogin")}
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero stack" style={{ textAlign: "center", padding: "var(--space-7) var(--space-4)", maxWidth: "960px", margin: "0 auto", gap: "var(--space-4)" }}>
        <div>
          <span className="badge badge-success" style={{ padding: "6px 16px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
            {t("landing.badge")}
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, lineHeight: 1.25, margin: 0, color: "var(--text)" }}>
          {t("landing.title")}
        </h1>
        <p className="muted" style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", maxWidth: "760px", margin: "0 auto", lineHeight: 1.6 }}>
          {t("landing.subtitle")}
        </p>
        <div className="row" style={{ justifyContent: "center", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <Button variant="primary" size="lg" onClick={goLogin} style={{ padding: "12px 36px", fontSize: "var(--text-md)", fontWeight: 600 }}>
            {t("landing.ctaStart")}
          </Button>
          <Button size="lg" onClick={goLogin} style={{ padding: "12px 28px", fontSize: "var(--text-md)" }}>
            {t("landing.ctaLogin")}
          </Button>
        </div>
      </section>

      {/* Main Unified Hosting Plan Card */}
      <section style={{ padding: "var(--space-4) var(--space-4)", maxWidth: "860px", margin: "0 auto" }}>
        <div
          className="card stack"
          style={{
            padding: "var(--space-6)",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface)",
            border: "2px solid var(--accent)",
            boxShadow: "var(--shadow-2)",
            gap: "var(--space-4)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: "var(--space-2)" }}>{t("landing.planBadge")}</span>
              <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, margin: 0 }}>{t("landing.planTitle")}</h2>
            </div>
            <Button variant="primary" size="lg" onClick={goLogin}>
              {t("landing.planAction")}
            </Button>
          </div>
          <p className="muted" style={{ fontSize: "var(--text-md)", lineHeight: 1.6 }}>{t("landing.planDesc")}</p>

          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: 0 }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)", fontSize: "var(--text-sm)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f1")}</span>
            </div>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f2")}</span>
            </div>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f3")}</span>
            </div>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f4")}</span>
            </div>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f5")}</span>
            </div>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)", fontWeight: "bold" }}>✓</span>
              <span>{t("landing.planFeatures.f6")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section style={{ padding: "var(--space-7) var(--space-4)", maxWidth: "1080px", margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", marginBottom: "var(--space-6)", fontSize: "var(--text-2xl)", fontWeight: 700 }}>
          {t("landing.featuresTitle")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-4)" }}>
          {/* 1-click & Zip */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--accent)" }}><Icon name="bolt" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featDeployTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featDeployDesc")}</p>
          </div>

          {/* Dedicated DB */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)" }}><Icon name="server" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featDbTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featDbDesc")}</p>
          </div>

          {/* AI / MCP integration */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--warning)" }}><Icon name="key" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featMcpTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featMcpDesc")}</p>
          </div>

          {/* Terminal */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--info)" }}><Icon name="terminal" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featTerminalTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featTerminalDesc")}</p>
          </div>

          {/* Speed & Live stats */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--accent)" }}><Icon name="network" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featSpeedTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featSpeedDesc")}</p>
          </div>

          {/* Security */}
          <div className="card stack" style={{ padding: "var(--space-5)", background: "var(--surface)", gap: "var(--space-2)", borderRadius: "var(--radius-md)" }}>
            <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
              <span style={{ color: "var(--success)" }}><Icon name="lock" size={22} /></span>
              <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.featSecurityTitle")}</strong>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{t("landing.featSecurityDesc")}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "var(--space-6) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <p style={{ margin: 0 }}>{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
