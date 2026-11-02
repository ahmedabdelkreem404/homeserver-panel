Part A خلص ونزل على اللوحة: ضفت 8 أدوات AI جديدة في صفحة مفاتيح MCP، ومكتوب في الصفحة ليه ChatGPT وDeepSeek مش موجودين.
كل إعداد اتكتب من التوثيق الحالي للأداة، واتعمل له اختبار، والاختبارات نجحت (فرونت 42، وbackend 17 في ملف اللوحة).
اللي بعده: Part B (المستخدمين والصلاحيات والكوتا) وهو الأكبر، والتفاصيل في docs/HANDOFF-PROMPT.md.

STEP REPORT: 3.0 (Part A: more AI clients)
Status: done
Branch: step-3.0 (from step-2.1)

## Summary
The create-key dialog now has tabs for Claude Code, Codex, Cursor (existing) plus Gemini CLI, Antigravity, Windsurf, VS Code, Cline, Zed, Claude Desktop and a generic block (URL + headers for any other tool). Each tab says where to paste the config. A note explains that ChatGPT and DeepSeek's chat have no config here and why. The tab list scrolls sideways on a phone.

## Vendor details used (web search of current docs, 2026-11-02; some sources are third-party guides)
- Gemini CLI: `mcpServers.<name>.httpUrl` + `headers` in `~/.gemini/settings.json` (official GitHub doc).
- Windsurf and Antigravity: `serverUrl` + `headers` in `mcp_config.json`. The Antigravity file location differs by version (`~/.gemini/antigravity/` or `~/.gemini/config/`), so the page tells the user to open the raw config from the MCP settings instead of naming one path.
- VS Code: `.vscode/mcp.json`, root key `servers`, `type: "http"`.
- Cline: `type: "streamableHttp"` exactly; no official Cline page was found, sources agree with each other.
- Zed: `context_servers.<name>.url` + `headers` (official docs).
- Claude Desktop: no native header support for remote servers, so `npx mcp-remote` with the values passed through `env` (a space inside an argument breaks on Windows). From the mcp-remote usage pattern, not re-verified against its README.
- Not added: ChatGPT (OAuth or no auth, no custom headers) and DeepSeek chat (no MCP client). Continue was left out because its schema was not verified.

## Changes
`packages/backend/src/services/mcp.js` (`clientConfigs`, `CLIENT_KEYS`), `packages/frontend/src/pages/mcp/CreateKeyDialog.jsx`, `ar.js`, `components.css`, tests `panel.test.js` (new test) and `mcp-clients.test.jsx`.

## Results
- Frontend vitest: 42/42. Backend `panel.test.js` on Node 24 in Docker: 17/17. The full backend suite was not re-run after this change (only the file that covers it).
- Deployed to https://panel.talabq.com with hsdeploy; `/api/health` ok; the MCP and backup routes answer 401 without a session. Evidence: `docs/evidence/3.0/00-deploy.txt`.

## Open issues
- The Antigravity, Cline and Claude Desktop entries rest on third-party docs; test them with a real install before telling a client they work.
- The full suites and the formal review for this part are still owed (Part F).

## Needs Ahmed
Nothing. Try the new tabs by creating a throwaway key in the panel.

## Suggested next step
Part B (users, roles, quotas, isolation). See `docs/HANDOFF-PROMPT.md` and `docs/NEXT.md`.
