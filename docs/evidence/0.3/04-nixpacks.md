# Item 7b - one nixpacks build of a tiny Node app on the server (app "nixpacks" in throwaway project hs-limits)

App: `package.json` (start script) + `server.js` (plain `http` server), no dependencies. Build type `nixpacks`, uploaded with `application.dropDeployment`. Server sampled every ~2 s over ssh (`free -m`, `docker stats --no-stream`) during the build. Nothing else was building.

Result: **FAILED after 1092 s (18.2 minutes).** Dokploy's own build log:

```
#8 965.2 curl: (56) Recv failure: Connection timed out
#8 965.2 error: cannot download npm-9.9.4.tgz from any mirror
#8 965.3 error: builder for '.../npm-9.9.4.tgz.drv' failed with exit code 1
ERROR: failed to build: failed to solve: process "/bin/bash -ol pipefail -c nix-env -if .nixpacks/nixpkgs-...nix && nix-collect-garbage -d" did not complete successfully: exit code: 1
Error: Docker build failed
```

The failing step is nixpacks installing Node 18 and npm through Nix inside the build: it downloaded hundreds of store paths from cache.nixos.org and then timed out fetching npm from registry.npmjs.org over the home connection.

Server memory during the build (238 samples, `free -m`):

| | used MB | available MB |
|---|---|---|
| before the build (3 samples) | 2263 | 1597 |
| peak during the build | 2457 (+194) | 1403 (lowest) |

- `dokploy` container (docker stats) peaked at 1705 MiB during the build (about 1.1-1.4 GiB idle).
- Max 1-minute load average 1.28 on 4 cores. Disk: 13 GB used before and after (the failed build left no new image).
- Raw samples are not kept (deleted with `.tmp`); the summary above is computed from all 238 samples.

Verdict: server-side nixpacks builds are **not acceptable on this host**: 18 minutes with no result because of the slow connection, and the Dokploy container grows by 300+ MiB while building. Builds should happen on the owner's machine (static mode) or use a Dockerfile that copies prebuilt files and downloads little.
