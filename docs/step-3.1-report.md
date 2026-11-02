أول جزء من Part B خلص ونزل على اللوحة: صفحة "المستخدمين" للمالك، وأدوار (مالك، مدير، عميل استضافة، مشاهد)، وحدود موارد لكل عميل.
العميل بيدخل بإيميل وكلمة مرور مؤقتة، وبيشوف صفحة الإعدادات بس، وكل الـ APIs التانية بترجع له 403 (ده اتجرب على نسخة حقيقية).
لسه ناقص أهم حاجة: العميل ما بيقدرش يرفع موقع لسه. ده الجزء الجاي (ownership وعزل المشاريع)، مش مخلص.

STEP REPORT: 3.1 (Part B, slice 1: accounts, roles, quotas)
Status: partly done (Part B is not finished)
Branch: step-3.1 (from step-3.0)

## Done
- Migration `004_tenants.sql` (additive): `tenants`, `quotas`, `users.tenant_id`, `users.disabled`, `resource_ownership`. Applied on the live database (migration 4; one user, the owner).
- Roles as data in `auth/permissions.js`: owner (all), admin (projects, MCP read/manage, devices, server, audit; no users, backups, MCP rotation), tenant and viewer (self-service only). A route with no permission name fails closed (`unlabelled.route`); a test asserts no route is unlabelled.
- Owner-only API (`/api/users`): list, create (temporary password shown once, argon2id, forced change at first sign-in), reset password (ends all sessions), suspend/resume (ends sessions, blocks sign-in with `account_suspended`), quota update with ranges. Every action audited without secrets. The owner account cannot be touched through these routes; slugs that would clash with the panel's hosts are refused.
- Frontend: Users page (list, create dialog with role-specific fields and quota, reset, suspend/resume, quota dialog), menu filtered by role, roles without access land on Settings, `put` added to the API client (it had none).
- Tests on Node 24 in Docker: backend 106/106 (new `accounts.test.js` includes a full authorization matrix: tenant, viewer and admin against every route), frontend 51/51, Playwright 8/8 (new: the owner adds a tenant in the UI, the tenant signs in for the first time in another browser, sees only Settings, gets 403 on 6 server APIs and is bounced from `/users`). Evidence: `docs/evidence/3.0/`.
- Four older tests were updated because they asserted the old single-role world (migration count, role list, `/api/users` not existing, viewer denied sessions).

## Not done (rest of Part B, in `docs/HANDOFF-PROMPT.md`)
Tenant-scoped data routes with object-level ownership checks (`resource_ownership`) and IDOR tests; granting tenants `projects.*` only after that; quota enforcement against Dokploy limits; per-tenant network isolation research; upload hardening; tenant dashboard with usage versus quota; a "typed-name" delete for accounts.

## Deviations and risks
- Tenant and viewer currently cannot do anything except their own settings. That is intentional until ownership scoping exists: granting them the global project routes would show them every project.
- Suspension is per user (`users.disabled`), not per tenant. One user per tenant for now.
- Admin role exists but is only covered by the authorization matrix test, not used in the UI beyond the menu.

## Needs Ahmed
Nothing now. To try it: Users page, "حساب جديد", create a tenant, give the temporary password to a friend (it is shown once).

## Suggested next step
B2: ownership-scoped project routes and IDOR tests, then the deploy wizard (Part C).
