# Item 8b - Node app with Dockerfile + hsdeploy db create postgres -> https://hs-db.talabq.com (final run with the final code)

Output below contains no secrets: the database password and DATABASE_URL are never printed (checked with grep, 0 hits).

```
$ hsdeploy up --no-verify            # server builds the Dockerfile (npm ci of pg)
Creating project "hs-db"
Creating app "hs-db"
Creating domain hs-db.talabq.com (port 3000, HTTPS off, certificate none)
Packed 4 files into a 0.00 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 2.4 s
Deployed: https://hs-db.talabq.com

$ hsdeploy db create postgres --image postgres:16@sha256:<digest already cached on the server>
Creating postgres service "hs-db-db"
Container postgres-compress-optical-driver-5gmbos.1.x7a72rofpss54zjo976bxiein is running and stable
DATABASE_URL was written to the app environment (value not shown). Run `hsdeploy up` to apply it.
Database ready: hs-db-db (internal host postgres-compress-optical-driver-5gmbos). DATABASE_URL is set in the app env.

$ hsdeploy env push
Set 2 variable(s): HS_NOTE, HS_FLAG (values not shown). Run `hsdeploy up` to apply.

$ hsdeploy up --expect "\"db\":\"ok\""
Packed 4 files into a 0.00 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 2.5 s
Container app-reboot-virtual-panel-o5jhw7.1.ey9hsyzr8drdk4a1kye6xwpew is running and stable
Public check passed in 0.5 s
Deployed: https://hs-db.talabq.com
(whole flow: 35 s wall time)
```

## curl: the page runs CREATE TABLE IF NOT EXISTS, INSERT and SELECT count(*) against Postgres on every request
```
{"db":"ok"}   <- HTTP 200 in 0.345611s
{"db":"ok"}   <- HTTP 200 in 0.412694s
{"db":"ok"}   <- HTTP 200 in 0.338156s
HTTP/1.1 200 OK
Content-Type: application/json
```

## env keys after db create and env push (names only): DATABASE_URL is kept next to the pushed keys
```
env key names after push: DATABASE_URL, HS_NOTE, HS_FLAG
```

## the env file is never shipped
```
Dry run: 4 files, 0.00 MB. Nothing was uploaded.
zip contains: Dockerfile, package-lock.json, package.json, server.js
```
