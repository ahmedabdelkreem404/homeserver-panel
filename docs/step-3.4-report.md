C2 خلص ونزل: العميل بيقدر يرفع zip عن طريق الـ API وتتعمل له مشروع وتطبيق وحدود ونطاق وبناء وتشغيل، كل ده جوه حدوده.
اتجرب على Dokploy الحقيقي: عميل تجريبي رفع موقع، اتبنى، رد 200 على https، واتمسح هو والمشروع (ومسحت الـ image اللي فضلت).
لسه مفيش واجهة للرفع (C3)، ولسه ناقص قواعد بيانات العميل وتجارب القوالب التانية (Node وPHP وLaravel) على السيرفر.

STEP REPORT: 3.4 (Part C, slice 2: create-site pipeline)
Status: partly done (C3 remains)
Branch: step-3.4 (from step-3.3). Deployed to https://panel.talabq.com (no UI yet; the API is `POST /api/my/sites`).

## Done
- `POST /api/my/sites?name=&template=` with the zip as the raw request body (`application/zip`), capped at 32 MB by the server before buffering. Permission `my.create` (tenant only).
- Order: validate and refuse first (name, zip hardening, template, allowance: sites, memory, CPU, links, upload size, duplicate name), only then touch Dokploy. Allowance uses what the account really has now. Each template reserves a fixed amount (static 64 MB / 0.25 CPU, node and php 256 / 0.5, next and laravel 384 / 0.5).
- Pipeline through the gateway (allowlist, policy, audit under the tenant's email): `project.create` (once per account, `t-<slug>`), `application.create`, limits, build type, environment (Laravel key), `domain.create` (`<slug>-<name>.talabq.com`, HTTPS off, certificate none), upload of the build context, wait for the build, wait for a running container.
- On any failure the app (and its domain) is deleted and the ownership row removed; the allowance is free again. One build at a time for the whole server (queue).
- Policy: five new allowlisted procedures, each with a fixed list of fields and, where it matters, fixed values (`sourceType = drop`, `buildType = dockerfile`); anything else is refused, as are protected projects and protected environments.
- Tests on Node 24 in Docker: backend 140/140 (new `sites.test.js`: full creation, Laravel key, allowance refusals with no Dokploy call, counting existing use, bad input, cleanup on a failed domain and a failed build, serialized uploads, roles, oversized body 413, policy boundaries), frontend 60/60. Playwright 8/8 including a REAL run: a tenant uploads a one-file site, Dokploy builds it, https://e2e-shop-hello-e2e.talabq.com answers 200 with the page, the tenant deletes it, the owner deletes the account's project. Evidence `docs/evidence/3.0/` (10 to 13).
- Four older tests were updated because they asserted the old closed allowlist (no env writer, no application.update); the boundary now is "field-restricted writers, never for protected apps".

## Found and fixed on the way
The project list was cached for 10 s, so a new site did not show in the tenant's list right after creation. Added `invalidate()` after creation and after a cleanup.

## Not done
- C3: the wizard UI (upload, template choice, progress), tenant databases (shared Postgres, MySQL) with `DATABASE_URL` wiring, re-deploy with a new zip and rollback, a real deploy of Node, PHP and Laravel with measured build times. Only the static template was built on the server so far.
- The panel's own delete does not remove the built image (hsdeploy does): every deleted site leaves its image behind and fills the disk. It needs `dockerImage.removeImage` allowed for tenant-owned apps. I removed the one image my test left.
- Tenant projects `t-<slug>` stay after the last site is deleted (empty, harmless).
- Memory ceilings: the panel container has 256 MB and holds the upload, the unpacked files and the rebuilt zip, so uploads are capped at 32 MB and unpacked size at 96 MB. A bigger site needs a bigger panel container first.
- A build log tail (20 lines) is returned to the tenant on a failed build; it is their own build output.

## Risks
- `serversideup/php` (PHP, Laravel) has not been pulled or built on this host. Test it before offering those templates to customers.
- Node and Next installs run on the server at build time (slow, memory hungry on 3.8 GiB).
- A tenant's container still sits on the shared Docker network (isolation research is still open from Part B).

## Needs Ahmed
Nothing.

## Suggested next step
C3: the wizard UI first (so a customer can use what exists), then databases and the remaining real deploys.
