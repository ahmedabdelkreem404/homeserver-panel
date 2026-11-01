# Item 8 - Tailscale API notes (official docs only, no token used, nothing called against a tailnet)

Fetched 2026-11-01 (no credentials involved, public documentation only):

| Source | URL |
|---|---|
| Official OpenAPI schema (linked from the API reference page) | https://api.tailscale.com/api/v2?outputOpenapiSchema=true |
| API reference (JS-rendered; text fetch returns only the intro) | https://tailscale.com/api |
| OAuth clients | https://tailscale.com/kb/1215/oauth-clients |
| Trust credentials (scope list) | https://tailscale.com/kb/1623/trust-credentials |

## What the official OpenAPI schema says (paraphrased, paths verbatim)

| Capability | Method + path | OAuth scope (per the schema) | Notes |
|---|---|---|---|
| List devices | `GET /api/v2/tailnet/{tailnet}/devices` | `devices:core:read` | Optional `fields` query; server-side `<field>=<value>` filters (e.g. `tags=tag:x`). Response: `{ "devices": [Device] }`. 404 if tailnet not found. |
| Get one device | `GET /api/v2/device/{deviceId}` | `devices:core:read` | |
| Delete a device | `DELETE /api/v2/device/{deviceId}` | `devices:core` | 200 on success. 501 "device not owned by tailnet". Deleting devices *shared into* the tailnet is not supported. |
| Expire a device key | `POST /api/v2/device/{deviceId}/expire` | `devices:core` | Not needed for the MVP. |

`Device` object properties listed by the schema (useful for the UI): `id`, `nodeId`, `name`, `hostname`, `addresses`, `os`, `clientVersion`, `updateAvailable`, `created`, `connectedToControl`, `lastSeen`, `authorized`, `expires`, `keyExpiryDisabled`, `tags`, `user`, `isExternal`, `isEphemeral`, `sshEnabled`.

- Auth: `Authorization: Bearer <access token>` (or HTTP Basic with the token as the username).
- Base URL: `https://api.tailscale.com/api/v2/...`. The `{tailnet}` segment accepts `-` = "default tailnet of the token being used" (the schema calls it the best option for most users).
- Access token (user-owned, `tskey-api-...`) lifetime: 1 to 90 days -> NOT suitable for an always-on panel.
- Trust credential (OAuth client, `tskey-client-...`): the schema states trust credentials "don't expire" and are not tied to a Tailscale user. The client exchanges id+secret for a short-lived access token.
  - Token endpoint (OAuth 2.0 client-credentials grant): `POST https://api.tailscale.com/api/v2/oauth/token` with `client_id`, `client_secret` (optional `scope`, `tags`).
  - The access token lives 1 hour (docs: `expires_in: 3600`, cannot be changed) -> the backend must request a new token before expiry.
- Scope semantics (trust-credentials page): each `:read` scope is read-only; the same scope without `:read` also allows changes.
- Docs warn: creating a credential with `devices:core` requires selecting one or more tags.

## Recommended credential for the panel

OAuth client (trust credential) with the minimum scopes for D3 "Tailscale devices":
- `devices:core:read` (list devices) and `devices:core` (delete devices; also covers read).
- Nothing else (no `all`, no `auth_keys`, no `policy_file`).

## Not verified (no credential yet) - to test in the next step with a real OAuth client

1. Whether a `devices:core` credential restricted to a tag can still list/delete devices that carry other tags or no tag (docs say a tag is mandatory at creation; the delete behaviour for untagged devices is not documented in what I read).
2. The exact response bodies of list/delete against this tailnet.
3. A GitHub issue (tailscale/tailscale #21721, surfaced by a web search, not read in full) reports `GET .../devices?fields=all` returning 404 for tailnets with shared-in devices; plan to use the default fields.
