/* PetroChina GPP Inventory - Offline Desktop Edition
   Self-contained, no server. Data persists in this browser (localStorage).
   Use the Data tab to import Excel/CSV and to back up / restore a data file. */
"use strict";

/* ---------------- Constants (mirror the online system) ---------------- */
const ITEM_TYPES = ["Spare Parts", "Consumables", "Chemicals", "Other"];
const TXN_TYPES = ["Purchase Order", "Work Order", "Return from Work Order", "Return Other", "Opening Balance", "Adjustment"];
const CRIT_LABELS = {
  1: "Operations & Maintenance Critical Spares",
  2: "Medium Critical Spares",
  3: "Normal / Non-Critical",
};
const Z_TABLE = { 1: 0.842, 2: 0.842, 3: 0.0 };
const STATUS_META = {
  BELOW_MIN: { label: "Below Minimum", cls: "s-below" },
  MINIMUM: { label: "Minimum", cls: "s-min" },
  OK: { label: "OK", cls: "s-ok" },
  ABOVE_MAX: { label: "Above Maximum", cls: "s-above" },
};
const STORE_KEY = "gpp_offline_inventory_v1";

/* ---------------- State ---------------- */
let state = {
  items: [],
  transactions: [],
  settings: { lead_time_months: 3, max_demand_months: 6 },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state.items = d.items || [];
      state.transactions = d.transactions || [];
      state.settings = Object.assign({ lead_time_months: 3, max_demand_months: 6 }, d.settings || {});
    }
  } catch (e) { console.warn("load failed", e); }
}
let saveWarned = false;
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    if (!saveWarned) {
      saveWarned = true;
      toast("Browser storage is full or blocked. Use Data → Backup to save a file.", "err");
    }
  }
}

/* ---------------- Helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function fmtUSD(n) { return "$" + (Math.round(num(n))).toLocaleString("en-US"); }
function fmtUSD2(n) { return "$" + num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtNum(n) { const x = num(n); return Number.isInteger(x) ? x.toLocaleString("en-US") : x.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function normCrit(v) { const n = parseInt(v, 10); return (n === 1 || n === 2 || n === 3) ? n : 3; }

function computeStatus(cur, min, max) {
  cur = num(cur); min = num(min); max = num(max);
  if (cur < min) return "BELOW_MIN";
  if (cur === min) return "MINIMUM";
  if (max && cur > max) return "ABOVE_MAX";
  return "OK";
}
function refreshItem(it) {
  it.criticality = normCrit(it.criticality);
  it.current_qty = round2(num(it.current_qty));
  it.total_value = round2(num(it.current_qty) * num(it.unit_price));
  it.status = computeStatus(it.current_qty, it.min_qty, it.max_qty);
  return it;
}

function monthList(startYm, endYm) {
  const out = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function shiftMonth(ym, delta) {
  let [y, m] = ym.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return y + "-" + String(m).padStart(2, "0");
}
function stdevS(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

/* Consumption statistics for an item (net of Work-Order returns) */
function itemStats(item) {
  const crit = normCrit(item.criticality);
  const z = Z_TABLE[crit];
  const lead = num(state.settings.lead_time_months) || 3;
  const maxMonths = num(state.settings.max_demand_months) || 6;
  const txns = state.transactions.filter(t => t.item_code === item.item_code);

  let firstIn = null;
  const net = {};
  for (const t of txns) {
    const m = String(t.date).slice(0, 7);
    if (t.direction === "IN") {
      if (!firstIn || t.date < firstIn) firstIn = t.date;
      if (t.txn_type === "Return from Work Order") net[m] = (net[m] || 0) - num(t.qty);
    } else if (t.direction === "OUT") {
      net[m] = (net[m] || 0) + num(t.qty);
    }
  }

  const base = { criticality: crit, criticality_label: CRIT_LABELS[crit], z_value: z, first_in_date: firstIn, lead_time_months: lead, max_demand_months: maxMonths };
  if (!firstIn) {
    return Object.assign(base, { months_history: 0, cumulative_consumption: 0, avg_monthly: 0, avg_yearly: 0, std_dev: 0, lead_time_demand: 0, safety_stock: 0, recommended_min: 0, recommended_max: 0, stock_status: "OK" });
  }
  const months = monthList(firstIn.slice(0, 7), todayStr().slice(0, 7));
  const series = months.map(m => net[m] || 0);
  const n = series.length;
  const cumulative = round2(series.reduce((a, b) => a + b, 0));
  const avg = n ? cumulative / n : 0;
  const avgDemand = Math.max(0, avg);
  const std = stdevS(series);
  const ltDemand = avgDemand * lead;
  const safety = z * std * Math.sqrt(lead);
  const recMin = (ltDemand + safety) > 0 ? Math.ceil(ltDemand + safety) : 0;
  const sixDemand = avgDemand * maxMonths;
  const recMax = (sixDemand + safety) > 0 ? Math.ceil(sixDemand + safety) : 0;
  return Object.assign(base, {
    months_history: n,
    cumulative_consumption: cumulative,
    avg_monthly: round2(avg),
    avg_yearly: round2(avg * 12),
    std_dev: round2(std),
    lead_time_demand: round2(ltDemand),
    safety_stock: round2(safety),
    recommended_min: recMin,
    recommended_max: recMax,
    stock_status: (recMin > 0 && num(item.current_qty) <= recMin) ? "REORDER" : "OK",
  });
}

/* ---------------- Toast ---------------- */
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = "toast " + (kind === "err" ? "err" : "ok");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---------------- Modal ---------------- */
function openModal(html) { $("#modal").innerHTML = html; $("#overlay").classList.add("show"); }
function closeModal() { $("#overlay").classList.remove("show"); $("#modal").innerHTML = ""; }
$("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });

/* ---------------- Router ---------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", ico: "▦" },
  { id: "inventory", label: "Inventory", ico: "▤" },
  { id: "transactions", label: "Transactions", ico: "⇄" },
  { id: "reorder", label: "Reorder", ico: "🛒" },
  { id: "settings", label: "Settings", ico: "⚙" },
  { id: "data", label: "Data / Import", ico: "⇪" },
];
let current = "dashboard";
function renderNav() {
  $("#nav").innerHTML = NAV.map(n =>
    `<button class="${n.id === current ? "active" : ""}" data-nav="${n.id}"><span class="ico">${n.ico}</span>${n.label}</button>`
  ).join("");
  $("#nav").querySelectorAll("button").forEach(b => b.onclick = () => go(b.dataset.nav));
}
function go(id) { current = id; renderNav(); $("#topActions").innerHTML = ""; PAGES[id](); }

/* ---------------- Pages ---------------- */
const PAGES = {};

PAGES.dashboard = function () {
  $("#pageTitle").textContent = "Dashboard";
  const items = state.items;
  const totalVal = items.reduce((a, b) => a + num(b.total_value), 0);
  const below = items.filter(i => i.status === "BELOW_MIN").length;
  const atMin = items.filter(i => i.status === "MINIMUM").length;
  const crit = { 1: 0, 2: 0, 3: 0 };
  const critVal = { 1: 0, 2: 0, 3: 0 };
  items.forEach(i => { const c = normCrit(i.criticality); crit[c]++; critVal[c] += num(i.total_value); });
  const top = [...items].sort((a, b) => num(b.total_value) - num(a.total_value)).slice(0, 10);

  $("#view").innerHTML = `
    ${items.length === 0 ? `<div class="banner">No data yet. Go to <b>Data / Import</b> to load your Excel/CSV item master, or add items in the Inventory tab.</div>` : ""}
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="lbl">Total Items</div><div class="val">${fmtNum(items.length)}</div><div class="sub">In master list</div></div>
      <div class="kpi"><div class="lbl">Inventory Value</div><div class="val">${fmtUSD(totalVal)}</div><div class="sub">Current stock × unit rate</div></div>
      <div class="kpi"><div class="lbl">Below Minimum</div><div class="val" style="color:var(--danger)">${fmtNum(below)}</div><div class="sub">Need attention</div></div>
      <div class="kpi"><div class="lbl">At Minimum</div><div class="val" style="color:var(--warn)">${fmtNum(atMin)}</div><div class="sub">Watch closely</div></div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
      ${[1, 2, 3].map(c => `
        <div class="kpi" style="cursor:pointer" data-critjump="${c}">
          <div class="row" style="gap:10px"><span class="crit c${c}">${c}</span>
            <div style="min-width:0"><div class="sub" style="margin:0">${CRIT_LABELS[c]}</div>
            <div class="val" style="font-size:22px">${fmtNum(crit[c])}</div></div></div>
          <div class="sub">${fmtUSD(critVal[c])}</div>
        </div>`).join("")}
    </div>
    <div class="card"><div class="hd">Top 10 by Value</div><div class="bd table-wrap">
      <table><thead><tr><th>Code</th><th>Description</th><th>Crit</th><th class="rt">Current</th><th class="rt">Value</th><th>Status</th></tr></thead>
      <tbody>${top.length ? top.map(i => `
        <tr class="tr-click" data-open="${esc(i.item_code)}"><td class="mono">${esc(i.item_code)}</td><td>${esc(i.description)}</td>
        <td><span class="crit c${normCrit(i.criticality)}">${normCrit(i.criticality)}</span></td>
        <td class="rt num">${fmtNum(i.current_qty)}</td><td class="rt num">${fmtUSD(i.total_value)}</td>
        <td><span class="pill ${STATUS_META[i.status].cls}">${STATUS_META[i.status].label}</span></td></tr>`).join("")
      : `<tr><td colspan="6" class="empty">No items yet.</td></tr>`}</tbody></table>
    </div></div>`;
  $("#view").querySelectorAll("[data-critjump]").forEach(el => el.onclick = () => { invFilters.crit = el.dataset.critjump; go("inventory"); });
  $("#view").querySelectorAll("[data-open]").forEach(el => el.onclick = () => itemDetail(el.dataset.open));
};

/* ---- Inventory ---- */
let invFilters = { q: "", type: "all", crit: "all", status: "all", page: 1 };
const PAGE_SIZE = 50;
PAGES.inventory = function () {
  $("#pageTitle").textContent = "Inventory";
  $("#topActions").innerHTML = `<button class="btn primary sm" id="addItemBtn">+ Add Item</button>`;
  $("#addItemBtn").onclick = () => itemForm(null);
  drawInventory();
};
function filteredItems() {
  const q = invFilters.q.toLowerCase();
  return state.items.filter(i => {
    if (q && !(String(i.item_code).toLowerCase().includes(q) || String(i.description).toLowerCase().includes(q))) return false;
    if (invFilters.type !== "all" && (i.item_type || "Other") !== invFilters.type) return false;
    if (invFilters.crit !== "all" && normCrit(i.criticality) !== Number(invFilters.crit)) return false;
    if (invFilters.status !== "all" && i.status !== invFilters.status) return false;
    return true;
  }).sort((a, b) => String(a.item_code).localeCompare(String(b.item_code), undefined, { numeric: true }));
}
function drawInventory() {
  const all = filteredItems();
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (invFilters.page > pages) invFilters.page = pages;
  const rows = all.slice((invFilters.page - 1) * PAGE_SIZE, invFilters.page * PAGE_SIZE);
  $("#view").innerHTML = `
    <div class="filters">
      <input type="text" id="fq" placeholder="Search code or description..." value="${esc(invFilters.q)}" />
      <select id="ftype"><option value="all">All Types</option>${ITEM_TYPES.map(t => `<option ${invFilters.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="fcrit"><option value="all">All Criticality</option>${[1, 2, 3].map(c => `<option value="${c}" ${invFilters.crit == c ? "selected" : ""}>${c} — ${CRIT_LABELS[c]}</option>`).join("")}</select>
      <select id="fstatus"><option value="all">All Statuses</option>${Object.keys(STATUS_META).map(s => `<option value="${s}" ${invFilters.status === s ? "selected" : ""}>${STATUS_META[s].label}</option>`).join("")}</select>
      <span class="spacer"></span><span class="muted">${fmtNum(all.length)} item(s)</span>
    </div>
    <div class="card"><div class="bd table-wrap">
      <table><thead><tr><th>Code</th><th>Description</th><th>UOM</th><th>Type</th><th>Crit</th><th class="rt">Min</th><th class="rt">Max</th><th class="rt">Current</th><th class="rt">Rate</th><th class="rt">Value</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(i => `
        <tr><td class="mono tr-click" data-open="${esc(i.item_code)}">${esc(i.item_code)}</td>
        <td>${esc(i.description)}</td><td>${esc(i.uom || "")}</td><td>${esc(i.item_type || "Other")}</td>
        <td><span class="crit c${normCrit(i.criticality)}">${normCrit(i.criticality)}</span></td>
        <td class="rt num">${fmtNum(i.min_qty)}</td><td class="rt num">${fmtNum(i.max_qty)}</td>
        <td class="rt num">${fmtNum(i.current_qty)}</td><td class="rt num">${fmtUSD2(i.unit_price)}</td>
        <td class="rt num">${fmtUSD(i.total_value)}</td>
        <td><span class="pill ${STATUS_META[i.status].cls}">${STATUS_META[i.status].label}</span></td>
        <td class="rt"><button class="btn ghost sm" data-edit="${esc(i.item_code)}">Edit</button></td></tr>`).join("")
      : `<tr><td colspan="12" class="empty">No items match your filters.</td></tr>`}</tbody></table>
      <div class="pager"><span class="muted">Page ${invFilters.page} / ${pages}</span>
        <button class="btn sm" id="prev" ${invFilters.page <= 1 ? "disabled" : ""}>Prev</button>
        <button class="btn sm" id="next" ${invFilters.page >= pages ? "disabled" : ""}>Next</button></div>
    </div></div>`;
  const applyF = () => { invFilters.q = $("#fq").value; invFilters.type = $("#ftype").value; invFilters.crit = $("#fcrit").value; invFilters.status = $("#fstatus").value; invFilters.page = 1; drawInventory(); };
  $("#fq").oninput = () => { invFilters.q = $("#fq").value; invFilters.page = 1; drawInventory(); $("#fq").focus(); };
  $("#ftype").onchange = applyF; $("#fcrit").onchange = applyF; $("#fstatus").onchange = applyF;
  $("#prev").onclick = () => { invFilters.page--; drawInventory(); };
  $("#next").onclick = () => { invFilters.page++; drawInventory(); };
  $("#view").querySelectorAll("[data-open]").forEach(el => el.onclick = () => itemDetail(el.dataset.open));
  $("#view").querySelectorAll("[data-edit]").forEach(el => el.onclick = () => itemForm(el.dataset.edit));
}

function itemForm(code) {
  const it = code ? state.items.find(x => x.item_code === code) : null;
  const v = it || { item_code: "", description: "", uom: "", item_type: "Spare Parts", criticality: 3, min_qty: 0, max_qty: 0, current_qty: 0, unit_price: 0 };
  openModal(`
    <div class="m-hd">${it ? "Edit Item" : "Add Item"}<button class="x" onclick="closeModal()">×</button></div>
    <div class="m-bd">
      <div class="two">
        <div class="field"><label>Item Code *</label><input id="i_code" value="${esc(v.item_code)}" ${it ? "disabled" : ""} /></div>
        <div class="field"><label>UOM</label><input id="i_uom" value="${esc(v.uom)}" /></div>
      </div>
      <div class="field"><label>Description *</label><input id="i_desc" value="${esc(v.description)}" /></div>
      <div class="two">
        <div class="field"><label>Item Type</label><select id="i_type">${ITEM_TYPES.map(t => `<option ${v.item_type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Criticality</label><select id="i_crit">${[1, 2, 3].map(c => `<option value="${c}" ${normCrit(v.criticality) === c ? "selected" : ""}>${c} — ${CRIT_LABELS[c]}</option>`).join("")}</select></div>
      </div>
      <div class="two">
        <div class="field"><label>Minimum Stock</label><input id="i_min" type="number" step="any" value="${num(v.min_qty)}" /></div>
        <div class="field"><label>Maximum Stock</label><input id="i_max" type="number" step="any" value="${num(v.max_qty)}" /></div>
      </div>
      <div class="two">
        <div class="field"><label>Current Stock</label><input id="i_cur" type="number" step="any" value="${num(v.current_qty)}" /></div>
        <div class="field"><label>Unit Rate (USD)</label><input id="i_price" type="number" step="any" value="${num(v.unit_price)}" /></div>
      </div>
    </div>
    <div class="m-ft"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="i_save">Save</button></div>`);
  $("#i_save").onclick = () => {
    const codeVal = it ? it.item_code : $("#i_code").value.trim();
    const desc = $("#i_desc").value.trim();
    if (!codeVal) return toast("Item code is required", "err");
    if (!desc) return toast("Description is required", "err");
    if (!it && state.items.some(x => x.item_code === codeVal)) return toast("Item code already exists", "err");
    const obj = it || { item_code: codeVal };
    obj.description = desc;
    obj.uom = $("#i_uom").value.trim();
    obj.item_type = $("#i_type").value;
    obj.criticality = normCrit($("#i_crit").value);
    obj.min_qty = num($("#i_min").value);
    obj.max_qty = num($("#i_max").value);
    obj.current_qty = num($("#i_cur").value);
    obj.unit_price = num($("#i_price").value);
    refreshItem(obj);
    if (!it) state.items.push(obj);
    saveState(); closeModal(); toast(it ? "Item updated" : "Item added"); drawInventory();
  };
}

function itemDetail(code) {
  const it = state.items.find(x => x.item_code === code);
  if (!it) return;
  const s = itemStats(it);
  const txns = state.transactions.filter(t => t.item_code === code).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  openModal(`
    <div class="m-hd"><div><div style="font-size:12px" class="muted mono">${esc(it.item_code)}</div>${esc(it.description)}</div><button class="x" onclick="closeModal()">×</button></div>
    <div class="m-bd">
      <div class="row" style="gap:8px;margin-bottom:12px">
        <span class="crit c${normCrit(it.criticality)}">${normCrit(it.criticality)}</span>
        <span class="muted">${CRIT_LABELS[normCrit(it.criticality)]}</span>
        <span class="spacer"></span><span class="pill ${STATUS_META[it.status].cls}">${STATUS_META[it.status].label}</span>
      </div>
      <div class="two">
        <div class="stat-line"><span>Current Stock</span><b>${fmtNum(it.current_qty)} ${esc(it.uom || "")}</b></div>
        <div class="stat-line"><span>Inventory Value</span><b>${fmtUSD(it.total_value)}</b></div>
        <div class="stat-line"><span>Master Min / Max</span><b>${fmtNum(it.min_qty)} / ${fmtNum(it.max_qty)}</b></div>
        <div class="stat-line"><span>Unit Rate</span><b>${fmtUSD2(it.unit_price)}</b></div>
      </div>
      <h3 class="sec" style="margin-top:16px">Consumption &amp; Recommended Min/Max</h3>
      <div class="two">
        <div class="stat-line"><span>Months History</span><b>${s.months_history}</b></div>
        <div class="stat-line"><span>Cumulative Consumption</span><b>${fmtNum(s.cumulative_consumption)}</b></div>
        <div class="stat-line"><span>Avg Monthly</span><b>${fmtNum(s.avg_monthly)}</b></div>
        <div class="stat-line"><span>Avg Yearly</span><b>${fmtNum(s.avg_yearly)}</b></div>
        <div class="stat-line"><span>Std Deviation</span><b>${fmtNum(s.std_dev)}</b></div>
        <div class="stat-line"><span>Safety Stock (Z=${s.z_value})</span><b>${fmtNum(s.safety_stock)}</b></div>
        <div class="stat-line"><span>Recommended Min (ROP)</span><b>${fmtNum(s.recommended_min)}</b></div>
        <div class="stat-line"><span>Recommended Max</span><b>${fmtNum(s.recommended_max)}</b></div>
      </div>
      <h3 class="sec" style="margin-top:16px">Transactions (${txns.length})</h3>
      <div class="table-wrap" style="max-height:220px;overflow-y:auto">
        <table><thead><tr><th>Date</th><th>Dir</th><th>Type</th><th class="rt">Qty</th></tr></thead>
        <tbody>${txns.length ? txns.map(t => `<tr><td>${esc(t.date)}</td><td>${t.direction}</td><td>${esc(t.txn_type)}</td><td class="rt num">${fmtNum(t.qty)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">No transactions.</td></tr>`}</tbody></table>
      </div>
    </div>
    <div class="m-ft"><button class="btn danger" id="d_del">Delete Item</button><span class="spacer"></span><button class="btn" onclick="closeModal()">Close</button><button class="btn primary" id="d_edit">Edit</button></div>`);
  $("#d_edit").onclick = () => { closeModal(); itemForm(code); };
  $("#d_del").onclick = () => {
    if (!confirm(`Delete item ${code} and its ${txns.length} transaction(s)?`)) return;
    state.items = state.items.filter(x => x.item_code !== code);
    state.transactions = state.transactions.filter(t => t.item_code !== code);
    saveState(); closeModal(); toast("Item deleted"); drawInventory();
  };
}

/* ---- Transactions ---- */
let txnPage = 1;
PAGES.transactions = function () {
  $("#pageTitle").textContent = "Transactions";
  $("#topActions").innerHTML = `<button class="btn primary sm" id="addTxnBtn">+ New Transaction</button>`;
  $("#addTxnBtn").onclick = () => txnForm(null);
  drawTxns();
};
function drawTxns() {
  const all = [...state.transactions].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b._c || 0) - (a._c || 0));
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (txnPage > pages) txnPage = pages;
  const rows = all.slice((txnPage - 1) * PAGE_SIZE, txnPage * PAGE_SIZE);
  const nameOf = (c) => { const it = state.items.find(x => x.item_code === c); return it ? it.description : ""; };
  $("#view").innerHTML = `
    <div class="card"><div class="bd table-wrap">
      <table><thead><tr><th>Date</th><th>Item</th><th>Description</th><th>Direction</th><th>Type</th><th class="rt">Qty</th><th>Ref</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(t => `
        <tr><td>${esc(t.date)}</td><td class="mono">${esc(t.item_code)}</td><td>${esc(nameOf(t.item_code))}</td>
        <td>${t.direction === "IN" ? '<span class="pill s-ok">IN</span>' : '<span class="pill s-below">OUT</span>'}</td>
        <td>${esc(t.txn_type)}</td><td class="rt num">${fmtNum(t.qty)}</td><td class="muted">${esc(t.reference || "")}</td>
        <td class="rt"><button class="btn ghost sm" data-etx="${t.id}">Edit</button><button class="btn ghost sm" data-dtx="${t.id}">✕</button></td></tr>`).join("")
      : `<tr><td colspan="8" class="empty">No transactions yet. Add one or import history from the Data tab.</td></tr>`}</tbody></table>
      <div class="pager"><span class="muted">${fmtNum(all.length)} txn(s) · Page ${txnPage}/${pages}</span>
      <button class="btn sm" id="tprev" ${txnPage <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn sm" id="tnext" ${txnPage >= pages ? "disabled" : ""}>Next</button></div>
    </div></div>`;
  $("#tprev").onclick = () => { txnPage--; drawTxns(); };
  $("#tnext").onclick = () => { txnPage++; drawTxns(); };
  $("#view").querySelectorAll("[data-etx]").forEach(el => el.onclick = () => txnForm(el.dataset.etx));
  $("#view").querySelectorAll("[data-dtx]").forEach(el => el.onclick = () => deleteTxn(el.dataset.dtx));
}
function applyTxnDelta(t, sign) {
  const it = state.items.find(x => x.item_code === t.item_code);
  if (!it) return;
  const delta = (t.direction === "IN" ? 1 : -1) * num(t.qty) * sign;
  it.current_qty = round2(num(it.current_qty) + delta);
  refreshItem(it);
}
function txnForm(id) {
  const t = id ? state.transactions.find(x => x.id === id) : null;
  const v = t || { item_code: "", date: todayStr(), direction: "OUT", txn_type: "Work Order", qty: 0, reference: "", note: "" };
  const codes = state.items.map(i => i.item_code);
  openModal(`
    <div class="m-hd">${t ? "Edit Transaction" : "New Transaction"}<button class="x" onclick="closeModal()">×</button></div>
    <div class="m-bd">
      <div class="field"><label>Item Code *</label>
        <input id="t_code" list="codeList" value="${esc(v.item_code)}" ${t ? "disabled" : ""} placeholder="Type or pick item code" />
        <datalist id="codeList">${codes.slice(0, 2000).map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      </div>
      <div class="two">
        <div class="field"><label>Date *</label><input id="t_date" type="date" value="${esc(v.date)}" /></div>
        <div class="field"><label>Direction *</label><select id="t_dir"><option ${v.direction === "IN" ? "selected" : ""}>IN</option><option ${v.direction === "OUT" ? "selected" : ""}>OUT</option></select></div>
      </div>
      <div class="two">
        <div class="field"><label>Type *</label><select id="t_type">${TXN_TYPES.map(x => `<option ${v.txn_type === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field"><label>Quantity *</label><input id="t_qty" type="number" step="any" value="${num(v.qty)}" /></div>
      </div>
      <div class="field"><label>Reference No</label><input id="t_ref" value="${esc(v.reference)}" /></div>
      <div class="banner" style="margin:0">Only <b>Return from Work Order</b> (IN) offsets consumption. OUT movements count as consumption.</div>
    </div>
    <div class="m-ft"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="t_save">Save</button></div>`);
  $("#t_save").onclick = () => {
    const code = t ? t.item_code : $("#t_code").value.trim();
    if (!code) return toast("Item code required", "err");
    if (!state.items.some(x => x.item_code === code)) return toast("No such item code in inventory", "err");
    const qty = num($("#t_qty").value);
    if (qty <= 0) return toast("Quantity must be greater than 0", "err");
    const data = { item_code: code, date: $("#t_date").value || todayStr(), direction: $("#t_dir").value, txn_type: $("#t_type").value, qty: qty, reference: $("#t_ref").value.trim() };
    if (t) {
      applyTxnDelta(t, -1);          // reverse old
      Object.assign(t, data);
      applyTxnDelta(t, +1);          // apply new
    } else {
      const nt = Object.assign({ id: uuid(), _c: Date.now() }, data);
      state.transactions.push(nt);
      applyTxnDelta(nt, +1);
    }
    saveState(); closeModal(); toast(t ? "Transaction updated" : "Transaction posted"); drawTxns();
  };
}
function deleteTxn(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  if (!confirm("Delete this transaction? Stock will be recalculated as if it never happened.")) return;
  applyTxnDelta(t, -1);
  state.transactions = state.transactions.filter(x => x.id !== id);
  saveState(); toast("Transaction deleted"); drawTxns();
}

/* ---- Reorder (critical-first) ---- */
PAGES.reorder = function () {
  $("#pageTitle").textContent = "Reorder Proposals";
  const rows = state.items.filter(i => i.status === "BELOW_MIN" || i.status === "MINIMUM").map(i => {
    const target = num(i.max_qty) > num(i.min_qty) ? num(i.max_qty) : num(i.min_qty);
    const sugg = Math.max(0, Math.ceil(target - num(i.current_qty)));
    return { ...i, target, sugg, est: round2(sugg * num(i.unit_price)) };
  }).filter(r => r.sugg > 0)
    .sort((a, b) => normCrit(a.criticality) - normCrit(b.criticality) || b.est - a.est);
  const totalCost = rows.reduce((a, b) => a + b.est, 0);
  const totalUnits = rows.reduce((a, b) => a + b.sugg, 0);
  $("#topActions").innerHTML = rows.length ? `<button class="btn sm" id="rexp">⬇ Export Excel</button>` : "";
  $("#view").innerHTML = `
    <div class="grid kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
      <div class="kpi"><div class="lbl">Items to Reorder</div><div class="val">${fmtNum(rows.length)}</div></div>
      <div class="kpi"><div class="lbl">Suggested Units</div><div class="val">${fmtNum(totalUnits)}</div></div>
      <div class="kpi"><div class="lbl">Estimated Cost</div><div class="val">${fmtUSD(totalCost)}</div></div>
    </div>
    <div class="card"><div class="bd table-wrap">
      <table><thead><tr><th>Crit</th><th>Code</th><th>Description</th><th>Status</th><th class="rt">Current</th><th class="rt">Min</th><th class="rt">Max</th><th class="rt">Order Qty</th><th class="rt">Est. Cost</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `
        <tr><td><span class="crit c${normCrit(r.criticality)}">${normCrit(r.criticality)}</span></td>
        <td class="mono">${esc(r.item_code)}</td><td>${esc(r.description)}</td>
        <td><span class="pill ${STATUS_META[r.status].cls}">${STATUS_META[r.status].label}</span></td>
        <td class="rt num">${fmtNum(r.current_qty)}</td><td class="rt num">${fmtNum(r.min_qty)}</td><td class="rt num">${fmtNum(r.max_qty)}</td>
        <td class="rt num"><b>${fmtNum(r.sugg)}</b></td><td class="rt num">${fmtUSD(r.est)}</td></tr>`).join("")
      : `<tr><td colspan="9" class="empty">Nothing to reorder — all items are above minimum.</td></tr>`}</tbody></table>
    </div></div>
    <p class="muted" style="font-size:12px;margin-top:10px">Sorted critical-first (Tier 1 → 2 → 3), then by estimated cost. Suggested Order Qty = target stock (Max, or Min when no Max) − current stock.</p>`;
  if (rows.length) $("#rexp").onclick = () => exportReorder(rows);
};

/* ---- Settings ---- */
PAGES.settings = function () {
  $("#pageTitle").textContent = "Settings";
  const s = state.settings;
  $("#view").innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr;max-width:820px">
      <div class="card"><div class="hd">Min / Max Parameters</div><div class="bd">
        <div class="field"><label>Lead Time (months)</label><input id="s_lead" type="number" step="any" value="${num(s.lead_time_months)}" /></div>
        <div class="field"><label>Max Demand Coverage (months)</label><input id="s_max" type="number" step="any" value="${num(s.max_demand_months)}" /></div>
        <button class="btn primary" id="s_save">Save Settings</button>
        <p class="muted" style="font-size:12px;margin-top:10px">Recommended Min (ROP) = Avg Monthly × Lead Time + Safety Stock.<br/>Recommended Max = Avg Monthly × Coverage + Safety Stock.<br/>Safety Stock = Z × StdDev × √LeadTime (Z: Tier 1&amp;2 = 0.842, Tier 3 = 0).</p>
      </div></div>
      <div class="card"><div class="hd">Criticality Legend</div><div class="bd">
        ${[1, 2, 3].map(c => `<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px dashed var(--border)"><span class="crit c${c}">${c}</span><span>${CRIT_LABELS[c]}</span></div>`).join("")}
        <p class="muted" style="font-size:12px;margin-top:10px">Set item criticality individually in the Inventory tab.</p>
      </div></div>
    </div>`;
  $("#s_save").onclick = () => {
    state.settings.lead_time_months = num($("#s_lead").value) || 3;
    state.settings.max_demand_months = num($("#s_max").value) || 6;
    state.items.forEach(refreshItem);
    saveState(); toast("Settings saved");
  };
};

/* ---- Data / Import ---- */
PAGES.data = function () {
  $("#pageTitle").textContent = "Data / Import";
  $("#view").innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr;max-width:920px">
      <div class="card"><div class="hd">Import Item Master (Excel / CSV)</div><div class="bd">
        <p class="muted" style="font-size:12.5px;margin-top:0">Columns recognised: <b>Item Code, Description, UOM, Item Type, Criticality, Minimum, Maximum, Current/Opening, Unit Rate</b>. Existing codes are updated; new ones are added.</p>
        <input type="file" id="impItems" accept=".xlsx,.xls,.csv" />
        <div class="row" style="margin-top:10px"><a class="dl" id="tplItems" href="#">↓ Download template</a></div>
      </div></div>
      <div class="card"><div class="hd">Import Transactions (Excel / CSV)</div><div class="bd">
        <p class="muted" style="font-size:12.5px;margin-top:0">Columns: <b>Date, Item Code, Direction (IN/OUT), Quantity, Transaction Type, Reference No</b>. Stock is adjusted automatically.</p>
        <input type="file" id="impTxns" accept=".xlsx,.xls,.csv" />
        <div class="row" style="margin-top:10px"><a class="dl" id="tplTxns" href="#">↓ Download template</a></div>
      </div></div>
      <div class="card"><div class="hd">Export</div><div class="bd">
        <div class="row"><button class="btn" id="expItems">⬇ Export Inventory (Excel)</button>
        <button class="btn" id="expTxns">⬇ Export Transactions (Excel)</button></div>
      </div></div>
      <div class="card"><div class="hd">Backup &amp; Restore (durable)</div><div class="bd">
        <p class="muted" style="font-size:12.5px;margin-top:0">Save a complete data file to your disk, or restore from one. Recommended before closing.</p>
        <div class="row"><button class="btn primary" id="backup">⬇ Backup to File (.json)</button>
        <label class="btn" style="cursor:pointer">↑ Restore from File<input type="file" id="restore" accept=".json" style="display:none" /></label></div>
        <div class="row" style="margin-top:14px"><button class="btn danger" id="clearAll">Clear ALL data</button></div>
      </div></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:16px">Data lives inside this browser profile. For safety, back up to a file regularly and store it with the app folder.</p>`;
  $("#impItems").onchange = (e) => readSheet(e.target.files[0], importItems);
  $("#impTxns").onchange = (e) => readSheet(e.target.files[0], importTxns);
  $("#expItems").onclick = exportItems;
  $("#expTxns").onclick = exportTxns;
  $("#backup").onclick = backup;
  $("#restore").onchange = (e) => restore(e.target.files[0]);
  $("#clearAll").onclick = () => { if (confirm("Erase all items and transactions from this browser?")) { state = { items: [], transactions: [], settings: state.settings }; saveState(); toast("All data cleared"); go("dashboard"); } };
  $("#tplItems").onclick = (e) => { e.preventDefault(); downloadTemplate("items"); };
  $("#tplTxns").onclick = (e) => { e.preventDefault(); downloadTemplate("txns"); };
};

/* ---- Excel/CSV IO ---- */
function readSheet(file, cb) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      cb(rows);
    } catch (err) { toast("Could not read file: " + err.message, "err"); }
  };
  reader.readAsArrayBuffer(file);
}
function pick(row, keys) {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const want of keys) if (norm === want) return row[k];
  }
  return undefined;
}
function importItems(rows) {
  if (!rows.length) return toast("No rows found", "err");
  let added = 0, updated = 0;
  for (const r of rows) {
    const code = String(pick(r, ["itemcode", "code", "material", "materialcode", "itemno"]) ?? "").trim();
    if (!code) continue;
    let it = state.items.find(x => x.item_code === code);
    const isNew = !it;
    if (isNew) { it = { item_code: code }; }
    const desc = pick(r, ["itemdescription", "description", "desc", "materialdescription", "name"]);
    it.description = String(desc ?? it.description ?? "").trim();
    it.uom = String(pick(r, ["uom", "unit", "unitofmeasure"]) ?? it.uom ?? "").trim();
    const type = String(pick(r, ["itemtype", "type", "category"]) ?? it.item_type ?? "Other").trim();
    it.item_type = ITEM_TYPES.includes(type) ? type : "Other";
    const crit = pick(r, ["criticality", "crit", "critical", "abc"]);
    it.criticality = crit !== undefined && crit !== "" ? normCrit(crit) : normCrit(it.criticality);
    it.min_qty = num(pick(r, ["minimumstock", "minimum", "min", "minqty", "minstock"]) ?? it.min_qty);
    it.max_qty = num(pick(r, ["maximumstock", "maximum", "max", "maxqty", "maxstock"]) ?? it.max_qty);
    const cur = pick(r, ["currentstock", "current", "openingbalance", "opening", "qty", "quantity", "stock", "onhand"]);
    if (cur !== undefined && cur !== "") it.current_qty = num(cur);
    else if (isNew) it.current_qty = 0;
    it.unit_price = num(pick(r, ["unitrate", "unitrateusd", "unitprice", "price", "rate", "cost"]) ?? it.unit_price);
    refreshItem(it);
    if (isNew) { state.items.push(it); added++; } else updated++;
  }
  saveState(); toast(`Imported: ${added} added, ${updated} updated`); go("inventory");
}
function importTxns(rows) {
  if (!rows.length) return toast("No rows found", "err");
  let ok = 0, skip = 0;
  for (const r of rows) {
    const code = String(pick(r, ["itemcode", "code", "material"]) ?? "").trim();
    if (!code || !state.items.some(x => x.item_code === code)) { skip++; continue; }
    let dir = String(pick(r, ["direction", "dir", "inout"]) ?? "").trim().toUpperCase();
    if (dir !== "IN" && dir !== "OUT") { skip++; continue; }
    const qty = num(pick(r, ["quantity", "qty", "amount"]));
    if (qty <= 0) { skip++; continue; }
    let type = String(pick(r, ["transactiontype", "txntype", "type"]) ?? "").trim();
    if (!TXN_TYPES.includes(type)) type = dir === "IN" ? "Purchase Order" : "Work Order";
    let date = pick(r, ["date", "txndate", "transactiondate"]);
    if (date instanceof Date) date = date.toISOString().slice(0, 10);
    else if (typeof date === "number") date = new Date(Math.round((date - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
    else date = String(date || todayStr()).slice(0, 10);
    const nt = { id: uuid(), _c: Date.now() + ok, item_code: code, date, direction: dir, txn_type: type, qty, reference: String(pick(r, ["referenceno", "reference", "ref", "refno"]) ?? "").trim() };
    state.transactions.push(nt);
    applyTxnDelta(nt, +1);
    ok++;
  }
  saveState(); toast(`Imported ${ok} transaction(s)${skip ? `, skipped ${skip}` : ""}`); go("transactions");
}
function sheetDownload(aoaSheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of aoaSheets) {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}
function exportItems() {
  if (!state.items.length) return toast("No items to export", "err");
  const data = filteredItems().length && (invFilters.q || invFilters.type !== "all" || invFilters.crit !== "all" || invFilters.status !== "all")
    ? filteredItems() : state.items;
  const rows = data.map(i => {
    const s = itemStats(i);
    return {
      "Item Code": i.item_code, "Item Description": i.description, "UOM": i.uom, "Item Type": i.item_type,
      "Criticality": normCrit(i.criticality), "Criticality Label": CRIT_LABELS[normCrit(i.criticality)],
      "Minimum Stock": num(i.min_qty), "Maximum Stock": num(i.max_qty), "Current Stock": num(i.current_qty),
      "Unit Rate (USD)": num(i.unit_price), "Total Value (USD)": num(i.total_value),
      "Status": STATUS_META[i.status].label, "Avg Yearly Consumption": s.avg_yearly,
    };
  });
  sheetDownload([["Inventory", rows]], "inventory_offline.xlsx");
  toast("Inventory exported");
}
function exportTxns() {
  if (!state.transactions.length) return toast("No transactions to export", "err");
  const rows = [...state.transactions].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(t => ({
    "Date": t.date, "Item Code": t.item_code, "Direction": t.direction, "Quantity": num(t.qty),
    "Transaction Type": t.txn_type, "Reference No": t.reference || "",
  }));
  sheetDownload([["Transactions", rows]], "transactions_offline.xlsx");
  toast("Transactions exported");
}
function exportReorder(rows) {
  const data = rows.map(r => ({
    "Item Code": r.item_code, "Item Description": r.description, "UOM": r.uom, "Item Type": r.item_type,
    "Criticality": normCrit(r.criticality), "Criticality Label": CRIT_LABELS[normCrit(r.criticality)],
    "Status": STATUS_META[r.status].label, "Current Stock": num(r.current_qty), "Minimum": num(r.min_qty),
    "Maximum": num(r.max_qty), "Suggested Order Qty": r.sugg, "Unit Rate (USD)": num(r.unit_price), "Estimated Cost (USD)": r.est,
  }));
  sheetDownload([["Reorder Proposal", data]], "reorder_proposal_offline.xlsx");
  toast("Reorder proposal exported");
}
function downloadTemplate(kind) {
  if (kind === "items") {
    sheetDownload([["Item Master", [{ "Item Code": "1001", "Item Description": "Sample Spare", "UOM": "EA", "Item Type": "Spare Parts", "Criticality": 1, "Minimum Stock": 5, "Maximum Stock": 20, "Current Stock": 8, "Unit Rate (USD)": 125.5 }]]], "item_master_template.xlsx");
  } else {
    sheetDownload([["Transactions", [{ "Date": todayStr(), "Item Code": "1001", "Direction": "OUT", "Quantity": 2, "Transaction Type": "Work Order", "Reference No": "WO-001" }]]], "transactions_template.xlsx");
  }
}
function backup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gpp_inventory_backup_" + todayStr() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
  toast("Backup file downloaded");
}
function restore(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.items) throw new Error("Invalid backup file");
      state.items = d.items || [];
      state.transactions = d.transactions || [];
      state.settings = Object.assign({ lead_time_months: 3, max_demand_months: 6 }, d.settings || {});
      state.items.forEach(refreshItem);
      saveState(); toast(`Restored ${state.items.length} items, ${state.transactions.length} transactions`); go("dashboard");
    } catch (err) { toast("Restore failed: " + err.message, "err"); }
  };
  reader.readAsText(file);
}

/* ---------------- Boot ---------------- */
window.closeModal = closeModal;
loadState();
state.items.forEach(refreshItem);
renderNav();
go("dashboard");
