#!/usr/bin/env bash
# setup.sh — Wait for MongoDB and Redis to be healthy before running smoke tests
# Usage: test/smoke/setup.sh [max_wait_seconds]

set -euo pipefail

MAX_WAIT="${1:-60}"
INTERVAL=2
ELAPSED=0

echo "=== Smoke Test Setup ==="

# Wait for MongoDB
echo -n "Waiting for MongoDB... "
while ! echo 'db.version()' | mongosh --host mongodb --port 27017 \
    -u "$DB_USERNAME" -p "$DB_PWD" --authenticationDatabase admin \
    --quiet 2>/dev/null; do
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo "TIMEOUT after ${MAX_WAIT}s"
        exit 1
    fi
    echo -n "."
done
echo "OK"

# Wait for Redis
echo -n "Waiting for Redis... "
ELAPSED=0
while ! redis-cli -h redis -p 6379 -a "$SESS_PWD" ping 2>/dev/null | grep -q PONG; do
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo "TIMEOUT after ${MAX_WAIT}s"
        exit 1
    fi
    echo -n "."
done
echo "OK"

echo "=== Infrastructure Ready ==="
