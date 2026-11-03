# IT Handover Checklist - PetroChina GPP Inventory (Self-Hosted)

Use this list to install, verify, and formally accept the deployment.

## A. Before you start
- [ ] Linux x86_64 server provisioned (see sizing in the IT guide)
- [ ] Docker Engine 24+ and Compose plugin installed (from internal mirror if air-gapped)
- [ ] `openssl` and `curl` available
- [ ] Internal DNS name chosen and pointed to the server IP
- [ ] Ports 80 and 443 free on the server

## B. Packaging (machine with internet, matching CPU architecture)
- [ ] Checked out the tested commit on the self-hosting branch
- [ ] Ran `scripts/build-and-save-images.sh`
- [ ] `images/backend.tar`, `images/web.tar`, `images/mongo.tar` produced
- [ ] Transferred the whole `deploy/` folder (incl. `images/`) to the server

## C. Configure
- [ ] Copied `.env.example` to `.env`
- [ ] Set `APP_HOSTNAME`
- [ ] Set `CORS_ORIGINS=https://<APP_HOSTNAME>`
- [ ] Left `REACT_APP_BACKEND_URL` empty (single-server, same-origin)
- [ ] Confirmed ports in `.env`

## D. Install
- [ ] Ran `./install.sh`
- [ ] Images loaded without error
- [ ] Certificate generated in `./certs` for the hostname
- [ ] `docker compose ps` shows `mongo`, `backend`, `web` all **healthy**

## E. Verify
- [ ] `curl -k https://<APP_HOSTNAME>/api/health` returns `{"status":"ok"}`
- [ ] Dashboard loads in a browser at `https://<APP_HOSTNAME>/`
- [ ] Database port is NOT reachable from another host (`nc -z <server> 27017` fails)
- [ ] Confirmed no external/internet calls in browser dev tools Network tab

## F. Certificate trust (optional but recommended)
- [ ] Imported `certs/server.crt` into the company trust store (GPO/MDM), or
      documented the one-time per-user trust prompt

## G. Data
- [ ] Imported current items (Excel) - see DATA_MIGRATION.md
- [ ] Imported transactions (Excel) - stock/history verified
- [ ] Ran `./scripts/backup-db.sh` once and stored the archive off-server

## H. Operations
- [ ] Scheduled the daily database backup (cron)
- [ ] Confirmed the stack restarts after a server reboot
- [ ] Recorded the deployed `APP_VERSION` and tested commit hash: ____________
- [ ] Kept current + previous image bundles on the server for rollback

## I. Acceptance
- [ ] Planning team confirmed the app behaves as it did on the hosted preview
- [ ] Sign-off: __________________________  Date: ____________
