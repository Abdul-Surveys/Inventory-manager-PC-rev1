# plan.md

## 1. Objectives
- Deliver a FastAPI + React + MongoDB inventory system where **Transactions are the source of truth** and drive stock, status, value, consumption, recommendations, and dashboards.
- Support **15,000-item scale** with server-side pagination/search/filter + MongoDB aggregation.
- Enable **Excel/CSV bulk import** (seed Item Master; treat Current Qty as opening balance) and **Excel export** of key reports.
- Provide a **polished dashboard** in USD with: total value, item counts, breakdown by item type, Top 20 high value, low-stock alerts, and non-moving items.

## 2. Implementation Steps

### Phase 1: Core workflow build (no POC phase)
Core = “Import Items → Create Transactions → Current Stock & Status update correctly at scale”.

**User stories (Phase 1)**
1. As a planner, I can import a master list (15k items) so I don’t manually create items.
2. As a storekeeper, I can record an IN transaction and see item stock increase immediately.
3. As a storekeeper, I can record an OUT transaction and see item stock decrease immediately.
4. As a planner, I can search/filter inventory and page through results quickly.
5. As a planner, I can trust item status colors because they update automatically from min/max/current.

**Backend (FastAPI + MongoDB)**
- Data model (Mongo collections):
  - `items`: item_code (unique), description, uom, item_type (default Other), min_qty, max_qty, unit_price, current_qty, status, total_value, criticality (optional), created_at/updated_at.
  - `transactions`: date, item_code, direction (IN/OUT), qty, type (PO/WO/Return WO/Return Other/Opening Balance), reference_no, created_at.
  - `settings`: lead_time_months, coverage_months, safety_months (defaults 6/6/2).
- Stock update logic:
  - Transaction insert in a DB transaction (or atomic sequence): validate qty > 0; compute stock delta; `$inc` item.current_qty; recompute status/total_value.
  - Prevent negative stock (configurable strict mode; default prevent).
- Import:
  - Upload endpoint accepts .xlsx/.csv; parse in backend; bulk upsert items in batches.
  - Option: if Current Qty > 0, create `Opening Balance` IN transactions (recommended for accurate non-moving/first receipt logic).
- Inventory API:
  - Server-side pagination + search (item_code/description) + filters (status, item_type, below_min only, etc.) + sort (value/stock/code).
- Transactions API:
  - Create/list with filters by date range/item_code/type/direction.

**Frontend (React)**
- Pages:
  - Inventory (table w/ pagination, search, filters, status color chips).
  - Transactions (add form + list; item description auto-populated from item code).
  - Import (upload file, preview summary, confirm import).

**Checkpoint tests (end-to-end)**
- Import provided Excel → item count matches.
- Add IN/OUT transactions → current stock updates correctly, status recalculates correctly.
- Pagination/search stays responsive with 15k items.

---

### Phase 2: V1 App Development (analysis, recommendations, dashboard, exports)

**User stories (Phase 2)**
1. As a planner, I can view monthly consumption and trend per item to understand usage.
2. As a planner, I can see recommended min/max from settings and compare to current values.
3. As a planner, I can apply recommended min/max to an item with one action.
4. As a manager, I can see a dashboard with total value, category breakdown, and top 20 high value items.
5. As a planner, I can download Excel reports so I can share analysis offline.

**Consumption / Analysis**
- Aggregations per item:
  - Total OUT, total returns (IN + type=Return from Work Order), total consumption = OUT − returns.
  - Monthly buckets for the last N months (default 12/24) for charts.
  - First receipt date = first IN transaction (incl. Opening Balance).
  - Last transaction date = most recent transaction.
- UI: item detail drawer/page with trend chart + metrics.

**Min/Max Recommendations + Settings**
- Settings page: lead_time_months, coverage_months, safety_months (persist to Mongo).
- Calculation:
  - Avg Monthly Consumption = (consumption over period) / months with history (handle zero-history).
  - Safety Stock = Avg Monthly × safety_months
  - Recommended Min = Avg Monthly × lead_time_months + Safety Stock
  - Recommended Max = Recommended Min + Avg Monthly × coverage_months
- UI: show current vs recommended; “Apply” updates item min/max.

**Dashboard (polished)**
- Widgets:
  - Total inventory value (USD), total items.
  - Value by item type + % contribution (chart).
  - Top 20 high-value items (table).
  - Low-stock alerts panel: below min + at min (with quick filters).
  - Non-moving count + list shortcut.
- Use Mongo aggregation pipelines for all widgets.

**Exports**
- Excel export endpoints:
  - Inventory list (with filters)
  - Transactions list (with filters)
  - Non-moving items
  - Top 20 high value

**Checkpoint tests (end-to-end)**
- Validate consumption math on a few items with known transactions.
- Settings change updates recommendation outputs.
- Dashboard loads quickly and matches inventory totals.
- Export downloads correct Excel files.

---

### Phase 3: Hardening, performance, and reporting completeness

**User stories (Phase 3)**
1. As a user, I can open the app and dashboard loads fast even with large data.
2. As a user, I can filter non-moving items accurately (received at least once + no movement for 12 months).
3. As a user, I can edit item master data (type, unit price, min/max) safely.
4. As a user, I can correct wrong transactions (delete/reverse) without breaking stock integrity.
5. As a manager, I can trust totals because all dashboards reconcile to item values.

**Non-moving logic**
- Criteria:
  - Has ≥1 IN transaction.
  - No OUT (or no net consumption activity) in last 12 months.
  - Exclude items never received with current_qty=0.
- Provide list + export.

**Data integrity operations**
- Transaction reversal workflow (recommended over delete): create compensating transaction.
- Optional: admin-only delete (since no auth, keep disabled by default).

**Performance**
- Add indexes: items(item_code, item_type, status, total_value), transactions(item_code, date, type, direction).
- Use projection + lean payloads; avoid sending 15k rows.

**Final testing**
- Full regression across: import, transactions, inventory, analysis, recommendations, dashboard, exports.

## 3. Next Actions
1. Confirm import behavior: create `Opening Balance` IN transactions from Current Qty (recommended: **Yes**).
2. Confirm allowed negative stock: default **No** (block transactions that would make stock < 0).
3. Confirm item types list: default [Spare Parts, Consumables, Chemicals, Other]; allow custom types?
4. Start Phase 1 implementation (backend models/APIs + frontend inventory/transactions/import).

## 4. Success Criteria
- Import of 15,000 items completes reliably (with summary + error report if any).
- Creating IN/OUT transactions updates current stock and status correctly and immediately.
- Inventory table supports fast pagination/search/filter at scale.
- Dashboard reconciles to item totals, shows top 20, low-stock alerts, and type breakdown.
- Consumption analysis + recommendation outputs match defined formulas and respond to settings.
- Excel exports generated correctly for all main reports.

---
## STATUS (updated after Phase 1+2 completion)
- DONE Phase 1 & 2: full backend (items/transactions/import/analysis/recommendations/dashboard/non-moving/exports/settings), full frontend (7 pages), user's 15,000-item master imported (item types defaulted to "Other" since column was empty; editable per item).
- Testing: testing_agent iteration_1 = backend 32/32 pass, frontend ~95%; autocomplete issue FIXED and re-verified; DB reset to pristine imported state afterwards.
- Decisions: Opening Balance IN txns on import (dated import day), negative stock blocked, txn reversal via compensating Adjustment, numeric-aware item_code sorting.
- Phase 3 candidates (not yet done): bulk transaction import from Excel, item type bulk re-categorization, dark mode.

## STATUS Phase 3 (complete)
- DONE: Monthly Snapshot Report (/reports + /api/reports/monthly-snapshot + export), Reorder Proposals (/reorder + /api/reorder + export), Bulk Type Editing (inventory multi-select + select-all-matching + /api/items/bulk-type), Transaction Bulk Import (/api/import/transactions + template + apply-to-stock option, UI on Import/Export page), PetroChina logo in sidebar + embedded in all Excel report headers.
- Testing: iteration_2 = backend 49/50 (1 expected-behavior note), frontend 100%; bulk-apply UI verified manually on safe item 15999 (restored).
- User data preserved: user's own transactions on item 1001 and manual type edits untouched.
