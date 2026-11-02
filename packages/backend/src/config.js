// Configuration comes from environment variables only. Every problem is collected and reported by variable NAME;
// values are never echoed. The built-in protected names can be extended by the environment, never shrunk.
import { PanelError } from "./errors.js";
import { isValidHashFormat } from "./auth/password.js";
import { parseSecretKey } from "./auth/secretbox.js";

export const BUILT_IN_PROTECTED_PROJECTS = Object.freeze(["infra", "mcp-gateway", "homeserver-panel", "shared-services"]);
export const BUILT_IN_PROTECTED_KEYS = Object.freeze(["claude-code", "remote-test", "homeserver-panel", "deploy-cli", "panel-runtime"]);
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

export const normalizeName = s => String(s ?? "").trim().toLowerCase();
const csv = value => String(value ?? "").split(",").map(normalizeName).filter(Boolean);

// The key travels in a header, so plain http is only accepted for private, loopback, Tailscale or Docker-internal hosts.
export function checkDokployUrl(url) {
  let u;
  try { u = new URL(url); } catch { return "is not a valid URL"; }
  if (u.protocol === "https:") return null;
  if (u.protocol !== "http:") return "must start with http:// or https://";
  const h = u.hostname.toLowerCase();
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  const [a, b] = m ? [Number(m[1]), Number(m[2])] : [-1, -1];
  const privateIp = a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
  const internalName = h === "localhost" || h === "dokploy" || h.endsWith(".ts.net");
  return privateIp || internalName ? null : "uses plain http to a public host; use https or a private, Tailscale or Docker-internal address";
}

export function loadConfig(env = process.env) {
  const problems = [];
  const bad = (name, why) => problems.push(`${name} ${why}`);

  const key = env.DOKPLOY_API_KEY ?? "";
  if (key.length < 16) bad("DOKPLOY_API_KEY", key ? "is too short to be a Dokploy key" : "is required");

  const url = (env.DOKPLOY_URL || "http://dokploy:3000").replace(/\/+$/, "");
  const urlProblem = checkDokployUrl(url);
  if (urlProblem) bad("DOKPLOY_URL", urlProblem);

  const port = env.PORT === undefined || env.PORT === "" ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) bad("PORT", "must be an integer from 1 to 65535");

  const logLevel = env.LOG_LEVEL || "info";
  if (!LOG_LEVELS.includes(logLevel)) bad("LOG_LEVEL", `must be one of ${LOG_LEVELS.join(", ")}`);

  const timeoutMs = env.DOKPLOY_TIMEOUT_MS ? Number(env.DOKPLOY_TIMEOUT_MS) : 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 120_000) bad("DOKPLOY_TIMEOUT_MS", "must be an integer from 500 to 120000");

  const secretKey = parseSecretKey(env.PANEL_SECRET_KEY);
  if (!secretKey) bad("PANEL_SECRET_KEY", env.PANEL_SECRET_KEY ? "must be 32 random bytes as hex (64 characters) or base64" : "is required");

  const ownerEmail = (env.OWNER_EMAIL ?? "").trim(), ownerHash = (env.OWNER_PASSWORD_HASH ?? "").trim();
  if ((ownerEmail && !ownerHash) || (!ownerEmail && ownerHash)) bad("OWNER_EMAIL / OWNER_PASSWORD_HASH", "must be set together");
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) bad("OWNER_EMAIL", "is not a valid email address");
  if (ownerHash && !isValidHashFormat(ownerHash)) bad("OWNER_PASSWORD_HASH", "is not an argon2id hash made by this panel");

  const baseDomain = (env.BASE_DOMAIN || "talabq.com").trim().toLowerCase();
  if (!/^[a-z0-9.-]+.[a-z]{2,}$/.test(baseDomain)) bad("BASE_DOMAIN", "is not a valid domain");
  const tsId = env.TAILSCALE_OAUTH_CLIENT_ID ?? "", tsSecret = env.TAILSCALE_OAUTH_CLIENT_SECRET ?? "";
  if ((tsId && !tsSecret) || (!tsId && tsSecret)) bad("TAILSCALE_OAUTH_CLIENT_ID / TAILSCALE_OAUTH_CLIENT_SECRET", "must be set together");

  if (problems.length) throw new PanelError("config_invalid", `Invalid configuration: ${problems.join("; ")}.`);

  return Object.freeze({
    port,
    host: env.HOST || "0.0.0.0",
    logLevel,
    dataDir: env.DATA_DIR || "./data",
    dokploy: Object.freeze({ url, key, timeoutMs }),
    secretKey,
    baseDomain,
    timeZone: env.STATUS_TIMEZONE || "Africa/Cairo",
    staticDir: env.STATIC_DIR || null,
    hostProc: env.HOST_PROC || "/host/proc",
    hostSys: env.HOST_SYS || "/host/sys",
    tailscale: tsId ? Object.freeze({ clientId: tsId, clientSecret: tsSecret, serverHostname: env.TAILSCALE_SERVER_HOSTNAME || "homeserver" }) : null,
    mcp: Object.freeze({
      projectName: env.MCP_PROJECT_NAME || "mcp-gateway",
      appName: env.MCP_APP_NAME || "dokploy-mcp",
      publicHost: env.MCP_PUBLIC_HOST || "mcp.talabq.com",
      dokployUrl: env.MCP_DOKPLOY_URL || "http://dokploy:3000",
      healthUrl: env.MCP_HEALTH_URL || `https://${env.MCP_PUBLIC_HOST || "mcp.talabq.com"}/health`,
    }),
    owner: ownerEmail ? Object.freeze({ email: ownerEmail, passwordHash: ownerHash }) : null,
    protectedProjectNames: Object.freeze(new Set([...BUILT_IN_PROTECTED_PROJECTS, ...csv(env.PROTECTED_PROJECT_NAMES)])),
    protectedKeyNames: Object.freeze(new Set([...BUILT_IN_PROTECTED_KEYS, ...csv(env.PROTECTED_KEY_NAMES)])),
    audit: Object.freeze({ retentionDays: 90, maxRows: 50_000 }),
  });
}

// Every secret value the process holds, for value-based log redaction.
export const secretsOf = config => [config.dokploy.key, config.secretKey.toString("hex"), config.secretKey.toString("base64"), config.secretKey.toString("base64url"), config.owner?.passwordHash, config.tailscale?.clientSecret].filter(Boolean);
