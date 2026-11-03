# Upgrade & Rollback

The deployment uses versioned image tags (`APP_VERSION` in `.env`) so you can
move forward and back deterministically. **Always back up the database first.**

## Before any change
```bash
cd deploy
./scripts/backup-db.sh
```

## Upgrade to a new release

1. On the packaging machine (with internet), check out the new tested commit and
   build the bundle:
   ```bash
   # set APP_VERSION=<new> in .env first
   ./scripts/build-and-save-images.sh
   ```
2. Transfer the new `images/*.tar` to the server's `deploy/images/`.
3. On the server:
   ```bash
   # set APP_VERSION=<new> in .env
   ./scripts/load-images.sh
   docker compose up -d        # recreates web & backend with the new images
   ```
   The database container and its volume are untouched; the app recreates any
   new indexes automatically.
4. Verify: `curl -k https://<APP_HOSTNAME>/api/health` and open the dashboard.

## Roll back to the previous release

1. Set `APP_VERSION` back to the previous value in `.env` (the old image tars
   should still be present, or reload them).
2. ```bash
   docker compose up -d
   ```
3. If a release changed data in an incompatible way, restore the pre-upgrade
   backup:
   ```bash
   ./scripts/restore-db.sh backups/<pre-upgrade-file>.archive.gz
   ```

## Notes
- Keep at least the current and previous image bundles on the server for fast
  rollback.
- The `mongo_data` Docker volume persists across upgrades, rollbacks, reboots,
  and `docker compose down`. It is removed only by an explicit
  `docker compose down -v` (do not run that unless you intend to erase data).
