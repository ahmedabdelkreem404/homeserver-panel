// MCP access keys and the hosted MCP's settings.
// The ONLY thing the panel may do to the protected project mcp-gateway is rotate DOKPLOY_MCP_HTTP_PATH of the app
// dokploy-mcp (rotatePath below). It is an explicit policy exception: it talks to Dokploy itself, touches that one
// environment line and nothing else, and is audited like any mutation. Nothing else on mcp-gateway is reachable.
import crypto from "node:crypto";
import { PanelError, REFUSAL_CODES } from "../errors.js";

const PATH_VAR = "DOKPLOY_MCP_HTTP_PATH";
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const newMcpPath = () => `/mcp-${Array.from(crypto.randomBytes(24), b => ALPHABET[b % ALPHABET.length]).join("")}`;

// Ready-to-paste client settings. For `claude mcp add` the name and URL come BEFORE the options (the header option is variadic on Windows).
export function clientConfigs({ url, apiKey, dokployUrl, serverName = "dokploy-remote" }) {
  const headers = { "X-Dokploy-Url": dokployUrl, "X-Dokploy-Api-Key": apiKey };
  return {
    claudeCode: `claude mcp add ${serverName} ${url} --transport http --header "X-Dokploy-Url: ${dokployUrl}" --header "X-Dokploy-Api-Key: ${apiKey}"`,
    codex: `[mcp_servers.${serverName}]\nurl = "${url}"\nhttp_headers = { "X-Dokploy-Url" = "${dokployUrl}", "X-Dokploy-Api-Key" = "${apiKey}" }\n`,
    cursor: JSON.stringify({ mcpServers: { [serverName]: { url, headers } } }, null, 2),
  };
}

export function createMcp({ gateway, client, audit, mcp, fetchImpl = globalThis.fetch, healthTimeoutMs = 180_000, healthPollMs = 3000, wait = sleep }) {
  // Finds the one allowed target by names; anything else is refused.
  async function findTarget() {
    const projects = await client.get("project.all");
    const project = (Array.isArray(projects) ? projects : []).find(p => String(p.name).toLowerCase() === mcp.projectName.toLowerCase());
    for (const e of project?.environments ?? []) for (const a of e.applications ?? []) {
      const full = await client.get("application.one", { applicationId: a.applicationId });
      if (String(full?.name).toLowerCase() === mcp.appName.toLowerCase()) return full;
    }
    throw new PanelError("policy_unresolved", "The MCP app was not found; refusing.");
  }
  const toUrl = path => `https://${mcp.publicHost}${path.startsWith("/") ? path : `/${path}`}`;
  const pathFrom = env => { const m = new RegExp(`^${PATH_VAR}=(.*)$`, "m").exec(String(env ?? "")); return m ? m[1].trim() : null; };

  return {
    listKeys: () => gateway.listApiKeys(),
    revokeKey: (ctx, apiKeyId) => gateway.deleteApiKey(ctx, { apiKeyId }),
    // Reads only the path variable of the MCP app; the rest of its environment is never exposed.
    async url() { const p = pathFrom((await findTarget()).env); return p ? toUrl(p) : null; },
    async createKey(ctx, { name, expiresInDays }) {
      const created = await gateway.createApiKey(ctx, { name, expiresInDays });
      const url = await this.url().catch(() => null);
      return { id: created.id, name: created.name, prefix: created.start ?? created.prefix ?? null, expiresAt: created.expiresAt ?? null, secret: created.key, url, configs: url ? clientConfigs({ url, apiKey: created.key, dokployUrl: mcp.dokployUrl }) : null };
    },

    async rotatePath(ctx, { confirm }) {
      if (confirm !== "ROTATE") throw new PanelError("invalid_request", 'Type ROTATE to confirm. Every connected client will lose access until it uses the new URL.');
      const id = audit.begin({ actor: ctx?.actor ?? "unknown", action: "mcp.rotate_path", target: `${mcp.projectName}/${mcp.appName}` });
      try {
        const app = await findTarget();
        const oldEnv = String(app.env ?? "");
        if (pathFrom(oldEnv) === null) throw new PanelError("policy_refused", `The MCP app has no ${PATH_VAR} to rotate.`);
        const newPath = newMcpPath();
        const env = oldEnv.split("\n").map(l => (l.startsWith(`${PATH_VAR}=`) ? `${PATH_VAR}=${newPath}` : l)).join("\n");
        await client.post("application.saveEnvironment", { applicationId: app.applicationId, env, buildArgs: app.buildArgs ?? null, buildSecrets: app.buildSecrets ?? null, createEnvFile: Boolean(app.createEnvFile) });
        await client.post("application.redeploy", { applicationId: app.applicationId, title: "Rotate MCP path" });
        const t0 = Date.now();
        let healthy = false;
        while (Date.now() - t0 < healthTimeoutMs && !healthy) {
          try { const r = await fetchImpl(mcp.healthUrl, { signal: AbortSignal.timeout(5000) }); healthy = r.ok && (await r.json())?.ok === true; } catch { /* still restarting */ }
          if (!healthy) await wait(healthPollMs);
        }
        if (!healthy) throw new PanelError("upstream_timeout", `The MCP did not become healthy after the change. The new path is ${PATH_VAR} in the app environment in Dokploy.`);
        audit.finish(id, "ok", { healthy: true });
        return { url: toUrl(newPath) };
      } catch (e) {
        audit.finish(id, REFUSAL_CODES.has(e?.code) ? "refused" : "error", { code: e?.code ?? "internal_error" });
        throw e;
      }
    },
  };
}
