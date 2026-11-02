# NEXT (state when the last session ended)

Done and pushed:
- Parts up to 1.5, E, 2A (inventory + backups), HANDOFF-PROMPT.md
- Part A: more AI clients (branch `step-3.0`, deployed)
- Part B: hosting accounts & quotas (branches `step-3.1`, `step-3.2`)
- Part C: deploy wizard & image cleanup (branches `step-3.3`, `step-3.4`, `step-3.5`, deployed)
- Part D: container terminal & quick commands (branch `step-4.0`, deployed and green). Reports: docs/step-3.1-report.md through docs/step-4.0-report.md.
- Part C4 / Step 5.0: Hostinger hPanel features, 1-Click Apps (n8n, WordPress, PocketBase), Dedicated per-site DB isolation, and public landing page (branch `step-5.0`, deployed and green: backend 150/150 on Node 24 Docker, frontend vitest 71/71, Playwright E2E 8/8). Report: docs/step-5.0-report.md.

Next:
- Part E: Phase 2 (Network and Power: dummy0 interface, netplan route metrics, daemon.json log rotation, hs-netd unix socket helper, battery guard). Ops bundle prepared in ops/, Ahmed executes single sudo bash command on homeserver.
- Part G: Dashboard real-time speed widget (visitor connection speed + server speed schedule and history chart).
- Part F: Closing the loop (security review, production screenshots, operations manual update).

Starting checks: `git fetch && git checkout step-5.0`, confirm https://panel.talabq.com/api/health is ok.

Owner actions still open: first sign-in at https://panel.talabq.com (new password, authenticator, recovery codes, then delete the Desktop file `panel-first-login.txt`); optionally turn off Cloudflare Web Analytics injection (see HANDOFF section 7).
