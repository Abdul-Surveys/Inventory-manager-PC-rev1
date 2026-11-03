# Data Migration - Loading Current Items & Transactions

The self-hosted system starts with an **empty** database. The live hosted
database is never copied into this package or into source control. Use ONE of
the two methods below to load your current data. Required database indexes are
created automatically the first time the backend starts.

---

## Method A (recommended): the app's own Excel import

No database access is needed. Uses features already in the product.

### 1. Export from the current (hosted) system
- **Items:** Inventory page -> **Export** -> save the Excel file.
- **Transactions:** Import / Export page -> export transactions (or keep your
  original transaction spreadsheet).

### 2. Import into the self-hosted system
- Open `https://<APP_HOSTNAME>/` -> **Import / Export**.
- Import the **items** spreadsheet first (creates the catalog).
- Then import the **transactions** spreadsheet (stock and history are rebuilt).
- Verify totals on the **Dashboard**.

Column names are matched flexibly (e.g. *Item Code, Description, UOM, Item Type,
Criticality, Minimum, Maximum, Current/Opening, Unit Rate* for items; *Date,
Item Code, Direction, Quantity, Transaction Type, Reference No* for
transactions).

> This is the most portable method and needs no server/database credentials.

---

## Method B: database archive (faithful full copy)

Use this if you want an exact copy including every field, and you have access to
run a dump against the source database.

### 1. Dump the source database (on a machine that can reach it)
```bash
mongodump --uri="<SOURCE_MONGO_URI>" --db <SOURCE_DB> --archive --gzip > current_data.archive.gz
```

### 2. Restore into the self-hosted stack (on the server)
```bash
cd deploy
cp /path/to/current_data.archive.gz backups/
./scripts/restore-db.sh backups/current_data.archive.gz
```
`restore-db.sh` drops and replaces the target database, then the app recreates
indexes on the next start. Confirm on the Dashboard.

> Keep `current_data.archive.gz` out of source control; it contains business data.

---

## After migrating

- Run a backup immediately: `./scripts/backup-db.sh`.
- Spot-check item counts, a few stock levels, and the monthly report.
