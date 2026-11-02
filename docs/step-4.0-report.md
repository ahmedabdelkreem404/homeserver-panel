الطرفية التفاعلية داخل الحاويات (Part D) خلصت وبقت شغالة بالكامل للأدمن ولكل عميل على مواقعه بس.
الاتصال محمي بتذكرة مؤقتة لمرة واحدة وCSRF Origin Check مع تحديد جلستين كحد أقصى وأوامر سريعة جاهزة للقوالب.
كل الاختبارات خضراء (149 باك إند على Node 24، 69 فرونت إند، 8 E2E، و29 hsdeploy)، والتحديث اترفع وشغال على السيرفر.

STEP REPORT: 4.0 (Part D: In-panel container terminal & quick commands)
Status: done
Branch: step-4.0 (built on step-3.5)
Deployed to: https://panel.talabq.com

## Summary
Completed Part D (Scope 1): Interactive container terminal inside the control panel using xterm.js in the browser, an authenticated proxy through the backend, and Dokploy v0.30.10's native container terminal protocol. The feature is available for the owner across all apps, and for tenants restricted strictly to apps they own. Includes CSRF origin checks, single-use 30-second tickets, concurrency caps (max 2 sessions per user), idle timeouts (5 minutes), total session length limits (30 minutes), and safe quick-action commands (migrations, cache clear) without shell access.

Regarding Scope 2 (host terminal): per architectural rules, Docker-group access is root-equivalent; running a host terminal safely requires the host unix socket helper introduced in Phase 2 (Part E). Mounting the docker socket or granting host root inside the panel is strictly forbidden, so host terminal is deferred to Part E where hs-netd / root helper socket architecture is installed by the owner.

## Changes
- Backend `packages/backend/src/services/terminal.js`:
  - `issueTicket({ userId, applicationId, dokployClient })`: validates ownership, checks container status, issues 30-second cryptographic ticket, enforces max 2 active sessions per user.
  - `handleTerminalUpgrade(req, socket, head, { dokployUrl, dokployApiKey, app })`: CSRF Origin header verification, ticket validation & immediate burning, bi-directional WebSocket pipe to Dokploy's `/docker-container-terminal` endpoint with `x-api-key` auth.
  - Idle timeout (5 min of silence) and max session lifetime (30 min) automatic tear-down.
  - Input frame cap (4 KB per frame) to prevent buffer overflows / DoS.
  - Full audit logging: `terminal.open`, `terminal.close`, `command.run`.
  - `ALLOWED_COMMANDS` table per template (Laravel migrate/cache, Node info, etc.) with `runQuickCommand` executing fixed predefined commands only.
- Backend routing `packages/backend/src/app.js`, `routes/my.js`, `routes/panel.js`:
  - `POST /api/my/sites/:id/terminal/ticket` & `GET /api/my/sites/:id/commands` & `POST /api/my/sites/:id/commands/run` (tenant scoped).
  - `POST /api/projects/apps/:id/terminal/ticket` & `GET /api/projects/apps/:id/commands` & `POST /api/projects/apps/:id/commands/run` (owner/admin scoped).
  - HTTP server WebSocket upgrade handler routing `/api/terminal/ws?ticket=...`.
- Frontend `packages/frontend/src/components/TerminalModal.jsx`:
  - xterm.js + `@xterm/addon-fit` integration with responsive resizing.
  - Status badges (`connecting`, `connected`, `disconnected`, `error`), container ID badge, reconnection button, and explainer tooltip.
  - Quick action command buttons loaded from template definition, disabled during execution or disconnect.
- Frontend UI wiring:
  - Added Terminal icon to `Icon.jsx`.
  - Added Terminal button to `AppRow.jsx`, `MySitesPage.jsx`, and `ProjectsPage.jsx`.
  - Dark-mode terminal theme and styling in `components.css`.
  - Full Arabic strings with Latin bidi isolation in `i18n/ar.js`.
- Tests:
  - Backend: `packages/backend/test/terminal.test.js` (5 comprehensive test suites covering command allowlist, ticket issuance, ownership checks, concurrency limits, ticket burn, origin validation, idle timeouts, quick command runner).
  - Frontend: `packages/frontend/test/terminal-modal.test.jsx` (component tests with mocked xterm and WebSocket).

## Commands and results
- `docker run --rm -v "E:/homeserver-panel:/app" -w /app node:24-alpine sh -c "npm test"`:
  - Backend: 149/149 passed (0 failed, 50.9s).
  - Frontend: 69/69 passed across 10 test files (0 failed, 54.8s).
- `tools/hsdeploy npm test`: 29/29 passed (2.6s).
- Playwright E2E: 8/8 passed against real Dokploy (58.1s).
- Release build & deploy:
  - `node scripts/build-release.mjs`: release ready (9.5 MB).
  - `hsdeploy up`: deployed, container `app-index-back-end-program-k7bbqu.1.9j98xo43erud02v1jr9orj3vk` running and healthy.
  - Live health check: `curl.exe -s https://panel.talabq.com/api/health` -> HTTP 200 OK `{"status":"ok","process":"ok","db":"ok","dokploy":"ok"}`.
- Secret scan: 0 hits in git diff, commits, and new files.

## Acceptance
- Met: Terminal runs inside container with xterm.js, single-use ticket auth, strict CSRF origin validation, concurrency cap of 2, idle timeout, quick commands runner, tenant isolation verified, 100% test pass.

## Deviations
- Scope 2 (host terminal) deferred to Part E: granting host access safely without exposing the docker socket requires the root unix-socket helper daemon (`hs-netd`) being created in Part E.

## Open issues
None in Part D.

## Needs Ahmed
Nothing for this step.

## Suggested next step
Part E: Phase 2 (Network and Power: dummy0 interface, netplan metrics, daemon.json log rotation, hs-netd unix socket helper, battery guard).
