# Step 1.2 - Authentication

Branch `step-1.2` (from `step-1.1`). Evidence: `docs/evidence/1.2/`. Tests run on Node v24.22.2 in `node:24-alpine` via Docker.

## What was built

| Area | Implementation |
|---|---|
| Users (D16) | `users` table: id, email (unique), password_hash, role (plain text), totp_secret_enc, totp_enabled, last_totp_step, must_change_password, created_at, updated_at. `permissions.js` holds the single `can(user, action)`; only the `owner` role exists (all actions). A route names its action in `config.permission`; one hook calls `can()`. |
| Passwords | `crypto.argon2Sync` (argon2id), 19 MiB, 2 passes, 1 lane; constant-time tag comparison; stored as `argon2id:m:t:p:salt:hash` (no `$`, safe in env files and Dokploy); unknown accounts get a dummy verify so timing is the same; rules: 12 to 200 characters, not repetitive, not the email name. |
| Owner bootstrap | First boot, no users: owner from `OWNER_EMAIL` + `OWNER_PASSWORD_HASH`, `must_change_password = 1`. No signup route exists (404). `scripts/hash-password.js` makes the hash from stdin. |
| TOTP | RFC 6238 with `node:crypto` (verified against the RFC 4226 and 6238 vectors); window of one step each side; a step can be used once (compare-and-set on `last_totp_step`, so two parallel requests cannot both pass); secret AES-256-GCM encrypted at rest with `PANEL_SECRET_KEY`; QR drawn locally as SVG with `qrcode-generator` (one small dependency without further dependencies, the only one added). |
| Recovery codes | 10 codes per user, stored as HMAC hashes, single use, regenerated with the password (old ones die). |
| Sessions | Random 256-bit token, only its SHA-256 stored; cookies `__Host-panel_session` (HttpOnly, Secure, SameSite=Strict, Path=/, no Domain); idle 12 h, absolute 7 days; token rotates at login, at password change and at the move to a full session; list, revoke one, revoke others, logout; a password change signs out every other browser. |
| CSRF | Double submit (`__Host-panel_csrf` cookie = `x-csrf-token` header, compared in constant time) on every state-changing request including login, plus an Origin check (default ports normalized). |
| Lockout | 5 failures per account and 20 per IP in 15 minutes; then a lock of 1, 2, 4 ... up to 60 minutes. Unknown emails count the same, so the answer never says whether an account exists. Wrong TOTP and recovery guesses count too. |
| Audit | Every login, TOTP, recovery, password and session action writes a row; the same generic message for any bad credential; blocked attempts are written at most once a minute per IP and account so an attacker cannot push real history out of the table. |
| Access rule | Each route declares `config.access`: `public`, `pre` (password done, TOTP pending), `session` (either stage) or `full`. A route that declares nothing is `full` (deny by default). |

Routes: `GET /api/auth/csrf`, `GET /api/auth/session`, `POST /api/auth/login`, `change-password`, `totp/enroll/start`, `totp/enroll/confirm`, `totp/verify`, `recovery`, `logout`, `GET sessions`, `POST sessions/revoke`, `POST recovery-codes/regenerate`. Everything else under `/api` needs a full session (password and TOTP done, password already changed).

## Tests: 59 pass (was 37)

New: password (hash, verify, malformed, rules), TOTP (RFC vectors, window, replay, garbage), secret box (round trip, tamper, key formats), permissions, sessions (idle, absolute, rotation, revoke), lockout (limits, backoff, window, per-IP), and 11 HTTP flows: every route answers 401 without a session (the list of public routes is asserted and the route table is built from the live app), CSRF missing, wrong, short or foreign-origin, generic login failures and no secret in audit, lockout, the full first login (password change, QR, TOTP, recovery codes, encrypted secret, hashed codes), later sign-ins with replay rejected, recovery single use and regeneration, guesses counted toward the lockout, session expiry and revocation, cookie hardening and token rotation, password change revoking other sessions, the `must_change_password` gate and the `forbidden` answer for a role without rights, owner bootstrap with no signup route and nothing secret in responses or logs.

Bugs the tests found while building: the route table listed Fastify's automatic HEAD twins (fixed), and the CSRF Origin check compared `localhost` with `localhost:80` (fixed by normalizing ports the same way for both sides).

## Review (inline; the gstack skill was not invoked for this part, to keep this long run affordable)

- Recovery-code login skips TOTP by design; it still needs the password and counts failures.
- The CSRF token is not bound to the session; SameSite=Strict, the Origin check and the `__Host-` prefix cover login CSRF and fixation.
- The IP for lockout comes from `cf-connecting-ip` (set by Cloudflare); someone who reaches Traefik directly could spoof it, but the per-account lock still applies.
- Over plain HTTP Safari will not store Secure cookies; production is HTTPS through Cloudflare and Chromium accepts them on localhost for the local E2E.
- Changing `OWNER_PASSWORD_HASH` after the first boot does nothing (the owner already exists); a documented reset procedure goes into `docs/PANEL-OPERATIONS.md` in step 1.5.

## Acceptance

All listed test areas pass on Node 24 in Docker (`00-tests-node24.txt`): password, TOTP window and replay, recovery codes single-use, lockout, CSRF missing and invalid, session expiry, `must_change_password` gate, 401 on every protected route. Nothing is exposed publicly yet.
