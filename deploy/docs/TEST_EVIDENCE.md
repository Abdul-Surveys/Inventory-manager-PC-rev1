# Test Evidence Report

This report states exactly what was verified while preparing the self-hosting
package, and - just as importantly - what could **not** be verified in the build
environment. It is deliberately honest: readiness is not claimed on the basis of
the hosted Emergent preview.

Environment used for verification: the Emergent build container (Kubernetes).
This container does **not** have a Docker daemon, so the container images could
not be built or run here. Those steps must be validated by IT on a real Docker
host (called out below).

---

## 1. Verified here (evidence)

### Offline cleanup - frontend
- Produced a real production build (`yarn build`, exit 0).
- Scanned the entire build output for external references:
  `googleapis`, `gstatic`, `posthog`, `ap.emergent`, `assets.emergent`,
  `emergent.sh` -> **none found** (result: "CLEAN").
- Fonts are now bundled: **80 local font files** (`.woff/.woff2`) emitted under
  `build/static/media/` (IBM Plex Sans/Mono, Space Grotesk). No CDN font request
  remains.
- `index.html` title rebranded to "PetroChina GPP · Inventory Management"; the
  PostHog and `emergent-main.js` scripts are removed.
- No hosted preview URL is baked into the JS bundle.

### Offline cleanup - backend
- `server.py` contains no outbound HTTP calls to third-party services (grep).
- A trimmed, pinned dependency file (`deploy/backend-requirements.txt`) was
  created containing only the libraries `server.py` imports. The unused
  `emergentintegrations`, `litellm` (which installs from an Emergent-hosted
  wheel URL), `openai`, `boto3`, `requests`, etc. are excluded, so the image
  pulls nothing from Emergent and needs no internet at runtime.
- Versions were taken from the currently-running, working environment to keep
  them consistent with tested behaviour.

### Application health endpoint
- Added `GET /api/health`; verified it responds `{"status":"ok","database":"up"}`
  against the live backend.

### Deployment configuration
- `docker-compose.yml` parses as valid YAML.
- Confirmed the **database publishes no host port** (internal network only).
- Confirmed the web service publishes only 80/443 and mounts certs read-only.
- `server.py` parses without syntax errors after all changes.

### Same-origin API handling
- `lib/api.js` updated so an empty `REACT_APP_BACKEND_URL` makes the app call
  `/api` on the same origin, and `downloadReport` builds URLs against
  `window.location.origin` (works for both same-origin and absolute setups).

## 2. NOT verified here (must be checked by IT on a Docker host)

- **Image builds** (`backend.Dockerfile`, `frontend.Dockerfile`) - no Docker
  daemon in this environment. Build them with `scripts/build-and-save-images.sh`
  on a Docker host and confirm success.
- **End-to-end stack run** via `docker compose up` (service start order, health
  checks, restart-on-reboot).
- **Clean `pip install -r deploy/backend-requirements.txt`** in a fresh image -
  pins are from the live environment but a from-scratch resolve was not run here.
- **Self-signed certificate + HTTPS** served by nginx, and the 80->443 redirect.
- **Certificate trust behaviour** in company browsers / trust store import.
- **Performance** on the company's actual server and network, and with the full
  ~200k-item catalog.

## 3. Recommended acceptance test on the target server

1. `scripts/build-and-save-images.sh` on the packaging machine - expect 3 tars.
2. Transfer; on the server `./install.sh`.
3. `docker compose ps` -> all `healthy`.
4. `curl -k https://<APP_HOSTNAME>/api/health` -> `{"status":"ok"}`.
5. Open the dashboard; open browser dev tools Network tab and confirm **no
   external domains** are contacted.
6. Import a sample Excel; add/edit/delete a transaction; download a report and
   the offline desktop ZIP.
7. Reboot the server; confirm the stack comes back automatically.
8. `scripts/backup-db.sh` then `scripts/restore-db.sh` on a throwaway copy.

## 4. Remaining platform dependencies

- Docker Engine + Compose, `openssl`, `curl` on the server.
- Correct CPU architecture match between the packaging machine and the server
  (x86_64 by default; build on ARM for an ARM server).
- Internal DNS (or hosts entries) resolving `APP_HOSTNAME` to the server.
