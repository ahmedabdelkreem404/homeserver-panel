# Item 1 - API key rate-limit audit (read-only query; key/hash/start columns never selected)

Command: `ssh homeserver 'docker exec -e PGOPTIONS="-c default_transaction_read_only=on" $(docker ps -q -f name=dokploy-postgres) psql -U dokploy -d dokploy -c "SELECT name, enabled, rate_limit_enabled, rate_limit_time_window, rate_limit_max, request_count, last_request, expires_at, created_at FROM apikey ORDER BY created_at"'`

```
       name       | enabled | rate_limit_enabled | window_ms | rate_limit_max | request_count |      last_request       | expires_at |       created_at        
------------------+---------+--------------------+-----------+----------------+---------------+-------------------------+------------+-------------------------
 claude-code      | t       | f                  |  86400000 |             10 |             0 | 2026-11-01 18:53:07.089 |            | 2026-11-01 18:31:19.972
 remote-test      | t       | f                  |  86400000 |             10 |             0 | 2026-11-01 19:40:23.961 |            | 2026-11-01 19:06:39.661
 homeserver-panel | t       | f                  |  86400000 |             10 |             0 | 2026-11-01 21:04:01.079 |            | 2026-11-01 21:03:51.055
(3 rows)
```
