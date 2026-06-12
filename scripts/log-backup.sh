#!/bin/sh
set -e

BACKUP_BASE="/log"
DATE=$(date +%Y-%m-%d)
CONTAINERS="reactnode-server-release reactnode-file-server-release"

mkdir -p "$BACKUP_BASE"

for CONTAINER in $CONTAINERS; do
    LOG_PATH=$(docker inspect --format='{{.LogPath}}' "$CONTAINER" 2>/dev/null)

    if [ -z "$LOG_PATH" ]; then
        echo "[$(date)] Container $CONTAINER not found, skipping"
        continue
    fi

    if [ ! -f "$LOG_PATH" ]; then
        echo "[$(date)] Log file not found: $LOG_PATH"
        continue
    fi

    BACKUP_DIR="$BACKUP_BASE/$DATE"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/${CONTAINER}.log"

    echo "[$(date)] Backing up $CONTAINER logs -> $BACKUP_FILE"
    cp "$LOG_PATH" "$BACKUP_FILE"
    truncate -s 0 "$LOG_PATH"
    echo "[$(date)] Cleared $CONTAINER log"
done

# Delete backup directories older than 30 days
find "$BACKUP_BASE" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \;
echo "[$(date)] Cleaned up backups older than 30 days"
