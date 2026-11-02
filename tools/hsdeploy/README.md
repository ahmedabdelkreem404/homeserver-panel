# hsdeploy

Deploy the current project to the homeserver (Dokploy) in one command, from any folder. No GitHub involved: the project is zipped on your machine and uploaded through Dokploy's `application.dropDeployment`.

Plain Node ESM, no dependencies, no native modules. Node 22.2 or newer (uses `fetch`, `FormData`, `zlib.crc32`, `util.parseArgs`).

## Install

From the repo root (copies the package, so re-run it after changing the code):

```bash
cd tools/hsdeploy
npm test
npm pack --pack-destination ../../.tmp
npm install -g ../../.tmp/hsdeploy-cli-<version>.tgz
```

The npm package is `hsdeploy-cli`; the command is `hsdeploy`. `npm install -g ./tools/hsdeploy` (a symlink install) failed on this machine with an `lstat ... UNKNOWN` error, so use the copy install above.

Credentials: either `~/.hsdeploy/config.json` (`{ "url", "key", "baseDomain", "sshHost" }`, readable only by your user) or the environment variables `HSDEPLOY_URL` and `HSDEPLOY_KEY`. The key must be a Dokploy API key created with `rateLimitEnabled:false` (a default-limit key starts answering `401` after about five calls). `hsdeploy login` saves the two environment variables into the config file without printing the key.

## Commands

| Command | What it does |
|---|---|
| `hsdeploy init --project <name> [--subdomain x --mode static|dockerfile --env-path .env.production ...]`\|dockerfile ...]` | Writes `.hsdeploy.json` (no secrets) and approves it |
| `hsdeploy trust` | Approves a `.hsdeploy.json` that was not created by `init` on this machine, or whose `buildCommand` changed. A person must run it in an interactive terminal and type `yes`; it refuses without a TTY, so an agent cannot approve a file itself |
| `hsdeploy up [--expect "text"] [--no-verify] [--dry-run]` | Find-or-create project, app and domain; zip; upload; wait for the build; check that a container really runs and stays up; poll the public URL until 200; print it |
| `hsdeploy status` | App state, containers, domain, last deployment, public HTTP status |
| `hsdeploy logs [--tail N]` | Runtime logs |
| `hsdeploy env push` | Sets the app environment from `envFile`; prints key names only; keeps existing keys such as `DATABASE_URL`. Apply with `hsdeploy up` |
| `hsdeploy db create postgres\|mysql [--image ref]` | Creates a database service in the same project and writes `DATABASE_URL` into the app env (value never printed). Apply with `hsdeploy up` |
| `hsdeploy down [--with-db] [--rm-project]` | Deletes the domain, the app and its built image; `--with-db` also deletes the `<app>-db` service; `--rm-project` removes the project if hsdeploy created it and it is empty |

Exit codes: 0 ok, 1 failed, 2 usage, 3 refused (protected project or app not created by hsdeploy), 4 timeout, 5 auth.

## `.hsdeploy.json`

```json
{
  "dokployProject": "my-site",
  "app": "my-site",
  "subdomain": "my-site",
  "mode": "static",
  "buildCommand": "npm run build",
  "outputDir": "dist",
  "envFile": ".env.production"
}
```

`port` (default 3000) is only used in `dockerfile` mode. Unknown fields are rejected: no URL, key or password belongs here. Because the file can name a build command, `up` only runs if this machine trusts it (D13). `hsdeploy init` records the trust itself, so a config created by `init` here works at once, and editing subdomain, port or envFile later needs no approval. Trust covers only the `buildCommand` (stored per folder and command hash in `~/.hsdeploy/trusted.json`): a config that was not created by `init` here (cloned, copied, hand-written) or a changed `buildCommand` needs `hsdeploy trust`, which needs a person at a terminal (it shows the build command and asks for `yes`, and refuses without a TTY).

## Modes

**static** runs `buildCommand` locally, ships `outputDir` under `public/` with a tiny dependency-free Node static server (single-page-app fallback) and a generated Dockerfile on `node:24-alpine`. The server does no build work beyond a `COPY`.

**dockerfile** ships the project and lets the server build your Dockerfile. Always excluded: `node_modules`, `.git`, `.env*`, `.next/cache`, `.turbo`, caches, `.hsdeploy.json`, plus your `.dockerignore` (comments, blank lines, `dir`, `dir/`, `*.ext`, `**/name`; negation `!` is rejected with a clear error). Prefer multi-stage Dockerfiles that `COPY` prebuilt output. Server-side builds that download dependencies are slow on this host; see `docs/step-0.3-report.md` for the measurements.

## Domains and safety

- Subdomains are single-label, lowercase, under `talabq.com`, HTTPS off and certificate none (Cloudflare terminates TLS). Reserved: `panel`, `mcp`, `www`, `root`, `api`, `dokploy`, `traefik`, `admin`, `mail`, `ns1`, `ns2`, `ftp`, `smtp`, and any host already used by another service.
- Protected projects are never touched: `infra`, `mcp-gateway`, `homeserver-panel` (by name and by id).
- hsdeploy only changes apps and databases it created (marker `managed-by:hsdeploy` in their description). Anything else is refused with exit code 3.
- One run at a time per machine (`~/.hsdeploy/deploy.lock`).
- Every API call has a timeout (30 s; 5 min for the upload). The key is never printed or put in error messages.
- `down` removes the image through `dockerImage.removeImage` by id (targeted). The global `settings.cleanUnusedImages` prune is not used because it would also delete cached base images that make builds fast; `ssh <sshHost> docker rmi` is the fallback.

Note: the init flag is `--env-path`, not `--env-file`: Node itself intercepts `--env-file` anywhere on the command line (it errored with "not found" and would silently load that file into the process environment).
