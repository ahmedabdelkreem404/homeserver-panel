# Live health check (read-only) against the real Dokploy, full server process on Node 24 in Docker

Command: docker run --rm --env-file .env.local -e DATA_DIR=/tmp/panel-data -e PORT=3999 node:24-alpine ... node src/server.js (the key is passed through a file, never on the command line).

```
server answered after 7 s (bind-mounted Windows files load slowly)
--- GET /api/health
{"status":"ok","process":"ok","db":"ok","dokploy":"ok"}
--- again (cached 10 s)
{"status":"ok","process":"ok","db":"ok","dokploy":"ok"}
--- GET /api/projects (must be 404 JSON)
wget: server returned error: HTTP/1.1 404 Not Found

--- server log: 8 lines; occurrences of the API key value in it: 0
{"level":30,"time":T,"pid":8,"hostname":"H","msg":"Server listening at http://127.0.0.1:3999"}
{"level":30,"time":T,"pid":8,"hostname":"H","msg":"Server listening at http://172.17.0.2:3999"}
{"level":30,"time":T,"pid":8,"hostname":"H","reqId":"req-1","req":{"method":"GET","url":"/api/health","host":"127.0.0.1:3999","remoteAddress":"127.
{"level":30,"time":T,"pid":8,"hostname":"H","reqId":"req-1","res":{"statusCode":200},"responseTime":223.6422680000005,"msg":"request completed"}
{"level":30,"time":T,"pid":8,"hostname":"H","reqId":"req-2","req":{"method":"GET","url":"/api/health","host":"127.0.0.1:3999","remoteAddress":"127.
{"level":30,"time":T,"pid":8,"hostname":"H","reqId":"req-2","res":{"statusCode":200},"responseTime":0.46782600000005914,"msg":"request completed"}
```

Notes: the first request took about 224 ms (two authenticated Dokploy calls, settings.health and user.haveRootAccess), the second 0.5 ms (cached 10 s). /api/projects answers 404: nothing but /api/health is public. The log holds 0 occurrences of the API key value.
