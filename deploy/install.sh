#!/usr/bin/env bash
# Install / start the GPP Inventory stack on this server.
# Safe to re-run: it will load images (if a bundle is present), ensure a
# certificate exists, and (re)start the services.
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info(){ echo -e "${GREEN}[install]${NC} $*"; }
warn(){ echo -e "${YELLOW}[install]${NC} $*"; }
fail(){ echo -e "${RED}[install]${NC} $*" >&2; exit 1; }

# ---- 1. Prerequisites ----
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. See docs/IT_INSTALLATION_GUIDE.md"
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose";
else fail "Docker Compose is not installed."; fi
info "Using: $COMPOSE"

# ---- 2. Configuration ----
if [ ! -f .env ]; then
  warn ".env not found - creating it from .env.example. EDIT IT before continuing."
  cp .env.example .env
  fail "Edit deploy/.env (set APP_HOSTNAME etc.), then run ./install.sh again."
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${APP_HOSTNAME:?APP_HOSTNAME must be set in .env}"
info "Hostname: $APP_HOSTNAME"

# ---- 3. Load prebuilt images (air-gapped bundle), if present ----
if ls images/*.tar >/dev/null 2>&1; then
  info "Loading prebuilt images from ./images ..."
  ./scripts/load-images.sh
else
  warn "No image bundle in ./images - compose will build locally (needs internet)."
fi

# ---- 4. Certificate ----
if [ ! -f certs/server.crt ] || [ ! -f certs/server.key ]; then
  info "Generating self-signed certificate for $APP_HOSTNAME ..."
  ./scripts/generate-cert.sh "$APP_HOSTNAME"
else
  info "Certificate already present in ./certs - keeping it."
fi

# ---- 5. Start ----
info "Starting services ..."
$COMPOSE up -d

# ---- 6. Wait for health ----
info "Waiting for services to become healthy ..."
for i in $(seq 1 40); do
  if $COMPOSE ps | grep -q 'unhealthy'; then sleep 3; continue; fi
  if curl -fsSk "https://localhost:${HTTPS_PORT:-443}/api/health" >/dev/null 2>&1; then
    info "Health check passed."; break
  fi
  sleep 3
done

echo
info "Done. Open:  https://${APP_HOSTNAME}/"
warn "First visit shows a certificate trust prompt unless IT imports certs/server.crt into the trust store."
