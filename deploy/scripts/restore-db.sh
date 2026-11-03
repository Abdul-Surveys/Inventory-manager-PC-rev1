#!/usr/bin/env bash
# Restore the application database from a compressed archive produced by
# backup-db.sh. THIS REPLACES the current data for that database.
# Usage: ./scripts/restore-db.sh backups/gpp_inventory_YYYYmmdd_HHMMSS.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
DB="${DB_NAME:-gpp_inventory}"
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

SRC="${1:-}"
[ -n "$SRC" ] && [ -f "$SRC" ] || { echo "Usage: $0 <archive.gz>" >&2; exit 1; }

read -r -p "This will DROP and replace database '$DB'. Continue? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "Aborted."; exit 1; }

echo "[restore] Restoring '$DB' from $SRC ..."
cat "$SRC" | $COMPOSE exec -T mongo mongorestore --db "$DB" --archive --gzip --drop
echo "[restore] Done. The app recreates indexes automatically on next start."
