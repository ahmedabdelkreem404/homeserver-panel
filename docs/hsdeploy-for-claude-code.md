# Deploying this project to the homeserver (paste into a project's CLAUDE.md)

Deploy with the `hsdeploy` command. Do not use GitHub, Dokploy's web UI or the Dokploy API directly for deploys.

Rules
- Deploy to the homeserver ONLY when Ahmed explicitly asks to deploy/upload/publish this specific project to the server. Building, running or testing a project means local only. Never run `hsdeploy init` or `hsdeploy up` on your own initiative.
- Public URLs are `https://<label>.talabq.com`. The label is ONE lowercase level (`my-app`, never `api.my-app`), because the wildcard covers a single level. Do not use `panel`, `mcp`, `www`, `root`.
- Never touch the Dokploy projects `infra`, `mcp-gateway` or `homeserver-panel`. `hsdeploy` refuses them; do not work around that.
- `hsdeploy` only manages apps it created. If it refuses with "not created by hsdeploy", stop and tell the owner.
- One deploy at a time. If it says another run is active, wait.
- Never print, log or commit keys or passwords. Credentials live in `~/.hsdeploy/config.json`. `.hsdeploy.json` holds no secrets; commit it only if the owner agrees.
- Do not run `sudo`. Do not change Traefik, Cloudflare, ssh, ufw or netplan.
- The server has about 4 GB RAM. Build on this machine and ship the result; avoid heavy `npm install` or compiles inside a Dockerfile.

First time in a project
- Static site (Vite, React, plain HTML): `hsdeploy init --project <name> --subdomain <label> --mode static --build "npm run build" --out dist`
- App with a Dockerfile: `hsdeploy init --project <name> --subdomain <label> --mode dockerfile --port <port>`
- `hsdeploy init` prints the build command it approves and trusts the config at once (D13); later edits to subdomain, port or envFile need no approval. Only a config that `init` did not create on this machine (cloned, copied, hand-written) or a changed `buildCommand` needs `hsdeploy trust`, which only a person can run in an interactive terminal (it refuses without a TTY). If `up` says the file was never approved, stop and tell the owner which file and which build command it contains; do not try to bypass it.

Everyday commands
- `hsdeploy up` deploys, checks the container stays up and prints the public URL once it returns 200. Add `--expect "some text"` to fail unless the page contains that text.
- `hsdeploy status`, `hsdeploy logs --tail 100`
- Database: prefer `hsdeploy db create postgres --shared` (one shared Postgres for all projects, a database and role per project). `hsdeploy db create postgres` (or `mysql`) makes a dedicated service instead. Then `hsdeploy up` to apply. The app reads `DATABASE_URL` from its environment; the password is never shown.
- Environment: put non-secret and secret values in the file named by `envFile`, add that file to `.gitignore`, then `hsdeploy env push` and `hsdeploy up`.
- Every app gets 256 MB and 1 CPU by default; raise `memoryLimitMb` / `cpuLimit` in `.hsdeploy.json` only when the app needs it.
- Remove everything: `hsdeploy down --with-db --rm-project` (the last flag only when the project holds nothing else).

Exit codes: 0 ok, 1 failed, 2 usage, 3 refused, 4 timeout, 5 auth/key problem. On exit 5, tell the owner the deploy key may have expired or been revoked; do not try to create keys yourself.

Install (owner, once): `cd tools/hsdeploy`, `npm test`, `npm pack --pack-destination ../../.tmp`, `npm install -g ../../.tmp/hsdeploy-cli-<version>.tgz` in the homeserver-panel repo.
