# Panel operations

The panel runs at https://panel.talabq.com as the Dokploy app `panel` in the project `homeserver-panel` (one container, 256 MB, 1 CPU, non-root). Data (SQLite and its backups) lives in the Docker volume `panel-data` mounted at `/data`. The host's `/proc` and `/sys` are mounted at `/host/proc` and `/host/sys` so the server pages can show real numbers.

## First sign-in
1. Open https://panel.talabq.com. Email and the temporary password are in `%USERPROFILE%\Desktop\panel-first-login.txt` (the email is the Dokploy account's).
2. The panel asks for a new password (12 characters or more), then to set up an authenticator app (scan the QR), then shows 10 recovery codes once. Save them somewhere safe and tick the box.
3. Delete the Desktop file.

If the first password is lost before the first sign-in, set a new `OWNER_PASSWORD_HASH` (see "Reset the owner") and redeploy.

## Update the panel
From the repository root, on a branch whose tests pass:

```bash
node scripts/build-release.mjs   # builds the UI and stages release/ (deps, backend, frontend) locally
hsdeploy up --expect 'id="root"' # zips Dockerfile + release/, deploys, checks the container and the public page
```

`hsdeploy up` is allowed for the protected project `homeserver-panel` only from this repository (see `tools/hsdeploy/README.md`). `down` and `db create` stay refused there. The build runs on this machine, never on the server. The environment variables are not re-sent by `up`; change them with `hsdeploy env push` (file named in `.hsdeploy.json`, kept outside git) and then `hsdeploy up`.

## Environment variables
`DOKPLOY_URL` (`http://dokploy:3000`), `DOKPLOY_API_KEY` (the `panel-runtime` key), `PANEL_SECRET_KEY` (32 random bytes as hex; encrypts the TOTP secrets), `OWNER_EMAIL`, `OWNER_PASSWORD_HASH` (only used while no user exists), `TAILSCALE_OAUTH_CLIENT_ID` / `_SECRET`, `LOG_LEVEL`. Optional: `PROTECTED_PROJECT_NAMES`, `PROTECTED_KEY_NAMES` (extend the built-in protected lists, never shrink them), `BASE_DOMAIN`, `MCP_*`. Values never appear in logs, errors or API answers.

## Rotate the runtime key (`panel-runtime`)
1. Create a new key in the panel (MCP access page) named `panel-runtime-new`, or with Dokploy's UI (rate limit disabled, no expiry).
2. Put it in the env file as `DOKPLOY_API_KEY`, run `hsdeploy env push`, then `hsdeploy up`.
3. Check https://panel.talabq.com/api/health answers `dokploy: ok`, then revoke the old key in Dokploy. `panel-runtime` is a protected name: the panel itself refuses to revoke it.

## Rotate `PANEL_SECRET_KEY`
Changing it makes every stored TOTP secret unreadable: every account would have to enroll again. Only do it if the key leaked: stop the app, delete `/data/panel.db` (see "Reset the owner"), set the new key and redeploy.

## Backups and restore
- The panel makes one online backup per UTC day (and one at start-up if today has none) in `/data/backups`, owner-only files named `panel-YYYYMMDD-HHMMSS.db`, newest 7 kept.
- Settings, "Backup": download a fresh copy at any time (audited). The file holds password hashes and encrypted TOTP secrets: keep it private.
- Restore: stop the app in Dokploy, copy the chosen file over the live database, start the app.

```bash
ssh homeserver
docker run --rm -v panel-data:/data alpine sh -c 'ls -l /data/backups'
# after stopping the app in Dokploy:
docker run --rm -v panel-data:/data alpine sh -c 'cp /data/backups/panel-YYYYMMDD-HHMMSS.db /data/panel.db && rm -f /data/panel.db-wal /data/panel.db-shm && chown 1000:1000 /data/panel.db'
```
Start the app again and sign in. Sessions are part of the database, so you return to the state of the backup.

## Reset the owner (lost password and recovery codes)
Stop the app, delete `panel.db` (and `-wal`, `-shm`) from the volume, set `OWNER_EMAIL` and a new `OWNER_PASSWORD_HASH`, start. A new first sign-in follows. Audit history is lost with the file: restore a backup instead if you only need an older state.

To make a hash: `docker run --rm -i -v <repo>:/app -w /app/packages/backend node:24-alpine node -e "let p='';process.stdin.on('data',d=>p+=d).on('end',()=>import('./src/auth/password.js').then(m=>process.stdout.write(m.hashPassword(p.trim()))))"` and type the password on stdin.

## Rotate the MCP path
MCP access page, "Change the secret path". It sets a new random `DOKPLOY_MCP_HTTP_PATH` on the `dokploy-mcp` app, redeploys it, waits for `/health` and shows the new URL once. Every connected client disconnects until it uses the new URL. This is the only change the panel may make inside the protected `mcp-gateway` project.

## Where things are
- Health: `GET /api/health` (coarse states only).
- Audit log: the panel's Audit page; every mutation is recorded before it runs.
- Logs: Dokploy, app `panel`, or `ssh homeserver docker logs <container>`.
- Limits, volumes and mounts are set in Dokploy for the app `panel`; `hsdeploy up` re-applies the 256 MB / 1 CPU limits on each deploy.
