# Item 6 - direct deploy from local zip (no Git provider), spike-test.talabq.com

## application.create (sourceType=drop)
> POST /api/application.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike-test","environmentId":"e_COARwMejO2vBqadJUDq","sourceType":"drop"}
> HTTP 200 in 454 ms
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
 "buildSecrets": null,
 "memoryReservation": null,
 "memoryLimit": null,
 "cpuReservation": null,
 "cpuLimit": null,
 "title": null,
 "enabled": null,
 "subtitle": null,
 "command": null,
 "args": null,
 "icon": null,
 "refreshToken": "[REDACTED]",
 "sourceType": "drop",
 "cleanCache": false,
 "repository": nu
... [trimmed, 2532 chars total]
```

## application.saveBuildType (dockerfile, context '.')
> POST /api/application.saveBuildType  (header: x-api-key: [REDACTED])
> body: {"applicationId":"NUPHDwH3fOBKN__s7ngPL","buildType":"dockerfile","dockerfile":"Dockerfile","dockerContextPath":"","dockerBuildStage":"","herokuVersion":null,"railpackVersion":null}
> HTTP 200 in 229 ms
```json
true
```

## domain.create (https=false, certificateType=none)
> POST /api/domain.create  (header: x-api-key: [REDACTED])
> body: {"host":"spike-test.talabq.com","path":"/","port":3000,"https":false,"certificateType":"none","applicationId":"NUPHDwH3fOBKN__s7ngPL","domainType":"application"}
> HTTP 200 in 242 ms
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

## application.dropDeployment (multipart: applicationId, zip)
> POST /api/application.dropDeployment  (header: x-api-key: [REDACTED])
> HTTP 200 in 170 ms
```json
true
```

## deployment.readLogs (tail=40)
> GET /api/deployment.readLogs?{"deploymentId":"w0qbMrToNFcaQ4SUag-7m","tail":40}  (header: x-api-key: [REDACTED])
> HTTP 200 in 345 ms
```json
Initializing deployment
Building app-hack-optical-system-vqslrr
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 137B done
#1 DONE 0.1s

#2 [internal] load metadata for docker.io/library/node:24-alpine
#2 DONE 0.0s

#3 [internal] load .dockerignore
#3 transferring context: 2B done
#3 DONE 0.1s

#4 [internal] load build context
#4 transferring context: 535B done
#4 DONE 0.1s

#5 [1/3] FROM docker.io/library/node:24-alpine
#5 DONE 0.2s

#6 [2/3] WORKDIR /app
#6 DONE 0.1s

#7 [3/3] COPY index.html server.js ./
#7 DONE 0.1s

#8 exporting to image
#8 exporting layers 0.1s done
#8 writing image sha256:fc4566f4dc5691a2219c593bd3c3521964f7e7e23aadc9d27b34391f75fcad97 done
#8 naming to docker.io/library/app-hack-optical-system-vqslrr 0.0s done
#8 DONE 0.1s
✅ Docker build completed.

```

## TIMINGS (t0 = start of zip upload)
> - /api/-  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "zipBytes": 730,
 "secondsUploadReturned": 0.172,
 "deploymentStatus": "done",
 "secondsDeploymentFinished": 3.324,
 "secondsUntilPublic200": 8.205,
 "lastPublicStatus": 200
}
```

## curl -I https://spike-test.talabq.com (run from this PC, Report-To header trimmed)
```
HTTP/1.1 200 OK
Date: Sun, 01 Nov 2026 20:21:08 GMT
Content-Type: text/html; charset=utf-8
Connection: keep-alive
cf-cache-status: DYNAMIC
Server: cloudflare
CF-RAY: a53d9aa29919f539-MRS
alt-svc: h3=":443"; ma=86400


--- body:
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>spike-test</title></head>
<body><h1>spike-test: direct deploy works</h1></body></html>
```
