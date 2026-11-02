أول شريحة من Part C خلصت: قارئ zip آمن وكاشف لنوع المشروع ومولّد Dockerfile لخمس تقنيات (static وNode وNext وPHP وLaravel).
ده كله كود واختبارات بس، لسه ما اتوصلش بـ Dokploy ولا بالواجهة، فالعميل ما يقدرش يرفع موقع من اللوحة لحد دلوقتي.
الجاي: ربطه بإنشاء الموقع مع فحص الحدود (C2)، وبعده الواجهة وقواعد البيانات وتجارب نشر حقيقية لكل قالب (C3).

STEP REPORT: 3.3 (Part C, slice 1: zip reader and templates)
Status: partly done (Part C continues in C2 and C3)
Branch: step-3.3 (from step-3.2). Not deployed: nothing user-visible changed.

## Done
- `deploy/zip-read.js` (zlib only): refuses path escapes (`..`, absolute, drive letters, backslashes, NUL, empty parts, depth, length), links and special files (only when the archive says it was made on Unix), encryption, zip64, unsupported compression, duplicate names in any case, too many files, too large a file or total, a suspicious compression ratio (zip bomb, checked before unpacking), a declared size that is not the real one (inflate is capped at the declared size), a failed CRC and damaged structure. `unwrapRoot` removes a single top-level folder.
- `deploy/templates.js`: detection from the files (Laravel, Next, Node, PHP, static with output folder, custom Dockerfile) and a build context per template: static (nginx-unprivileged, SPA fallback, files under `public/`), Node (`node:24-alpine`, start script or main, non-root), Next (built on the server only when `.next` is missing, with a warning), PHP and Laravel (`serversideup/php:8.3-fpm-nginx`, Laravel with a composer build stage unless `vendor/` is shipped, writable storage folders, webroot `public`). `.env*`, `.git` and `node_modules` never reach the build and are listed. A project with its own Dockerfile is refused unless the owner allows it. `defaultEnv` gives Laravel a fresh `APP_KEY` and production settings.
- Tests on Node 24 in Docker: 18 new (zip hardening matrix with hand-built hostile archives, detection table, Dockerfile properties per template, secrets stripped, custom Dockerfile, env defaults, zip to build context). Whole suite: see `docs/evidence/3.0/09-tests-c1.txt`.

## Not done
C2: the create-site pipeline against Dokploy (a project per tenant, app, domain, limits, env, upload of the build context, build timeout, one build at a time) with quota checks and the policy allowlist for those procedures. C3: the wizard UI, shared databases per tenant (Postgres, then MySQL), re-deploy and rollback, and one real deploy per template with measured build times on this host. None of the images has been pulled or built on the server yet, so the Dockerfiles are tested for shape, not for a successful build.

## Risks
- `serversideup/php` is a third-party image (widely used for Laravel); pin its tag and check it builds on this host before offering PHP and Laravel to customers. Its first pull on a slow line will be long.
- Node and Next installs run on the server at build time unless the upload already contains what is needed; that is slow and memory hungry on 3.8 GiB.
- Zip entries are read fully into memory (limits: 300 MB total, 100 MB per file, 5000 files); the upload route must cap the request body by the tenant's `max_upload_mb` before this runs.

## Needs Ahmed
Nothing.
