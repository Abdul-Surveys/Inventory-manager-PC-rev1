# IT Installation Guide - PetroChina GPP Inventory (Self-Hosted)

Audience: company IT. Outcome: the inventory app running on one internal server,
reached at `https://<your-hostname>/` over the intranet, restarting automatically
after reboots, with a documented backup routine.

---

## 1. Supported platform & prerequisites

- **Operating system:** Linux x86_64 (Ubuntu 22.04 LTS / RHEL 8+ / equivalent).
  - *ARM note:* works on ARM64 too, but build the image bundle on an ARM host so
    the architecture matches the server.
- **Container runtime:** Docker Engine 24+ with the Compose plugin
  (`docker compose`), or `docker-compose` v2. Install these from your internal
  package mirror if the server is air-gapped.
- **Tools:** `openssl` and `curl` (standard on most Linux installs).
- **Privileges:** ability to run Docker (root or a user in the `docker` group).

## 2. Hardware sizing (assumption - adjust to your data)

Sized for a small planning team (tens of concurrent users) and a catalog up to
~200,000 items. Actual needs scale with data volume and usage.

| | CPU | RAM | Disk |
|--|-----|-----|------|
| Minimum | 2 cores | 4 GB | 20 GB |
| Recommended | 4 cores | 8 GB | 50 GB |

The database and its indexes are the main memory/disk consumers. Give the server
headroom if you import the full 200k-item master and years of transactions.

## 3. Network ports

| Port | Direction | Purpose |
|------|-----------|---------|
| 443 | inbound | Application over HTTPS (primary) |
| 80 | inbound | Redirects to 443 |
| (none) | - | The database port (27017) is **not** published outside the server |

Add a DNS A-record (or client `hosts` entries) pointing your chosen hostname to
the server's intranet IP, so staff can use `https://inventory.yourcompany.local/`.

## 4. Transfer the package (air-gapped)

On a machine **with** internet (same CPU architecture as the server):

```bash
cd deploy
cp .env.example .env         # set APP_VERSION / MONGO_IMAGE_TAG if changing defaults
./scripts/build-and-save-images.sh   # creates images/backend.tar, web.tar, mongo.tar
```

Copy the **entire `deploy/` folder (including `images/`)** to the server by your
approved method (USB, internal file share, etc.).

## 5. Configure

On the server:

```bash
cd deploy
cp .env.example .env
```

Edit `.env` and set at least:

- `APP_HOSTNAME` - the internal DNS name staff will use (the certificate is made
  for this exact name).
- `CORS_ORIGINS` - set to `https://<APP_HOSTNAME>`.
- Leave `REACT_APP_BACKEND_URL` **empty** (same-origin single-server setup).
- Change `HTTP_PORT`/`HTTPS_PORT` only if 80/443 are already in use.

Every setting is explained inside `.env.example`.

## 6. Install & start

```bash
./install.sh
```

The script will:
1. Detect Docker / Compose.
2. Load the prebuilt images from `./images`.
3. Generate a self-signed certificate for `APP_HOSTNAME` into `./certs`.
4. Create the persistent database volume and start all services with
   restart-on-failure and health checks.
5. Wait for the health check to pass.

## 7. Verify

- Open `https://<APP_HOSTNAME>/` in a browser. Accept the one-time certificate
  prompt (see section 9) and confirm the **dashboard loads**.
- API health: `curl -k https://<APP_HOSTNAME>/api/health` -> `{"status":"ok"}`.
- Service status: `docker compose ps` (all `healthy`).

## 8. Import your data (optional, later)

The system starts empty. Follow **docs/DATA_MIGRATION.md** to load the current
items and transactions - either via the app's own Excel import screens
(recommended, no database access needed) or via a database archive restore.

## 9. Certificate trust (remove browser warnings)

The install creates a self-signed certificate, so browsers show a one-time trust
warning. To remove it for everyone, have IT import `deploy/certs/server.crt` into
the company trust store (Group Policy / MDM / manual per machine). This is an IT
step; it is not automated.

## 10. Backups

Only the database needs backup (the app stores no uploaded files on disk).

```bash
./scripts/backup-db.sh                 # writes backups/<db>_<timestamp>.archive.gz
```

Schedule it (example: daily at 01:00 via cron):

```cron
0 1 * * *  cd /opt/gpp-inventory/deploy && ./scripts/backup-db.sh >> /var/log/gpp-backup.log 2>&1
```

Copy the resulting archives off-server. Restore with:

```bash
./scripts/restore-db.sh backups/<file>.archive.gz
```

## 11. Upgrade & rollback

See **docs/UPGRADE_ROLLBACK.md**.

## 12. Day-to-day operations

```bash
docker compose ps          # status
docker compose logs -f     # live logs
docker compose restart     # restart all
docker compose down        # stop (data is kept in the volume)
docker compose up -d        # start again
```

After a server reboot the stack starts automatically (`restart: unless-stopped`).
