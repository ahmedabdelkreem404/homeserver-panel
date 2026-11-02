# Item 8d - CLI QA probes (error paths and safety). Only read-only live API calls; nothing is created or deleted.

Expected exit codes: 0 ok, 1 failed, 2 usage or bad config, 3 refused, 4 timeout, 5 auth. The first run of this list found two things: config validation errors exited 1 instead of 2 (fixed: they are usage errors now), and my own expectation for `env push` on a protected project was wrong (the policy refuses first, exit 3, which is the right behavior).

```
up in a folder without .hsdeploy.json                              exit=2 (expected 2) PASS
    hsdeploy: No .hsdeploy.json in E:\homeserver-panel\.tmp\qa\empty. Run `hsdeploy init` first. 
unknown command                                                    exit=2 (expected 2) PASS
    hsdeploy: Unknown command "bogus". Try `hsdeploy --help`. 
unknown option                                                     exit=2 (expected 2) PASS
    hsdeploy: Unknown option '--nope'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--nope". Try `hsdeploy --help`. 
init for protected project infra                                   exit=3 (expected 3) PASS
    hsdeploy: Project "infra" is protected. hsdeploy never touches infra, mcp-gateway, homeserver-panel. 
init for protected project MCP-Gateway (case)                      exit=3 (expected 3) PASS
    hsdeploy: Project "MCP-Gateway" is protected. hsdeploy never touches infra, mcp-gateway, homeserver-panel. 
init subdomain with two labels                                     exit=2 (expected 2) PASS
    hsdeploy: subdomain "a.b" must be a single label (no dots): the wildcard only covers one level. 
init uppercase subdomain                                           exit=2 (expected 2) PASS
    hsdeploy: subdomain "Site" must be lowercase. 
init reserved subdomain mcp                                        exit=3 (expected 3) PASS
    hsdeploy: subdomain "mcp" is reserved. 
init without --project                                             exit=2 (expected 2) PASS
    hsdeploy: .hsdeploy.json: "dokployProject" is required. 
up with a never-approved .hsdeploy.json (it names a build command) exit=3 (expected 3) PASS
    hsdeploy: .hsdeploy.json changed or was never approved here. Review it (it can name a build command), then run `hsdeploy trust`. 
config with a secret-like field is rejected                        exit=2 (expected 2) PASS
    hsdeploy: .hsdeploy.json: unknown field "apiKey". Secrets and URLs do not belong in this file. 
trust without a TTY (agent-style run) is refused                       exit=3 (expected 3) PASS
    hsdeploy: `hsdeploy trust` must be run by a person in an interactive terminal. Tell the owner which .hsdeploy.json needs approval and why.
status (read-only) on a protected project is refused before any call exit=3 (expected 3) PASS
    hsdeploy: Project "mcp-gateway" is protected. hsdeploy never touches infra, mcp-gateway, homeserver-panel. 
env push on a protected project is refused first                   exit=3 (expected 3) PASS
    hsdeploy: Project "mcp-gateway" is protected. hsdeploy never touches infra, mcp-gateway, homeserver-panel. 
wrong key -> auth error                                            exit=5 (expected 5) PASS
    hsdeploy: Dokploy rejected the key for project.all (HTTP 401). The key may be revoked, expired or rate limited. Unauthorized 
unreachable server -> network error                                exit=1 (expected 1) PASS
    hsdeploy: Cannot reach Dokploy at http://127.0.0.1:9 (fetch failed). 
```

After this list was recorded `hsdeploy trust` was changed (found by the /cso review): it now needs a person at an interactive terminal and refuses without a TTY, as probed above.
