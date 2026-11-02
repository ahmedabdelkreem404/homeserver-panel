# Secret scan, step 1.3

Command: `git add -N . && node <scratchpad>/scan.mjs` (outside the repo). It searches every tracked and intent-to-add file for the real Dokploy key, the Tailscale OAuth id and secret, the deploy-cli key and the MCP secret path.

```
DOKPLOY_API_KEY: 0 file(s)
TAILSCALE_CLIENT_SECRET: 0 file(s)
TAILSCALE_CLIENT_ID: 0 file(s)
DEPLOY_CLI_KEY: 0 file(s)
MCP_PATH_FRAGMENT: 0 file(s)
files checked: 121; .env.local tracked: false; node_modules tracked: false; problems: 0
```

Test values in the suite (Tailscale client id and secret, MCP path `OLDPATH...`, Dokploy fake secrets) are made-up strings that exist only in test files.
