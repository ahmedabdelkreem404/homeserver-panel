# Step 0.2b - Tailscale OAuth client real test (tokens, secrets and other devices' IPs redacted; nothing deleted)

## 1. Mint access token (client-credentials)
> POST https://api.tailscale.com/api/v2/oauth/token  (form: client_id, client_secret, grant_type=client_credentials)
> HTTP 200 in 534 ms
```json
{
 "token_type": "Bearer",
 "expires_in": 3600,
 "scope": "devices:core"
}
```

## 2. List devices
> GET https://api.tailscale.com/api/v2/tailnet/-/devices  (default fields)
> HTTP 200 in 255 ms, 3 devices
```json
[
 {
  "hostname": "DESKTOP-8B6PHQI",
  "os": "windows",
  "lastSeen": "2026-11-01T21:23:01Z",
  "connectedToControl": true,
  "tags": [],
  "authorized": true,
  "isExternal": false,
  "addresses": "[REDACTED]"
 },
 {
  "hostname": "homeserver",
  "os": "linux",
  "lastSeen": "2026-11-01T21:23:01Z",
  "connectedToControl": true,
  "tags": [],
  "authorized": true,
  "isExternal": false,
  "addresses": [
   "100.114.91.58"
  ],
  "id": "5052414055014507",
  "nodeId": "nYV2sHMFTg11CNTRL"
 },
 {
  "hostname": "localhost",
  "os": "iOS",
  "lastSeen": "2026-11-01T14:31:30Z",
  "connectedToControl": false,
  "tags": [],
  "authorized": true,
  "isExternal": false,
  "addresses": "[REDACTED]"
 }
]
```

## 3. Get homeserver device (read check)
> GET /api/v2/device/{homeserver id}
> HTTP 200 in 86 ms
```json
{
 "hostname": "homeserver",
 "authorized": true
}
```

## 4. Delete-permission check, full token, non-existent id
> DELETE /api/v2/device/nonexistent-spike-device-0000
> HTTP 404 in 81 ms
```json
{
 "message": "no manageable device matching this ID found"
}
```

## 5a. Control: mint a READ-ONLY token (scope=devices:core:read)
> HTTP 200
```json
{
 "token_type": "Bearer",
 "expires_in": 3600,
 "scope": "devices:core:read"
}
```

## 5b. Control: same DELETE with the read-only token
> DELETE /api/v2/device/nonexistent-spike-device-0000
> HTTP 404
```json
{
 "message": "no manageable device matching this ID found"
}
```

## 5c. Control: read-only token can still list
> HTTP 200, 3 devices

