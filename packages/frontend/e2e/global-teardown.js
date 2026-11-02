import { execFileSync } from "node:child_process";
import { E2E_CONTAINER } from "./credentials.js";

export default function globalTeardown() {
  try { execFileSync("docker", ["rm", "-f", E2E_CONTAINER], { stdio: "ignore" }); } catch { /* already gone */ }
}
