واجهة معالج إنشاء الموقع (C3) خلصت ونزلت: العميل يقدر يرفع ملف zip ويشوف نوع القالب والذاكرة المطلوبة قبل ما يقرر.
العملية بقت background job في الباك إند مع شاشة متابعة حية، ومسح الموقع بيمسح الـ Docker image بتاعته في الخلفية عشان مساحة الديسك.
كل الاختبارات خضراء (144 باك إند، 67 فرونت إند، 8 E2E)، واللوحة شغالة تمام على السيرفر.

STEP REPORT: 3.5 (Part C, slice 3: deploy wizard UI & image cleanup)
Status: done
Branch: step-3.5 (built on step-3.4)
Deployed to: https://panel.talabq.com

## Summary
Completed Part C3: The New Site wizard in the frontend and background job pipeline. A tenant (or owner) can upload a project zip, preview the detected template and resource reservation, select/override template, name the site, and watch the build progress live. Upon app deletion, the built Docker image is cleaned up in the background once containers stop, preventing disk leaks.

## Changes
- Frontend `packages/frontend/src/pages/NewSitePage.jsx`: multi-step wizard (zip upload / drop, preview of detected framework + warnings + memory/CPU, site name and subdomain check, live job progress with animated phase indicators and error log tail).
- Frontend routing & navigation: `App.jsx`, `Shell.jsx`, `access.js`, `MySitesPage.jsx` wired with `/new` route and links; button in header and empty state.
- Frontend API: `api.postFile` for raw binary zip uploads with CSRF double-submit protection.
- Backend `packages/backend/src/services/hosting.js` & `routes/my.js`:
  - `POST /api/my/sites/inspect`: inspects zip without creating any resources, returns detected template, reasons, warnings, and allowance check.
  - Background job runner for `POST /api/my/sites` returning job ID (202 Accepted) and `GET /api/my/jobs/:id` for live polling. Scoped to caller's tenant (IDOR safe).
  - Background image cleanup (`removeBuiltImage`) on `deleteSite`: waits for swarm containers to terminate, then invokes `dockerImage.removeImage` for `app-*` repository.
- Protection policy: allowlisted `dockerImage.removeImage` restricted to `app-*` images with strict field allowlist.
- Arabic localization: full Arabic strings in `i18n/ar.js` with explainer tooltips.
- Tests: `packages/frontend/test/new-site.test.jsx`, `packages/backend/test/hosting.test.js` updated with image removal and inspect tests.
- Evidence saved: `docs/evidence/3.0/15-tests-c3.txt`, `16-e2e-c3.txt`, `17-server-after-c3.txt`, `18-deploy-c3.txt`.

## Commands and results
- `docker run --rm -v "E:/homeserver-panel:/app" -w /app node:24-alpine sh -c "npm test"`:
  - Backend: 144/144 passed (0 failed, 52s).
  - Frontend: 67/67 passed across 9 test files (0 failed, 45s).
- Playwright E2E: 8/8 passed against real Dokploy (1.3m).
- Live health check: `curl.exe -i https://panel.talabq.com/api/health` -> HTTP 200 OK `{"status":"ok","process":"ok","db":"ok","dokploy":"ok"}`.
- Secret scan: 0 hits in git diff and all new files.

## Acceptance
- Met: New Site wizard UI functional, live build progress, template auto-detection, image cleanup on deletion, full authorization and tenant scoping, 100% test coverage.

## Deviations
None.

## Open issues
- Tenant databases (Postgres, MySQL) configuration UI in wizard.
- Real deploy benchmarks for heavy templates (PHP, Laravel, Node) on this hardware.

## Needs Ahmed
Nothing for this step.

## Suggested next step
Part C4: Tenant database integration in the wizard (shared Postgres / MySQL) and remaining real deploys benchmarks, then proceed to Part D (in-panel container terminal).
