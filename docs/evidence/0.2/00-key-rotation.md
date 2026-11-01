# Addendum A - rotate the homeserver-panel key (all key values redacted)

## BEFORE: API key names
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 221 ms
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

## CREATE new homeserver-panel key (rateLimitEnabled:false)
> POST /api/user.createApiKey  (header: x-api-key: [REDACTED])
> body: {"name":"homeserver-panel","rateLimitEnabled":false,"metadata":{"organizationId":"RG27hJyQnwH0Le-61VBDf"}}
> HTTP 200 in 180 ms
```json
{
 "configId": "default",
 "name": "homeserver-panel",
 "start": "giFGvr",
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
 "createdAt": "2026-11-01T21:03:51.055Z",
 "updatedAt": "2026-11-01T21:03:51.055Z",
 "permissions": null,
 "metadata": null,
 "id": "Z4XwVWV4jeSVOgJaATalG4Kl2CizA9Vk"
}
```

## VERIFY new key: 12 sequential read calls (user.haveRootAccess), HTTP statuses
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 200 in 0 ms
```json
{
 "statuses": [
  200,
  200,
  200,
  200,
  200,
  200,
  200,
  200,
  200,
  200,
  200,
  200
 ]
}
```

## DELETE old homeserver-panel key (by id)
> POST /api/user.deleteApiKey  (header: x-api-key: [REDACTED])
> body: {"apiKeyId":"[REDACTED]"}
> HTTP 200 in 155 ms
```json
true
```

## OLD key reused (expected 401)
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 401 in 66 ms
```json
{
 "message": "Unauthorized"
}
```

## AFTER: API key names
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 401 in 168 ms
```json
{
 "items": []
}
```

## AFTER (re-read with the NEW key; the AFTER entry above used the old key's module state and got 401, which is the expected rejection)
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 234 ms
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
   "createdAt": "2026-11-01T21:03:51.055Z"
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

