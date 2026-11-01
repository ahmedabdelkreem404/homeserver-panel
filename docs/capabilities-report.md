# Step 0.1 - Capability spike: Dokploy and Tailscale for homeserver-panel

Date: 2026-11-01. Target: Dokploy v0.30.10 at `http://100.114.91.58:3000` (over Tailscale). All Dokploy results below come from real calls; evidence files are in `docs/evidence/0.1/` (keys, env values and the owner's name/email redacted). Anything not exercised is marked **not verified**.

## 1. API access

- OpenAPI 3.1 document: `GET /api/settings.getOpenApiDocument` (needs the key; 604 paths, ~760 KB). Evidence: `02-openapi-endpoints.txt` (282 relevant endpoints, tag | method | path).
- Server base: `http://100.114.91.58:3000/api`. Auth: header **`x-api-key: <key>`** (security scheme `apiKey`, `in: header`). Without a key every call returns `401 {"message":"Unauthorized"}`.
- Conventions: reads are `GET /api/<router>.<procedure>?<params>` (scalar params in the query string); writes are `POST` with a JSON body. One exception: `application.dropDeployment` is `multipart/form-data`.

## 2. Endpoints table

Verified = I called it in this spike and got the documented result.

| Capability | Endpoint | Request shape | Verified |
|---|---|---|---|
| Discover API | `GET settings.getOpenApiDocument` | none | yes (02) |
| List projects, apps, compose, databases + status | `GET project.all` | none; per service `applicationStatus` / `composeStatus` | yes (03) |
| Environments of a project | `GET environment.byProjectId` | `projectId` | yes (05, 07) |
| Create project | `POST project.create` | `{name, description?}`; returns the project and its default `production` environment | yes (05) |
| Remove project | `POST project.remove` | `{projectId}` | yes (07) |
| Create app | `POST application.create` | `{name, environmentId, sourceType}` (`docker` or `drop`) | yes (05, 06) |
| Set Docker image source | `POST application.saveDockerProvider` | `{applicationId, dockerImage, username:null, password:null, registryUrl:null}` (all five keys required, nulls allowed) | yes (05) |
| Set build type | `POST application.saveBuildType` | `{applicationId, buildType:"dockerfile", dockerfile, dockerContextPath, dockerBuildStage, herokuVersion:null, railpackVersion:null}` | yes (06) |
| Change run command etc. | `POST application.update` | `{applicationId, command, ...}` | yes (05) |
| Deploy / redeploy | `POST application.deploy` / `application.redeploy` | `{applicationId, title?, description?}` | yes (05) |
| Stop / start | `POST application.stop` / `application.start` | `{applicationId}` | yes (05) |
| Delete app | `POST application.delete` | `{applicationId}` | yes (05, 07) |
| Read app status | `GET application.one` | `applicationId` (`applicationStatus`: idle, running, done, error); 404 once deleted | yes (05, 07) |
| Runtime container logs | `GET application.readLogs` | `applicationId, tail?, since?, search?`; lines carry timestamps | yes (05) |
| Deployment history | `GET deployment.all` | `applicationId` | yes (03, 05, 06) |
| Deployment (build) logs | `GET deployment.readLogs` | `deploymentId, tail?` | yes (03, 05, 06) |
| **Direct deploy from a zip** | `POST application.dropDeployment` | multipart: `applicationId`, `zip` (file), optional `dropBuildPath` | yes (06) |
| Create / delete domain | `POST domain.create` / `domain.delete` | `{host, path, port, https:false, certificateType:"none", applicationId, domainType:"application"}` / `{domainId}` | yes (06, 07) |
| Domain existence check | `GET domain.one`, `GET overview.domains` | `domainId` / none | yes (07) |
| Who am I / org id | `GET user.session` | none; contains `session.activeOrganizationId` | yes (04) |
| **List API keys** | `GET user.get` | none; keys are at `user.apiKeys[]` = `{id, name, prefix, enabled, expiresAt, createdAt}` (never the secret). There is no dedicated list endpoint. | yes (04) |
| **Create API key** | `POST user.createApiKey` | `{name (1-32 chars), metadata:{organizationId}, rateLimitEnabled?, expiresIn?, ...}`; returns the secret `key` once, plus `id` | yes (04) |
| **Delete API key** | `POST user.deleteApiKey` | `{apiKeyId}` -> `true`; the key then gets `401` | yes (04) |
| Root check | `GET user.haveRootAccess` | none | yes (03, 04) |
| Host health: RAM, CPU count, disk, container count | `GET docker.getServerHealth` | `sinceHours?` (~1.2 s) | yes (03) |
| Per-container CPU / RAM / net / block IO | `GET swarm.getContainerStats` | none (~2.7 s, see section 4) | yes (03) |
| Containers list | `GET docker.getContainers` | none | yes (03) |
| Docker disk usage | `GET dockerDiskUsage.getDiskUsage` | none | yes (03) |
| Dashboard counters | `GET project.homeStats`, `GET overview.services` | none | yes (03) |
| Per-app monitoring history | `GET application.readAppMonitoring` | `appName`; returns empty series (most likely because Dokploy's monitoring add-on is not installed; not confirmed) | yes, empty (03) |
| Server metrics via monitoring add-on | `GET server.getServerMetrics` | needs `url`, `token` of the monitoring service | not verified (add-on not installed; see 4) |
| Audit log | `GET auditLog.all` | not called | not verified |
| Prune unused images | `settings.cleanUnusedImages` | not called | not verified |
| Volume mounts | `POST mounts.create` | `{type:"volume", volumeName, mountPath, serviceId, serviceType}` | not verified in this spike (it worked earlier in this session on `dokploy-mcp`) |

Misleading name: `user.getServerMetrics` returns the user profile, not server metrics.

## 3. Direct deployment (D2): result and timings

Method (no Git provider, no GitHub link): an app with `sourceType: "drop"`, `buildType: "dockerfile"`, a domain, then `application.dropDeployment` with a zip.

- Zip: 730 bytes, three files at the root (`Dockerfile`, `index.html`, `server.js`), made with Python `zipfile` (forward-slash paths; PowerShell 5.1's `Compress-Archive` writes backslashes, so do not use it).
- Dockerfile: `FROM node:24-alpine` -> `COPY` -> `CMD ["node","server.js"]`, listening on 3000. The base image is already cached on the server, so the build pulled nothing.
- Domain: `spike-test.talabq.com`, `https:false`, `certificateType:"none"`, port 3000, created before the upload.

| Phase (t0 = start of the zip upload) | Time |
|---|---|
| `dropDeployment` HTTP response | 0.17 s |
| Build + deploy finished (`deployment.all` status `done`) | 3.3 s |
| `https://spike-test.talabq.com` first answers `200` through Cloudflare | **8.2 s** |

Evidence: `06-direct-deploy.md` has the build log (real `docker build`, image named after the app), the timings and `curl -I` -> `HTTP/1.1 200 OK`, with the page body `spike-test: direct deploy works`.

Trade-offs and what this does not prove:
- Works from Ahmed's machine over Tailscale with only the API key. No GitHub, no SSH needed.
- The fast time depends on a cached base image and a tiny context. A first pull of a new base image over the slow home connection will dominate. Not measured.
- Not tested: the `static`, `nixpacks` and `railpack` build types, large zips (upload size limit unknown), `dropBuildPath`.
- Recommended pattern for low RAM (3.8 GiB host, Dokploy itself uses ~1.1 GiB): build on Ahmed's machine and ship the finished output, so the server only runs a `COPY`-style Dockerfile and never `npm install`.
- Deleting an app does NOT remove the image Dokploy built (it was still on the server after cleanup; I removed that one tag with `docker rmi`, evidence in `07-cleanup.md`). The panel must run an image cleanup after deletes.

## 4. App lifecycle and pitfalls (item 5)

| Operation | HTTP time | Result |
|---|---|---|
| `application.deploy` (image already cached) | 0.6 s | status `done` after 2.3 s |
| `application.stop` | 5.5 s | status `idle` |
| `application.start` | 9.9 s | status `done` |
| `application.redeploy` | 0.3 s | new deployment `done` in history |
| `application.delete` | 1.3 s | app gone |

Runtime logs came back with timestamps (`ping` output). The status poll after redeploy returned immediately because the status was already `done` before the new deployment started, so poll `deployment.all`, not `applicationStatus`.

**Pitfall found (important for the panel):** my first attempt used a run command with quotes (`node -e "..."`). the command evidently is not run through a shell (inferred from the crash, not confirmed in Dokploy's source), the container crashed (`non-zero exit (1)`), yet `deploy` still reported `done`, and `application.start` then hung for more than 300 s with no server response. The panel must (a) treat `done` as "service created", not "healthy", and check replicas/containers; (b) put timeouts on every start/stop/deploy call; (c) never accept free-form shell strings in commands without validation. Both attempts are in `05-app-lifecycle.md`.

## 5. API keys (item 4) and "MCP access keys"

Proven in `04-api-keys.md`: create `spike-test` -> use it (`200`) -> it appears in `user.apiKeys` -> delete -> reuse returns `401` -> list is back to the original three (`claude-code`, `homeserver-panel`, `remote-test`).

**Rate-limit trap:** a key created with default settings has `rateLimitEnabled:true`, `rateLimitMax:10`, 24 h window. In `04b-api-key-rate-limit.md` such a key answered `200` five times, then `401` (not `429`) on every later call. Any key the panel creates, and the panel's own key, must be created with `rateLimitEnabled:false`. Note: `GET user.get` does not return the rate-limit fields, so the panel cannot inspect them afterwards. My 60+ calls with Ahmed's `homeserver-panel` key all succeeded, which shows that key is not limited this way.

Link to D3: the hosted MCP at `mcp.talabq.com` asks callers for `X-Dokploy-Url` and `X-Dokploy-Api-Key` headers (its `/health` output earlier in this session). So "MCP access keys" in the panel are plain Dokploy API keys: list from `user.get`, create and revoke with the two endpoints above.

The prompt called the owner key "panel-dev"; the key that exists and was used is named `homeserver-panel`. Same purpose, different name.

## 6. Metrics source (D3 "server status")

No agent needed for the MVP:
- `docker.getServerHealth`: RAM total/used, CPU core count, disk total/used, container and service counts (sample: 4.05 GB RAM total, 1.75 GB used, 4 cores, 125 GB disk, 13 GB used).
- `swarm.getContainerStats`: per-container CPU %, memory, network and block IO. Host CPU % can be approximated as the sum of container CPU; load average is not exposed (can come from `/proc/loadavg` if the panel mounts `/proc` read-only).
- Cost warning: that stats call takes ~2.7 s and the Dokploy container showed 79 % CPU in the same reading. The backend must cache it (10-30 s) and call it only while a status page is open.
- Dokploy's own monitoring add-on (`server.setupMonitoring`) adds another container and RAM; not recommended on this host. `application.readAppMonitoring` is empty until it is installed.

## 7. Tailscale (item 8, official docs only)

Full notes with URLs: `docs/evidence/0.1/08-tailscale-docs.md`.
- List devices: `GET https://api.tailscale.com/api/v2/tailnet/-/devices` (scope `devices:core:read`). Delete: `DELETE https://api.tailscale.com/api/v2/device/{deviceId}` (scope `devices:core`). Auth: `Authorization: Bearer <token>`. `-` means the token's own tailnet.
- Credential: **OAuth client** (trust credential). The docs say trust credentials do not expire; the access token it mints lasts 1 hour, so the backend refreshes it (`POST https://api.tailscale.com/api/v2/oauth/token`, client-credentials grant). A user API token lasts at most 90 days, so it is not suitable.
- Minimal scopes: `devices:core:read` and `devices:core`. Creating a `devices:core` credential requires choosing at least one tag. Whether that tag limits which devices can be deleted is **not verified**.
- Not verified: any real response, since no credential exists yet.

## 8. Architecture recommendation

Stack (chosen to fit 3.8 GiB RAM and the existing server):
- **Backend**: Node 24 (the `node:24-alpine` image is already on the server, so no pull) with Fastify. Evidence for the size estimate: the existing Node app `dokploy-mcp` uses 62.65 MiB (`docker stats`). Target 80-120 MB.
- **Database**: SQLite in a Dokploy volume mount: owner account (argon2id password hash, TOTP secret encrypted at rest), sessions, audit log. Node 24's built-in SQLite module or `better-sqlite3`: compare in Step 0.2 (not verified which is smaller and stable enough).
- **Frontend**: separate repo folder and separate build (Vite + React, Arabic RTL, i18n ar/en), shipped as static files. Serve from a small static container (`nginx:alpine` needs one image pull, about 50 MB; alternative: a tiny Node static server on the cached image). Target <20 MB.
- Total target: under 200 MB. Expected 100-140 MB.

Wiring (env vars only): backend reads `DOKPLOY_URL`, `DOKPLOY_API_KEY`, Tailscale OAuth client id/secret, session secret, `ALLOWED_ORIGIN`, `PROTECTED_PROJECT_NAMES`; the frontend reads only the API base URL at build time. No domain or credential in code. Single host `panel.talabq.com`: frontend at `/`, backend at `/api` using Dokploy's domain `path` / `internalPath` / `stripPath` fields, so cookies are same-origin and no CORS is needed. **Not verified**: two apps sharing one host by path.

Security: backend only holds Dokploy and Tailscale credentials. Login with email + password + TOTP, rate-limited, httpOnly SameSite cookies, CSRF protection, audit log of every mutating call, strict input validation, HTTPS terminated by Cloudflare. The Dokploy key is effectively full control of the server, so the panel is a high-value target: also consider Cloudflare Access in front of `/` as a second gate (not tested).

Protecting `infra`, `mcp-gateway` and the panel itself (enforced in the backend, not only the UI):
1. Resolve every mutating request to its owning project through the API (`application.one` -> project) and refuse if that project id is in a protected set; the set is built at startup from `PROTECTED_PROJECT_NAMES` (`infra`, `mcp-gateway`, the panel's own project) and stored by id.
2. Same for API keys: protected key names (`claude-code`, `homeserver-panel`, `remote-test`, and the key the panel itself uses) cannot be deleted from the UI.
3. Tailscale: protect the server's own device and the owner's devices from deletion (deleting the server's node would cut off the only admin path).
4. The UI hides actions on protected items and shows why; the backend returns `403` regardless.

Deploy flow from Ahmed's machine (D2): a small local CLI or script zips the build output, calls `application.dropDeployment`, polls `deployment.all`, checks replicas, then reports the public URL. It uses an API key created with rate limit disabled.

## 9. Risks and open questions

Risks
- API key = root-level control; one leaked key owns the server. Mitigate with separate named keys per use, rotation from the panel, audit log.
- Silent breakage from the default key rate limit (`401` after ~5 calls).
- `deploy` and `start`/`stop` do not report container health and `start` can hang; the panel needs timeouts and a health check.
- Built images accumulate after app deletion; builds compete with Dokploy for RAM (one build at a time).
- Dokploy's stats call is expensive on this host.
- Tailscale token handling: access tokens last 1 hour; secrets must stay server-side.

Open questions (for Ahmed or the next step)
1. Create the Tailscale OAuth client (`devices:core:read`, `devices:core`, with a tag) so list/delete can be tested for real.
2. ~~Path-based routing of two apps on `panel.talabq.com`.~~ **Decided by Ahmed (2026-11-01): one image.** Backend and frontend stay separate packages in the repo, wired by env vars, but ship as a single image where the backend serves the built static files from `panel.talabq.com`. No path-routing test needed.
3. Maximum zip size and `static` / `nixpacks` builds for real projects: test with a representative project.
4. Is a second gate (Cloudflare Access) wanted for `panel.talabq.com`?
5. Node built-in SQLite vs `better-sqlite3`: pick after a small measurement.

## 10. Engineering review of this recommendation (/plan-eng-review, condensed run)

Target: sections 8 and 9 above (plan only, no code exists). This was a **condensed run** of the gstack skill, not the full interactive procedure: see "How this review deviated" at the end. Findings use `[severity] (confidence N/10)`. Nothing below is approved yet; every item is a recommendation for Ahmed / Claude chat to decide.

**Scope Challenge.** Estimated deliverables: 2 deployables (backend, frontend), 1 SQLite volume, 1 deploy script. No existing code to reuse inside this repo. Reuse found elsewhere: Dokploy's own API covers every D3 feature (no custom collector), `node:24-alpine` is already cached on the server, Dokploy has volume backups and mounts. Result: scope accepted as-is, with the cut below suggested.

**Premise table (key claims, receipts in `docs/evidence/0.1/`)**

| Claim | Receipt | Verdict |
|---|---|---|
| Key auth header is `x-api-key` | 02 (securitySchemes), 03 (200 vs 401) | verified |
| Direct zip deploy works, 8.2 s to public 200 | 06 | verified (cached base image only) |
| Default keys die after about 5 calls with `401` | 04b | verified |
| An app can reach Dokploy at `http://dokploy:3000` | `list_profiles` of the dokploy-remote MCP earlier this session (url `http://dokploy:3000/api/trpc`) | verified for `dokploy-mcp`; **not verified for a new app** |
| `application.one` returns env vars at runtime | MCP call on `dokploy-mcp` earlier this session (the OpenAPI schema does not declare `env`) | verified once, outside this spike's logs |
| Path routing of two apps on one host | none | unverified |
| Node built-in SQLite is stable enough | none | unverified |

### Architecture

- **[CRITICAL] (confidence 8/10) Section 8, "Protecting infra, mcp-gateway and the panel itself", item 1.** The Dokploy key can read every app's env vars (secrets of `mcp-gateway`, the Tailscale secret, the panel's own session secret) and can call `application.move`, `compose.move`, `project.duplicate`, `project.remove` and settings procedures (02 endpoint list). A deny check on "delete" alone is not protection. Fix: the backend is NOT a generic proxy. It exposes a fixed allowlist of Dokploy procedures, each with a policy check on the resolved project id (including moves and duplicates), never returns raw `env`, and checks a protected id set on every mutating call. Disposition: pending.
- **[INFORMATIONAL] (confidence 8/10) Section 8, wiring.** In production use `DOKPLOY_URL=http://dokploy:3000` (service name on the Docker network) and keep the Tailscale IP only for local development. This avoids a hop through the host and Tailscale. Verify with the first panel deploy. Disposition: pending.
- **[INFORMATIONAL] (confidence 6/10, medium confidence) Section 8, path routing on `panel.talabq.com`.** Untested. A cheaper default: keep backend and frontend as separate packages in the repo, but ship ONE image where the backend serves the built static files. One app, no path-routing risk, no `nginx:alpine` pull, about 15 MB less RAM. Choose after a 10-minute path-routing test, or skip the test. Disposition: pending Ahmed's call.
- **[INFORMATIONAL] (confidence 7/10) D2 deploy script.** It bypasses the panel (no audit entry) and needs a second full-power key on Ahmed's laptop; `createApiKey` has no scope parameter, only `expiresIn`. Use a separate key named `deploy-cli` with an expiry, and have the panel read `deployment.allCentralized` to show deploys it did not perform. Disposition: pending.
- Design-twice: shape 1 = per-route checks; shape 2 = one deep `ProtectionPolicy` module that every Dokploy call goes through. Pick shape 2 (one owner for the protected set, avoids two ways to do one task).

### Code quality

- **[INFORMATIONAL] (confidence 7/10)** One typed Dokploy client module with a timeout on every call (evidence: `application.start` hung for over 300 s in 05) and an error map: a Dokploy `401` (key revoked, or the rate-limit trap in 04b) must never become the panel's own `401`, or the owner is logged out in a loop. Turn the spike's verified calls into contract tests for that client, since procedures are version-specific (`user.getServerMetrics` returns a profile).
- No shared-code extraction applies yet (no callers).

### Tests (planned paths, none exist yet)

```
CODE PATHS                                       USER FLOWS
[+] ProtectionPolicy                             [+] Owner login
  [GAP] each mutating route x protected id         [GAP][->E2E] password + TOTP, replayed TOTP code
  [GAP] app moved between projects                 [GAP]        lockout / rate limit
  [GAP] protected project deleted + recreated    [+] Projects
[+] Dokploy client                                 [GAP]        delete blocked on infra (403 + UI hint)
  [GAP] timeout on hung start                    [+] MCP access keys
  [GAP] 401 from Dokploy != panel 401              [GAP]        create sends rateLimitEnabled:false
  [GAP] key create body: rateLimitEnabled:false    [GAP]        protected keys cannot be revoked
[+] Audit log + SQLite                           [+] Tailscale devices
  [GAP] every mutation writes one entry            [GAP]        server's own device cannot be deleted
  [GAP] retention / size bound                   [+] Server status
                                                   [GAP]        cached stats, Dokploy-unreachable state
COVERAGE: 0/14 planned paths have tests (plan only) | GAPS: 14 (1 E2E)
```

The regression rule applies to the protection logic and the rate-limit body: both are safety invariants, so write them as table-driven tests at the policy boundary.

### Performance

- **[INFORMATIONAL] (confidence 8/10)** `swarm.getContainerStats` costs about 2.7 s and coincided with 79 % CPU in the Dokploy container (03): cache it 10-30 s and fetch only while a status page is open.
- **[INFORMATIONAL] (confidence 8/10)** Set a container limit through `application.update` (`memoryLimit` and `cpuLimit` exist in its schema, for example 256 MB) so a leak in the panel cannot starve Dokploy on a 3.8 GiB host.
- **[INFORMATIONAL] (confidence 6/10)** The audit log needs retention and a size bound. SQLite on a volume needs backups: Dokploy has `volumeBackups.*` (6 endpoints, not exercised), and the owner/TOTP data is the part that is painful to recreate.

### Failure modes

Dokploy down: login and the audit log must still work from SQLite, with a clear "Dokploy unreachable" state (planned, untested). Tailscale token refresh fails: the device page shows an error and nothing else breaks. Rate-limited key: a silent `401`, the one potentially silent path; covered by the contract test above. Critical gaps (no test, no handling, silent): none beyond these planned items.

### NOT in scope

Dokploy monitoring add-on (RAM cost); Tailscale ACL editing; multi-user roles; compose and database management in the panel; Cloudflare Access (open question 4 above).

### What already exists

Dokploy API for projects, keys, logs, metrics and deploys; `dokploy-mcp` as a working Node app of 62.65 MiB on the same network; Dokploy volume mounts and volume backups; `node:24-alpine` cached on the server.

### Completion summary

- Scope Challenge: scope accepted as-is (one cut suggested: single image)
- Architecture: 5 findings (1 critical) | Code quality: 1 | Test review: diagram produced, 14 gaps | Performance: 3
- Unresolved decisions: 4 (single image vs path routing; second gate; deploy-cli key policy; protected-set ownership)
- Outside voice: skipped (see below). Lake score: N/A. Parallelization: sequential.

### How this review deviated from the full skill (and why)

- No interactive decision gates, no decision ledger file, no saved review report and no review log: the findings are recommendations, approval belongs to Ahmed / Claude chat, and the step prompt asked for no files beyond the step's deliverables. The skill's report-back rule applies and the review-log command was NOT run.
- Skipped: outside voice (Codex), web research, the plan-reality check command, the gstack upgrade prompt and its marker `touch` writes (they write outside this project folder, which the folder rule forbids), and the prior-learnings cross-project question.
- The skill's tier-1 reality rows were reduced to the premise table above.
