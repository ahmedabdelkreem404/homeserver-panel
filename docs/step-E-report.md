Part E خلص: كل تطبيق بقى له حد رام 256MB وCPU واحد، وفيه Postgres واحد مشترك لكل المشاريع.
اتجرب على السيرفر الحقيقي بمشروع مؤقت واتمسح بالكامل، والنسخة العامة من hsdeploy اتحدثت.
استثناء `up` للوحة (homeserver-panel) من مجلد الريبو بس اتختبر بالـ unit tests، وهيتجرب فعلياً في 1.5.

STEP REPORT: E (hsdeploy improvements)
Status: done
Branch: step-E (from step-1.4)

## Summary
- Default limits on every deployed app: 256 MB memory and 1 CPU, per-project override with `memoryLimitMb` / `cpuLimit` in `.hsdeploy.json`. Set through `application.update` before each deploy; unchanged values are not re-sent.
- `hsdeploy db create postgres --shared`: one `shared-postgres` service in the protected project `shared-services` (created on first use), one database and role per (project, app) inside it, created over `ssh homeserver docker exec ... psql` with the SQL on stdin and a generated password that is never printed. `DATABASE_URL` points at the shared service. Per-project mode is unchanged.
- `down --with-db` drops only this project's database and role (a database is dropped only if that role owns it).
- `up`, `status`, `logs`, `env push` are allowed for the protected `homeserver-panel` project only when run from this repository (package name plus `packages/backend/src/protection-policy.js`). `down` and `db create` stay refused there. `shared-services` is now protected too.
- Global copy reinstalled; README and `docs/hsdeploy-for-claude-code.md` updated.

## Commands and results
- `node --test` in `tools/hsdeploy`: 28/28 (20 existing, 8 new). `docs/evidence/E/00-tests.txt`.
- Real server smoke test (throwaway project `hs-e-smoke`): `docs/evidence/E/01-real-server-smoke.txt`.
  - `docker service inspect` shows `{"NanoCPUs":1000000000,"MemoryBytes":268435456}`.
  - database and role existed in the shared Postgres, and counts were 0 and 0 after `down --with-db`.
  - no service, app or project left behind.
- The first smoke run caught a real bug: `\gexec` lost its backslash in a JS template literal. Fixed, and a test now asserts a real backslash.

## Deviations
- The project and app names are both in the database name (`hs_e_smoke_hs_e_smoke_db`), so two projects with an app of the same name do not collide.
- `shared-services` and `shared-postgres` now exist on the server (intended deliverable).

## Open issues
- The panel-repo exception is tested with fakes; the first real use is the 1.5 deploy.
- The repo marker is a convention, not authentication: it prevents accidents, not a hostile local user.
- The panel's own protected list does not yet include `shared-services` (it can be extended through its environment variable in 1.5).

## Needs Ahmed
Nothing.
