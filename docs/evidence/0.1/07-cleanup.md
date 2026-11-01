# Item 7 - cleanup and proof (keys redacted)

## domain.delete (spike-test.talabq.com)
> POST /api/domain.delete  (header: x-api-key: [REDACTED])
> body: {"domainId":"okeiIHrlA7hDmTvfdc3_H"}
> HTTP 200 in 460 ms
```json
{
 "domainId": "okeiIHrlA7hDmTvfdc3_H",
 "host": "spike-test.talabq.com",
 "https": false,
 "port": 3000,
 "customEntrypoint": null,
 "path": "/",
 "serviceName": null,
 "domainType": "application",
 "uniqueConfigKey": "[REDACTED]",
 "createdAt": "2026-11-01T20:20:39.683Z",
 "composeId": null,
 "customCertResolver": null,
 "applicationId": "NUPHDwH3fOBKN__s7ngPL",
 "previewDeploymentId": null,
 "certificateType": "none",
 "internalPath": "/",
 "stripPath": false,
 "middlewares": [],
 "forwardAuthEnabled": false,
 "enabled": true
}
```

## application.delete (spike-test, drop app)
> POST /api/application.delete  (header: x-api-key: [REDACTED])
> body: {"applicationId":"NUPHDwH3fOBKN__s7ngPL"}
> HTTP 200 in 1461 ms
```json
{
 "applicationId": "NUPHDwH3fOBKN__s7ngPL",
 "name": "spike-test",
 "appName": "app-hack-optical-system-vqslrr",
 "description": null,
 "env": null,
 "previewEnv": null,
 "watchPaths": null,
 "previewBuildArgs": null,
 "previewBuildSecrets": null,
 "previewLabels": null,
 "previewWildcard": null,
 "previewPort": 3000,
 "previewHttps": false,
 "previewPath": "/",
 "previewCertificateType": "none",
 "previewCustomCertResolver": null,
 "previewLimit": 3,
 "isPreviewDeploymentsActive": false,
 "previewRequireCollaboratorPermissions": true,
 "rollbackActive": false,
 "buildArgs": null,
 "buildSecr
... [trimmed, 4004 chars total]
```

## project.remove (spike)
> POST /api/project.remove  (header: x-api-key: [REDACTED])
> body: {"projectId":"bQ6O56kykxlBSvweHvZoK"}
> HTTP 200 in 223 ms
```json
{
 "projectId": "bQ6O56kykxlBSvweHvZoK",
 "name": "spike",
 "description": "capability spike - temporary, safe to delete",
 "createdAt": "2026-11-01T20:12:41.265Z",
 "organizationId": "RG27hJyQnwH0Le-61VBDf",
 "env": ""
}
```

## PROOF project.all: names + service counts
> GET /api/project.all  (header: x-api-key: [REDACTED])
> HTTP 200 in 189 ms
```json
[
 {
  "project": "mcp-gateway",
  "applications": [
   "dokploy-mcp"
  ],
  "compose": []
 },
 {
  "project": "infra",
  "applications": [
   "cloudflared"
  ],
  "compose": []
 }
]
```

## PROOF overview.domains: hosts still registered
> GET /api/overview.domains  (header: x-api-key: [REDACTED])
> HTTP 200 in 143 ms
```json
{
 "hosts": [
  "mcp.talabq.com"
 ]
}
```

## PROOF application.one for the deleted app (expected not found)
> GET /api/application.one?{"applicationId":"NUPHDwH3fOBKN__s7ngPL"}  (header: x-api-key: [REDACTED])
> HTTP 404 in 180 ms
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

## PROOF domain.one for the deleted domain (expected not found)
> GET /api/domain.one?{"domainId":"okeiIHrlA7hDmTvfdc3_H"}  (header: x-api-key: [REDACTED])
> HTTP 404 in 152 ms
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

## PROOF API key names (no spike-test*)
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 145 ms
```json
{
 "items": [
  "claude-code",
  "homeserver-panel",
  "remote-test"
 ]
}
```

## PROOF public URL after cleanup (expected 404 from Traefik)
> HEAD /api/https://spike-test.talabq.com  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "status": 404
}
```


## Server-side leftovers check (ssh homeserver, read + removal of our own spike image tag only)
```
Untagged: app-hack-optical-system-vqslrr:latest
Deleted: sha256:fc4566f4dc5691a2219c593bd3c3521964f7e7e23aadc9d27b34391f75fcad97
---
cloudflare/cloudflared:latest
node:24-alpine
postgres:<none>
dokploy/dokploy:v0.30.10
traefik:v3.6.25
dangling:
1
```
