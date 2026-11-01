# Item 5 - app lifecycle on throwaway project 'spike' (env/keys redacted)

## project.create
> POST /api/project.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike","description":"capability spike - temporary, safe to delete"}
> HTTP 200 in 398 ms
```json
{
 "project": {
  "projectId": "bQ6O56kykxlBSvweHvZoK",
  "name": "spike",
  "description": "capability spike - temporary, safe to delete",
  "createdAt": "2026-11-01T20:12:41.265Z",
  "organizationId": "RG27hJyQnwH0Le-61VBDf",
  "env": ""
 },
 "environment": {
  "environmentId": "e_COARwMejO2vBqadJUDq",
  "name": "production",
  "description": "Production environment",
  "createdAt": "2026-11-01T20:12:41.271Z",
  "env": "",
  "projectId": "bQ6O56kykxlBSvweHvZoK",
  "isDefault": true
 }
}
```

## application.create
> POST /api/application.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike-lifecycle","environmentId":"e_COARwMejO2vBqadJUDq","sourceType":"docker"}
> HTTP 200 in 433 ms
```json
{
 "applicationId": "30yumttVZwoYuYjUYUTU7",
 "name": "spike-lifecycle",
 "appName": "app-navigate-haptic-feed-xrc8jt",
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
 "sourceType": "docker",
 "cleanCache": false,
 "reposit
... [trimmed, 2540 chars total]
```

## application.saveDockerProvider (node:24-alpine, no registry)
> POST /api/application.saveDockerProvider  (header: x-api-key: [REDACTED])
> body: {"applicationId":"30yumttVZwoYuYjUYUTU7","dockerImage":"node:24-alpine","username":null,"password":null,"registryUrl":null}
> HTTP 200 in 281 ms
```json
true
```

## application.update (command = tiny node http server on :3000)
> POST /api/application.update  (header: x-api-key: [REDACTED])
> body: {"applicationId":"30yumttVZwoYuYjUYUTU7","command":"node -e \"require('http').createServer((q,s)=>s.end('spike ok')).listen(3000,()=>console.log('spike listening on 3000'))\""}
> HTTP 200 in 191 ms
```json
true
```

## application.deploy (deploy)
> POST /api/application.deploy  (header: x-api-key: [REDACTED])
> body: {"applicationId":"30yumttVZwoYuYjUYUTU7","title":"spike first deploy"}
> HTTP 200 in 265 ms
```json

```

## application.readLogs (runtime logs, tail=10) after deploy
> GET /api/application.readLogs?{"applicationId":"30yumttVZwoYuYjUYUTU7","tail":10}  (header: x-api-key: [REDACTED])
> HTTP 200 in 338 ms
```json

```

## application.stop (stop)
> POST /api/application.stop  (header: x-api-key: [REDACTED])
> body: {"applicationId":"30yumttVZwoYuYjUYUTU7"}
> HTTP 200 in 5442 ms
```json
{
 "applicationId": "30yumttVZwoYuYjUYUTU7",
 "name": "spike-lifecycle",
 "appName": "app-navigate-haptic-feed-xrc8jt",
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
 "command": "node -e \"require('http').createServer((q,s)=>s.end('spike ok')).listen(3000,()=>console.log('spike listening on 3000'))\"
... [trimmed, 4155 chars total]
```


# FIRST ATTEMPT ABORTED: command with quotes crashed the container, application.start then hung >300s (HeadersTimeout). App deleted and re-run below with `ping 127.0.0.1`.

## application.delete (broken first-attempt app)
> POST /api/application.delete  (header: x-api-key: [REDACTED])
> body: {"applicationId":"30yumttVZwoYuYjUYUTU7"}
> HTTP 200 in 455 ms
```json
{
 "applicationId": "30yumttVZwoYuYjUYUTU7",
 "name": "spike-lifecycle",
 "appName": "app-navigate-haptic-feed-xrc8jt",
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
 "command": "node -e \"require('http').createServer((q,s)=>s.end('spike ok')).listen(3000,()=>console.log('spike listening on 3000'))\"",
 "args": null,
 "icon": null,
 "refreshToken": "[REDACTED]",
 "sourceType": "docker",
 "cleanCache": false,
 "repository": null,
 "owner": null,
 "branch": null,
 "buildPath": "/",
 "triggerType": "push",
 "autoDeploy": true,
 "gitlabProjectId": null,
 "gitlabRepository": null,
 "gitlabOwner": null,
 "gitlabBranch": null,
 "gitlabBuildPath": "/",
 "gitlabPathNamespace": null,
 "giteaRepository": null,
 "giteaOwner": null,
 "giteaBranch": null,
 "giteaBuildPath": "/",
 "bitbucketRepository": null,
 "bitbucketRepositorySlug": null,
 "bitbucketOwner": null,
 "bitbucketBranch": null,
 "bitbucke
... [trimmed, 4155 chars total]
```


# Item 5 - ATTEMPT 2 (command: ping 127.0.0.1, no quoting)

## application.create
> POST /api/application.create  (header: x-api-key: [REDACTED])
> body: {"name":"spike-lifecycle","environmentId":"e_COARwMejO2vBqadJUDq","sourceType":"docker"}
> HTTP 200 in 389 ms
```json
{
 "applicationId": "LYMwRpYYSHxHSzoiencyU",
 "name": "spike-lifecycle",
 "appName": "app-hack-auxiliary-driver-otapap",
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
 "sourceType": "docker",
 "cleanCache": false,
 "reposi
... [trimmed, 2541 chars total]
```

## application.saveDockerProvider (node:24-alpine, no registry)
> POST /api/application.saveDockerProvider  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU","dockerImage":"node:24-alpine","username":null,"password":null,"registryUrl":null}
> HTTP 200 in 205 ms
```json
true
```

## application.update (command = ping 127.0.0.1, logs a line per second)
> POST /api/application.update  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU","command":"ping 127.0.0.1"}
> HTTP 200 in 310 ms
```json
true
```

## application.deploy (deploy)
> POST /api/application.deploy  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU","title":"spike first deploy"}
> HTTP 200 in 621 ms
```json

```

## application.readLogs (runtime logs, tail=10) after deploy
> GET /api/application.readLogs?{"applicationId":"LYMwRpYYSHxHSzoiencyU","tail":10}  (header: x-api-key: [REDACTED])
> HTTP 200 in 350 ms
```json

```

## application.stop (stop)
> POST /api/application.stop  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU"}
> HTTP 200 in 5507 ms
```json
{
 "applicationId": "LYMwRpYYSHxHSzoiencyU",
 "name": "spike-lifecycle",
 "appName": "app-hack-auxiliary-driver-otapap",
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
 "command": "ping 127.0.0.1",
 "args": null,
 "icon": null,
 "refreshToken": "[REDACTED]",
 "sourceType": "docker",
 "cleanCache": fal
... [trimmed, 4050 chars total]
```

## application.start (start)
> POST /api/application.start  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU"}
> HTTP 200 in 9883 ms
```json
{
 "applicationId": "LYMwRpYYSHxHSzoiencyU",
 "name": "spike-lifecycle",
 "appName": "app-hack-auxiliary-driver-otapap",
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
 "command": "ping 127.0.0.1",
 "args": null,
 "icon": null,
 "refreshToken": "[REDACTED]",
 "sourceType": "docker",
 "cleanCache": fal
... [trimmed, 4050 chars total]
```

## application.redeploy (redeploy)
> POST /api/application.redeploy  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU","title":"spike redeploy"}
> HTTP 200 in 290 ms
```json

```

## application.readLogs (runtime logs, tail=10) after redeploy
> GET /api/application.readLogs?{"applicationId":"LYMwRpYYSHxHSzoiencyU","tail":10}  (header: x-api-key: [REDACTED])
> HTTP 200 in 373 ms
```json
2026-11-01T20:19:37.769985338Z PING 127.0.0.1 (127.0.0.1): 56 data bytes
2026-11-01T20:19:37.770055703Z 64 bytes from 127.0.0.1: seq=0 ttl=64 time=0.099 ms
2026-11-01T20:19:38.769972605Z 64 bytes from 127.0.0.1: seq=1 ttl=64 time=0.129 ms
2026-11-01T20:19:39.770324274Z 64 bytes from 127.0.0.1: seq=2 ttl=64 time=0.149 ms
2026-11-01T20:19:40.770465381Z 64 bytes from 127.0.0.1: seq=3 ttl=64 time=0.141 ms
2026-11-01T20:19:41.770809479Z 64 bytes from 127.0.0.1: seq=4 ttl=64 time=0.190 ms
2026-11-01T20:19:42.771121672Z 64 bytes from 127.0.0.1: seq=5 ttl=64 time=0.183 ms
2026-11-01T20:19:43.770973477Z 64 bytes from 127.0.0.1: seq=6 ttl=64 time=0.099 ms

```

## deployment.all (slim)
> GET /api/deployment.all?{"applicationId":"LYMwRpYYSHxHSzoiencyU"}  (header: x-api-key: [REDACTED])
> HTTP 200 in 316 ms
```json
[
 {
  "status": "done",
  "title": "spike redeploy"
 },
 {
  "status": "done",
  "title": "spike first deploy"
 }
]
```

## deployment.readLogs (latest deployment, tail=20)
> GET /api/deployment.readLogs?{"deploymentId":"TCpOP270B81WEfAdaIzrb","tail":20}  (header: x-api-key: [REDACTED])
> HTTP 200 in 258 ms
```json
Initializing deployment

```

## TIMINGS summary
> - /api/-  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "deploy": {
  "httpMs": 621,
  "secondsToStatus": 2.267,
  "finalStatus": "done",
  "timeout": false
 },
 "stop": {
  "httpMs": 5507,
  "secondsToStatus": 1.963,
  "finalStatus": "idle",
  "timeout": false
 },
 "start": {
  "httpMs": 9883,
  "secondsToStatus": 0.227,
  "finalStatus": "done",
  "timeout": false
 },
 "redeploy": {
  "httpMs": 290,
  "secondsToStatus": 0.205,
  "finalStatus": "done",
  "timeout": false
 }
}
```

## application.delete
> POST /api/application.delete  (header: x-api-key: [REDACTED])
> body: {"applicationId":"LYMwRpYYSHxHSzoiencyU"}
> HTTP 200 in 1300 ms
```json
{
 "applicationId": "LYMwRpYYSHxHSzoiencyU",
 "name": "spike-lifecycle",
 "appName": "app-hack-auxiliary-driver-otapap",
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
 "command": "ping 127.0.0.1",
 "args": null,
 "icon": null,
 "refreshToken": "[REDACTED]",
 "sourceType": "docker",
 "cleanCache": fal
... [trimmed, 4747 chars total]
```

## environment.byProjectId after app delete (applications left)
> GET /api/environment.byProjectId?{"projectId":"bQ6O56kykxlBSvweHvZoK"}  (header: x-api-key: [REDACTED])
> HTTP 200 in 139 ms
```json
[
 {
  "env": "[REDACTED]",
  "applications": 0
 }
]
```

