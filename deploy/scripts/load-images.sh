#!/usr/bin/env bash
# SERVER SIDE (air-gapped): load the prebuilt images from ./images.
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob
files=(images/*.tar)
[ ${#files[@]} -gt 0 ] || { echo "No image tars found in ./images" >&2; exit 1; }
for f in "${files[@]}"; do
  echo "[load] $f"
  docker load -i "$f"
done
echo "[load] All images loaded."
