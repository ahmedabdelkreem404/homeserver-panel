#!/bin/bash
# Part 2A: backups on the server before any network or swarm change. Nothing is modified outside ~/hs-backups.
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
DEST=$HOME/hs-backups/$TS
mkdir -p "$DEST" && chmod 700 "$HOME/hs-backups" "$DEST"
U=$(id -u); G=$(id -g)
# root-only host folders are read through a throwaway container with a read-only bind mount (no sudo)
copy() { docker run --rm -v "$1":/src:ro -v "$DEST":/dest -e U=$U -e G=$G node:24-alpine sh -c "tar czf /dest/$2 -C /src . && chown \$U:\$G /dest/$2 && chmod 600 /dest/$2"; }
copy /etc/dokploy etc-dokploy.tgz
copy /etc/netplan etc-netplan.tgz
copy /etc/docker etc-docker.tgz
PG=$(docker ps -q --filter name=dokploy-postgres | head -n1)
PGUSER=$(docker exec "$PG" printenv POSTGRES_USER); PGDB=$(docker exec "$PG" printenv POSTGRES_DB)
docker exec "$PG" pg_dump -U "$PGUSER" "$PGDB" | gzip > "$DEST/dokploy-postgres.sql.gz"
chmod 600 "$DEST"/*
echo "backup folder: $DEST"
ls -l "$DEST" | awk 'NR>1 {print $5, $9}'
for f in etc-dokploy.tgz etc-netplan.tgz etc-docker.tgz dokploy-postgres.sql.gz; do
  [ -s "$DEST/$f" ] || { echo "EMPTY: $f"; exit 1; }
done
tar tzf "$DEST/etc-netplan.tgz" | sed 's|^\./||' | grep -v '^$' | sed 's/^/netplan file: /'
tar tzf "$DEST/etc-docker.tgz" | sed 's|^\./||' | grep -v '^$' | sed 's/^/docker file: /'
gzip -t "$DEST/dokploy-postgres.sql.gz" && echo "pg_dump gzip: ok ($(zcat "$DEST/dokploy-postgres.sql.gz" | grep -c '^CREATE TABLE') tables)"
echo "daemon.json:"; tar xzOf "$DEST/etc-docker.tgz" ./daemon.json
echo "BACKUP-OK $DEST"
