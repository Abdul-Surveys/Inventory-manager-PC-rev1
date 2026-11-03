#!/usr/bin/env bash
# PACKAGING SIDE (run where there IS internet): build the images and export
# them to tar files for transfer to the air-gapped server.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
VER="${APP_VERSION:-1.0.0}"
MONGO_TAG="${MONGO_IMAGE_TAG:-7.0}"

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

echo "[bundle] Building application images (version $VER) ..."
$COMPOSE build

echo "[bundle] Pulling pinned database image mongo:$MONGO_TAG ..."
docker pull "mongo:${MONGO_TAG}"

mkdir -p images
echo "[bundle] Saving images to ./images (this can take a few minutes) ..."
docker save "gpp-inventory-backend:${VER}" -o images/backend.tar
docker save "gpp-inventory-web:${VER}"     -o images/web.tar
docker save "mongo:${MONGO_TAG}"           -o images/mongo.tar

echo "[bundle] Done. Transfer the entire 'deploy' folder (including ./images) to the server."
ls -lh images
