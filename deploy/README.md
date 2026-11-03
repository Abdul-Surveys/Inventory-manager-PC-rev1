# PetroChina GPP Inventory - Self-Hosting Package

This `deploy/` folder contains everything the company IT team needs to run the
inventory application on an internal server, over the company intranet, with no
internet access. The application and its features are unchanged from the hosted
version.

## What's inside

| Path | Purpose |
|------|---------|
| `.env.example` | The single configuration file (copy to `.env` and edit) |
| `docker-compose.yml` | Defines the three services (web, backend, database) |
| `backend.Dockerfile` / `frontend.Dockerfile` | How the app images are built |
| `backend-requirements.txt` | Trimmed, offline, pinned backend dependencies |
| `nginx/nginx.conf` | HTTPS termination, static hosting, `/api` reverse proxy |
| `install.sh` | One-command install / start |
| `scripts/` | Certificate, image bundle, backup/restore helpers |
| `docs/` | Full IT guide, offline audit, migration, upgrade, evidence, checklist |

## Two-machine workflow (air-gapped)

1. **Packaging machine (has internet):** run `scripts/build-and-save-images.sh`
   to build and export the images into `images/*.tar`.
2. **Server (air-gapped):** copy the whole `deploy/` folder (including `images/`),
   then run `./install.sh`.

## Quick start (on the server)

```bash
cd deploy
cp .env.example .env         # then edit APP_HOSTNAME etc.
./install.sh                 # loads images, makes cert, starts everything
# open https://<APP_HOSTNAME>/
```

Start with **docs/IT_INSTALLATION_GUIDE.md** for the complete procedure.

## Key facts

- **No login** - access is open to anyone on the intranet by design; the network
  is the security boundary.
- **Offline** - no feature calls the internet at runtime (see
  `docs/OFFLINE_REQUIREMENTS_REPORT.md`).
- **Empty start** - the database begins empty; import your data later
  (see `docs/DATA_MIGRATION.md`).
- **Only the database needs backup** - the app stores no uploaded files on disk.
