# Item 4 - API key create -> use -> delete -> rejected (key values redacted)

## user.session (only the org id is shown)
> GET /api/user.session  (header: x-api-key: [REDACTED])
> HTTP 200 in 288 ms
```json
{
 "activeOrganizationId": "present"
}
```

## BEFORE: user.get -> existing API keys (names and limits only)
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 173 ms
```json
{
 "items": [
  {
   "name": "claude-code",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T18:31:19.972Z"
  },
  {
   "name": "homeserver-panel",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T20:05:40.616Z"
  },
  {
   "name": "remote-test",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T19:06:39.661Z"
  }
 ]
}
```

## CREATE key (default limits)
> POST /api/user.createApiKey  (header: x-api-key: [REDACTED])
> body: {"name":"spike-test","metadata":{"organizationId":"RG27hJyQnwH0Le-61VBDf"}}
> HTTP 200 in 147 ms
```json
{
 "configId": "default",
 "name": "spike-test",
 "start": "dOUcEa",
 "referenceId": "dXMKvvSoxdGyqI19d8iCb9YnyCNDxUvP",
 "prefix": null,
 "key": "[REDACTED]",
 "refillInterval": null,
 "refillAmount": null,
 "lastRefillAt": null,
 "enabled": true,
 "rateLimitEnabled": true,
 "rateLimitTimeWindow": 86400000,
 "rateLimitMax": 10,
 "requestCount": 0,
 "remaining": null,
 "lastRequest": null,
 "expiresAt": null,
 "createdAt": "2026-11-01T20:11:26.553Z",
 "updatedAt": "2026-11-01T20:11:26.553Z",
 "permissions": null,
 "metadata": null,
 "id": "FdHMr4zbWM7hGprbrcLObMxxKTXyEkPo"
}
```

## USE new key (default limits) for one read call: user.haveRootAccess
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 200 in 161 ms
```json
false
```

## USE new key (default limits) for project.all (project names only)
> GET /api/project.all  (header: x-api-key: [REDACTED])
> HTTP 200 in 320 ms
```json
{
 "projects": [
  "mcp-gateway",
  "infra"
 ]
}
```

## CREATE key (rate limit disabled)
> POST /api/user.createApiKey  (header: x-api-key: [REDACTED])
> body: {"name":"spike-test-nolimit","rateLimitEnabled":false,"metadata":{"organizationId":"RG27hJyQnwH0Le-61VBDf"}}
> HTTP 200 in 457 ms
```json
{
 "configId": "default",
 "name": "spike-test-nolimit",
 "start": "BbCNuV",
 "referenceId": "dXMKvvSoxdGyqI19d8iCb9YnyCNDxUvP",
 "prefix": null,
 "key": "[REDACTED]",
 "refillInterval": null,
 "refillAmount": null,
 "lastRefillAt": null,
 "enabled": true,
 "rateLimitEnabled": false,
 "rateLimitTimeWindow": 86400000,
 "rateLimitMax": 10,
 "requestCount": 0,
 "remaining": null,
 "lastRequest": null,
 "expiresAt": null,
 "createdAt": "2026-11-01T20:11:27.333Z",
 "updatedAt": "2026-11-01T20:11:27.333Z",
 "permissions": null,
 "metadata": null,
 "id": "fCgb0IOjIDm2lWQ5yq5hFPeQWod3TccQ"
}
```

## USE new key (rate limit disabled) for one read call: user.haveRootAccess
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 200 in 426 ms
```json
false
```

## USE new key (rate limit disabled) for project.all (project names only)
> GET /api/project.all  (header: x-api-key: [REDACTED])
> HTTP 200 in 265 ms
```json
{
 "projects": [
  "mcp-gateway",
  "infra"
 ]
}
```

## AFTER CREATE: user.get -> API keys (names and limits only)
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 242 ms
```json
{
 "items": [
  {
   "name": "claude-code",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T18:31:19.972Z"
  },
  {
   "name": "spike-test-nolimit",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T20:11:27.333Z"
  },
  {
   "name": "homeserver-panel",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T20:05:40.616Z"
  },
  {
   "name": "remote-test",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T19:06:39.661Z"
  },
  {
   "name": "spike-test",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T20:11:26.553Z"
  }
 ]
}
```

## DELETE spike-test (by id returned from create)
> POST /api/user.deleteApiKey  (header: x-api-key: [REDACTED])
> body: {"apiKeyId":"[REDACTED]"}
> HTTP 200 in 2643 ms
```json
true
```

## USE deleted key spike-test again (expected rejection)
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 401 in 34 ms
```json
{
 "message": "Unauthorized"
}
```

## DELETE spike-test-nolimit (by id returned from create)
> POST /api/user.deleteApiKey  (header: x-api-key: [REDACTED])
> body: {"apiKeyId":"[REDACTED]"}
> HTTP 200 in 142 ms
```json
true
```

## USE deleted key spike-test-nolimit again (expected rejection)
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 401 in 46 ms
```json
{
 "message": "Unauthorized"
}
```

## AFTER DELETE: user.get -> API keys (names and limits only)
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 170 ms
```json
{
 "items": [
  {
   "name": "claude-code",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T18:31:19.972Z"
  },
  {
   "name": "homeserver-panel",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T20:05:40.616Z"
  },
  {
   "name": "remote-test",
   "enabled": true,
   "expiresAt": null,
   "createdAt": "2026-11-01T19:06:39.661Z"
  }
 ]
}
```

