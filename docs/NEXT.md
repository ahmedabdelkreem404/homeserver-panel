# NEXT (state when the last session ended)

Done and pushed: parts up to 1.5, E, 2A (inventory + backups), HANDOFF-PROMPT.md, Part A (more AI clients, branch `step-3.0`, deployed).

In progress: Part B (hosting accounts). Slices B1 (accounts, roles, quotas, Users page; branch step-3.1) and B2 (ownership, /api/my, tenant sites page, owner assigns sites; branch step-3.2) are DONE, DEPLOYED and green (backend 113/113, frontend 60/60, Playwright 8/8). Reports: docs/step-3.1-report.md and docs/step-3.2-report.md. B1 contents:
- migration `004_tenants.sql` (tenants, quotas, users.tenant_id, users.disabled, resource_ownership),
- roles in `auth/permissions.js` (owner, admin, tenant, viewer; tenant and viewer only have self-service actions; an unlabelled route fails closed),
- `services/accounts.js` + `routes/users.js` (owner-only: list, create with a temporary password shown once, reset password, suspend/resume, quota),
- suspended users lose their sessions at once and cannot sign in (`account_suspended`),
- tests `accounts.test.js` (role data, route labelling, validation, full authorization matrix tenant/viewer/admin on every route, suspension, reset, quota).
Deployed to https://panel.talabq.com (migration 4 applied). Report: docs/step-3.1-report.md.

In progress: Part C (deploy wizard), branch step-3.3. Slice C1 done, not deployed: hardened zip reader and Dockerfile templates (docs/step-3.3-report.md). Next: C2 (create-site pipeline with quota checks and the policy allowlist for tenant creates), C3 (wizard UI, tenant databases, one real deploy per template). Still open from Part B: tenant databases, quota enforcement at creation and disk, per-tenant network isolation research, custom domains.

Then: C (deploy wizard), D (terminal), E (Phase 2 network and power; the owner runs one sudo command), G (dashboard speed + the Cloudflare beacon note), F (closing).

Starting checks: `git fetch && git checkout step-3.1`, run the whole suite on Node 24 in Docker, confirm https://panel.talabq.com/api/health is ok.

Owner actions still open: first sign-in at https://panel.talabq.com (new password, authenticator, recovery codes, then delete the Desktop file `panel-first-login.txt`); optionally turn off Cloudflare Web Analytics injection (see HANDOFF section 7).
