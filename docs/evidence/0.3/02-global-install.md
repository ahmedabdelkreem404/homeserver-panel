# hsdeploy --help from a folder outside the repo

```
cwd: ~ (/c/Users/<user>)
$ hsdeploy --version
0.1.0
$ hsdeploy --help
hsdeploy - deploy the current project to the homeserver (Dokploy) in one command

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
          --build <command> --out <dir> --env-file <path> --force
  up:     --expect <text>  fail unless the page contains this text;  --no-verify;  --dry-run
  logs:   --tail <n>
  db create: --image <image>   e.g. postgres:16 (default) or a digest-pinned reference
  down:   --with-db  --rm-project
  -h, --help   -v, --version

Exit codes: 0 ok, 1 failed, 2 usage, 3 refused (protected or not managed), 4 timeout, 5 auth.
Config: ~/.hsdeploy/config.json or HSDEPLOY_URL / HSDEPLOY_KEY. Protected projects: infra, mcp-gateway, homeserver-panel.

$ hsdeploy bogus
hsdeploy: Unknown command "bogus". Try `hsdeploy --help`.
exit code: 2
```

Installed globally with: npm pack (tools/hsdeploy) then npm install -g <tgz>. Package name hsdeploy-cli, command hsdeploy. A plain 'npm install -g ./tools/hsdeploy' (symlink) failed on this machine, see the step report.
