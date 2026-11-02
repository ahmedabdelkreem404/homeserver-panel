اللوحة شغالة على https://panel.talabq.com، والـ container بيستهلك حوالي 30MB من 256MB، والـ 21 مسار API محميين.
الإيميل هو إيميل حسابك في Dokploy، وكلمة المرور الأولى في ملف panel-first-login.txt على الـ Desktop (مش في أي تقرير).
أول ما تدخل هتغير الباسوورد وتفعل الـ 2FA. ما دخلتش بحسابك الحقيقي ولا غيرت له باسوورد.

STEP REPORT: 1.5 (deploy)
Status: done, with the deviations below
Branch: step-1.5 (from step-E)

## Summary
Panel deployed through hsdeploy to the Dokploy project `homeserver-panel`, app `panel`, domain `panel.talabq.com` (HTTPS off, certificate none). One non-root container (uid 1000) from `node:24-alpine`, 256 MB / 1 CPU, volume `panel-data` at `/data`, host `/proc` and `/sys` at `/host/proc` and `/host/sys`. Built locally (`scripts/build-release.mjs`); the image only copies the staged output.
Added in this part: the daily SQLite backup (online backup API, 7 kept, owner-only files) and the "download backup" button in Settings; `shared-services` and `panel-runtime` joined the built-in protected names; hsdeploy lets the panel repository use the reserved subdomain `panel`.

## Changes
`Dockerfile`, `.dockerignore`, `.hsdeploy.json`, `scripts/build-release.mjs`; backend `services/backup.js`, route `GET /api/settings/backup` and `/backups`, wiring and protected names; frontend `BackupCard`; hsdeploy subdomain exception; `docs/PANEL-OPERATIONS.md`; tests.

## Commands and results
- Node 24 in Docker, `npm test`: backend 96/96, frontend 40/40 (`evidence/1.5/05-tests-node24.txt`).
- Deploy: `evidence/1.5/00-deploy.txt` (container stable, public check passed).
- Production checks (`01-prod-checks.txt`): `/` 200 with the login shell; `/api/health` ok (process, db, dokploy); 21 API routes (read, write, backup, sessions) answer 401 without a session, 0 unprotected; CSP (default-src none, script-src self, frame-ancestors none), X-Frame-Options DENY, Referrer-Policy no-referrer, nosniff, HSTS present, no x-powered-by; the first password round trip works (sign-in step one returns `password_ok` / `change_password`, nothing changed).
- Container (`02-container-and-metrics.txt`): runs as `node`, health `healthy`, limits `NanoCPUs 1e9 / MemoryBytes 268435456`, the three mounts, a backup file `panel-20261102-121439.db` mode 600 in a 700 folder, and real host values read from inside it (wifi `wlp2s0b1` 94 % / -44 dBm, CPU, memory, 6 temperature sensors, battery).
- Idle memory (`06-docker-stats-idle.txt`): 29.6 MiB of 256 MiB after more than 10 minutes (limit asked: under 200 MB).
- Cleanup (`03-cleanup.txt`): Dokploy keys are `claude-code, deploy-cli, homeserver-panel, panel-runtime, remote-test` (no `e2e-temp`); projects `homeserver-panel, shared-services, mcp-gateway, infra`, none of the throwaway `hs-*`; no leftover containers; the `alpine` image pulled for a check was removed.
- Secret scan (`04-secret-scan.txt`): 0 hits for the deploy key, runtime key, Tailscale secret, panel secret key, owner hash and first password in all commits and the staged diff. The owner email matches only git `Author:` lines; one real-email string in an old test was replaced by a placeholder.

## Acceptance
Met: panel reachable, health ok, protected routes 401, headers, RAM under 200 MB, host metrics real, cleanup proven, secret scan 0, backups (daily plus download), runtime key `panel-runtime` (rate limit off, no expiry, protected name).
Not met or partly:
- Host mounts are not read-only: Dokploy v0.30.10 has no read-only flag for bind mounts. Mitigated by the non-root user (cannot write root-owned /proc and /sys files) and by the backend only reading.
- No screenshots of the production screens: they need the owner's real password and TOTP, and the first sign-in is yours. The same screens at phone and desktop width, with real Dokploy data, are in `evidence/1.4/screens`.
- `/qa` against production and `/cso` were not run as the formal gstack skills. A manual pass instead (below).
- D11 metrics through a session: the host values were read in the container, the disk value comes from Dokploy (shown with a real value in the 1.4 screenshots); no signed-in call was made against production.

## Manual security pass (OWASP / STRIDE, short)
Spoofing: argon2id passwords, TOTP with replay rejection, recovery codes single-use, lockout with backoff, one failure message for both fields. Tampering: CSRF double-submit on every mutation (E2E-proved), SameSite=Strict `__Host-` cookies, strict CSP. Repudiation: every mutation audited before it runs, backups and downloads audited. Information disclosure: no secret in logs, errors or answers (asserted in tests), secrets only in Dokploy env, secret scan 0. Denial of service: rate limits and lockout, container limits. Elevation: one permission function, protected projects and keys enforced by one policy, MCP path rotation is the single exception inside `mcp-gateway`. Residual risks: rw bind mounts (above), `panel.db` is mode 644 inside the volume, an attacker with Dokploy access controls everything anyway.

## Deviations
Part 1.5 asked for read-only mounts, `/qa` and `/cso`, and production screenshots; see above. The runtime key was created with a direct Dokploy API call from a script (the secret went straight into a git-ignored file), because the panel cannot create its own runtime key before it runs.

## Open issues
- Health checks log at info level every 30 s (noisy logs); the Docker log rotation arrives with Phase 2.
- RTL cosmetic: units before numbers ("GB 1.8").
- The Desktop password file must be deleted by the owner after the first sign-in.

## Needs Ahmed
Sign in once at https://panel.talabq.com with the Desktop file's email and password, set a new password, set up the authenticator app and save the recovery codes. Then delete the Desktop file.

## Suggested next step
Phase 2 (network and power): the ops bundle that you run with one sudo command.
