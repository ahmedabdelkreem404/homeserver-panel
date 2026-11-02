import { useState } from "react";
import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import { Link, useRouter } from "../lib/router.jsx";
import { t } from "../i18n/index.js";

export default function LandingPage() {
  const { navigate } = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("shared");

  return (
    <div className="landing-wrap" dir="rtl" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Top Navbar */}
      <header className="landing-nav row" style={{ justifyContent: "space-between", alignItems: "center", padding: "var(--space-4) var(--space-6)", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ display: "inline-flex", padding: "6px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)", color: "var(--accent)" }}>
            <Icon name="server" size={24} />
          </span>
          <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.5px" }}>{t("landing.brand")}</span>
          <span className="badge badge-info font-mono" style={{ fontSize: "11px" }}>v2.0</span>
        </div>
        <div className="row" style={{ gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={() => navigate("/login")}>
            <Icon name="user" size={16} />
            {t("landing.ctaLogin")}
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero stack" style={{ textAlign: "center", padding: "var(--space-7) var(--space-4)", maxWidth: "960px", margin: "0 auto", gap: "var(--space-4)" }}>
        <div>
          <span className="badge badge-success" style={{ padding: "4px 14px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
            {t("landing.badge")}
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 800, lineHeight: 1.2, margin: 0, color: "var(--text)" }}>
          {t("landing.title")}
        </h1>
        <p className="muted" style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", maxWidth: "760px", margin: "0 auto", lineHeight: 1.6 }}>
          {t("landing.subtitle")}
        </p>
        <div className="row" style={{ justifyContent: "center", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <Button variant="primary" size="lg" onClick={() => navigate("/login")} style={{ padding: "12px 32px", fontSize: "var(--text-md)" }}>
            {t("landing.ctaStart")}
          </Button>
          <Button size="lg" onClick={() => navigate("/login")} style={{ padding: "12px 24px", fontSize: "var(--text-md)" }}>
            {t("landing.ctaLogin")}
          </Button>
        </div>
      </section>

      {/* Hosting Plans Comparison */}
      <section className="landing-plans" style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "1100px", margin: "0 auto" }}>
        <div className="stack" style={{ textAlign: "center", marginBottom: "var(--space-6)", gap: "var(--space-2)" }}>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{t("landing.plansTitle")}</h2>
          <p className="muted" style={{ maxWidth: "600px", margin: "0 auto" }}>{t("landing.plansSubtitle")}</p>
        </div>

        <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-4)" }}>
          {/* Shared Hosting Card */}
          <div
            className={`card stack ${selectedPlan === "shared" ? "plan-active" : ""}`}
            style={{
              padding: "var(--space-5)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
              border: selectedPlan === "shared" ? "2px solid var(--accent)" : "1px solid var(--border)",
              boxShadow: "var(--shadow-1)",
              gap: "var(--space-3)",
              cursor: "pointer",
            }}
            onClick={() => setSelectedPlan("shared")}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge badge-info">{t("landing.shared.badge")}</span>
              <Icon name="network" size={20} className="muted" />
            </div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>{t("landing.shared.title")}</h3>
            <p className="muted" style={{ fontSize: "var(--text-sm)", minHeight: "42px" }}>{t("landing.shared.desc")}</p>
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "var(--space-2) 0" }} />
            <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none", padding: 0, margin: 0, fontSize: "var(--text-sm)" }}>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.shared.feature1")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.shared.feature2")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.shared.feature3")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.shared.feature4")}</li>
            </ul>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Button variant="primary" style={{ width: "100%" }} onClick={() => navigate("/login")}>
                {t("landing.shared.action")}
              </Button>
            </div>
          </div>

          {/* Cloud VPS Container Card */}
          <div
            className={`card stack ${selectedPlan === "vps" ? "plan-active" : ""}`}
            style={{
              padding: "var(--space-5)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
              border: selectedPlan === "vps" ? "2px solid var(--accent)" : "1px solid var(--border)",
              boxShadow: "var(--shadow-2)",
              gap: "var(--space-3)",
              position: "relative",
              cursor: "pointer",
            }}
            onClick={() => setSelectedPlan("vps")}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge badge-success">{t("landing.vps.badge")}</span>
              <Icon name="terminal" size={20} className="muted" />
            </div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>{t("landing.vps.title")}</h3>
            <p className="muted" style={{ fontSize: "var(--text-sm)", minHeight: "42px" }}>{t("landing.vps.desc")}</p>
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "var(--space-2) 0" }} />
            <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none", padding: 0, margin: 0, fontSize: "var(--text-sm)" }}>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.vps.feature1")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.vps.feature2")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.vps.feature3")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.vps.feature4")}</li>
            </ul>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Button variant="primary" style={{ width: "100%" }} onClick={() => navigate("/login")}>
                {t("landing.vps.action")}
              </Button>
            </div>
          </div>

          {/* AI MCP Hosting Card */}
          <div
            className={`card stack ${selectedPlan === "ai" ? "plan-active" : ""}`}
            style={{
              padding: "var(--space-5)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
              border: selectedPlan === "ai" ? "2px solid var(--accent)" : "1px solid var(--border)",
              boxShadow: "var(--shadow-1)",
              gap: "var(--space-3)",
              cursor: "pointer",
            }}
            onClick={() => setSelectedPlan("ai")}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge badge-warning">{t("landing.ai.badge")}</span>
              <Icon name="key" size={20} className="muted" />
            </div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: 0 }}>{t("landing.ai.title")}</h3>
            <p className="muted" style={{ fontSize: "var(--text-sm)", minHeight: "42px" }}>{t("landing.ai.desc")}</p>
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "var(--space-2) 0" }} />
            <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none", padding: 0, margin: 0, fontSize: "var(--text-sm)" }}>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.ai.feature1")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.ai.feature2")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.ai.feature3")}</li>
              <li className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}><span style={{ color: "var(--success)" }}>✓</span> {t("landing.ai.feature4")}</li>
            </ul>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Button variant="primary" style={{ width: "100%" }} onClick={() => navigate("/login")}>
                {t("landing.ai.action")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars */}
      <section style={{ padding: "var(--space-6) var(--space-4)", background: "var(--surface-2)", marginTop: "var(--space-6)" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", marginBottom: "var(--space-5)", fontSize: "var(--text-xl)", fontWeight: 700 }}>
            {t("landing.featuresTitle")}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
            <div className="card stack" style={{ padding: "var(--space-4)", background: "var(--surface)", gap: "var(--space-2)" }}>
              <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span style={{ color: "var(--accent)" }}><Icon name="bolt" size={20} /></span>
                <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.speedTitle")}</strong>
              </div>
              <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{t("landing.speedDesc")}</p>
            </div>

            <div className="card stack" style={{ padding: "var(--space-4)", background: "var(--surface)", gap: "var(--space-2)" }}>
              <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span style={{ color: "var(--success)" }}><Icon name="lock" size={20} /></span>
                <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.securityTitle")}</strong>
              </div>
              <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{t("landing.securityDesc")}</p>
            </div>

            <div className="card stack" style={{ padding: "var(--space-4)", background: "var(--surface)", gap: "var(--space-2)" }}>
              <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <span style={{ color: "var(--info)" }}><Icon name="download" size={20} /></span>
                <strong style={{ fontSize: "var(--text-md)" }}>{t("landing.backupTitle")}</strong>
              </div>
              <p className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{t("landing.backupDesc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "var(--space-5) var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
        <p>{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
