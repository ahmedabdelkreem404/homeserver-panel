# Step 0.2 - Closing the gaps from Step 0.1

Date: 2026-11-01. Branch `step-0.2` (from `step-0.1`). Evidence in `docs/evidence/0.2/` (no key, token, secret path or owner email in any file; scanned). Anything not run is marked **not verified**.

Status per item: 1 done, 2 done (no change needed), 3 first blocked, completed as Step 0.2b with delete permission still unproven (section 3b), 4 done, 5 done.

## 1. API key rate-limit audit (done)

Read-only query on Dokploy's database (`default_transaction_read_only=on`, key/hash/start columns never selected). Evidence: `01-key-audit.md`.

| name | enabled | rate_limit_enabled | window (ms) / max (stored defaults) | request_count | last_request (UTC) | expires |
|---|---|---|---|---|---|---|
| claude-code | yes | **no** | 86400000 / 10 | 0 | 2026-11-01 18:53 | never |
| remote-test | yes | **no** | 86400000 / 10 | 0 | 2026-11-01 19:40 | never |
| homeserver-panel | yes | **no** | 86400000 / 10 | 0 | 2026-11-01 21:04 | never |

Reading: none of the existing keys is rate limited. The 10/day values are only stored defaults; the limit applies only where `rate_limit_enabled` is true. Keys created in the Dokploy UI have it off. The trap from Step 0.1 (`401` after about 5 calls) affects keys created through `user.createApiKey` WITHOUT `rateLimitEnabled:false`. D7 covers it. The schema also confirms that `request_count` stays 0 when limiting is off, so it is not a usage meter.

## 2. Replacement keys and MCP entries (done: nothing to replace)

No key is rate limited, so no "-v2" key was created and the Claude Code MCP entries were not touched. Current health, from `claude mcp list` (secret path redacted), in `02-mcp-entries.md`: `dokploy` (local stdio) Connected, `dokploy-remote` (hosted, HTTP) Connected.

## 3. Tailscale real test (first blocked; completed as Step 0.2b, see 3b below)

`TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET` are not in `.env.local`. The addendum asked me to create them in the browser. I did not, because editing the Tailscale access policy (`tagOwners`) and generating an OAuth client with device-delete rights are security-setting changes that I may not make even when asked. Nothing was changed in Tailscale. **Not verified:** token minting, the device list, the homeserver device id, the delete-permission check (404 vs 403) and whether `tag:panel` limits which devices can be managed.

What Ahmed does (about 3 minutes), then I run the test:
1. Tailscale admin > Access controls: add only `"tagOwners": { "tag:panel": ["autogroup:admin"] }` (merge into the existing `tagOwners` block, change nothing else) and save.
2. Settings > Trust credentials (OAuth clients) > Generate: scopes Devices > Core Read and Write, tag `tag:panel`, description `homeserver-panel`. Copy the client id and secret.
3. Append both to `.env.local` as `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET` (the one-line PowerShell command in the step report does it without echoing the secret).

## 3b. Tailscale real test, Step 0.2b (done; delete permission NOT proven)

Run on 2026-11-01 with the OAuth client Ahmed created (scopes `devices:core:read` + `devices:core`, tag `tag:panel`). Nothing was deleted or modified. Evidence: `03-tailscale.md` (tokens and secrets redacted; other devices' IPs redacted).

| Check | Result |
|---|---|
| Mint token (`POST /api/v2/oauth/token`, client credentials) | HTTP 200, `Bearer`, `expires_in` 3600, granted scope `devices:core` |
| List devices (`GET /api/v2/tailnet/-/devices`) | HTTP 200, 3 devices: `DESKTOP-8B6PHQI` (windows), `homeserver` (linux), `localhost` (iOS, offline). All have **no tags**, none external |
| homeserver device | id `5052414055014507`, nodeId `nYV2sHMFTg11CNTRL`, tailnet IP `100.114.91.58`, connected |
| Read one device (`GET /api/v2/device/{id}`) | HTTP 200 |
| `DELETE /api/v2/device/nonexistent-spike-device-0000`, full token | **HTTP 404** `{"message":"no manageable device matching this ID found"}` |
| Control: same DELETE with a token minted with `scope=devices:core:read` only | **HTTP 404, identical body** (that read-only token still lists devices: 200) |

What this means, and what it does not:
- Token minting, listing and reading work with `tag:panel`, including for untagged devices. Verified.
- **The 404-vs-403 test does not prove delete permission.** The control shows a token that is definitely not allowed to delete gets the same 404, so for an unknown id the lookup fails before any scope check. The result tells nothing about whether `devices:core` + `tag:panel` can delete a real device. **Delete permission: not verified.**
- The wording "no manageable device" hints that a credential only manages some devices, possibly those owned by its tag. All three current devices are untagged, so it is **unknown whether a `tag:panel` credential can delete or modify untagged devices**.
- I did not probe further on a real device: a DELETE on the homeserver id with a read-only token would cut off the server if the API failed open, and a no-op write is a change nobody asked for.
- Safe way to settle it later: Ahmed adds a disposable tagged node (an ephemeral device created with a `tag:panel` auth key, on a spare machine or container), then delete that node with the panel's credential. Until then the panel's device page is **read-only** (list, last seen, online state) and the delete button stays out of the MVP.

## 4. SQLite choice (done): `node:sqlite`

Measured in a throwaway `node:24-alpine` container on the server (Node v24.22.2, Alpine, musl). Evidence: `04-sqlite.md`.

| | `node:sqlite` (built in) | `better-sqlite3` 13.0.3 |
|---|---|---|
| Install | none | `npm install`: 10 s, uses a prebuilt `linuxmusl-x64` binary, **no compiler or python needed** |
| Install size | 0 | 27 MB `node_modules` (all platforms' prebuilds ship in the package; the Linux musl binary itself is 2.4 MB) |
| RSS: start / after open + 1,000 inserts / growth | 46.8 / 53.4 / +6.5 MB | 46.8 / 56.1 / +9.3 MB |
| 1,000 autocommit inserts, WAL, `synchronous=NORMAL` | 108 ms | 138 ms |
| Library default `synchronous` | **FULL**: 4.8 s for the same inserts (fsync each) | NORMAL: 144 ms |
| Stability (Node 24 docs) | "Stability: 1.2 - Release candidate", no flag needed | mature, third-party native module |

Recommendation: **`node:sqlite`**, with `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000`. Reasons: zero dependencies and no native-binary supply chain, smaller RAM, equal speed once `synchronous` is set. The one trap is its FULL default (35x slower on autocommit writes), so set the pragma in the single database module. Risk: release-candidate API. Mitigation: all SQL lives behind one repository module, Node is pinned to a minor version in the Dockerfile, and swapping to `better-sqlite3` later is a one-file change (its prebuilt musl binary installs without a compiler). `better-sqlite3` is the fallback, not the first choice.

## 5. In-network wiring check (done)

Tiny drop app `spike-net` on `spike-net.talabq.com` (HTTPS off, certificate none). Its server called `http://dokploy:3000/api/user.session` with the `homeserver-panel` key from an env var and exposed only `{ok,status}`. Evidence: `05-network-wiring.md`.
- Over https the page returned `{"ok":true,"status":200}`; the check that the body has exactly `ok` and `status`, and contains neither the key nor the header name, passed.
- Build and deploy took 1.5 s (cached base image); the app is reachable from a freshly created app on the default network, so `http://dokploy:3000` works for new apps, not only for `dokploy-mcp`.
- Cleanup proven: `project.all` lists only `mcp-gateway` and `infra`; `application.one` and `domain.one` on the deleted ids return 404; the public URL returns 404; `overview.domains` shows no spike host; the database has 0 applications named `spike*` and 0 projects named `spike`; the server has only the four original services; the built image was removed with `docker rmi` (it is not removed by Dokploy).

## Owner actions performed by executor (addendum)

- **A. Rotate the `homeserver-panel` key: done.** Created a new `homeserver-panel` key with `rateLimitEnabled:false`, wrote it to `.env.local`, verified 12 consecutive `200` read calls (a default-limit key would have failed after about 5), deleted the old key by id, and the old key returned `401`. Key names after: `claude-code`, `homeserver-panel`, `remote-test`. `.tmp/set-key.ps1` does not exist. Evidence: `00-key-rotation.md` (the "AFTER" entry made with the old key's state shows the expected `401`; the re-read with the new key follows it).
- **B. Tailscale ACL edit and OAuth client creation: not done**, for the reason in item 3. Handed back to Ahmed with exact steps.
- **C. Cloudflare Access: no for the MVP (D6).** Recorded; nothing done in Cloudflare.

## Updated open-questions list

| # | Question | State |
|---|---|---|
| 1 | Tailscale OAuth client (`devices:core:read` + `devices:core`, `tag:panel`) and the real list/delete test | Partly closed in 0.2b: mint, list and read verified; delete **not** proven (see 3b) |
| 2 | Path routing vs one image | Closed: D5, one image |
| 3 | Zip upload size limit, `static` / `nixpacks` builds | Open, move to Step 0.3 (deploy tool) |
| 4 | Cloudflare Access | Closed: D6, no |
| 5 | `node:sqlite` vs `better-sqlite3` | Closed: `node:sqlite` |
| 6 | Does an app reach Dokploy at `http://dokploy:3000`? | Closed: yes, verified on a new app |
| 7 | Are existing keys rate limited? | Closed: no (all three have it off) |
| 8 | Does `tag:panel` limit which Tailscale devices can be deleted or modified? | **Open**: the 404 test is not a permission signal; needs a disposable tagged node |

## Changes this implies for the Phase 1 design

1. `DOKPLOY_URL` defaults to `http://dokploy:3000` in the container; the Tailscale IP is for local development only.
2. Database: `node:sqlite`, one repository module, the three pragmas above, Node pinned by minor version. No `better-sqlite3` dependency; drops the 27 MB package from the image.
3. Panel key handling: create every key with `rateLimitEnabled:false` (D7). A rotation feature is feasible with the proven order create -> verify -> delete old -> check `401`; the panel can only identify its own key by name (the list has no secret), so it must keep `homeserver-panel` unique.
4. Tailscale: the device page is read-only in the MVP (list, online state, last seen). Device deletion is out of the MVP until it is proven on a disposable tagged node; the protection rules for the server's own device and Ahmed's devices stay in the design for when it is added.
5. No change to D5, D6 or D8.

## Security review of the credential handling (/cso, static, scoped)

Run `1793567530469-5277e8f9d130dad3`, scope `credential-handling`, limited with `--paths` to `.gitignore`, `.env.example`, `docs/evidence/0.2`, `docs/step-0.2-report.md`; offline; static only (the helper reports Docker isolation is unavailable on native Windows). Helper status: **finished, completeness partial**. It records no supported findings for this run: **my submission was rejected twice** (first for an empty application-model dimension, then because I included two helper-owned coverage records), and I finished the run after the second failure instead of retrying. So the finding below is **not in the helper's record**; it comes from my own review of the files the helper let me read. Not assessed: `.env.local` contents, the rotation scripts under `.tmp`, Dokploy's stored env values, any real Tailscale credential (none exists).

| ID | Severity | Confidence | Where | Finding |
|---|---|---|---|---|
| S1 | low | medium | `.gitignore:1` | Only `.env.local`, `.tmp/` and `node_modules/` are ignored. A Phase 1 `backend/.env`, `.env.production` or a local SQLite file (owner password hash and TOTP secrets) would be staged by `git add -A`. No leak today: nothing sensitive is tracked and the committed docs contain 0 occurrences of the key. Fix: ignore `.env`, `.env.*` (keep `!.env.example`), `*.db`, `*.db-wal`, `*.db-shm`, `data/`, and add a pre-commit secret scan in Phase 1. |

Operational observations (outside the helper's snapshot, so not helper-verified):
- **O1, secret path shown in session output.** The hosted MCP's secret path appeared in this conversation's tool output twice (once in Step 0.1's health check, once from `claude mcp list` in this step). The committed evidence is clean (scanned), but the session transcript holds it. If transcripts leave this machine, rotate `DOKPLOY_MCP_HTTP_PATH` in the `dokploy-mcp` app and update the `dokploy-remote` entry. Not changed here (it was off limits).
- **O2, full-power key in a throwaway app's env.** For the item 5 spike the `homeserver-panel` key lived in the env of a publicly routed app for about 10 seconds (it answered only `{ok,status}` and was then deleted; the database shows 0 leftover apps). Any holder of a full key can read app env vars through the API (observed in Step 0.1), so Phase 1 should keep one purpose-named key per use and never reuse the owner's key for spikes.
- **O3, rotation flow is sound.** New key created first, 12 consecutive `200` calls, only then the old key deleted by id, old key proven `401`, key written to `.env.local` and never printed, evidence scanned for the key (0 hits). Weak points: no expiry on `claude-code` or `remote-test` (both have `expires_at` empty); `.env.local` relies on the Windows user's file permissions.
- **O4, planned Tailscale credential.** Keep the OAuth client secret only in `.env.local` locally and as a Dokploy env var in production, never in the repo; it is shown once at creation. `devices:core` can delete devices, so the server's own device and Ahmed's devices must be in the protected set. Rotation: create a new client, switch, then delete the old one. Not verified (no credential yet).
- **O5, redaction method.** The evidence helper redacts by field name and by known secret values. That held for these files, but a field with a neutral name would slip through by name, so keep the value-based pass in Phase 1 tooling.
