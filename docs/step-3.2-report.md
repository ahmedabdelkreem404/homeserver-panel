Part B2 خلص ونزل: العميل بقى يشوف مواقعه هو بس، ويشغّلها ويوقفها ويشوف لوجاتها ويحذفها، وما يقدرش يلمس موقع عميل تاني.
لو حاول عميل يوصل لموقع عميل تاني بيرجعله نفس رد "مفيش موقع كده"، ومفيش أي أمر بيوصل لـ Dokploy (اتجرب).
اللي لسه ناقص: العميل ما يقدرش يرفع موقع جديد بنفسه لحد ما نعمل معالج الرفع (Part C). دلوقتي المالك هو اللي بيدّي العميل موقع موجود.

STEP REPORT: 3.2 (Part B, slice 2: ownership and the tenant's own space)
Status: partly done (Part B continues in C: deploy wizard)
Branch: step-3.2 (from step-3.1)

## Done
- `services/hosting.js`: every call starts from `resource_ownership`. An id that is not the tenant's gets exactly the answer a missing one gets (404, identical body), so other customers' sites cannot be probed. Answers carry no docker names, project names, env or other tenants.
- `/api/my/*` (tenant: read, manage, delete; viewer: read): overview (allowance against use: apps, memory, CPU, databases, links, apps without limits), sites, state, logs, actions (deploy, redeploy, start, stop, restart), delete with the typed name. The tenant is resolved from the session, never from the request. The owner and admin have no hosting space (403).
- Owner-only: list an account's sites, hand an existing app to it, take it back. Apps in protected projects, unknown apps, apps already owned and non-tenant accounts are refused. All audited.
- Defense in depth: an ownership row pointing into a protected project is ignored in the list and the gateway policy still refuses the action (tested by planting such a row).
- Frontend: "مواقعي" page (usage cards, site list with the same row and actions as the owner's projects, logs, typed delete), hosting roles land there and see two menu items; the owner's Users page got a "Sites" dialog (give from a pick-list without protected projects, take back). Viewers can look but the lifecycle and delete entries are disabled.
- Tests on Node 24 in Docker: backend 113/113 (7 new hosting tests: assign rules, own-sites-only, IDOR on every `/api/my` route with identical bodies and zero Dokploy mutations, owner-only routes closed to tenants, own actions audited under the tenant's email, typed-name delete, overview numbers, take-back, viewer and owner, protected-row defense), frontend 60/60, Playwright 8/8 (the tenant now lands on "مواقعي" and gets 403 on six server APIs). Evidence `docs/evidence/3.0/`.
- Deployed to https://panel.talabq.com; the new routes answer 401 without a session.

## Not done (in `docs/HANDOFF-PROMPT.md`)
Tenant-created sites (deploy wizard, Part C) with quota checks at creation; databases owned per tenant (the `database` ownership kind exists, nothing creates them yet); disk usage and quota enforcement against Dokploy; per-tenant network isolation; upload hardening; custom domains; a live end-to-end run where a tenant manages a real app (the server currently has no non-protected app to hand over; the IDOR and action paths are proven against the fake Dokploy).

## Deviations and risks
- Memory and CPU in the overview come from the limits Dokploy reports for each owned app, not measured use. A small CPU number is read as cores and a large one as nanoCPUs (heuristic, commented in the code).
- The tenant UI reuses the owner's project row, so the "deploy" entry shows in the menu for tenants (it re-deploys the existing app).

## Needs Ahmed
Nothing. To try it end to end you need a non-protected app: deploy one with hsdeploy, give it to a test account from Users, Sites.

## Suggested next step
Part C: the deploy wizard, with quota checks, templates and shared databases.
