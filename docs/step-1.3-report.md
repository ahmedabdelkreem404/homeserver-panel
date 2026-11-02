خلاص 1.3 خلصت: كل الـ API بتاع اللوحة (مشاريع، مفاتيح MCP، أجهزة Tailscale، حالة السيرفر، سجل التدقيق) اتبنى واتختبر.
88 اختبار نجحوا على Node 24 جوه Docker، والسر مش ظاهر في أي رد ولا لوج.
فاضل تحقق واحد في 1.5: قراءة `/host/proc` من جوه الكونتينر على السيرفر الحقيقي.

STEP REPORT: 1.3
Status: done
Branch / commit: step-1.3 (from step-1.2)
Summary: Panel API behind full sessions: projects (list with usage and urls, state verdict, lifecycle actions, logs, typed-name delete), MCP access keys (list, create with one-time secret and client configs, revoke), MCP path rotation as one audited policy exception, Tailscale devices (read only), full server status (D11), on-demand speed test, audit API. Every source degrades to `{available:false, reason}`.
Changes (files and modules):
- src/metrics/{hostfs,parsers,sampler,speedtest,status}.js, src/migrations/003_metrics.sql
- src/services/{projects,mcp,tailscale}.js, src/routes/panel.js
- protection-policy.js (domain host rules, reserved subdomains), config.js, gateway.js (appDetails, createApiKey), audit.js (query), app.js, server.js
- tests: host-metrics.test.js (11), panel.test.js (16), policy.test.js (+2), updates to helpers/app/core tests
Commands run and results: `npm test --workspace packages/backend` in node:24-alpine (Node v24.22.2): tests 88, pass 88, fail 0 (docs/evidence/1.3/00-tests-node24.txt). Secret scan: 0 problems (docs/evidence/1.3/01-secret-scan.md).
Acceptance criteria:
- Every route 401 without a session, deny-by-default: met (panel.test.js, route table test)
- Protected apps/projects/keys refused with no call to Dokploy: met (actions, delete, key tests)
- No env, token or secret in any response, log or audit row: met (leak test, key and rotation tests)
- Rotation exception touches only the one env line, only saveEnvironment + redeploy on dokploy-mcp, needs typed ROTATE, waits for /health, audited: met; fails safe when unhealthy or app/variable missing
- Parsers verified on real data captured from the server: met (fixtures/host/host-samples.txt)
- Speed test limited (1 per 10 min, one at a time, 25 MB down / 10 MB up) and stored: met
Evidence: docs/evidence/1.3/
Deviations from the prompt and why: per-part /plan-eng-review and /review were done inline (self review against the checklist), not through the gstack skills; /qa and /cso are still owed after 1.4 and 1.5 as the prompt says.
Bugs found by the new tests and fixed: parseUptime returned 0 for a missing file (now null, so uptime shows as unavailable); a malformed audit cursor returned no rows (now ignored); route id check required 6+ characters (now 1-64 of the same charset).
Open issues and risks: a non-root container may not be able to read /host/proc/1/net/* on the real server (EACCES). It degrades to "unavailable" instead of failing; checked in 1.5, fallback is host networking or running that read as root. Real Tailscale OAuth client is not exercised here (fake fetch only); 1.5 checks it live.
Needs Ahmed (accounts, keys, decisions): nothing for this part.
Suggested next step: 1.4 frontend.
