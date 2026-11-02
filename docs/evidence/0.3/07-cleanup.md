# Item 8c - cleanup proof after hsdeploy down (final pass)

Earlier passes showed three real problems that were fixed in hsdeploy and re-tested: Dokploy leaves the postgres data volume behind; the images of a deleted app stay while swarm still holds the stopped containers (down now waits for them to disappear before removing the image and volume); and rebuilds leave the previous image untagged (up now removes exactly that one).

## Teardown output (both exit 0)
```
$ cd hs-static && hsdeploy down --rm-project
OK   delete domain hs-static.talabq.com
OK   delete app hs-static
OK   wait for the app's containers to disappear
OK   remove built image
OK   delete empty project
Done.
exit=0

$ cd hs-db && hsdeploy down --with-db --rm-project
OK   delete domain hs-db.talabq.com
OK   delete app hs-db
OK   wait for the app's containers to disappear
OK   remove built image
OK   delete postgres service hs-db-db
OK   wait for the database containers to disappear
OK   remove data volume postgres-bypass-haptic-hard-drive-bvyu5e-data
OK   delete empty project
Done.
exit=0
```

## Dokploy API
```
project.all -> projects: mcp-gateway, infra
hs-* projects remaining: 0
hs-static: application.one -> 404 not found
hs-static: domain.one(hs-static.talabq.com) -> 404 not found
hs-static: project.one -> 404 not found
hs-static: public https://hs-static.talabq.com -> HTTP 404
hs-db: application.one -> 404 not found
hs-db: domain.one(hs-db.talabq.com) -> 404 not found
hs-db: postgres.one -> 404 not found
hs-db: project.one -> 404 not found
hs-db: public https://hs-db.talabq.com -> HTTP 404
overview.domains hosts: mcp.talabq.com
```

## Server (ssh homeserver, no sudo) and database (read-only counts)
```
services:
dokploy 1/1
dokploy-mcp-wcpvvs 1/1
dokploy-postgres 1/1
infra-cloudflared-dy6kmm 1/1
stray app/postgres containers:
db counts (read-only):
  applications named hs-*: 0
  postgres named hs-*: 0
  projects named hs-*: 0
  domains hs-*: 0
  api keys: claude-code, deploy-cli, remote-test, homeserver-panel
```

## Server images and named volumes: before the final pass vs after teardown
```
baseline:
  11a8ef9411df dokploy/dokploy:v0.30.10
  349727db7d6c node:24-alpine
  5436e6763af2 cloudflare/cloudflared:latest
  74d436cb49d3 postgres:<none>
  ee0b3aaa56c3 traefik:v3.6.25
  ---
  dokploy
  dokploy-mcp-npm
  dokploy-postgres

after:
  11a8ef9411df dokploy/dokploy:v0.30.10
  349727db7d6c node:24-alpine
  5436e6763af2 cloudflare/cloudflared:latest
  74d436cb49d3 postgres:<none>
  ee0b3aaa56c3 traefik:v3.6.25
  ---
  dokploy
  dokploy-mcp-npm
  dokploy-postgres

diff: identical
```
