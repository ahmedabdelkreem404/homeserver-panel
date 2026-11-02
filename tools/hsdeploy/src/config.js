// User config (url + key, outside any project) and per-project .hsdeploy.json (no secrets).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { HsError } from "./errors.js";
import { DEFAULT_BASE_DOMAIN } from "./protection-policy.js";

export const userDir = (env = process.env) => env.HSDEPLOY_HOME || path.join(os.homedir(), ".hsdeploy");
export const PROJECT_FILE = ".hsdeploy.json";

export function loadUserConfig({ env = process.env, dir = userDir(env) } = {}) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")); } catch { /* no file yet */ }
  const url = env.HSDEPLOY_URL || file.url;
  const key = env.HSDEPLOY_KEY || file.key;
  if (url) assertSafeUrl(url);
  return { url, key, baseDomain: env.HSDEPLOY_BASE_DOMAIN || file.baseDomain || DEFAULT_BASE_DOMAIN, sshHost: file.sshHost || "homeserver" };
}

// The key travels in a header, so plain http is only accepted for private, loopback, Tailscale or Docker-internal hosts.
export function assertSafeUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new HsError("usage", "HSDEPLOY_URL / config url is not a valid URL."); }
  if (u.protocol === "https:") return;
  if (u.protocol !== "http:") throw new HsError("usage", "HSDEPLOY_URL / config url must start with http:// or https://.");
  const h = u.hostname.toLowerCase();
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  const [a, b] = m ? [Number(m[1]), Number(m[2])] : [-1, -1];
  const privateIp = a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
  const internalName = h === "localhost" || h === "dokploy" || h.endsWith(".ts.net") || h === "[::1]";
  if (!privateIp && !internalName) throw new HsError("usage", `Refusing to send the key over plain http to "${u.hostname}". Use https, or a private, Tailscale or Docker-internal address.`);
}

export function saveUserConfig(cfg, dir = userDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "config.json");
  // Tighten the ACL while the file is still empty, so the key never exists under an inherited ACL.
  fs.writeFileSync(file, "", { mode: 0o600 });
  if (!restrictToCurrentUser(file)) console.error(`hsdeploy: warning: could not restrict ${file} to your user. Fix its permissions before using the key.`);
  fs.writeFileSync(file, JSON.stringify({ url: cfg.url, key: cfg.key, baseDomain: cfg.baseDomain, sshHost: cfg.sshHost }, null, 2) + "\n", { mode: 0o600 });
  return file;
}

// POSIX modes mean little on Windows, so also drop inherited ACLs and grant only the current user.
export function restrictToCurrentUser(file) {
  if (process.platform !== "win32") return true;
  const user = process.env.USERNAME;
  if (!user) return false;
  try { execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:F`], { stdio: "ignore" }); return true; } catch { return false; }
}

const NAME = /^[a-z0-9][a-z0-9-]{1,40}$/;
const ALLOWED = new Set(["dokployProject", "app", "subdomain", "port", "mode", "buildCommand", "outputDir", "envFile"]);

export function parseProjectConfig(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new HsError("usage", `${PROJECT_FILE} must be a JSON object.`);
  for (const k of Object.keys(obj)) if (!ALLOWED.has(k)) throw new HsError("usage", `${PROJECT_FILE}: unknown field "${k}". Secrets and URLs do not belong in this file.`);
  const str = (k, req = true) => {
    const v = obj[k];
    if (v === undefined || v === null || v === "") { if (req) throw new HsError("usage", `${PROJECT_FILE}: "${k}" is required.`); return undefined; }
    if (typeof v !== "string") throw new HsError("usage", `${PROJECT_FILE}: "${k}" must be a string.`);
    return v;
  };
  const cfg = { dokployProject: str("dokployProject"), app: str("app"), subdomain: str("subdomain"), mode: str("mode") };
  if (!NAME.test(cfg.app)) throw new HsError("usage", `${PROJECT_FILE}: "app" must match ${NAME} (lowercase, digits, hyphen).`);
  if (!["static", "dockerfile"].includes(cfg.mode)) throw new HsError("usage", `${PROJECT_FILE}: "mode" must be "static" or "dockerfile".`);
  cfg.port = obj.port === undefined ? 3000 : obj.port;
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) throw new HsError("usage", `${PROJECT_FILE}: "port" must be an integer from 1 to 65535.`);
  cfg.buildCommand = str("buildCommand", false);
  cfg.outputDir = str("outputDir", false);
  cfg.envFile = str("envFile", false);
  if (cfg.mode === "static") {
    if (!cfg.outputDir) throw new HsError("usage", `${PROJECT_FILE}: static mode needs "outputDir".`);
    cfg.port = 3000; // the generated static server always listens on 3000
  }
  for (const f of ["outputDir", "envFile"]) {
    if (cfg[f] && (path.isAbsolute(cfg[f]) || cfg[f].split(/[\\/]/).includes(".."))) throw new HsError("usage", `${PROJECT_FILE}: "${f}" must be a relative path inside the project.`);
  }
  return cfg;
}

export function loadProjectConfig(dir) {
  const file = path.join(dir, PROJECT_FILE);
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { throw new HsError("usage", `No ${PROJECT_FILE} in ${dir}. Run \`hsdeploy init\` first.`); }
  let obj;
  try { obj = JSON.parse(raw); } catch { throw new HsError("usage", `${PROJECT_FILE} is not valid JSON.`); }
  const cfg = parseProjectConfig(obj);
  return { cfg, hash: trustHash(cfg), file };
}

// Trust covers only what can execute code on this machine: the build command. Other fields (subdomain, port, envFile...) can change freely.
export const trustHash = cfg => crypto.createHash("sha256").update(JSON.stringify({ buildCommand: cfg.buildCommand ?? null })).digest("hex");

export const configHash = cfg => crypto.createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(cfg).sort()))).digest("hex");

// Trust on first use: a changed .hsdeploy.json (it can name a build command) needs `hsdeploy trust` again.
const trustFile = udir => path.join(udir, "trusted.json");
export function isTrusted(projectDir, hash, udir = userDir()) {
  try { return JSON.parse(fs.readFileSync(trustFile(udir), "utf8"))[path.resolve(projectDir)] === hash; } catch { return false; }
}
export function trust(projectDir, hash, udir = userDir()) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(trustFile(udir), "utf8")); } catch { /* first entry */ }
  map[path.resolve(projectDir)] = hash;
  fs.mkdirSync(udir, { recursive: true });
  fs.writeFileSync(trustFile(udir), JSON.stringify(map, null, 2) + "\n");
}
