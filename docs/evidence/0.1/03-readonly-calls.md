# Item 3 - read-only calls (keys/env redacted, responses trimmed)

## project.all (summarised: projects > environments > services with status)
> GET /api/project.all  (header: x-api-key: [REDACTED])
> HTTP 200 in 267 ms
```json
[
 {
  "project": "mcp-gateway",
  "environments": [
   {
    "env": "[REDACTED]",
    "applications": [
     {
      "name": "dokploy-mcp",
      "status": "done"
     }
    ],
    "compose": [],
    "postgres": [],
    "mysql": [],
    "mariadb": [],
    "mongo": [],
    "redis": []
   }
  ]
 },
 {
  "project": "infra",
  "environments": [
   {
    "env": "[REDACTED]",
    "applications": [
     {
      "name": "cloudflared",
      "status": "done"
     }
    ],
    "compose": [],
    "postgres": [],
    "mysql": [],
    "mariadb": [],
    "mongo": [],
    "redis": []
   }
  ]
 }
]
```

## overview.services
> GET /api/overview.services  (header: x-api-key: [REDACTED])
> HTTP 200 in 294 ms
```json
[
 {
  "id": "VnKPiZMKcA1QBFxeOct4w",
  "name": "cloudflared",
  "appName": "infra-cloudflared-dy6kmm",
  "status": "done",
  "createdAt": "2026-11-01T18:05:10.924Z",
  "serverId": null,
  "serverName": null,
  "projectId": "KPXNtFop5s-mkoYpOtm0U",
  "projectName": "infra",
  "environmentId": "ixvJOVzzZJX-P23aIze7f",
  "environmentName": "production",
  "icon": null,
  "type": "application",
  "lastDeployAt": "2026-11-01T18:12:58.203Z"
 },
 {
  "id": "AcORjhALO3EIYYnq-JIb2",
  "name": "dokploy-mcp",
  "appName": "dokploy-mcp-wcpvvs",
  "status": "done",
  "createdAt": "2026-11-01T18:52:18.326Z",
  "serverId": null,
  "serverName": null,
  "projectId": "QBdvhTJfqmqJYMoHiKdrs",
  "projectName": "mcp-gateway",
  "environmentId": "yMH__LLBNeVVbVJzNIilm",
  "environmentName": "production",
  "icon": null,
  "type": "application",
  "lastDeployAt": "2026-11-01T19:40:21.038Z"
 }
]
```

## project.homeStats
> GET /api/project.homeStats  (header: x-api-key: [REDACTED])
> HTTP 200 in 125 ms
```json
{
 "projects": 2,
 "environments": 2,
 "applications": 2,
 "compose": 0,
 "databases": 0,
 "services": 2,
 "status": {
  "running": 2,
  "error": 0,
  "idle": 0
 }
}
```

## docker.getContainers
> GET /api/docker.getContainers  (header: x-api-key: [REDACTED])
> HTTP 200 in 197 ms
```json
[
 {
  "containerId": "97ec1f37d474",
  "name": "infra-cloudflared-dy6kmm.1.xoxnadv2uzig6wyi7tvr46dpc",
  "image": "cloudflare/cloudflared:latest",
  "ports": "",
  "state": "running",
  "status": "Up 2 hours"
 }
]
```

## docker.getServerHealth
> GET /api/docker.getServerHealth?{"sinceHours":1}  (header: x-api-key: [REDACTED])
> HTTP 200 in 546 ms
```json
{
 "checkedAt": "2026-11-01T20:09:58.633Z",
 "containers": {
  "containerCount": 7,
  "serviceCount": 4
 },
 "resources": {
  "memTotalBytes": 4048683008,
  "memUsedBytes": 1783308288,
  "cpuCount": 4
 },
 "inotify": {
  "maxWatches": 29485,
  "maxInstances": 128,
  "maxQueuedEvents": 16384,
  "currentInstances": 0,
  "persisted": false
 },
 "disk": {
  "totalBytes": 125422911488,
  "usedBytes": 12955389952
 },
 "dockerNetworks": {
  "count": 6,
  "addressPools": null,
  "usage": [
   {
    "name": "dokploy-network",
    "driver": "overlay",
    "subnet": "10.0.1.0/24",
    "containersInUse": 6,
    "capacity": 254,
    "percentUsed": 2
   },
   {
    "name": "ingress",
    "driver": "overlay",
    "subnet": "10.0.0.0/24",
    "containersInUse": 1,
    "capacity": 254,
    "percentUsed": 0
   },
   {
    "name": "bridge",
    "driver": "bridge",
    "subnet": "172.17.0.0/16",
    "containersInUse": 0,
    "capacity": 65534,
    "percentUsed": 0
   },
   {
    "name": "docker_gwbridge",
    "driver": "bridge",
    "subnet": "172.18.0.0/16",
    "containersInUse": 6,
    "capacity": 65534,
    "percentUsed": 0
   }
  ]
 },
 "daemonErrors": [],
 "daemonLogsWindow": {
  "fromEpoch": 17
... [trimmed, 1364 chars total]
```

## dockerDiskUsage.getDiskUsage
> GET /api/dockerDiskUsage.getDiskUsage  (header: x-api-key: [REDACTED])
> HTTP 200 in 326 ms
```json
[
 {
  "type": "Images",
  "totalCount": 5,
  "active": 5,
  "size": "4.129GB",
  "reclaimable": "0B (0%)",
  "sizeBytes": 4433479991.296
 },
 {
  "type": "Containers",
  "totalCount": 7,
  "active": 5,
  "size": "46.4MB",
  "reclaimable": "46.4MB (99%)",
  "sizeBytes": 48653926.4
 },
 {
  "type": "Local Volumes",
  "totalCount": 3,
  "active": 3,
  "size": "112.6MB",
  "reclaimable": "0B (0%)",
  "sizeBytes": 118069657.6
 },
 {
  "type": "Build Cache",
  "totalCount": 0,
  "active": 0,
  "size": "0B",
  "reclaimable": "0B",
  "sizeBytes": 0
 }
]
```

## swarm.getContainerStats
> GET /api/swarm.getContainerStats  (header: x-api-key: [REDACTED])
> HTTP 200 in 2774 ms
```json
[
 {
  "BlockIO": "0B / 12.3kB",
  "CPUPerc": "0.00%",
  "Container": "bfe5a806eead504b9f8fb2ba212b302352af602d189c9106cb25856c448ddeec",
  "ID": "bfe5a806eead",
  "MemPerc": "1.70%",
  "MemUsage": "65.77MiB / 3.771GiB",
  "Name": "dokploy-mcp-wcpvvs.1.cuq7bz2e3reldw0rljklyosc1",
  "NetIO": "119kB / 112kB"
 },
 {
  "BlockIO": "0B / 0B",
  "CPUPerc": "0.60%",
  "Container": "97ec1f37d474dd1b070d563719f25c70efa1daf31cef7e09d33442cdd16f7559",
  "ID": "97ec1f37d474",
  "MemPerc": "0.43%",
  "MemUsage": "16.72MiB / 3.771GiB",
  "Name": "infra-cloudflared-dy6kmm.1.xoxnadv2uzig6wyi7tvr46dpc",
  "NetIO": "2.75MB / 3.13MB"
 },
 {
  "BlockIO": "325MB / 36.9kB",
  "CPUPerc": "79.32%",
  "Container": "32b5e72dc971189dfd3a6d14460971bc158774641cf5619c0da51e08befac56a",
  "ID": "32b5e72dc971",
  "MemPerc": "29.91%",
  "MemUsage": "1.128GiB / 3.771GiB",
  "Name": "dokploy.1.9t47oxsdd3blatjxd7boai4nx",
  "NetIO": "12.3MB / 8.1MB"
 },
 {
  "BlockIO": "39.4MB / 3.47MB",
  "CPUPerc": "0.04%",
  "Container": "f18be6a3d72050bb19d87029230019a72352892710716a46fcd05994ea0f095b",
  "ID": "f18be6a3d720",
  "MemPerc": "2.24%",
  "MemUsage": "86.39MiB / 3.771GiB",
  "Name": "dokploy-postgres.1.ivba3xdusyksiptk
... [trimmed, 1523 chars total]
```

## user.getServerMetrics
> GET /api/user.getServerMetrics  (header: x-api-key: [REDACTED])
> HTTP 200 in 117 ms
```json
{
 "id": "dXMKvvSoxdGyqI19d8iCb9YnyCNDxUvP",
 "firstName": "[REDACTED]",
 "lastName": "[REDACTED]",
 "isRegistered": false,
 "expirationDate": "2026-11-01T17:36:04.497Z",
 "createdAt2": "2026-11-01T17:36:04.497Z",
 "createdAt": "2026-11-01T17:36:04.487Z",
 "twoFactorEnabled": true,
 "email": "[REDACTED]",
 "emailVerified": false,
 "image": "/avatars/avatar-8.png",
 "banned": false,
 "banReason": null,
 "banExpires": null,
 "updatedAt": "2026-11-01T17:42:26.046Z",
 "role": "user",
 "enablePaidFeatures": false,
 "allowImpersonation": false,
 "enableEnterpriseFeatures": false,
 "licenseKey": null,
 "isValidEnterpriseLicense": false,
 "stripeCustomerId": null,
 "stripeSubscriptionId": null,
 "serversQuantity": 0,
 "sendInvoiceNotifications": false,
 "isEnterpriseCloud": false,
 "trustedOrigins": null,
 "bookmarkedTemplates": [],
 "onboardingCompletedAt": "2026-11-01T17:37:15.175Z"
}
```

## application.readAppMonitoring
> GET /api/application.readAppMonitoring?{"appName":"dokploy-mcp-wcpvvs"}  (header: x-api-key: [REDACTED])
> HTTP 200 in 115 ms
```json
{
 "cpu": [],
 "memory": [],
 "disk": [],
 "network": [],
 "block": []
}
```

## user.session
> GET /api/user.session  (header: x-api-key: [REDACTED])
> HTTP 200 in 159 ms
```json
{
 "user": {
  "id": "dXMKvvSoxdGyqI19d8iCb9YnyCNDxUvP"
 },
 "session": {
  "activeOrganizationId": "RG27hJyQnwH0Le-61VBDf"
 }
}
```

## user.haveRootAccess
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 200 in 128 ms
```json
false
```

## deployment.all (applicationId of dokploy-mcp, first 3, slimmed)
> GET /api/deployment.all?{"applicationId":"AcORjhALO3EIYYnq-JIb2"}  (header: x-api-key: [REDACTED])
> HTTP 200 in 555 ms
```json
[
 {
  "deploymentId": "SEjUUkrXwYoyVTocslewz",
  "status": "done",
  "title": "Pin dokploy-mcp@4.0.0 + npm cache volume",
  "createdAt": "2026-11-01T19:40:21.038Z"
 },
 {
  "deploymentId": "BGphr2g9NyNVHin_3CI_g",
  "status": "done",
  "title": "Initial deploy",
  "createdAt": "2026-11-01T18:53:03.186Z"
 }
]
```

## deployment.readLogs (tail=15)
> GET /api/deployment.readLogs?{"deploymentId":"SEjUUkrXwYoyVTocslewz","tail":15}  (header: x-api-key: [REDACTED])
> HTTP 200 in 219 ms
```json
Initializing deployment

```

