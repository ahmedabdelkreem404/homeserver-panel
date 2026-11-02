# Step 1.1 - Backend skeleton and safety core

Date: 2026-11-02. Branch `step-1.1` (from `step-0.3`). Code in `packages/backend`, evidence in `docs/evidence/1.1/`. Scope kept: no auth, no UI, no deploy, nothing created or changed on the server or in Dokploy (only read calls, for the fixtures and the health check).

## 1. Architecture map

```
 browser / probe
       |
   Fastify (app.js) ---- routes/health.js   (the only public route: GET /api/health)
       |                        |
       |                   gateway.js  <-- the ONLY door to Dokploy for the rest of the panel
       |                        |
       |        +---------------+----------------+
       |        |               |                |
       |  protection-policy.js  audit.js      redact.js (scrub fields + known secret values)
       |  allowlist + owner     pending row     
       |  resolution, fail      before the call,
       |  closed                finished after
       |        |               |
       |  dokploy-client.js     db.js  (node:sqlite, WAL, synchronous=NORMAL, busy_timeout=5000,
       |  timeouts, error map          versioned migrations)
       |        |
       |     Dokploy API (x-api-key)
       |
   config.js (env only, fail fast) -> secretsOf() -> logger.js (pino stream that removes secret values)
```

## 2. Modules (561 lines of source)

| Module | Role |
|---|---|
| `config.js` | Env only; collects every problem by variable name (never values); protected project and key names are the built-ins plus env additions, never fewer; plain http only for private, Tailscale, `.ts.net` or the Docker name `dokploy` |
| `db.js` | `node:sqlite` with the D9 pragmas, `readPragmas`, and a tiny migration runner (`NNN_name.sql`, each in a transaction) |
| `audit.js` | One row per mutating call: `begin()` writes `pending` BEFORE the call, `finish()` sets `ok`, `refused` or `error`; retention 90 days and 50,000 rows |
| `errors.js` | One `PanelError` with stable codes mapped to HTTP in one place; an upstream 401 becomes 502 `upstream_auth_failed`, never the panel's own 401 |
| `dokploy-client.js` | Typed HTTP, a timeout on every call, key only in the `x-api-key` header, never in errors |
| `dokploy-shapes.js` | Normalizers built on the verified shapes (project.all is a summary only; key list has no secrets) |
| `protection-policy.js` | The allowlist (reads and mutations) and the fail-closed owner resolution (id -> environment -> project name and id, also for domains, composes and every database type); moves check both ends; renames and duplicates cannot take a protected name; protected key names cannot be deleted; new keys must use `rateLimitEnabled:false` (D7) |
| `gateway.js` | `read`, `call`, `listProjects`, `listApiKeys`, `createApiKey`, `deleteApiKey`: allowlist + policy + audit + scrubbed output |
| `redact.js`, `logger.js` | Field-based and value-based redaction for outputs, audit details and logs |
| `routes/health.js`, `app.js`, `server.js` | Public coarse health (cached 10 s), wiring, process start |

## 3. Tests

- **Backend: 37 tests, 37 pass on Node v24.22.2 in `node:24-alpine` via Docker** (`docs/evidence/1.1/00-tests-node24.txt`): policy 10, gateway 9, core (config, db, migrations, audit, redaction, client, error mapping) 10, app (health, logging, contract) 8.
- The policy table alone checks more than 100 cases: every mutating procedure (applications, composes, six database types, domains, projects) against every protected project, plus a normal project that must be allowed; moves in both directions; a protected project recreated with a new id (still protected by name); fail-closed on unknown owner, broken link, upstream timeout and unexpected errors; the allowlist stays closed (no raw env writer, no settings or server procedure); key-name protection.
- Contract tests run on fixtures recorded read-only from the live Dokploy (`packages/backend/test/fixtures`, scrubbed; 0 secret values in them). They caught that `scrub` had hidden the whole key list because the field is called `apiKeys`, so that fixture is written without scrubbing and contains only ids, names and dates.
- The first test run found a real policy bug: a Dokploy "not found" while resolving the owner leaked out as a 404 instead of the fail-closed 403. Fixed with a test.
- **hsdeploy (D13 change): 20 tests pass** (`03-hsdeploy-d13.md`).
- **Live health** against the real Dokploy, read-only, full server process on Node 24 in Docker (`01-live-health.md`): `{"status":"ok","process":"ok","db":"ok","dokploy":"ok"}`; first call 224 ms, cached call 0.5 ms; `/api/projects` answers 404; 0 occurrences of the API key in the log. (The process took 7 s to start because Windows bind-mounted files load slowly in Docker.)
- **Secret scan** of all 84 files to be committed: 0 hits for the Dokploy key, the Tailscale id and secret, the deploy-cli key and the hosted MCP secret path (`02-secret-scan.md`).

## 4. Review and security passes

- **/plan-eng-review** (condensed, chat-only): adopted fail-closed resolution, per-procedure target declarations, names from Dokploy not from the request, picked-field outputs with a scrub backstop, pending-then-finish audit rows, coarse cached health.
- **/review** (condensed; no commits ahead of base and no remote, so the helper gates did not apply): 5 informational findings, 3 fixed (rename to a protected name, environment without an embedded project name, value-based scrub of known secrets), 1 deferred (host rules for domains), 1 accepted (protected ids load in the background; names always protect).
- **/cso** (static, scoped to policy and redaction; helper run `1793582598847-e42a8e9af8dfd2e1`, finished, completeness partial, Docker isolation unavailable on native Windows): two low findings recorded in the helper: domain host not checked (deferred to step 1.3, no route exposes domains yet) and field-name-only scrubbing (fixed).

## 5. Decisions taken in this step

- Protected sets can only grow through env; the policy checks both id and normalized name at call time.
- The audit row is written before the call (fail closed: if it cannot be written, the call does not run).
- `policy.init()` runs in the background so a slow or missing Dokploy never delays boot.
- No generic proxy exists: `gateway.call` accepts only allowlisted procedures; `application.one`, `compose.one` and `<db>.one` are used inside the policy only and their output never leaves it; no `saveEnvironment`.
- Plain-http guard for `DOKPLOY_URL` (same rule as hsdeploy).

## 6. Risks and open points

- **Domain host rules (deferred to 1.3):** `domain.create` and `domain.update` check the owner but not the host; before any domain route exists the policy must reject reserved, protected and in-use hosts (hsdeploy already has the rule).
- **No authentication yet:** only `/api/health` is public and it returns coarse states. Nothing else is reachable.
- **Resolve-then-mutate gap:** the owner is resolved right before the call, but an item could be moved in Dokploy between the two calls. Accepted: the panel offers no move action and the window is milliseconds.
- `node:sqlite` is a release candidate in Node 24 (D9): all SQL stays behind `db.js` and `audit.js`.
- Docker Desktop was not running, so I started it (the engine was up after about 25 s). It is still running; stop it if you do not want it.

## 7. Addendum items

- **A (D15) - done.** The section "Deploying to the homeserver (hsdeploy)" was appended once to `%USERPROFILE%\.claude\CLAUDE.md`; the original 8,872 bytes are byte-identical at the start of the file (checked with `cmp`), and no duplicate was added. Update to A (received while this step was running): the section's FIRST bullet is now "Deploy to the homeserver ONLY when Ahmed explicitly asks to deploy/upload/publish this specific project to the server. Building, running or testing a project means local only. Never run `hsdeploy init` or `hsdeploy up` on your own initiative." (inserted once, rest of the file untouched); the same rule is the first line of the rules in `docs/hsdeploy-for-claude-code.md`. This also answers your earlier question about adding hsdeploy lines to the global file: they are there now.
- **B (D13) - done, separate commit `0b7cd66`.** `hsdeploy init` records the trust itself; trust now covers only the `buildCommand`, so later edits of subdomain, port or envFile need no approval. A config that was not created by `init` on this machine (cloned, copied, hand-written), or a changed `buildCommand`, still needs `hsdeploy trust`, which only a person can run in an interactive terminal. CLI-level tests cover both paths (20 hsdeploy tests pass), the docs are updated, and the global copy was reinstalled and checked live (`03-hsdeploy-d13.md`). Existing trust records from before this change used a different hash, so projects initialized earlier need one `hsdeploy trust` by you (none exist now: the test projects were removed).
- **C (D16) - design recorded for step 1.2, nothing built now.** The auth schema will be roles-ready:
  - `users` table: `id`, `email` (unique), `password_hash` (argon2id through `crypto.argon2`), `role`, TOTP secret (encrypted), `totp_enrolled_at`, `disabled_at`, `created_at`.
  - `sessions` table: hashed session id, `user_id`, `created_at`, `expires_at`, last seen.
  - One module `permissions.js` with `can(user, permission)` and a role-to-permissions map; the only role seeded now is `owner` (all permissions). Every route declares the permission it needs and calls `can` in one hook, so adding `admin`, `operator` or `viewer` later is a data change, not a rewrite.
  - Audit `actor` becomes the user id (`user:<id>`); the gateway already takes `{ actor }` per call.
  - Not built: invitations, user management screens, per-project permissions.

## 8. Housekeeping

- `.tmp/` emptied (removal by its literal path worked this time).
- The broken npm link folder `%APPDATA%\npm\node_modules\hsdeploy` could not be removed from here: Windows answers "mount point ... device object is not attached". It is harmless. **Owner action:** in your own terminal run `rmdir "%APPDATA%\npm\node_modules\hsdeploy"`.
