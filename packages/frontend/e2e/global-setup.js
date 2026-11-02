import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_CONTAINER, E2E_EMAIL, E2E_FIRST_PASSWORD, E2E_PORT } from "./credentials.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export default async function globalSetup() {
  try { docker("rm", "-f", E2E_CONTAINER); } catch { /* none left over */ }
  const base = ["-v", `${root}:/app`, "-w", "/app/packages/backend"];
  const hash = docker("run", "--rm", ...base, "-e", `P=${E2E_FIRST_PASSWORD}`, "node:24-alpine", "node", "-e",
    "import('./src/auth/password.js').then(m => process.stdout.write(m.hashPassword(process.env.P)))");
  docker("run", "-d", "--name", E2E_CONTAINER, "-p", `${E2E_PORT}:3000`, ...base,
    "--env-file", path.join(root, ".env.local"), // real Dokploy URL and key: reads only, plus the throwaway key e2e-temp
    "-e", `OWNER_EMAIL=${E2E_EMAIL}`, "-e", `OWNER_PASSWORD_HASH=${hash}`,
    "-e", `PANEL_SECRET_KEY=${crypto.randomBytes(32).toString("hex")}`,
    "-e", "STATIC_DIR=/app/packages/frontend/dist", "-e", "DATA_DIR=/tmp/panel-data", "-e", "LOG_LEVEL=warn",
    "node:24-alpine", "node", "src/server.js");
  const deadline = Date.now() + 90_000;
  for (;;) {
    try { if ((await fetch(`http://localhost:${E2E_PORT}/api/health`)).status < 500) return; } catch { /* still starting */ }
    if (Date.now() > deadline) throw new Error(`the e2e panel did not come up: ${docker("logs", E2E_CONTAINER).slice(-800)}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}
