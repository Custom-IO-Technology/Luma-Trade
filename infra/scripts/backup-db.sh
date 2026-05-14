#!/usr/bin/env bash
# =============================================================================
# Obscura Trading Engine — QuestDB Backup
# Usage: bash backup-db.sh   (or via cron)
# Keeps last 7 backups, compresses with gzip.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/data/backups"
QUESTDB_DATA="$PROJECT_ROOT/data/questdb"
MAX_BACKUPS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/questdb_backup_${TIMESTAMP}.tar.gz"

echo "[Backup] Creating snapshot: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" -C "$QUESTDB_DATA" .

# Rotate: keep only last N backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/questdb_backup_*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "$BACKUP_DIR"/questdb_backup_*.tar.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
    echo "[Backup] Rotated $REMOVE_COUNT old backup(s)."
fi

echo "[Backup] ✅ Done. Size: $(du -h "$BACKUP_FILE" | cut -f1)"
