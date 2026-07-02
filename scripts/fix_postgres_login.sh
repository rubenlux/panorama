#!/bin/bash
# Fix for: "role postgres is not permitted to log in" (code 28000)
#
# Cause: abrupt shutdown of Docker Desktop / WSL2 (e.g. killing everything when
# CPU spikes) can corrupt the WSL2 virtual disk backing the postgres_data volume,
# flipping rolcanlogin in pg_authid without any ALTER ROLE ever running.
#
# Fix: bring the container down, patch the role in single-user mode
# (bypasses the login check entirely), then start it back up.
set -e

CONTAINER=news-postgres-1
VOLUME=news_postgres_data

echo "[1/3] Stopping $CONTAINER..."
docker stop "$CONTAINER"

echo "[2/3] Restoring LOGIN on role postgres (single-user mode)..."
echo "ALTER ROLE postgres LOGIN;" | MSYS_NO_PATHCONV=1 docker run --rm -i \
  -v "$VOLUME":/var/lib/postgresql/data \
  postgres:15-alpine postgres --single -D /var/lib/postgresql/data postgres

echo "[3/3] Starting $CONTAINER..."
docker start "$CONTAINER"
sleep 3

RESULT=$(docker exec "$CONTAINER" psql -U postgres -d newsdb -tAc \
  "SELECT rolcanlogin FROM pg_roles WHERE rolname='postgres'" 2>&1)

if [ "$RESULT" = "t" ]; then
  echo "✓ Fixed — postgres role can log in again."
else
  echo "✗ Still broken — output: $RESULT"
  exit 1
fi
