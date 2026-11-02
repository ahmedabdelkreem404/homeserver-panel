// Builds everything locally (D12) and stages exactly what the Docker image copies into release/ (git-ignored):
//   release/backend/src, package.json, deps (production dependencies only)  and  release/frontend (the built UI).
// The production dependencies are installed in a temporary folder and shipped as "deps" because hsdeploy never zips a
// folder named node_modules. Run it from the repository root: node scripts/build-release.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const release = path.join(root, "release");
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`failed: ${command} ${args.join(" ")}`); process.exit(1); }
};

run("npm", ["run", "build", "--workspace", "packages/frontend"], root);

fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(path.join(release, "backend"), { recursive: true });
fs.cpSync(path.join(root, "packages/backend/src"), path.join(release, "backend/src"), { recursive: true });
fs.cpSync(path.join(root, "packages/backend/package.json"), path.join(release, "backend/package.json"));
fs.cpSync(path.join(root, "packages/frontend/dist"), path.join(release, "frontend"), { recursive: true });

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panel-deps-"));
try {
  fs.cpSync(path.join(root, "packages/backend/package.json"), path.join(scratch, "package.json"));
  run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], scratch);
  fs.cpSync(path.join(scratch, "node_modules"), path.join(release, "backend/deps"), { recursive: true });
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }

const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`release ready: ${(size(release) / 1048576).toFixed(1)} MB in ${release}`);
