# NEXT (state when the last session ended)

Done and pushed: parts up to 1.5, E, 2A (inventory + backups), HANDOFF-PROMPT.md, Part A (more AI clients, branch `step-3.0`, deployed).

In progress: Part B (hosting accounts), branch `step-3.1`. Slice B1a is done and green (backend 106/106, frontend 42/42 on Node 24):
- migration `004_tenants.sql` (tenants, quotas, users.tenant_id, users.disabled, resource_ownership),
- roles in `auth/permissions.js` (owner, admin, tenant, viewer; tenant and viewer only have self-service actions; an unlabelled route fails closed),
- `services/accounts.js` + `routes/users.js` (owner-only: list, create with a temporary password shown once, reset password, suspend/resume, quota),
- suspended users lose their sessions at once and cannot sign in (`account_suspended`),
- tests `accounts.test.js` (role data, route labelling, validation, full authorization matrix tenant/viewer/admin on every route, suspension, reset, quota).
NOT deployed yet (the live panel runs Part A). Deploy with `node scripts/build-release.mjs` and `hsdeploy up` after the frontend Users page exists.

Next action (rest of Part B in `docs/HANDOFF-PROMPT.md`): the frontend "Users" page (owner), tenant-scoped data routes with object-level ownership checks through `resource_ownership` (only then grant tenant any `projects.*` action), IDOR tests, quota enforcement, per-tenant isolation research, upload hardening.

Then: C (deploy wizard), D (terminal), E (Phase 2 network and power; the owner runs one sudo command), G (dashboard speed + the Cloudflare beacon note), F (closing).

Starting checks: `git fetch && git checkout step-3.1`, run the whole suite on Node 24 in Docker, confirm https://panel.talabq.com/api/health is ok.

Owner actions still open: first sign-in at https://panel.talabq.com (new password, authenticator, recovery codes, then delete the Desktop file `panel-first-login.txt`); optionally turn off Cloudflare Web Analytics injection (see HANDOFF section 7).
