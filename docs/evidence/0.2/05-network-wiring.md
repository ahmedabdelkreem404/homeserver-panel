# Item 5 - in-network wiring check (spike-net.talabq.com), then cleanup (key redacted)

## project.create
> POST /api/project.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike","description":"step 0.2 wiring spike - temporary"}
> HTTP 200 in 656 ms
```json
{
 "project": {
  "projectId": "lGiA9XKSaPrEkq0NcVeJ7",
  "name": "spike",
  "description": "step 0.2 wiring spike - temporary",
  "createdAt": "2026-11-01T21:09:30.080Z",
  "organizationId": "RG27hJyQnwH0Le-61VBDf",
  "env": ""
 },
 "environment": {
  "environmentId": "RKIOBTWwQNNMf2HEvFMvJ",
  "na
... [trimmed, 482 chars total]
```

## application.create (drop)
> POST /api/application.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike-net","environmentId":"RKIOBTWwQNNMf2HEvFMvJ","sourceType":"drop"}
> HTTP 200 in 778 ms
```json
{
 "applicationId": "NBFBsJJU6OZd9NKuDBncy",
 "name": "spike-net",
 "appName": "app-index-wireless-pixel-tjdxhc",
 "description": null,
 "env": null,
 "previewEnv": null,
 "watchPaths": null,
 "previewBuildArgs": null,
 "previewBuildSecrets": null,
 "previewLabels": null,
 "previewWildcard": null,
 
... [trimmed, 2532 chars total]
```

## application.saveBuildType
> POST /api/application.saveBuildType  (header: x-api-key: [REDACTED])
> body: {"applicationId":"NBFBsJJU6OZd9NKuDBncy","buildType":"dockerfile","dockerfile":"Dockerfile","dockerContextPath":"","dockerBuildStage":"","herokuVersion":null,"railpackVersion":null}
> HTTP 200 in 248 ms
```json
true
```

## application.saveEnvironment (env holds the key; redacted in this log)
> POST /api/application.saveEnvironment  (header: x-api-key: [REDACTED])
> body: {"applicationId":"NBFBsJJU6OZd9NKuDBncy","env":"[REDACTED]","buildArgs":null,"buildSecrets":null,"createEnvFile":false}
> HTTP 200 in 361 ms
```json
true
```

## domain.create (https=false, cert none)
> POST /api/domain.create  (header: x-api-key: [REDACTED])
> body: {"host":"spike-net.talabq.com","path":"/","port":3000,"https":false,"certificateType":"none","applicationId":"NBFBsJJU6OZd9NKuDBncy","domainType":"application"}
> HTTP 200 in 256 ms
```json
{
 "domainId": "tGooIRYNZuPBa6hRsf5v0",
 "host": "spike-net.talabq.com",
 "https": false,
 "port": 3000,
 "customEntrypoint": null,
 "path": "/",
 "serviceName": null,
 "domainType": "application",
 "uniqueConfigKey": "[REDACTED]",
 "createdAt": "2026-11-01T21:09:31.744Z",
 "composeId": null,
 "cust
... [trimmed, 535 chars total]
```

## application.dropDeployment
> POST /api/application.dropDeployment  (header: x-api-key: [REDACTED])
> HTTP 200 in 151 ms
```json
true
```

## https://spike-net.talabq.com response (the whole body)
> GET https://spike-net.talabq.com  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "publicHttpStatus": 200,
 "secondsUntilAnswer": 30.09,
 "body": {
  "ok": true,
  "status": 200
 },
 "bodyHasOnlyOkAndStatus": true,
 "bodyContainsKeyOrHeaderName": false
}
```

## domain.delete
> POST /api/domain.delete  (header: x-api-key: [REDACTED])
> body: {"domainId":"tGooIRYNZuPBa6hRsf5v0"}
> HTTP 200 in 281 ms
```json
{
 "domainId": "tGooIRYNZuPBa6hRsf5v0",
 "host": "spike-net.talabq.com",
 "https": false,
 "port": 3000,
 "customEntrypoint": null,
 "path": "/",
 "serviceName": null,
 "domainType": "application",
 "
... [trimmed, 535 chars total]
```

## application.delete
> POST /api/application.delete  (header: x-api-key: [REDACTED])
> body: {"applicationId":"NBFBsJJU6OZd9NKuDBncy"}
> HTTP 200 in 349 ms
```json
{
 "applicationId": "NBFBsJJU6OZd9NKuDBncy",
 "name": "spike-net",
 "appName": "app-index-wireless-pixel-tjdxhc",
 "description": null,
 "env": "[REDACTED]",
 "previewEnv": null,
 "watchPaths": null,

... [trimmed, 4004 chars total]
```

## project.remove
> POST /api/project.remove  (header: x-api-key: [REDACTED])
> body: {"projectId":"lGiA9XKSaPrEkq0NcVeJ7"}
> HTTP 200 in 284 ms
```json
{
 "projectId": "lGiA9XKSaPrEkq0NcVeJ7",
 "name": "spike",
 "description": "step 0.2 wiring spike - temporary",
 "createdAt": "2026-11-01T21:09:30.080Z",
 "organizationId": "RG27hJyQnwH0Le-61VBDf",
 "
... [trimmed, 210 chars total]
```

## PROOF project.all after cleanup
> GET /api/project.all  (header: x-api-key: [REDACTED])
> HTTP 200 in 632 ms
```json
[
 {
  "project": "mcp-gateway",
  "applications": [
   "dokploy-mcp"
  ]
 },
 {
  "project": "infra",
  "applications": [
   "cloudflared"
  ]
 }
]
```

## PROOF overview.domains hosts
> GET /api/overview.domains  (header: x-api-key: [REDACTED])
> HTTP 200 in 322 ms
```json
{
 "hosts": [
  "mcp.talabq.com"
 ]
}
```

## PROOF application.one on the deleted app (expect 404)
> GET /api/application.one?{"applicationId":"NBFBsJJU6OZd9NKuDBncy"}  (header: x-api-key: [REDACTED])
> HTTP 404 in 368 ms
```json
{
 "message": "Application not found",
 "code": "NOT_FOUND",
 "data": {
  "code": "NOT_FOUND",
  "httpStatus": 404,
  "path": "application.one",
  "zodError": null
 }
}
```

## PROOF domain.one on the deleted domain (expect 404)
> GET /api/domain.one?{"domainId":"tGooIRYNZuPBa6hRsf5v0"}  (header: x-api-key: [REDACTED])
> HTTP 404 in 474 ms
```json
{
 "message": "Domain not found",
 "code": "NOT_FOUND",
 "data": {
  "code": "NOT_FOUND",
  "httpStatus": 404,
  "path": "domain.one",
  "zodError": null
 }
}
```

## PROOF public URL after cleanup (expect 404)
> GET https://spike-net.talabq.com  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "status": 404
}
```

## PROOF server side (ssh homeserver, no sudo)
```
Untagged: app-index-wireless-pixel-tjdxhc:latest
Deleted: sha256:1bd8bfdb8d8036f33158bf49791e64bde20b851af5e8302c131c9de180d58194
--- services:
dokploy 1/1
dokploy-mcp-wcpvvs 1/1
dokploy-postgres 1/1
infra-cloudflared-dy6kmm 1/1
--- images:
cloudflare/cloudflared:latest
node:24-alpine
postgres:<none>
dokploy/dokploy:v0.30.10
traefik:v3.6.25
--- app dirs:
```

## PROOF database side (read-only counts; the env column that held the key was never selected)
```
applications named spike*: 0
projects named spike: 0
api keys: 3
```
