// The bare domain (talabq.com, www.talabq.com) serves only the public landing page; the panel lives on panel.<domain>.
const host = () => (typeof window === "undefined" ? "" : window.location.hostname.toLowerCase());

export function isRootDomain(hostname = host()) {
  const parts = hostname.replace(/^www\./, "").split(".");
  return parts.length === 2 && parts.every(Boolean) && !/^\d+$/.test(parts[1]);
}

// Where the landing page sends a visitor to sign in: the panel host when on the bare domain, the same origin otherwise.
export function panelLoginUrl(hostname = host()) {
  return isRootDomain(hostname) ? `https://panel.${hostname.replace(/^www\./, "")}/login` : "/login";
}
