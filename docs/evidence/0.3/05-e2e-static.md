# Item 8a - Vite + React static site, hsdeploy up -> https://hs-static.talabq.com (final run with the final code)

Earlier runs in this step failed and led to fixes in hsdeploy (details in docs/step-0.3-report.md): project.all returns app summaries without appName/description; docker.getContainersByAppNameMatch returns [] with appType=stack; databases in project.all have no name; Dokploy leaves the postgres data volume and old images behind. This is the clean run.

```
$ hsdeploy up --expect "hs-static: Vite and React"          # run 1: creates project, app, domain
Creating project "hs-static"
Creating app "hs-static"
Creating domain hs-static.talabq.com (port 3000, HTTPS off, certificate none)
Running local build: npm run build
✓ 29 modules transformed.
✓ built in 1.20s
Packed 4 files into a 0.05 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 2.5 s
Container app-connect-bluetooth-panel-buthlz.1.zb69zw6z5iegb8gs0yrjtf3zy is running and stable
Public check passed in 0.4 s
Deployed: https://hs-static.talabq.com
(wall time 19 s: local build + zip + upload + server build + container check + public check)

$ hsdeploy up --expect "hs-static: Vite and React"          # run 2: redeploy
Running local build: npm run build
✓ 29 modules transformed.
✓ built in 1.38s
Packed 4 files into a 0.05 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 3.9 s
Container app-connect-bluetooth-panel-buthlz.1.knfgpxbyx1toh20w53ufrztn6 is running and stable
Public check passed in 0.4 s
Deployed: https://hs-static.talabq.com
(wall time 22 s)
```

## curl against the public URL
```
HTTP 200  time_total=0.549686s
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Connection: keep-alive
Cache-Control: no-cache
cf-cache-status: DYNAMIC
Server: cloudflare

--- body (first 12 lines)
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>hs-static</title>
    <script type="module" crossorigin src="/assets/index-DyxpfM4W.js"></script>
  </head>
  <body>
    <div id="root"><h1>hs-static: Vite and React deployed with hsdeploy</h1></div>
  </body>
</html>
--- asset
asset HTTP 200 content-type=text/javascript; charset=utf-8
```

## hsdeploy status
```json
{
  "exists": true,
  "status": "done",
  "hosts": [
    "hs-static.talabq.com"
  ],
  "lastDeployment": {
    "status": "done",
    "title": "Manual deployment",
    "createdAt": "2026-11-02T00:25:56.980Z"
  },
  "containers": [
    {
      "name": "<container>",
      "state": "running",
      "status": "Up 27 seconds"
    },
    {
      "name": "<container>",
      "state": "exited",
      "status": "Exited (137) 14 seconds ago"
    }
  ],
  "public": "HTTP 200"
}
```

## hsdeploy logs --tail 3
```
2026-11-02T00:26:02.564153397Z static server listening on 3000
```

## Run 3: changed content (button label), previous image removal
```
$ hsdeploy up --expect "hs-static: Vite and React"
Running local build: npm run build
✓ 29 modules transformed.
✓ built in 1.31s
Packed 4 files into a 0.05 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 2.6 s
Container app-connect-bluetooth-panel-buthlz.1.e33leh63uauhif0tq6l8ss734 is running and stable
Public check passed in 0.3 s
Removed the previous build's image
Deployed: https://hs-static.talabq.com
```
Result: the line "Removed the previous build's image" appears, and docker images -f dangling=true shows no image from this app (the only dangling image on the server is a 4-day-old one that existed before these tests).
