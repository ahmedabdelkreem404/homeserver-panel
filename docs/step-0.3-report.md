# Step 0.3 - hsdeploy: one-command deploy from any project folder

Date: 2026-11-02. Branch `step-0.3` (from `step-0.2`). Evidence in `docs/evidence/0.3/` (no key, password or token in any file; scanned). Everything below was run; anything not run is marked **not verified**.

Result: `hsdeploy` works end to end. Two sample apps were deployed and answered over https, torn down with one command each, and the server returned to the exact state it had before. The server-side **nixpacks build failed** and is not usable on this host; zip uploads up to 100 MB work.

## 1. What was built

`tools/hsdeploy/` (plain ESM JavaScript, no dependencies, no native modules; Node 22.2 or newer because this machine has Node v22.23.4, see deviations). Modules, as designed:

| File | Role |
|---|---|
| `src/dokploy-client.js` | The only module that talks to Dokploy: timeouts on every call (30 s, upload 5 min), HTTP-to-error mapping, key never in messages |
| `src/protection-policy.js` | Protected projects (`infra`, `mcp-gateway`, `homeserver-panel`) by name and id, reserved subdomains, single-label check, "created by hsdeploy" marker |
| `src/zip.js` | Own zip writer (forward-slash names, deflate or store, crc32 from `node:zlib`) and an independent reader; `.dockerignore` subset; `.env*` always excluded |
| `src/config.js`, `src/lock.js`, `src/env-file.js`, `src/templates.js`, `src/errors.js` | User config (+ ACL), project config validation and trust, one-deploy lock, env merge, static-server template, exit codes |
| `src/deployer.js` | Service layer: find-or-create, upload, wait, verify the container, public check, db, down, image and volume cleanup |
| `src/cli.js`, `bin/hsdeploy.js` | Thin commands: `init`, `trust`, `up`, `status`, `logs`, `env push`, `db create`, `down`, `login` |

Docs: `tools/hsdeploy/README.md` and `docs/hsdeploy-for-claude-code.md` (the block to paste into a project's CLAUDE.md).

## 2. Acceptance checks

| Check | Result | Evidence |
|---|---|---|
| `hsdeploy --help` from a folder outside the repo | works (run from the home folder) | `02-global-install.md` |
| Unit tests (node:test) | 17 of 17 pass: subdomain table, protected refusal by name and id, unmanaged-app refusal before any call, zip path format with independent reader and crc, config parsing, trust hash, error mapping, key never in errors, lock, env merge, URL guard | `00-unit-tests.txt` |
| `deploy-cli` key | exists, `rate_limit_enabled` false, `expires_at` exactly 365 days after creation; verified with a read-only query, never printed; stored only in `%USERPROFILE%\.hsdeploy\config.json` (ACL: current user only) | `01-deploy-cli-key.md` |
| `hs-static.talabq.com` | HTTP 200, expected text, asset served; first `up` 19 s wall (local build, zip, upload, server build, container check, public check), redeploy 22 s | `05-e2e-static.md` |
| `hs-db.talabq.com` | `{"db":"ok"}` on every request after a real CREATE/INSERT/SELECT against Postgres; whole flow (up, db create, env push, up) 35 s | `06-e2e-db.md` |
| `down --with-db` and cleanup | both exit 0 (45 s for both); no `hs-*` project, app, database, domain, container, image or volume remains; server images and volumes identical to the baseline taken before the pass | `07-cleanup.md`, `09-final-smoke.md` |
| Zip size limit | 5, 25, 50 and 100 MB incompressible zips all accepted (limit not reached): 15 s, 44 s, 69 s, 204 s including the build | `03-zip-limits.md` |
| nixpacks build | **failed after 18.2 minutes** (see section 4) | `04-nixpacks.md` |
| CLI error-path QA | 16 of 16 probes give the expected exit codes | `08-qa-cli.md` |

## 3. Bugs the real runs found (all fixed and re-tested)

Unit tests with invented API shapes missed these. Only live runs showed them:
1. `project.all` returns app **summaries**: no `appName`, no `description`. The managed-marker check and the container query depend on both, so the first `up` could not verify and a second `up` would have refused its own app. Now the full app (`application.one`) is read first; the unit test uses the real shape.
2. `docker.getContainersByAppNameMatch` returns `[]` when `appType=stack` is passed; without it the swarm app's containers appear.
3. Databases in `project.all` are `{postgresId}` only (no name): they are matched by reading each one.
4. Dokploy leaves the Postgres **data volume** after `postgres.remove`; `down` now removes it (`dockerVolume.removeVolume`, ssh fallback).
5. The image of a deleted app stays untagged while swarm still holds the stopped containers; `down` now waits until the containers are gone, then removes the image through `dockerImage.removeImage {repository, tag, id}` (all three are required; the first try with `id` only got HTTP 400).
6. A rebuild moves the tag and leaves the previous image untagged; `up` now removes exactly that previous image id (with retries, because the old container lingers for a few seconds).
7. Node itself intercepts `--env-file` anywhere on the command line (it errored, and would silently load that file into the process): the init flag is `--env-path`.
8. `npm install -g ./tools/hsdeploy` (symlink install) failed here (`lstat ... UNKNOWN`); the CLI is installed from a packed copy instead (section 6).

## 4. Zip limits and nixpacks (item 7)

- **dropDeployment size:** no failure up to 100 MB. Time is the practical limit: about 2 s per MB, mostly upload over Tailscale plus the Docker build-context copy. Larger sizes were not tried (the prompt said to stop at the first failure and there was none).
- **nixpacks, one build of a tiny Node app (no dependencies):** failed after 1,092 s. Nixpacks installs Node 18 and npm through Nix inside the build, downloaded hundreds of store paths, then `curl: (56) Recv failure: Connection timed out` fetching `npm-9.9.4.tgz` from registry.npmjs.org. Server memory used rose from 2,263 MB to a peak of 2,457 MB (+194 MB, lowest available 1,403 MB of 3,861 MB); the `dokploy` container peaked at 1,705 MiB (about 1.1 to 1.4 GiB idle); max load 1.28 on 4 cores. Disk was unchanged at 13 GB.
- **Verdict:** server-side nixpacks builds are **not acceptable** on this host: 18 minutes with no result because of the home connection, and the build is heavy on RAM. Use static mode (build on the owner's machine) or Dockerfiles that copy prebuilt files. For comparison, the `pg` Dockerfile build with `npm ci` on the server took 7.5 s (the npm cache and registry were reachable that time), so small Dockerfile builds are fine.

## 5. Gstack steps, and what they found

- **/plan-eng-review** (condensed, chat-only, not persisted; no interactive gates, no outside voice): adopted before coding: apps and databases carry a `managed-by:hsdeploy` marker and anything else is refused; `.hsdeploy.json` is untrusted (trust on first use by path and content hash); `util.parseArgs`; targeted image removal instead of the global prune; verify "really runs" by container id stability, not by status.
- **/review** (condensed; the branch has no commits or remote, so the full diff procedure did not apply): four low findings fixed: a duplicated protected-project list, a lock race, a crash on a project without environments, and the `trust` note.
- **/qa:** the gstack skill was **not run**. It needs a live target and the two apps are torn down by design. The equivalent was done by hand: both apps tested over https (sections 2 and `05`, `06`), plus 16 error-path probes (`08-qa-cli.md`) which found that config validation errors exited 1 instead of 2 (fixed).
- **/cso** (static, scoped to hsdeploy's credential handling; helper run `1793579818093-0392f43479112299`, finished, completeness partial, Docker isolation unavailable on native Windows): two low findings recorded in the helper and then fixed: (1) a plain-http key could be sent to any host named in `HSDEPLOY_URL` (now http is accepted only for loopback, private, Tailscale, `.ts.net` or the Docker name `dokploy`; https otherwise); (2) `config.json` was written before its ACL was tightened (now the empty file's ACL is restricted first). My own pre-pass also found that an agent could run `hsdeploy trust` and approve a hostile build command, so `trust` now needs a person at an interactive terminal (it refuses without a TTY).

## 6. Deviations and open points

- **Node version:** this machine runs Node v22.23.4 (the prompt said Node 24). hsdeploy needs 22.2 or newer. The containers it ships use `node:24-alpine`, which is cached on the server.
- **Global install:** installed from a packed copy under the package name `hsdeploy-cli` (command `hsdeploy`). The failed link install left a broken folder-link `%APPDATA%\npm\node_modules\hsdeploy` that I could not remove from here ("mount point ... device object is not attached"). **Owner action:** in your own terminal run `rmdir "%APPDATA%\npm\node_modules\hsdeploy"` (it removes only the link). After changing hsdeploy's code, re-run the install steps in the README (it copies, it does not link).
- `up` after `db create` needs a second run to apply `DATABASE_URL` (documented). The default Postgres image `postgres:16` would pull from the internet; the test used the digest-pinned image already cached on the server (`--image`). **Not verified:** a plain `postgres:16` pull on this connection, MySQL, and zip uploads above 100 MB.
- **Canonical decision numbers:** fixed in `docs/step-0.2-report.md`: node:sqlite is D9 and the read-only Tailscale page is D10.
- The `deploy-cli` key has full control (Dokploy keys have no scopes) and lives 365 days; rotate it before it expires.

## 7. Phase 1 implications

- `dokploy-client.js` and `protection-policy.js` are the two modules the panel backend also needs. They now have two plausible callers (hsdeploy, the panel); extract a shared package only when the panel backend actually starts, and keep the protection tests with it.
- The panel must treat `project.all` as a summary (no `appName`, `description`, database names), expect `[]` from the container query with `appType=stack`, and clean up volumes and images itself after deletes.
- Server-side builds: Dockerfiles that copy prebuilt output only; never nixpacks.
