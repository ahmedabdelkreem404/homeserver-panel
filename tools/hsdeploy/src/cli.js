// Thin command layer: parse arguments, build the context, call the Deployer, print results.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { HsError, EXIT } from "./errors.js";
import { DokployClient } from "./dokploy-client.js";
import { Deployer } from "./deployer.js";
import { PROJECT_FILE, configHash, isTrusted, loadProjectConfig, loadUserConfig, parseProjectConfig, saveUserConfig, trust, userDir } from "./config.js";
import { ProtectionPolicy, validateSubdomain } from "./protection-policy.js";
import { acquireLock } from "./lock.js";

export const HELP = `hsdeploy - deploy the current project to the homeserver (Dokploy) in one command

Usage: hsdeploy <command> [options]

Commands:
  init                Write .hsdeploy.json here (no secrets) and trust it
  trust               Approve the current .hsdeploy.json (needed after it changes)
  up                  Create project/app/domain if missing, upload, deploy, verify it runs, check the public URL
  status              App state, containers, domain, last deployment, public HTTP status
  logs                Runtime logs of the app
  env push            Set the app environment from "envFile" (values are never printed)
  db create <type>    Create a postgres or mysql service in the project and write DATABASE_URL into the app env
  down                Delete the app, its domain and its image (see --with-db, --rm-project)
  login               Save HSDEPLOY_URL and HSDEPLOY_KEY (read from the environment) to ~/.hsdeploy/config.json

Options:
  --dir <path>        Project folder (default: current folder)
  init:   --project <name> --app <name> --subdomain <label> --mode static|dockerfile --port <n>
          --build <command> --out <dir> --env-path <path> --force
  up:     --expect <text>  fail unless the page contains this text;  --no-verify;  --dry-run
  logs:   --tail <n>
  db create: --image <image>   e.g. postgres:16 (default) or a digest-pinned reference
  down:   --with-db  --rm-project
  -h, --help   -v, --version

Exit codes: 0 ok, 1 failed, 2 usage, 3 refused (protected or not managed), 4 timeout, 5 auth.
Config: ~/.hsdeploy/config.json or HSDEPLOY_URL / HSDEPLOY_KEY. Protected projects: infra, mcp-gateway, homeserver-panel.
`;

const OPTS = {
  dir: { type: "string" }, project: { type: "string" }, app: { type: "string" }, subdomain: { type: "string" }, mode: { type: "string" }, port: { type: "string" },
  build: { type: "string" }, out: { type: "string" }, "env-path": { type: "string" }, force: { type: "boolean" }, expect: { type: "string" },
  "no-verify": { type: "boolean" }, "dry-run": { type: "boolean" }, tail: { type: "string" }, image: { type: "string" },
  "with-db": { type: "boolean" }, "rm-project": { type: "boolean" }, help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
};

async function context(flags, { client = true } = {}) {
  const projectDir = path.resolve(flags.dir ?? process.cwd());
  const { cfg, hash } = loadProjectConfig(projectDir);
  if (!isTrusted(projectDir, hash)) throw new HsError("refused", `${PROJECT_FILE} changed or was never approved here. Review it (it can name a build command), then run \`hsdeploy trust\`.`);
  const user = loadUserConfig();
  const deployer = new Deployer({ client: client ? new DokployClient({ url: user.url, key: user.key }) : null, user, projectDir, cfg });
  if (client) await deployer.load();
  return deployer;
}

export async function run(argv, { out = console.log, err = console.error } = {}) {
  let parsed;
  try { parsed = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: true }); }
  catch (e) { throw new HsError("usage", `${e.message}. Try \`hsdeploy --help\`.`); }
  const { values: f, positionals: [cmd, sub] } = parsed;
  if (f.version) return out("0.1.0");
  if (f.help || !cmd || cmd === "help") return out(HELP);

  if (cmd === "login") {
    const user = loadUserConfig();
    if (!user.url || !user.key) throw new HsError("usage", "Set HSDEPLOY_URL and HSDEPLOY_KEY in the environment, then run `hsdeploy login`.");
    const file = saveUserConfig(user);
    return out(`Saved ${file} (readable only by the current user). The key was not printed.`);
  }

  if (cmd === "init") {
    const projectDir = path.resolve(f.dir ?? process.cwd());
    const target = path.join(projectDir, PROJECT_FILE);
    if (fs.existsSync(target) && !f.force) throw new HsError("usage", `${PROJECT_FILE} already exists. Use --force to overwrite.`);
    const pkg = fs.existsSync(path.join(projectDir, "package.json")) ? JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8")) : {};
    const hasDockerfile = fs.existsSync(path.join(projectDir, "Dockerfile"));
    const mode = f.mode ?? (hasDockerfile && !f.out ? "dockerfile" : "static");
    const app = f.app ?? path.basename(projectDir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const cfg = parseProjectConfig({
      dokployProject: f.project, app, subdomain: f.subdomain ?? app, mode,
      port: f.port ? Number(f.port) : 3000,
      buildCommand: f.build ?? (mode === "static" && pkg.scripts?.build ? "npm run build" : undefined),
      outputDir: f.out ?? (mode === "static" ? "dist" : undefined), envFile: f["env-path"],
    });
    validateSubdomain(cfg.subdomain, { baseDomain: loadUserConfig().baseDomain });
    new ProtectionPolicy().assertProjectName(cfg.dokployProject);
    fs.writeFileSync(target, JSON.stringify(Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined)), null, 2) + "\n");
    trust(projectDir, configHash(cfg));
    return out(`Wrote ${target} and trusted it${cfg.buildCommand ? ` (\`up\` will run: ${cfg.buildCommand})` : ""}.\nNext: hsdeploy up`);
  }

  if (cmd === "trust") {
    const projectDir = path.resolve(f.dir ?? process.cwd());
    const { cfg, hash } = loadProjectConfig(projectDir);
    // A cloned repo can ship a .hsdeploy.json with a hostile build command. Approval must come from a person at a keyboard:
    // an agent running this through a shell tool has no TTY, so it cannot approve a file by itself.
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new HsError("refused", "`hsdeploy trust` must be run by a person in an interactive terminal. Tell the owner which .hsdeploy.json needs approval and why.");
    const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Trust ${PROJECT_FILE} in ${projectDir}${cfg.buildCommand ? ` and let \`up\` run: ${cfg.buildCommand}` : ""}? Type yes: `);
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") throw new HsError("refused", "Not trusted.");
    trust(projectDir, hash);
    return out(`Trusted ${PROJECT_FILE}.`);
  }

  const mutating = ["up", "down", "db", "env"].includes(cmd) && !f["dry-run"];
  const release = mutating ? acquireLock(userDir()) : () => {};
  try {
    if (cmd === "up") {
      const d = await context(f, { client: !f["dry-run"] });
      if (f["dry-run"]) { const { count, buffer } = d.prepareZip(); return out(`Dry run: ${count} files, ${(buffer.length / 1048576).toFixed(2)} MB. Nothing was uploaded.`); }
      const url = await d.up({ expect: f.expect, noVerify: f["no-verify"] });
      return out(`Deployed: ${url}`);
    }
    if (cmd === "status") return out(JSON.stringify(await (await context(f)).status(), null, 2));
    if (cmd === "logs") return out(String(await (await context(f)).logs(f.tail ? Number(f.tail) : 100)).trimEnd());
    if (cmd === "env" && sub === "push") { const keys = await (await context(f)).envPush(); return out(`Set ${keys.length} variable(s): ${keys.join(", ")} (values not shown). Run \`hsdeploy up\` to apply.`); }
    if (cmd === "db" && sub === "create") {
      const type = parsed.positionals[2];
      const r = await (await context(f)).dbCreate(type, { image: f.image });
      return out(`Database ready: ${r.service} (internal host ${r.host}). DATABASE_URL is set in the app env.`);
    }
    if (cmd === "down") { await (await context(f)).down({ withDb: f["with-db"], rmProject: f["rm-project"] }); return out("Done."); }
    throw new HsError("usage", `Unknown command "${cmd}${sub ? " " + sub : ""}". Try \`hsdeploy --help\`.`);
  } finally { release(); }
}

export async function main(argv) {
  try { await run(argv); process.exitCode = EXIT.OK; }
  catch (e) {
    if (e instanceof HsError) { console.error(`hsdeploy: ${e.message}`); process.exitCode = e.exitCode; }
    else { console.error(`hsdeploy: unexpected error: ${e?.message ?? e}`); process.exitCode = EXIT.FAILED; }
  }
}
