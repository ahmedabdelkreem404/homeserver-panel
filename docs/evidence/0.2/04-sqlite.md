# Item 4 - SQLite choice: node:sqlite vs better-sqlite3 (throwaway node:24-alpine container on the server)

Method: `ssh homeserver 'docker run --rm -i --memory 1g node:24-alpine sh -s' < script` (image already cached; no files left on the server). Each case runs in a fresh process: RSS at start, open DB (WAL), 1,000 autocommit inserts of audit-log-shaped rows, 2 s idle, RSS again. Scripts are not kept (deleted with .tmp).

## Run 1 - install, size and first measurements
```
== environment
v24.22.2
3.24.3
libc: musl libc (x86_64)
build tools present? python3=no make=no g++=no

== node:sqlite availability (stderr shows any warning)
node:sqlite loaded, DatabaseSync = function

== baseline (no sqlite) / node:sqlite
{"which":"none","node":"v24.22.2","rss_start_mb":46.5,"work_ms":0,"module_load_ms":0,"rss_idle_mb":46.8,"heap_used_mb":3.9,"rss_growth_mb":0.3}
{"which":"node:sqlite","node":"v24.22.2","rss_start_mb":46.5,"count":1000,"work_ms":4819,"module_load_ms":1,"rss_idle_mb":53.1,"heap_used_mb":4.5,"rss_growth_mb":6.6}

== better-sqlite3 install (no python/make/g++ in this image)
npm http fetch GET 200 https://registry.npmjs.org/better-sqlite3 787ms (cache miss)
npm http fetch GET 200 https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.0.3.tgz 8090ms (cache miss)
added 2 packages in 10s
npm install exit/time: 10 s
installed version: 13.0.3

== install size
node_modules total: 27344 KB
node_modules/better-sqlite3: 26876 KB
native binary: 2435680 bytes node_modules/better-sqlite3/prebuilds/linuxmusl-x64.node
native binary: 1980736 bytes node_modules/better-sqlite3/prebuilds/darwin-arm64.node
native binary: 1982880 bytes node_modules/better-sqlite3/prebuilds/darwin-x64.node
native binary: 2226168 bytes node_modules/better-sqlite3/prebuilds/linux-x64.node
native binary: 2312112 bytes node_modules/better-sqlite3/prebuilds/linuxmusl-arm64.node
native binary: 1903104 bytes node_modules/better-sqlite3/prebuilds/win32-arm64.node
native binary: 2066328 bytes node_modules/better-sqlite3/prebuilds/linux-arm64.node
native binary: 1989632 bytes node_modules/better-sqlite3/prebuilds/win32-x64.node
better-sqlite3 node-addon-api 

== better-sqlite3 run
{"which":"better-sqlite3","node":"v24.22.2","rss_start_mb":46.8,"count":1000,"work_ms":152,"module_load_ms":21,"rss_idle_mb":56.2,"heap_used_mb":4.3,"rss_growth_mb":9.4}
```

## Run 2 - same workload with the synchronous pragma set explicitly (DEFAULT = whatever the library ships)
```
better-sqlite3 installed (prebuilt, no compiler)
{"which":"node:sqlite","requested_sync":"DEFAULT","node":"v24.22.2","rss_start_mb":46.8,"synchronous":2,"count":1000,"work_ms":4839,"module_load_ms":0,"rss_idle_mb":53.3,"heap_used_mb":4.6,"rss_growth_mb":6.5}
{"which":"node:sqlite","requested_sync":"NORMAL","node":"v24.22.2","rss_start_mb":46.9,"synchronous":1,"count":1000,"work_ms":108,"module_load_ms":0,"rss_idle_mb":53.4,"heap_used_mb":4.6,"rss_growth_mb":6.5}
{"which":"node:sqlite","requested_sync":"FULL","node":"v24.22.2","rss_start_mb":46.8,"synchronous":2,"count":1000,"work_ms":5117,"module_load_ms":1,"rss_idle_mb":53.3,"heap_used_mb":4.6,"rss_growth_mb":6.5}
{"which":"better-sqlite3","requested_sync":"DEFAULT","node":"v24.22.2","rss_start_mb":46.9,"synchronous":1,"count":1000,"work_ms":144,"module_load_ms":18,"rss_idle_mb":56.2,"heap_used_mb":4.3,"rss_growth_mb":9.3}
{"which":"better-sqlite3","requested_sync":"NORMAL","node":"v24.22.2","rss_start_mb":46.8,"synchronous":1,"count":1000,"work_ms":138,"module_load_ms":17,"rss_idle_mb":56.1,"heap_used_mb":4.3,"rss_growth_mb":9.3}
{"which":"better-sqlite3","requested_sync":"FULL","node":"v24.22.2","rss_start_mb":46.9,"synchronous":2,"count":1000,"work_ms":4948,"module_load_ms":17,"rss_idle_mb":55.9,"heap_used_mb":4.3,"rss_growth_mb":9}
```
