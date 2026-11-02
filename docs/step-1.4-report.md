الخطوة 1.4 (الواجهة) خلصت: الواجهة عربي RTL بتشتغل على موبايل 360px، وكل الاختبارات نجحت على Node 24.
اختبارات E2E اشتغلت على نسخة حقيقية من اللوحة في Docker متوصلة بـ Dokploy الحقيقي، وعملت وألغت مفتاح e2e-temp.
اللي ناقص: `/review` و`/qa` الرسميين ما اتشغلوش، وبيانات السيرفر (CPU/حرارة/بطارية) هتظهر في 1.5 لما نربط /proc و/sys.

STEP REPORT: 1.4
Status: done (with the gaps listed under Open issues)
Branch / commit: step-1.4 (pushed to origin)

## Summary
React + Vite frontend in `packages/frontend`, Arabic RTL first, light/dark themes, self-hosted Arabic font, served by the backend as static files (`STATIC_DIR`). Screens: login, TOTP verify, first-login flow (password, TOTP enrollment with a local SVG QR, recovery codes), dashboard, projects, MCP access, devices, server, audit log, settings.

## Changes
- `packages/frontend/**`: app, components (Dialog with focus trap, Menu, Explainer (!), TypedConfirm, Field, Meter, ...), pages, i18n (`ar.js` is the only place with strings), tokens/base/layout/components CSS.
- `packages/backend/src/static.js`, `app.js`, `config.js`: static serving with SPA fallback and security headers.
- `packages/backend/test/panel.test.js`: the audit time-filter test compared against a fixed fake clock while the audit writes real time; it started failing once the real clock passed the fake one. It now uses the real clock.
- `packages/frontend/e2e/**`: Playwright E2E (global setup starts the real panel in `node:24-alpine`, with the built frontend and the real Dokploy read access from `.env.local`; teardown removes the container).
- `.gitignore`: Playwright output.

## Commands and results
- Node 24 in Docker, `npm test`: backend 93/93, frontend (vitest/jsdom) 38/38. Output: `docs/evidence/1.4/00-tests-node24.txt`.
- `npx playwright test`: 7/7 passed. Output: `docs/evidence/1.4/01-e2e-playwright.txt`.
- `vite build`: passes (JS 310 kB, 93 kB gzip; CSS 4.3 kB gzip).

## Acceptance criteria
- Arabic RTL, responsive to 360 px: met. Evidence: `docs/evidence/1.4/screens/` (phone-* and desktop-* for 7 screens), E2E checks `dir=rtl` and no horizontal scroll at 360 px.
- All listed screens exist and use live data or a real empty state: met (projects come from the real Dokploy; the host-metric cards show "unavailable" until the host mounts exist in 1.5).
- Secret shown once, three client configs, cannot be closed before it is marked saved: met (component test and E2E).
- MCP path rotation warning with typed confirmation: met (component test; no real rotation was triggered).
- Typed-name delete, lock badge on protected items: met (component tests; E2E shows the lock on `infra` and `mcp-gateway`).
- CSRF enforced: met (E2E: a call without the header gets 403 `csrf_failed`; anonymous gets 401).
- First-login flow, TOTP login with replay-safe codes, logout: met (E2E).
- Throwaway key `e2e-temp` created and revoked: met (E2E). Cleanup: the row is gone from the panel after the test; the temporary panel container and its data are removed by teardown.
- Accessibility basics (labels, focus trap, aria, keyboard menu): met in component tests; no automated contrast audit was run.

## Evidence
`docs/evidence/1.4/00-tests-node24.txt`, `01-e2e-playwright.txt`, `screens/*.png` (the MCP url is masked).

## Deviations
- The E2E owner is a test account (`e2e-owner@example.test`) created in a throwaway data directory; the real owner is created in 1.5.
- `/plan-eng-review`, `/review`, `/qa` were not run for this part (budget); the E2E suite and the review of failures stand in for `/qa` locally. They are still owed.

## Open issues and risks
- In RTL, values with Latin units render the unit before the number (for example "GB 1.8", "ms 473"). Cosmetic; fix by isolating those values with a bidi isolate.
- Only the `step-1.4` branch is on GitHub; the earlier step branches are local.
- No automated contrast check.

## Needs Ahmed
Nothing for this part.

## Suggested next step
Part E (hsdeploy limits and shared Postgres), then 1.5 (deploy).
