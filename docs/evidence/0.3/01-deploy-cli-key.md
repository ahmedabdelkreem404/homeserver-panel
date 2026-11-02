# deploy-cli key verification (read-only query; key/hash/start columns never selected)

```
       name       | enabled | rate_limit_enabled |       expires_at        |       created_at        
------------------+---------+--------------------+-------------------------+-------------------------
 claude-code      | t       | f                  |                         | 2026-11-01 18:31:19.972
 remote-test      | t       | f                  |                         | 2026-11-01 19:06:39.661
 homeserver-panel | t       | f                  |                         | 2026-11-01 21:03:51.055
 deploy-cli       | t       | f                  | 2027-11-01 21:36:37.593 | 2026-11-01 21:36:37.593
(4 rows)
```

Expiry check: expires_at is about one year after created_at. The key value is only in %USERPROFILE%\.hsdeploy\config.json (ACL: current user only).

ACL of the config file:
```
C:\Users\<current user> Abdelkareem/.hsdeploy/config.json DESKTOP-8B6PHQI\<current user>:(F)

Successfully processed 1 files; Failed processing 0 files
```
