# Offline Internet-Requirements Report

**Question:** does any application feature need an external/internet service at
runtime? **Conclusion:** No. After the cleanup below, the application runs fully
offline on an isolated intranet. This report lists every feature and its verdict.

## Cleanup performed for offline operation

| Item | Before | After |
|------|--------|-------|
| Usage analytics (PostHog) | Loaded a script and sent events to `ap.emergent.sh` | **Removed** from `frontend/public/index.html` |
| Emergent helper script | `assets.emergent.sh/scripts/emergent-main.js` | **Removed** |
| Web fonts | Fetched from Google Fonts CDN | **Bundled locally** via `@fontsource` (served from the app) |
| Backend LLM/cloud libs | `emergentintegrations`, `litellm` (Emergent-hosted wheel), `openai`, `boto3`, `requests`, ... in `requirements.txt` | **Excluded** from the deploy image (`deploy/backend-requirements.txt`); not imported by any feature |
| Backend `.env` | Contained the hosted MongoDB URL | **Not shipped** in the image; configuration injected by Compose |

## Feature-by-feature audit

| Feature | External service needed? | Notes |
|---------|--------------------------|-------|
| Dashboard | No | Data from local database only |
| Inventory (list/search/filter/CRUD) | No | Local database |
| Criticality column & filter | No | Local |
| Transactions (create/edit/delete, stock recalc) | No | Local |
| Consumption & recommended Min/Max | No | Computed in the backend (NumPy/Python) |
| Reorder proposals (critical-first) | No | Local aggregation |
| Monthly report + criticality trend | No | Local aggregation |
| Critical-materials dashboard | No | Local |
| Bulk type / bulk criticality | No | Local |
| Auto-classify criticality | No | Rules-based keyword matching in the backend; no AI/API |
| Excel import (items & transactions) | No | Parsed in memory with `openpyxl`; nothing stored on disk |
| Excel / report exports | No | Generated with `XlsxWriter` in memory |
| Offline desktop edition download | No | Self-contained ZIP; its Excel engine (SheetJS) is bundled |
| Fonts / UI assets | No | Bundled and served locally |
| Authentication | No | Open access by design; no identity provider |

## Residual notes

- The database image (`mongo`) and the application images are **shipped
  prebuilt** so the air-gapped server downloads nothing.
- Building the images (packaging step) does require internet **once**, on a
  separate machine - never on the air-gapped server.
- No telemetry, crash reporting, or remote logging remains.
