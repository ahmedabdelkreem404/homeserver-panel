# Item 4b - default API key rate limit (key values redacted)

## call #6 with a default-limit key
> GET /api/user.haveRootAccess  (header: x-api-key: [REDACTED])
> HTTP 401 in 45 ms
```json
{
 "message": "Unauthorized"
}
```

## 13 sequential calls with a default-limit key: HTTP statuses
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
  401,
  401,
  401,
  401,
  401,
  401,
  401,
  401
 ]
}
```

## DELETE spike-ratelimit
> POST /api/user.deleteApiKey  (header: x-api-key: [REDACTED])
> body: {"apiKeyId":"[REDACTED]"}
> HTTP 200 in 145 ms
```json
true
```

## remaining key names
> GET /api/user.get  (header: x-api-key: [REDACTED])
> HTTP 200 in 144 ms
```json
{
 "items": [
  "claude-code",
  "homeserver-panel",
  "remote-test"
 ]
}
```

