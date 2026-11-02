// Tailscale devices, read only (D10): an OAuth client-credentials token (kept until it expires) and the device list.
// Only the server's own tailnet address is returned; other devices show name, system, online state and tags.
import { PanelError } from "../errors.js";

const API = "https://api.tailscale.com/api/v2";

export function createTailscale({ settings, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  let token;

  async function accessToken() {
    if (token && token.expiresAt - now().getTime() > 60_000) return token.value;
    const res = await fetchImpl(`${API}/oauth/token`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, grant_type: "client_credentials", scope: "devices:core:read" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new PanelError("upstream_auth_failed", "Tailscale did not accept the OAuth client.");
    const j = await res.json();
    token = { value: j.access_token, expiresAt: now().getTime() + Number(j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return {
    configured: Boolean(settings),
    adminUrl: "https://login.tailscale.com/admin/machines",
    async devices() {
      if (!settings) return { configured: false, devices: [] };
      let res;
      try { res = await fetchImpl(`${API}/tailnet/-/devices`, { headers: { authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(10_000) }); }
      catch (e) { if (e instanceof PanelError) throw e; throw new PanelError("upstream_unreachable", "Cannot reach Tailscale."); }
      if (res.status === 401) token = undefined;
      if (!res.ok) throw new PanelError(res.status === 401 || res.status === 403 ? "upstream_auth_failed" : "upstream_error", `Tailscale answered ${res.status}.`);
      const body = await res.json();
      return {
        configured: true, adminUrl: this.adminUrl,
        devices: (body.devices ?? []).map(d => ({
          name: d.hostname, os: d.os, online: Boolean(d.connectedToControl), lastSeen: d.lastSeen ?? null, tags: d.tags ?? [],
          ip: d.hostname === settings.serverHostname ? (d.addresses ?? []).find(a => a.startsWith("100.")) ?? null : null,
        })),
      };
    },
  };
}
