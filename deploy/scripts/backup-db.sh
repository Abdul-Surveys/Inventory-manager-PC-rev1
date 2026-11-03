#!/usr/bin/env bash
# Back up the application database to a compressed archive in ./backups.
# Usage: ./scripts/backup-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
DB="${DB_NAME:-gpp_inventory}"
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

mkdir -p backups
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="backups/${DB}_${STAMP}.archive.gz"

echo "[backup] Dumping database '$DB' ..."
$COMPOSE exec -T mongo mongodump --db "$DB" --archive --gzip > "$OUT"
echo "[backup] Wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo "[backup] Store this file off-server as part of your backup routine."
