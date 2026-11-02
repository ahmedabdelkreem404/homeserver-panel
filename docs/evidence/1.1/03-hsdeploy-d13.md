# D13 - hsdeploy trusts configs created by init; trust covers only the build command

## Unit and CLI-level tests (hsdeploy suite)
```

> hsdeploy-cli@0.1.0 test
> node --test "test/*.test.js"

TAP version 13
# Subtest: project config: valid, defaults, and clear rejections
ok 1 - project config: valid, defaults, and clear rejections
# Subtest: config hash is order independent; trust is per path and covers only the build command (D13)
ok 2 - config hash is order independent; trust is per path and covers only the build command (D13)
# Subtest: user config: env overrides the file, bad url rejected
ok 3 - user config: env overrides the file, bad url rejected
# Subtest: error mapping by HTTP status, and the key never appears in a message
ok 4 - error mapping by HTTP status, and the key never appears in a message
# Subtest: client: timeout, network failure and auth errors are mapped; key is not leaked
ok 5 - client: timeout, network failure and auth errors are mapped; key is not leaked
# Subtest: env merge keeps unrelated keys such as DATABASE_URL
ok 6 - env merge keeps unrelated keys such as DATABASE_URL
# Subtest: lock: second run is refused while the first is alive, stale locks are taken over
ok 7 - lock: second run is refused while the first is alive, stale locks are taken over
# Subtest: deployer refuses protected projects and apps it did not create, before any mutation
ok 8 - deployer refuses protected projects and apps it did not create, before any mutation
# Subtest: subdomain validation table
ok 9 - subdomain validation table
# Subtest: a host used by another service is refused, but an app may keep its own host
ok 10 - a host used by another service is refused, but an app may keep its own host
# Subtest: protected projects are refused by name (case-insensitive) and by id
ok 11 - protected projects are refused by name (case-insensitive) and by id
# Subtest: an app without the hsdeploy marker cannot be changed, even in a normal project
ok 12 - an app without the hsdeploy marker cannot be changed, even in a normal project
# Packed 1 files into a 0.00 MB zip
# Packed 1 files into a 0.00 MB zip
# Packed 1 files into a 0.00 MB zip
# Packed 1 files into a 0.00 MB zip
# Subtest: D13: a config created by init is trusted at once; non-code edits keep trust; a new build command needs a person
ok 13 - D13: a config created by init is trusted at once; non-code edits keep trust; a new build command needs a person
# Subtest: D13: a config that was not created by init on this machine needs manual trust, and trust is bound to its folder
ok 14 - D13: a config that was not created by init on this machine needs manual trust, and trust is bound to its folder
# Subtest: init still refuses protected projects and reserved subdomains, and trusts nothing it refused
ok 15 - init still refuses protected projects and reserved subdomains, and trusts nothing it refused
# Subtest: zip entries use forward slashes and round-trip through an independent reader
ok 16 - zip entries use forward slashes and round-trip through an independent reader
# Subtest: Windows paths are converted and unsafe names are rejected
ok 17 - Windows paths are converted and unsafe names are rejected
# Subtest: incompressible data is stored, compressible data is deflated
ok 18 - incompressible data is stored, compressible data is deflated
# Subtest: ignore matcher: dirs, globs, nested names; negation is rejected
ok 19 - ignore matcher: dirs, globs, nested names; negation is rejected
# Subtest: collectFiles skips default excludes, env files and .dockerignore entries
ok 20 - collectFiles skips default excludes, env files and .dockerignore entries
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 530.6166
```

## Live check with the reinstalled global CLI (no network: --dry-run)
```
$ hsdeploy up --dry-run          # right after init
(init printed: Wrote .hsdeploy.json and trusted it.) -> Dry run: 1 files, 0.00 MB. Nothing was uploaded.
$ edit subdomain, then hsdeploy up --dry-run
-> Dry run: 1 files, 0.00 MB. Nothing was uploaded.   (no new approval needed)
$ edit buildCommand, then hsdeploy up --dry-run
hsdeploy: .hsdeploy.json changed or was never approved here. Review it (it can name a build command), then run `hsdeploy trust`.
exit=3
$ hsdeploy trust   (no TTY, as an agent would run it)
hsdeploy: `hsdeploy trust` must be run by a person in an interactive terminal. Tell the owner which .hsdeploy.json needs approval and why.
exit=3
```
