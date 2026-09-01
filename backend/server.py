from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ASCENDING, DESCENDING
import os
import io
import math
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import statistics
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="GPP Inventory Management System")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("gpp-inventory")

# ---------------------------- Constants ----------------------------
ITEM_TYPES = ["Spare Parts", "Consumables", "Chemicals", "Other"]
TXN_TYPES = ["Purchase Order", "Work Order", "Return from Work Order", "Return Other", "Opening Balance", "Adjustment"]
STATUS_BELOW_MIN = "BELOW_MIN"
STATUS_MINIMUM = "MINIMUM"
STATUS_OK = "OK"
STATUS_ABOVE_MAX = "ABOVE_MAX"
DEFAULT_SETTINGS = {"lead_time_months": 3, "max_demand_months": 6, "non_moving_months": 12}

# Criticality -> (Service Level %, Z-value of standard normal quantile)
Z_TABLE = {1: (80, 0.842), 2: (80, 0.842), 3: (50, 0.0)}
CRITICALITY_LABELS = {1: "Operations & Maintenance Critical Spares", 2: "Medium Critical Spares", 3: "Normal / Non-Critical"}


# ---------------------------- Helpers ----------------------------

def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def compute_status(current_qty: float, min_qty: float, max_qty: float) -> str:
    if current_qty < min_qty:
        return STATUS_BELOW_MIN
    if current_qty == min_qty:
        return STATUS_MINIMUM
    if max_qty and current_qty > max_qty:
        return STATUS_ABOVE_MAX
    return STATUS_OK


def clean_item(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def norm_header(h: str) -> str:
    return "".join(ch for ch in str(h).lower().strip() if ch.isalnum())


HEADER_MAP = {
    "itemcode": "item_code", "code": "item_code", "materialcode": "item_code", "matcode": "item_code",
    "itemdescription": "description", "description": "description", "materialdescription": "description", "itemname": "description",
    "uom": "uom", "unitofmeasurement": "uom", "unit": "uom",
    "unitprice": "unit_price", "unitrate": "unit_price", "rate": "unit_price", "price": "unit_price",
    "minqty": "min_qty", "minimumstock": "min_qty", "minstock": "min_qty", "minimum": "min_qty", "min": "min_qty",
    "maxqty": "max_qty", "maximumstock": "max_qty", "maxstock": "max_qty", "maximum": "max_qty", "max": "max_qty",
    "currentqty": "current_qty", "currentstock": "current_qty", "qty": "current_qty", "stock": "current_qty", "quantity": "current_qty",
    "itemtype": "item_type", "type": "item_type", "category": "item_type",
    "criticality": "criticality",
}


def to_float(v, default=0.0):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return default
        return float(v)
    except (ValueError, TypeError):
        return default


def to_code(v):
    if v is None:
        return None
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v.is_integer():
            return str(int(v))
    s = str(v).strip()
    return s if s else None


async def get_settings_doc():
    doc = await db.settings.find_one({"key": "global"})
    if not doc:
        doc = {"key": "global", **DEFAULT_SETTINGS, "updated_at": now_iso()}
        await db.settings.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def normalize_criticality(v) -> int:
    """Normalize any stored criticality value to 1/2/3 (default 3 = Normal)."""
    try:
        n = int(float(str(v).strip()))
        return n if n in (1, 2, 3) else 3
    except (ValueError, TypeError):
        return 3


# Rules-based criticality classification from item description.
# Order matters: a Tier-1 (safety/critical) keyword wins over Tier-2 (production/operational).
CRIT1_KEYWORDS = [
    "safety valve", "relief valve", "psv", "prv", "esd", "sdv", "shutdown valve", "blowdown",
    "blow down", "fire", "flame detector", "gas detector", "smoke detector", "h2s", "wellhead",
    "christmas tree", "actuator", "governor", "protection relay", "emergency", "turbine",
    "critical", "annunciator", "fusible", "deluge", "pressure safety", "rupture disc",
    "flare", "ignition", "explosion", "lifesaving", "life saving", "escape", "detector",
]
CRIT2_KEYWORDS = [
    "pump", "motor", "valve", "transmitter", "sensor", "gauge", "filter", "gasket",
    "controller", "plc", "breaker", "transformer", "heat exchanger", "bearing", "impeller",
    "coupling", "instrument", "solenoid", "regulator", "compressor", "seal", "switch",
    "relay", "cooler", "fan", "blower", "generator", "alternator", "rotor", "stator",
    "cartridge", "element", "diaphragm", "packing", "shaft", "gear", "manifold",
]


def classify_criticality(description: str) -> int:
    """Suggest a criticality tier (1/2/3) from a free-text item description."""
    d = (description or "").lower()
    for kw in CRIT1_KEYWORDS:
        if kw in d:
            return 1
    for kw in CRIT2_KEYWORDS:
        if kw in d:
            return 2
    return 3


def month_list(start_ym: str, end_ym: str) -> List[str]:
    """Inclusive list of YYYY-MM months between two month keys."""
    try:
        y1, m1 = int(start_ym[:4]), int(start_ym[5:7])
        y2, m2 = int(end_ym[:4]), int(end_ym[5:7])
    except (ValueError, TypeError):
        return []
    start_idx = y1 * 12 + m1 - 1
    end_idx = max(y2 * 12 + m2 - 1, start_idx)
    return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(start_idx, end_idx + 1)]


def compute_item_stats(first_in: Optional[str], monthly_net: dict, criticality, settings: dict, current_qty: float):
    """Spec-compliant consumption statistics and Recommended Min/Max.

    - Consumption = OUT transactions minus Return from Work Order (net consumption)
    - Window = First IN Date -> Report Review Date (today), calendar months, zero months included
    - Std Dev = sample standard deviation (STDEV.S) of the monthly net series
    - Safety Stock = Z x StdDev x sqrt(lead time months); Z derived from criticality
    - Rec Min (ROP) = Lead-Time Demand + Safety Stock; Rec Max = (avg x max_demand_months) + Safety Stock
    """
    review_date = today_str()
    now_ym = review_date[:7]
    crit = normalize_criticality(criticality)
    service_level, z_value = Z_TABLE[crit]
    lead = float(settings.get("lead_time_months", 3))
    max_months = float(settings.get("max_demand_months", 6))

    base = {
        "criticality": crit,
        "criticality_label": CRITICALITY_LABELS[crit],
        "service_level": service_level,
        "z_value": z_value,
        "report_review_date": review_date,
        "first_in_date": first_in,
        "lead_time_months": lead,
        "max_demand_months": max_months,
    }

    if not first_in:
        return {**base, "months_history": 0, "cumulative_consumption": 0,
                "avg_monthly_consumption": 0, "avg_yearly_consumption": 0,
                "consumption_std_dev": 0, "lead_time_demand": 0, "safety_stock": 0,
                "recommended_min": 0, "six_month_demand": 0, "recommended_max": 0,
                "stock_status": "OK", "confidence": "LOW",
                "confidence_reasons": ["Never received (no IN transactions)"]}

    months = month_list(first_in[:7], now_ym)
    series = [float(monthly_net.get(m, 0) or 0) for m in months]
    n = len(series)
    cumulative = round(sum(series), 4)
    avg_monthly = cumulative / n if n else 0.0
    avg_for_demand = max(0.0, avg_monthly)  # guard against negative net in edge cases
    std_dev = statistics.stdev(series) if n >= 2 else 0.0
    lt_demand = avg_for_demand * lead
    safety_stock = z_value * std_dev * math.sqrt(lead)
    rec_min = math.ceil(lt_demand + safety_stock) if (lt_demand + safety_stock) > 0 else 0
    six_month_demand = avg_for_demand * max_months
    rec_max = math.ceil(six_month_demand + safety_stock) if (six_month_demand + safety_stock) > 0 else 0

    reasons = []
    if n < 6:
        reasons.append(f"Only {n} month{'s' if n != 1 else ''} of history")
    if cumulative <= 0:
        reasons.append("No consumption recorded")
    else:
        zero_ratio = series.count(0.0) / n if n else 1
        if zero_ratio > 0.66:
            reasons.append(f"Intermittent demand ({round(zero_ratio * 100)}% zero months)")
    stock_status = "REORDER" if (rec_min > 0 and current_qty <= rec_min) else "OK"

    return {**base, "months_history": n, "cumulative_consumption": cumulative,
            "avg_monthly_consumption": round(avg_monthly, 2),
            "avg_yearly_consumption": round(avg_monthly * 12, 2),
            "consumption_std_dev": round(std_dev, 2),
            "lead_time_demand": round(lt_demand, 2),
            "safety_stock": round(safety_stock, 2),
            "recommended_min": rec_min,
            "six_month_demand": round(six_month_demand, 2),
            "recommended_max": rec_max,
            "stock_status": stock_status,
            "confidence": "LOW" if reasons else "NORMAL",
            "confidence_reasons": reasons}


CONSUMPTION_GROUP = {
    "_id": "$item_code",
    "total_in": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", 0]}},
    "total_out": {"$sum": {"$cond": [{"$eq": ["$direction", "OUT"]}, "$qty", 0]}},
    "wo_returns": {"$sum": {"$cond": [{"$and": [{"$eq": ["$direction", "IN"]}, {"$eq": ["$txn_type", "Return from Work Order"]}]}, "$qty", 0]}},
    "first_receipt": {"$min": {"$cond": [{"$eq": ["$direction", "IN"]}, "$date", None]}},
    "first_out": {"$min": {"$cond": [{"$eq": ["$direction", "OUT"]}, "$date", None]}},
    "last_txn": {"$max": "$date"},
    "last_out": {"$max": {"$cond": [{"$eq": ["$direction", "OUT"]}, "$date", None]}},
    "txn_count": {"$sum": 1},
    "has_in": {"$max": {"$cond": [{"$eq": ["$direction", "IN"]}, 1, 0]}},
}


# ---------------------------- Models ----------------------------

class ItemCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_code: str
    description: str
    uom: str = "PCS"
    item_type: str = "Other"
    min_qty: float = 0
    max_qty: float = 0
    current_qty: float = 0
    unit_price: float = 0
    criticality: Optional[int] = 3


class ItemUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    description: Optional[str] = None
    uom: Optional[str] = None
    item_type: Optional[str] = None
    min_qty: Optional[float] = None
    max_qty: Optional[float] = None
    unit_price: Optional[float] = None
    criticality: Optional[int] = None


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str  # YYYY-MM-DD
    item_code: str
    direction: str  # IN / OUT
    qty: float
    txn_type: str
    reference_no: Optional[str] = ""
    notes: Optional[str] = ""


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    lead_time_months: float = Field(gt=0, le=24, default=3)
    max_demand_months: float = Field(gt=0, le=36, default=6)
    non_moving_months: float = Field(gt=0, le=60, default=12)


class ApplyRecommendation(BaseModel):
    min_qty: float
    max_qty: float


# ---------------------------- Meta / Settings ----------------------------

@api_router.get("/")
async def root():
    return {"message": "GPP Inventory Management API", "status": "running"}


@api_router.get("/meta")
async def get_meta():
    return {"item_types": ITEM_TYPES, "txn_types": TXN_TYPES,
            "statuses": [STATUS_BELOW_MIN, STATUS_MINIMUM, STATUS_OK, STATUS_ABOVE_MAX]}


@api_router.get("/settings")
async def get_settings():
    return await get_settings_doc()


@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate):
    update = payload.model_dump()
    update["updated_at"] = now_iso()
    await db.settings.update_one({"key": "global"}, {"$set": update}, upsert=True)
    return await get_settings_doc()


# ---------------------------- Items ----------------------------

@api_router.get("/items")
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    item_type: Optional[str] = None,
    criticality: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: str = "item_code",
    sort_dir: str = "asc",
):
    q = {}
    if search:
        q["$or"] = [
            {"item_code": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    if item_type and item_type != "all":
        q["item_type"] = item_type
    if criticality and criticality != "all":
        try:
            q["criticality"] = int(criticality)
        except (ValueError, TypeError):
            pass
    if status and status != "all":
        q["status"] = status
    allowed_sort = {"item_code", "description", "current_qty", "min_qty", "max_qty", "unit_price", "total_value", "status", "item_type"}
    if sort_by not in allowed_sort:
        sort_by = "item_code"
    direction = ASCENDING if sort_dir == "asc" else DESCENDING
    total = await db.items.count_documents(q)
    cursor = db.items.find(q, {"_id": 0}).collation({"locale": "en_US", "numericOrdering": True}).sort(sort_by, direction).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size))}


@api_router.get("/items/search")
async def search_items(q: str = Query("", min_length=0), limit: int = 10):
    query = {}
    if q:
        query["$or"] = [
            {"item_code": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.items.find(query, {"_id": 0, "item_code": 1, "description": 1, "uom": 1, "current_qty": 1, "unit_price": 1}).limit(limit)
    return await cursor.to_list(limit)


@api_router.post("/items")
async def create_item(payload: ItemCreate):
    code = payload.item_code.strip()
    existing = await db.items.find_one({"item_code": code})
    if existing:
        raise HTTPException(status_code=400, detail=f"Item code '{code}' already exists")
    doc = payload.model_dump()
    doc["item_code"] = code
    doc["item_type"] = doc.get("item_type") or "Other"
    doc["criticality"] = normalize_criticality(doc.get("criticality"))
    doc["id"] = str(uuid.uuid4())
    doc["total_value"] = round(doc["current_qty"] * doc["unit_price"], 2)
    doc["status"] = compute_status(doc["current_qty"], doc["min_qty"], doc["max_qty"])
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.items.insert_one(dict(doc))
    if payload.current_qty > 0:
        txn = {
            "id": str(uuid.uuid4()), "date": today_str(), "item_code": code,
            "item_description": doc["description"], "direction": "IN", "qty": payload.current_qty,
            "txn_type": "Opening Balance", "reference_no": "INITIAL", "notes": "Item created with opening stock",
            "created_at": now_iso(),
        }
        await db.transactions.insert_one(txn)
    doc.pop("_id", None)
    return doc


@api_router.get("/items/{item_code}")
async def get_item(item_code: str):
    doc = await db.items.find_one({"item_code": item_code}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return doc


@api_router.put("/items/{item_code}")
async def update_item(item_code: str, payload: ItemUpdate):
    doc = await db.items.find_one({"item_code": item_code})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "criticality" in update:
        update["criticality"] = normalize_criticality(update["criticality"])
    merged = {**doc, **update}
    update["total_value"] = round(merged["current_qty"] * merged["unit_price"], 2)
    update["status"] = compute_status(merged["current_qty"], merged["min_qty"], merged["max_qty"])
    update["updated_at"] = now_iso()
    await db.items.update_one({"item_code": item_code}, {"$set": update})
    return clean_item(await db.items.find_one({"item_code": item_code}, {"_id": 0}))


@api_router.post("/items/{item_code}/apply-recommendation")
async def apply_recommendation(item_code: str, payload: ApplyRecommendation):
    doc = await db.items.find_one({"item_code": item_code})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    status = compute_status(doc["current_qty"], payload.min_qty, payload.max_qty)
    await db.items.update_one({"item_code": item_code}, {"$set": {
        "min_qty": payload.min_qty, "max_qty": payload.max_qty, "status": status, "updated_at": now_iso()}})
    return clean_item(await db.items.find_one({"item_code": item_code}, {"_id": 0}))


# ---------------------------- Item Analysis ----------------------------

@api_router.get("/items/{item_code}/analysis")
async def item_analysis(item_code: str):
    item = await db.items.find_one({"item_code": item_code}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    settings = await get_settings_doc()

    txns = await db.transactions.find(
        {"item_code": item_code}, {"_id": 0, "date": 1, "direction": 1, "qty": 1, "txn_type": 1}
    ).to_list(100000)

    monthly_in, monthly_out, monthly_woret = {}, {}, {}
    total_in = total_out = wo_returns = 0.0
    first_in = None
    last_txn = None
    for t in txns:
        ym = t["date"][:7]
        q = t["qty"] or 0
        if t["direction"] == "IN":
            monthly_in[ym] = monthly_in.get(ym, 0) + q
            total_in += q
            if first_in is None or t["date"] < first_in:
                first_in = t["date"]
            if t.get("txn_type") == "Return from Work Order":
                wo_returns += q
                monthly_woret[ym] = monthly_woret.get(ym, 0) + q
        else:
            monthly_out[ym] = monthly_out.get(ym, 0) + q
            total_out += q
        if last_txn is None or t["date"] > last_txn:
            last_txn = t["date"]

    monthly_net = {}
    for ym in set(list(monthly_out.keys()) + list(monthly_woret.keys())):
        monthly_net[ym] = monthly_out.get(ym, 0) - monthly_woret.get(ym, 0)

    stats = compute_item_stats(first_in, monthly_net, item.get("criticality"), settings, item.get("current_qty", 0))

    # Zero-filled monthly series for the chart (cap display at last 36 months)
    monthly = []
    if first_in:
        months = month_list(first_in[:7], today_str()[:7])[-36:]
        # cumulative must start from the true beginning, not the display window
        full_months = month_list(first_in[:7], today_str()[:7])
        cum_map = {}
        run = 0.0
        for m in full_months:
            run += monthly_net.get(m, 0)
            cum_map[m] = run
        for m in months:
            cons = monthly_net.get(m, 0)
            monthly.append({"month": m, "in_qty": round(monthly_in.get(m, 0), 2), "out_qty": round(monthly_out.get(m, 0), 2),
                            "consumption": round(cons, 2), "cumulative_consumption": round(cum_map[m], 2)})

    recent = await db.transactions.find({"item_code": item_code}, {"_id": 0}).sort("date", DESCENDING).limit(20).to_list(20)

    return {
        "item": item,
        "total_in": round(total_in, 2),
        "total_out": round(total_out, 2),
        "wo_returns": round(wo_returns, 2),
        "total_consumption": stats["cumulative_consumption"],
        "avg_monthly_consumption": stats["avg_monthly_consumption"],
        "first_receipt_date": first_in,
        "last_transaction_date": last_txn,
        "monthly": monthly,
        "stats": stats,
        "recommendation": {
            **stats,
            "current_min": item.get("min_qty", 0),
            "current_max": item.get("max_qty", 0),
        },
        "settings": settings,
        "recent_transactions": recent,
    }


# ---------------------------- Transactions ----------------------------

@api_router.post("/transactions")
async def create_transaction(payload: TransactionCreate):
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    if payload.direction not in ("IN", "OUT"):
        raise HTTPException(status_code=400, detail="Direction must be IN or OUT")
    if payload.txn_type not in TXN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid transaction type. Allowed: {TXN_TYPES}")
    try:
        datetime.strptime(payload.date[:10], "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be in YYYY-MM-DD format")

    item = await db.items.find_one({"item_code": payload.item_code.strip()})
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{payload.item_code}' not found in item master")

    delta = payload.qty if payload.direction == "IN" else -payload.qty
    new_qty = item["current_qty"] + delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail=f"Insufficient stock: current stock is {item['current_qty']}, cannot issue {payload.qty}")

    txn = {
        "id": str(uuid.uuid4()),
        "date": payload.date[:10],
        "item_code": item["item_code"],
        "item_description": item["description"],
        "direction": payload.direction,
        "qty": payload.qty,
        "txn_type": payload.txn_type,
        "reference_no": payload.reference_no or "",
        "notes": payload.notes or "",
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(dict(txn))

    status = compute_status(new_qty, item["min_qty"], item["max_qty"])
    total_value = round(new_qty * item.get("unit_price", 0), 2)
    await db.items.update_one({"item_code": item["item_code"]}, {"$set": {
        "current_qty": new_qty, "status": status, "total_value": total_value, "updated_at": now_iso()}})

    txn.pop("_id", None)
    return {"transaction": txn, "new_stock": new_qty, "new_status": status}


@api_router.get("/transactions")
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    item_code: Optional[str] = None,
    direction: Optional[str] = None,
    txn_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
):
    q = {}
    if item_code:
        q["item_code"] = item_code
    if search:
        q["$or"] = [
            {"item_code": {"$regex": search, "$options": "i"}},
            {"item_description": {"$regex": search, "$options": "i"}},
            {"reference_no": {"$regex": search, "$options": "i"}},
        ]
    if direction and direction != "all":
        q["direction"] = direction
    if txn_type and txn_type != "all":
        q["txn_type"] = txn_type
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        q["date"] = date_q
    total = await db.transactions.count_documents(q)
    cursor = db.transactions.find(q, {"_id": 0}).sort([("date", DESCENDING), ("created_at", DESCENDING)]).skip((page - 1) * page_size).limit(page_size)
    txns = await cursor.to_list(page_size)
    return {"transactions": txns, "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size))}


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: Optional[str] = None
    direction: Optional[str] = None
    qty: Optional[float] = None
    txn_type: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


def txn_delta(direction: str, qty: float) -> float:
    return qty if direction == "IN" else -qty


@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionUpdate):
    txn = await db.transactions.find_one({"id": txn_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    item = await db.items.find_one({"item_code": txn["item_code"]})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    merged = {**txn, **changes}
    if merged["qty"] <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    if merged["direction"] not in ("IN", "OUT"):
        raise HTTPException(status_code=400, detail="Direction must be IN or OUT")
    if merged["txn_type"] not in TXN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid transaction type. Allowed: {TXN_TYPES}")
    try:
        datetime.strptime(merged["date"][:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Date must be in YYYY-MM-DD format")

    old_delta = txn_delta(txn["direction"], txn["qty"])
    new_delta = txn_delta(merged["direction"], merged["qty"])
    new_stock = item["current_qty"] - old_delta + new_delta
    if new_stock < 0:
        raise HTTPException(status_code=400, detail=f"Cannot modify: stock would become negative ({new_stock})")

    update = {
        "date": merged["date"][:10], "direction": merged["direction"], "qty": merged["qty"],
        "txn_type": merged["txn_type"], "reference_no": merged.get("reference_no", "") or "",
        "notes": merged.get("notes", "") or "", "updated_at": now_iso(),
    }
    await db.transactions.update_one({"id": txn_id}, {"$set": update})
    await db.items.update_one({"item_code": item["item_code"]}, {"$set": {
        "current_qty": new_stock,
        "status": compute_status(new_stock, item["min_qty"], item["max_qty"]),
        "total_value": round(new_stock * item.get("unit_price", 0), 2),
        "updated_at": now_iso(),
    }})
    updated = await db.transactions.find_one({"id": txn_id}, {"_id": 0})
    return {"transaction": updated, "new_stock": new_stock}


@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str):
    txn = await db.transactions.find_one({"id": txn_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    item = await db.items.find_one({"item_code": txn["item_code"]})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    new_stock = item["current_qty"] - txn_delta(txn["direction"], txn["qty"])
    if new_stock < 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: stock would become negative ({new_stock}). Adjust later transactions first.")
    await db.transactions.delete_one({"id": txn_id})
    await db.items.update_one({"item_code": item["item_code"]}, {"$set": {
        "current_qty": new_stock,
        "status": compute_status(new_stock, item["min_qty"], item["max_qty"]),
        "total_value": round(new_stock * item.get("unit_price", 0), 2),
        "updated_at": now_iso(),
    }})
    return {"deleted": txn_id, "new_stock": new_stock}


# ---------------------------- Import ----------------------------

def parse_import_file(content: bytes, filename: str):
    name = filename.lower()
    if name.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise ValueError("Unsupported file type. Please upload .xlsx or .csv")
    cols = {}
    for c in df.columns:
        mapped = HEADER_MAP.get(norm_header(c))
        if mapped and mapped not in cols.values():
            cols[c] = mapped
    df = df.rename(columns=cols)
    if "item_code" not in df.columns:
        raise ValueError("Could not find an 'Item Code' column in the file")
    if "description" not in df.columns:
        raise ValueError("Could not find an 'Item Description' column in the file")
    rows = []
    seen = set()
    skipped = 0
    for rec in df.to_dict("records"):
        code = to_code(rec.get("item_code"))
        if not code or code in seen:
            skipped += 1
            continue
        seen.add(code)
        item_type = rec.get("item_type")
        if isinstance(item_type, float) and math.isnan(item_type):
            item_type = None
        item_type = str(item_type).strip() if item_type else "Other"
        if item_type not in ITEM_TYPES:
            item_type = "Other"
        crit = rec.get("criticality")
        if isinstance(crit, float) and math.isnan(crit):
            crit = None
        crit_val = normalize_criticality(crit) if crit is not None else 3
        desc = rec.get("description")
        if isinstance(desc, float) and math.isnan(desc):
            desc = ""
        uom = rec.get("uom")
        if isinstance(uom, float) and math.isnan(uom):
            uom = "PCS"
        rows.append({
            "item_code": code,
            "description": str(desc).strip() or f"Item {code}",
            "uom": str(uom).strip().upper() or "PCS",
            "item_type": item_type,
            "min_qty": to_float(rec.get("min_qty")),
            "max_qty": to_float(rec.get("max_qty")),
            "current_qty": to_float(rec.get("current_qty")),
            "unit_price": to_float(rec.get("unit_price")),
            "criticality": crit_val,
        })
    return rows, skipped


@api_router.post("/import/items")
async def import_items(file: UploadFile = File(...), create_opening_balance: bool = Query(True)):
    content = await file.read()
    if len(content) > 60 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 60MB)")
    try:
        rows, skipped = await asyncio.to_thread(parse_import_file, content, file.filename or "upload.xlsx")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in file")

    existing_codes = set(await db.items.distinct("item_code"))
    ts = now_iso()
    ops = []
    opening_txns = []
    created = 0
    updated = 0
    for r in rows:
        r["total_value"] = round(r["current_qty"] * r["unit_price"], 2)
        r["status"] = compute_status(r["current_qty"], r["min_qty"], r["max_qty"])
        r["updated_at"] = ts
        is_new = r["item_code"] not in existing_codes
        if is_new:
            created += 1
            ops.append(UpdateOne({"item_code": r["item_code"]},
                                 {"$set": r, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": ts}},
                                 upsert=True))
            if create_opening_balance and r["current_qty"] > 0:
                opening_txns.append({
                    "id": str(uuid.uuid4()), "date": today_str(), "item_code": r["item_code"],
                    "item_description": r["description"], "direction": "IN", "qty": r["current_qty"],
                    "txn_type": "Opening Balance", "reference_no": "IMPORT",
                    "notes": "Opening balance from master import", "created_at": ts,
                })
        else:
            updated += 1
            ops.append(UpdateOne({"item_code": r["item_code"]}, {"$set": r}))

    BATCH = 2000
    for i in range(0, len(ops), BATCH):
        await db.items.bulk_write(ops[i:i + BATCH], ordered=False)
    for i in range(0, len(opening_txns), BATCH):
        await db.transactions.insert_many(opening_txns[i:i + BATCH], ordered=False)

    return {"total_rows": len(rows), "created": created, "updated": updated,
            "skipped": skipped, "opening_balance_transactions": len(opening_txns)}


# ---------------------------- Dashboard ----------------------------

@api_router.get("/dashboard")
async def dashboard():
    settings = await get_settings_doc()
    facet = await db.items.aggregate([
        {"$facet": {
            "totals": [{"$group": {"_id": None, "total_value": {"$sum": "$total_value"}, "total_items": {"$sum": 1},
                                    "total_stock_units": {"$sum": "$current_qty"}}}],
            "by_type": [{"$group": {"_id": "$item_type", "value": {"$sum": "$total_value"}, "count": {"$sum": 1}}},
                        {"$sort": {"value": -1}}],
            "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}, "value": {"$sum": "$total_value"}}}],
            "by_criticality": [{"$group": {"_id": "$criticality", "count": {"$sum": 1}, "value": {"$sum": "$total_value"}}}],
            "top20": [{"$match": {"total_value": {"$gt": 0}}}, {"$sort": {"total_value": -1}}, {"$limit": 20},
                      {"$project": {"_id": 0}}],
        }}
    ]).to_list(1)
    f = facet[0]
    totals = f["totals"][0] if f["totals"] else {"total_value": 0, "total_items": 0, "total_stock_units": 0}
    total_value = totals.get("total_value", 0)
    by_type = [{"item_type": b["_id"] or "Other", "value": round(b["value"], 2), "count": b["count"],
                "pct": round((b["value"] / total_value * 100), 1) if total_value else 0} for b in f["by_type"]]
    by_status = {b["_id"]: {"count": b["count"], "value": round(b["value"], 2)} for b in f["by_status"]}

    crit_counts = {1: 0, 2: 0, 3: 0}
    crit_value = {1: 0, 2: 0, 3: 0}
    for b in f.get("by_criticality", []):
        c = normalize_criticality(b["_id"])
        crit_counts[c] += b["count"]
        crit_value[c] += b["value"] or 0
    total_items_cnt = totals.get("total_items", 0)
    by_criticality = [{
        "criticality": c, "label": CRITICALITY_LABELS[c],
        "count": crit_counts[c], "value": round(crit_value[c], 2),
        "pct": round((crit_counts[c] / total_items_cnt * 100), 1) if total_items_cnt else 0,
    } for c in (1, 2, 3)]

    low_stock_items = await db.items.find(
        {"status": {"$in": [STATUS_BELOW_MIN, STATUS_MINIMUM]}}, {"_id": 0}
    ).sort("total_value", DESCENDING).limit(10).to_list(10)

    # Non-moving count
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(30.44 * settings.get("non_moving_months", 12)))).strftime("%Y-%m-%d")
    nm = await db.transactions.aggregate([
        {"$group": {"_id": "$item_code", "has_in": {"$max": {"$cond": [{"$eq": ["$direction", "IN"]}, 1, 0]}},
                    "last_txn": {"$max": "$date"}}},
        {"$match": {"has_in": 1, "last_txn": {"$lt": cutoff}}},
        {"$count": "count"},
    ]).to_list(1)
    non_moving_count = nm[0]["count"] if nm else 0

    return {
        "total_value": round(total_value, 2),
        "total_items": totals.get("total_items", 0),
        "total_stock_units": totals.get("total_stock_units", 0),
        "by_type": by_type,
        "by_criticality": by_criticality,
        "by_status": by_status,
        "top20": f["top20"],
        "low_stock_items": low_stock_items,
        "low_stock_count": by_status.get(STATUS_BELOW_MIN, {}).get("count", 0) + by_status.get(STATUS_MINIMUM, {}).get("count", 0),
        "non_moving_count": non_moving_count,
        "settings": settings,
    }


@api_router.get("/dashboard/critical")
async def critical_dashboard():
    """Focused view on critical materials (criticality Tier 1 & 2)."""
    agg = await db.items.aggregate([
        {"$match": {"criticality": {"$in": [1, 2]}}},
        {"$group": {"_id": {"crit": "$criticality", "status": "$status"},
                    "count": {"$sum": 1}, "value": {"$sum": "$total_value"}}},
    ]).to_list(200)

    tiers = {1: {"count": 0, "value": 0.0, "status": {}},
             2: {"count": 0, "value": 0.0, "status": {}}}
    for b in agg:
        c = normalize_criticality(b["_id"].get("crit"))
        if c not in (1, 2):
            continue
        st = b["_id"].get("status") or STATUS_OK
        tiers[c]["count"] += b["count"]
        tiers[c]["value"] += b["value"] or 0
        tiers[c]["status"][st] = tiers[c]["status"].get(st, 0) + b["count"]

    def tier_payload(c):
        t = tiers[c]
        s = t["status"]
        return {
            "criticality": c, "label": CRITICALITY_LABELS[c],
            "count": t["count"], "value": round(t["value"], 2),
            "below_min": s.get(STATUS_BELOW_MIN, 0), "minimum": s.get(STATUS_MINIMUM, 0),
            "ok": s.get(STATUS_OK, 0), "above_max": s.get(STATUS_ABOVE_MAX, 0),
        }

    by_tier = [tier_payload(1), tier_payload(2)]
    total_count = sum(t["count"] for t in by_tier)
    total_value = sum(t["value"] for t in by_tier)
    reorder_count = sum(t["below_min"] + t["minimum"] for t in by_tier)
    below_min_count = sum(t["below_min"] for t in by_tier)

    at_risk = await db.items.aggregate([
        {"$match": {"criticality": {"$in": [1, 2]},
                    "status": {"$in": [STATUS_BELOW_MIN, STATUS_MINIMUM]}}},
        {"$sort": {"criticality": 1, "total_value": -1}},
        {"$limit": 100},
        {"$project": {"_id": 0}},
    ]).to_list(100)

    return {
        "total_count": total_count,
        "total_value": round(total_value, 2),
        "reorder_count": reorder_count,
        "below_min_count": below_min_count,
        "by_tier": by_tier,
        "at_risk": at_risk,
    }


@api_router.get("/export/critical")
async def export_critical():
    items = await db.items.find(
        {"criticality": {"$in": [1, 2]}}, {"_id": 0}
    ).sort([("criticality", ASCENDING), ("total_value", DESCENDING)]).to_list(100000)
    df = pd.DataFrame([{
        "Item Code": i["item_code"], "Item Description": i["description"], "UOM": i["uom"],
        "Item Type": i.get("item_type", "Other"),
        "Criticality": normalize_criticality(i.get("criticality")),
        "Criticality Label": CRITICALITY_LABELS[normalize_criticality(i.get("criticality"))],
        "Minimum Stock": i["min_qty"], "Maximum Stock": i["max_qty"], "Current Stock": i["current_qty"],
        "Unit Rate (USD)": i["unit_price"], "Total Value (USD)": i["total_value"],
        "Status": STATUS_LABELS.get(i.get("status"), i.get("status")),
    } for i in items])
    return df_to_excel_response(df, "Critical Materials", "critical_materials.xlsx")



# ---------------------------- Consumption Analysis (list) ----------------------------

def analysis_group_pipeline(search: Optional[str] = None):
    """Two-stage grouping: per item+month OUT totals, then per item with months array."""
    pipeline = []
    if search:
        pipeline.append({"$match": {"$or": [
            {"item_code": {"$regex": search, "$options": "i"}},
            {"item_description": {"$regex": search, "$options": "i"}},
        ]}})
    pipeline += [
        {"$group": {
            "_id": {"code": "$item_code", "month": {"$substrCP": ["$date", 0, 7]}},
            "out": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, 0, "$qty"]}},
            "wo_ret": {"$sum": {"$cond": [{"$and": [{"$eq": ["$direction", "IN"]}, {"$eq": ["$txn_type", "Return from Work Order"]}]}, "$qty", 0]}},
            "in_qty": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", 0]}},
            "first_in": {"$min": {"$cond": [{"$eq": ["$direction", "IN"]}, "$date", None]}},
            "max_date": {"$max": "$date"},
        }},
        {"$group": {
            "_id": "$_id.code",
            "months": {"$push": {"month": "$_id.month", "out": "$out", "wo_ret": "$wo_ret"}},
            "total_out": {"$sum": "$out"},
            "total_wo_ret": {"$sum": "$wo_ret"},
            "total_in": {"$sum": "$in_qty"},
            "first_in": {"$min": "$first_in"},
            "last_txn": {"$max": "$max_date"},
        }},
        {"$addFields": {"net_consumption": {"$subtract": ["$total_out", "$total_wo_ret"]}}},
    ]
    return pipeline


def build_analysis_row(d: dict, item: dict, settings: dict):
    monthly_net = {}
    for m in d.get("months", []):
        net = (m.get("out") or 0) - (m.get("wo_ret") or 0)
        if net:
            monthly_net[m["month"]] = net
    stats = compute_item_stats(d.get("first_in"), monthly_net, item.get("criticality"), settings, item.get("current_qty", 0))
    return {
        "item_code": d["_id"],
        "description": item.get("description", ""),
        "uom": item.get("uom", ""),
        "item_type": item.get("item_type", "Other"),
        "current_qty": item.get("current_qty", 0),
        "min_qty": item.get("min_qty", 0),
        "max_qty": item.get("max_qty", 0),
        "status": item.get("status", ""),
        "total_in": d.get("total_in", 0),
        "total_out": d.get("total_out", 0),
        "wo_returns": d.get("total_wo_ret", 0),
        "total_consumption": stats["cumulative_consumption"],
        "avg_monthly_consumption": stats["avg_monthly_consumption"],
        "first_receipt_date": d.get("first_in"),
        "last_transaction_date": d.get("last_txn"),
        "stats": stats,
        "recommendation": {**stats, "current_min": item.get("min_qty", 0), "current_max": item.get("max_qty", 0)},
    }


@api_router.get("/analysis")
async def consumption_analysis(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    with_consumption_only: bool = False,
    sort_by: str = "consumption",
    sort_dir: str = "desc",
):
    settings = await get_settings_doc()
    pipeline = analysis_group_pipeline(search)
    if with_consumption_only:
        pipeline.append({"$match": {"net_consumption": {"$gt": 0}}})
    sort_field = {"consumption": "net_consumption", "total_out": "total_out", "last_txn": "last_txn", "item_code": "_id"}.get(sort_by, "net_consumption")
    pipeline.append({"$sort": {sort_field: DESCENDING if sort_dir == "desc" else ASCENDING}})
    pipeline.append({"$facet": {
        "data": [{"$skip": (page - 1) * page_size}, {"$limit": page_size}],
        "count": [{"$count": "total"}],
    }})
    res = await db.transactions.aggregate(pipeline).to_list(1)
    data = res[0]["data"] if res else []
    total = res[0]["count"][0]["total"] if res and res[0]["count"] else 0

    codes = [d["_id"] for d in data]
    items_map = {}
    if codes:
        async for it in db.items.find({"item_code": {"$in": codes}}, {"_id": 0}):
            items_map[it["item_code"]] = it

    rows = [build_analysis_row(d, items_map.get(d["_id"], {}), settings) for d in data]
    return {"rows": rows, "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size)), "settings": settings,
            "report_review_date": today_str()}


# ---------------------------- Non-Moving ----------------------------

async def get_non_moving_rows(settings, limit=None):
    months = settings.get("non_moving_months", 12)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(30.44 * months))).strftime("%Y-%m-%d")
    pipeline = [
        {"$group": {"_id": "$item_code",
                    "has_in": {"$max": {"$cond": [{"$eq": ["$direction", "IN"]}, 1, 0]}},
                    "last_txn": {"$max": "$date"},
                    "first_receipt": {"$min": {"$cond": [{"$eq": ["$direction", "IN"]}, "$date", None]}},
                    "total_in": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", 0]}}}},
        {"$match": {"has_in": 1, "last_txn": {"$lt": cutoff}}},
        {"$sort": {"last_txn": 1}},
    ]
    if limit:
        pipeline.append({"$limit": limit})
    data = await db.transactions.aggregate(pipeline).to_list(limit or 100000)
    codes = [d["_id"] for d in data]
    items_map = {}
    if codes:
        async for it in db.items.find({"item_code": {"$in": codes}}, {"_id": 0}):
            items_map[it["item_code"]] = it
    rows = []
    for d in data:
        item = items_map.get(d["_id"], {})
        rows.append({
            "item_code": d["_id"],
            "description": item.get("description", ""),
            "uom": item.get("uom", ""),
            "item_type": item.get("item_type", "Other"),
            "current_qty": item.get("current_qty", 0),
            "total_value": item.get("total_value", 0),
            "first_receipt_date": d.get("first_receipt"),
            "last_transaction_date": d.get("last_txn"),
            "classification": f"Non-Moving – {int(months // 12)} Year" if months >= 12 else f"Non-Moving – {int(months)} Months",
        })
    return rows, cutoff


@api_router.get("/non-moving")
async def non_moving(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    settings = await get_settings_doc()
    rows, cutoff = await get_non_moving_rows(settings)
    total = len(rows)
    start = (page - 1) * page_size
    return {"rows": rows[start:start + page_size], "total": total, "page": page,
            "page_size": page_size, "total_pages": max(1, math.ceil(total / page_size)),
            "cutoff_date": cutoff, "months": settings.get("non_moving_months", 12)}


# ---------------------------- Exports ----------------------------

LOGO_PATH = str(ROOT_DIR / "assets" / "logo.png")


def write_report_header(wb, ws, title: str):
    title_fmt = wb.add_format({"bold": True, "font_size": 14})
    sub_fmt = wb.add_format({"font_color": "#666666", "font_size": 9})
    if os.path.exists(LOGO_PATH):
        ws.insert_image(0, 0, LOGO_PATH, {"x_scale": 0.085, "y_scale": 0.085, "x_offset": 4, "y_offset": 4})
    ws.set_row(0, 22)
    ws.write(0, 1, title, title_fmt)
    ws.write(1, 1, "PetroChina GPP - Inventory Management System", sub_fmt)
    ws.write(2, 1, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", sub_fmt)


def df_to_excel_response(df: pd.DataFrame, sheet: str, filename: str, title: Optional[str] = None):
    buf = io.BytesIO()
    startrow = 4
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet[:31], startrow=startrow)
        ws = writer.sheets[sheet[:31]]
        write_report_header(writer.book, ws, title or sheet)
        for i, col in enumerate(df.columns):
            width = max(12, min(40, int(df[col].fillna("").astype(str).str.len().max() if len(df) else 12) + 2, 42))
            ws.set_column(i, i, width)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


STATUS_LABELS = {STATUS_BELOW_MIN: "Below Minimum", STATUS_MINIMUM: "Minimum", STATUS_OK: "OK", STATUS_ABOVE_MAX: "Above Maximum"}


@api_router.get("/export/inventory")
async def export_inventory(search: Optional[str] = None, item_type: Optional[str] = None, status: Optional[str] = None):
    q = {}
    if search:
        q["$or"] = [{"item_code": {"$regex": search, "$options": "i"}}, {"description": {"$regex": search, "$options": "i"}}]
    if item_type and item_type != "all":
        q["item_type"] = item_type
    if status and status != "all":
        q["status"] = status
    items = await db.items.find(q, {"_id": 0}).sort("item_code", ASCENDING).to_list(100000)
    # Build avg-yearly-consumption map from transaction history (independent of criticality Z)
    settings = await get_settings_doc()
    cons_map = {}
    agg = await db.transactions.aggregate(analysis_group_pipeline()).to_list(100000)
    for d in agg:
        r = build_analysis_row(d, {"current_qty": 0}, settings)
        cons_map[d["_id"]] = r["stats"]["avg_yearly_consumption"]
    df = pd.DataFrame([{
        "Item Code": i["item_code"], "Item Description": i["description"], "UOM": i["uom"],
        "Item Type": i.get("item_type", "Other"), "Minimum Stock": i["min_qty"], "Maximum Stock": i["max_qty"],
        "Current Stock": i["current_qty"], "Unit Rate (USD)": i["unit_price"], "Total Value (USD)": i["total_value"],
        "Status": STATUS_LABELS.get(i.get("status"), i.get("status")),
        "Criticality": normalize_criticality(i.get("criticality")),
        "Criticality Label": CRITICALITY_LABELS[normalize_criticality(i.get("criticality"))],
        "Avg Yearly Consumption": cons_map.get(i["item_code"], 0),
    } for i in items])
    return df_to_excel_response(df, "Inventory", "inventory_report.xlsx")


@api_router.get("/export/transactions")
async def export_transactions(date_from: Optional[str] = None, date_to: Optional[str] = None,
                              direction: Optional[str] = None, txn_type: Optional[str] = None):
    q = {}
    if direction and direction != "all":
        q["direction"] = direction
    if txn_type and txn_type != "all":
        q["txn_type"] = txn_type
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        q["date"] = date_q
    txns = await db.transactions.find(q, {"_id": 0}).sort("date", DESCENDING).to_list(200000)
    df = pd.DataFrame([{
        "Date": t["date"], "Item Code": t["item_code"], "Item Description": t["item_description"],
        "Direction": t["direction"], "Quantity": t["qty"], "Transaction Type": t["txn_type"],
        "Reference No": t.get("reference_no", ""), "Notes": t.get("notes", ""),
    } for t in txns])
    return df_to_excel_response(df, "Transactions", "transactions_report.xlsx")


@api_router.get("/export/non-moving")
async def export_non_moving():
    settings = await get_settings_doc()
    rows, cutoff = await get_non_moving_rows(settings)
    df = pd.DataFrame([{
        "Item Code": r["item_code"], "Item Description": r["description"], "UOM": r["uom"],
        "Item Type": r["item_type"], "Current Stock": r["current_qty"], "Total Value (USD)": r["total_value"],
        "First Receipt": r["first_receipt_date"], "Last Transaction": r["last_transaction_date"],
        "Classification": r["classification"],
    } for r in rows])
    return df_to_excel_response(df, "Non-Moving Items", "non_moving_items.xlsx")


@api_router.get("/export/top20")
async def export_top20():
    items = await db.items.find({"total_value": {"$gt": 0}}, {"_id": 0}).sort("total_value", DESCENDING).limit(20).to_list(20)
    df = pd.DataFrame([{
        "Rank": idx + 1, "Item Code": i["item_code"], "Item Description": i["description"], "UOM": i["uom"],
        "Item Type": i.get("item_type", "Other"), "Current Stock": i["current_qty"],
        "Unit Rate (USD)": i["unit_price"], "Total Value (USD)": i["total_value"],
    } for idx, i in enumerate(items)])
    return df_to_excel_response(df, "Top 20 High Value", "top20_high_value.xlsx")


@api_router.get("/export/analysis")
async def export_analysis():
    settings = await get_settings_doc()
    pipeline = analysis_group_pipeline() + [{"$sort": {"net_consumption": -1}}]
    data = await db.transactions.aggregate(pipeline).to_list(100000)
    codes = [d["_id"] for d in data]
    items_map = {}
    if codes:
        async for it in db.items.find({"item_code": {"$in": codes}}, {"_id": 0}):
            items_map[it["item_code"]] = it
    review_date = today_str()
    rows = []
    for d in data:
        item = items_map.get(d["_id"], {})
        r = build_analysis_row(d, item, settings)
        s = r["stats"]
        rows.append({
            "Item Code": r["item_code"], "Item Description": r["description"], "UOM": r["uom"],
            "Current Stock": r["current_qty"],
            "Criticality": f"{s['criticality']} - {s['criticality_label']}",
            "Service Level %": s["service_level"], "Z-Value": s["z_value"],
            "First IN Date": s["first_in_date"], "Report Review Date": review_date,
            "Months History": s["months_history"],
            "Total OUT": r["total_out"], "WO Returns": r["wo_returns"],
            "Cumulative Consumption": s["cumulative_consumption"],
            "Avg Monthly Consumption": s["avg_monthly_consumption"],
            "Avg Yearly Consumption": s["avg_yearly_consumption"],
            "Consumption Std Dev": s["consumption_std_dev"],
            "Lead-Time Demand": s["lead_time_demand"],
            "Safety Stock": s["safety_stock"],
            "Recommended Minimum (ROP)": s["recommended_min"],
            "Six-Month Demand": s["six_month_demand"],
            "Recommended Maximum": s["recommended_max"],
            "Stock Status": s["stock_status"],
            "Confidence": s["confidence"],
            "Confidence Notes": "; ".join(s["confidence_reasons"]),
            "Current Min": item.get("min_qty", 0), "Current Max": item.get("max_qty", 0),
        })
    df = pd.DataFrame(rows)
    return df_to_excel_response(df, "Consumption Analysis", "consumption_analysis.xlsx",
                                title=f"Consumption & Recommended Min-Max Report - Reviewed {review_date}")


# ---------------------------- Bulk Type Update ----------------------------

class BulkTypeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    new_type: str
    item_codes: Optional[List[str]] = None
    select_filter: Optional[dict] = None  # {search, item_type, status}


def build_bulk_query(item_codes, select_filter):
    if item_codes:
        return {"item_code": {"$in": item_codes}}
    if select_filter is not None:
        f = select_filter
        q = {}
        if f.get("search"):
            q["$or"] = [
                {"item_code": {"$regex": f["search"], "$options": "i"}},
                {"description": {"$regex": f["search"], "$options": "i"}},
            ]
        if f.get("item_type") and f["item_type"] != "all":
            q["item_type"] = f["item_type"]
        if f.get("criticality") and f["criticality"] != "all":
            try:
                q["criticality"] = int(f["criticality"])
            except (ValueError, TypeError):
                pass
        if f.get("status") and f["status"] != "all":
            q["status"] = f["status"]
        return q
    return None


@api_router.post("/items/bulk-type")
async def bulk_update_type(payload: BulkTypeUpdate):
    if payload.new_type not in ITEM_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid item type. Allowed: {ITEM_TYPES}")
    q = build_bulk_query(payload.item_codes, payload.select_filter)
    if q is None:
        raise HTTPException(status_code=400, detail="Provide item_codes or select_filter")
    res = await db.items.update_many(q, {"$set": {"item_type": payload.new_type, "updated_at": now_iso()}})
    return {"matched": res.matched_count, "modified": res.modified_count, "new_type": payload.new_type}


class BulkCriticalityUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    new_criticality: int
    item_codes: Optional[List[str]] = None
    select_filter: Optional[dict] = None


@api_router.post("/items/bulk-criticality")
async def bulk_update_criticality(payload: BulkCriticalityUpdate):
    crit = normalize_criticality(payload.new_criticality)
    if payload.new_criticality not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="new_criticality must be 1, 2, or 3")
    q = build_bulk_query(payload.item_codes, payload.select_filter)
    if q is None:
        raise HTTPException(status_code=400, detail="Provide item_codes or select_filter")
    res = await db.items.update_many(q, {"$set": {"criticality": crit, "updated_at": now_iso()}})
    return {"matched": res.matched_count, "modified": res.modified_count,
            "new_criticality": crit, "new_criticality_label": CRITICALITY_LABELS[crit]}


class AutoClassifyRequest(BaseModel):
    dry_run: bool = True
    only_unclassified: bool = True  # only touch items currently at criticality 3


@api_router.post("/items/auto-classify")
async def auto_classify_criticality(payload: AutoClassifyRequest):
    """Rules-based helper that suggests a criticality tier from each item's description.

    - dry_run=True returns a preview (counts + sample changes) without modifying data
    - only_unclassified=True limits scope to items currently at criticality 3 (default),
      preserving any manual 1/2 assignments
    """
    q = {}
    if payload.only_unclassified:
        q = {"$or": [{"criticality": 3}, {"criticality": {"$exists": False}}, {"criticality": None}]}
    cursor = db.items.find(q, {"_id": 0, "item_code": 1, "description": 1, "criticality": 1})

    suggested_counts = {1: 0, 2: 0, 3: 0}
    change_ops = []
    samples = []
    changed = 0
    scanned = 0
    async for it in cursor:
        scanned += 1
        cur = normalize_criticality(it.get("criticality"))
        sug = classify_criticality(it.get("description"))
        suggested_counts[sug] += 1
        if sug != cur:
            changed += 1
            if len(samples) < 50:
                samples.append({
                    "item_code": it["item_code"], "description": it.get("description", ""),
                    "current": cur, "suggested": sug,
                    "suggested_label": CRITICALITY_LABELS[sug],
                })
            if not payload.dry_run:
                change_ops.append(UpdateOne(
                    {"item_code": it["item_code"]},
                    {"$set": {"criticality": sug, "updated_at": now_iso()}},
                ))

    applied = 0
    if not payload.dry_run and change_ops:
        BATCH = 2000
        for i in range(0, len(change_ops), BATCH):
            res = await db.items.bulk_write(change_ops[i:i + BATCH], ordered=False)
            applied += res.modified_count

    return {
        "scanned": scanned,
        "suggested_counts": suggested_counts,
        "changes": changed,
        "applied": applied,
        "dry_run": payload.dry_run,
        "only_unclassified": payload.only_unclassified,
        "samples": samples,
    }


# ---------------------------- Reorder Suggestions ----------------------------

REORDER_PIPELINE_FIELDS = [
    {"$addFields": {"target_qty": {"$cond": [{"$gt": ["$max_qty", "$min_qty"]}, "$max_qty", "$min_qty"]}}},
    {"$addFields": {"suggested_qty": {"$ceil": {"$max": [0, {"$subtract": ["$target_qty", "$current_qty"]}]}}}},
    {"$addFields": {"est_cost": {"$round": [{"$multiply": ["$suggested_qty", "$unit_price"]}, 2]}}},
    {"$addFields": {"crit_sort": {"$ifNull": ["$criticality", 3]}}},
    {"$match": {"suggested_qty": {"$gt": 0}}},
]


def reorder_match(search, item_type, include_minimum, criticality=None):
    statuses = [STATUS_BELOW_MIN] + ([STATUS_MINIMUM] if include_minimum else [])
    q = {"status": {"$in": statuses}}
    if search:
        q["$or"] = [
            {"item_code": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    if item_type and item_type != "all":
        q["item_type"] = item_type
    if criticality and criticality != "all":
        try:
            q["criticality"] = int(criticality)
        except (ValueError, TypeError):
            pass
    return q


@api_router.get("/reorder")
async def reorder_suggestions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    item_type: Optional[str] = None,
    criticality: Optional[str] = None,
    include_minimum: bool = True,
    sort_by: str = "est_cost",
    sort_dir: str = "desc",
):
    sort_field = sort_by if sort_by in {"est_cost", "suggested_qty", "current_qty", "item_code"} else "est_cost"
    # Critical-first: Tier 1 spares are always ordered before anything else.
    sort_stage = {"crit_sort": 1, sort_field: DESCENDING if sort_dir == "desc" else ASCENDING}
    pipeline = [{"$match": reorder_match(search, item_type, include_minimum, criticality)}] + REORDER_PIPELINE_FIELDS + [
        {"$sort": sort_stage},
        {"$facet": {
            "data": [{"$skip": (page - 1) * page_size}, {"$limit": page_size}, {"$project": {"_id": 0}}],
            "count": [{"$count": "total"}],
            "totals": [{"$group": {"_id": None, "total_est_cost": {"$sum": "$est_cost"}, "total_units": {"$sum": "$suggested_qty"}}}],
        }},
    ]
    res = await db.items.aggregate(pipeline).to_list(1)
    f = res[0]
    total = f["count"][0]["total"] if f["count"] else 0
    totals = f["totals"][0] if f["totals"] else {"total_est_cost": 0, "total_units": 0}
    return {"rows": f["data"], "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size)),
            "total_est_cost": round(totals.get("total_est_cost", 0), 2),
            "total_units": totals.get("total_units", 0)}


@api_router.get("/export/reorder")
async def export_reorder(search: Optional[str] = None, item_type: Optional[str] = None,
                         criticality: Optional[str] = None, include_minimum: bool = True):
    pipeline = [{"$match": reorder_match(search, item_type, include_minimum, criticality)}] + REORDER_PIPELINE_FIELDS + [
        {"$sort": {"crit_sort": 1, "est_cost": -1}}, {"$project": {"_id": 0}},
    ]
    rows = await db.items.aggregate(pipeline).to_list(100000)
    df = pd.DataFrame([{
        "Item Code": r["item_code"], "Item Description": r["description"], "UOM": r["uom"],
        "Item Type": r.get("item_type", "Other"),
        "Criticality": normalize_criticality(r.get("criticality")),
        "Criticality Label": CRITICALITY_LABELS[normalize_criticality(r.get("criticality"))],
        "Status": STATUS_LABELS.get(r.get("status"), r.get("status")),
        "Current Stock": r["current_qty"], "Minimum": r["min_qty"], "Maximum": r["max_qty"],
        "Target Qty": r["target_qty"], "Suggested Order Qty": r["suggested_qty"],
        "Unit Rate (USD)": r["unit_price"], "Estimated Cost (USD)": r["est_cost"],
    } for r in rows])
    return df_to_excel_response(df, "Reorder Proposal", "reorder_proposal.xlsx", title="Purchase Reorder Proposal")


# ---------------------------- Monthly Snapshot Report ----------------------------

def shift_month(ym: str, delta: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    idx = y * 12 + (m - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


async def month_movement_stats(ym: str):
    pipeline = [
        {"$match": {"date": {"$regex": f"^{ym}"}}},
        {"$group": {
            "_id": "$item_code",
            "in_qty": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", 0]}},
            "out_qty": {"$sum": {"$cond": [{"$eq": ["$direction", "OUT"]}, "$qty", 0]}},
            "wo_ret": {"$sum": {"$cond": [{"$and": [{"$eq": ["$direction", "IN"]}, {"$eq": ["$txn_type", "Return from Work Order"]}]}, "$qty", 0]}},
            "txns": {"$sum": 1},
        }},
    ]
    data = await db.transactions.aggregate(pipeline).to_list(100000)
    codes = [d["_id"] for d in data]
    items_map = {}
    if codes:
        async for it in db.items.find({"item_code": {"$in": codes}}, {"_id": 0, "item_code": 1, "unit_price": 1, "description": 1, "uom": 1}):
            items_map[it["item_code"]] = it
    totals = {"consumption_qty": 0, "consumption_value": 0.0, "receipts_qty": 0, "receipts_value": 0.0,
              "in_value": 0.0, "out_value": 0.0, "txn_count": 0, "items_moved": len(data), "items_consumed": 0}
    per_item = []
    for d in data:
        it = items_map.get(d["_id"], {})
        price = it.get("unit_price", 0) or 0
        cons = max(0, (d["out_qty"] or 0) - (d["wo_ret"] or 0))  # net consumption = OUT - WO returns
        cons_val = round(cons * price, 2)
        totals["consumption_qty"] += cons
        totals["consumption_value"] += cons_val
        totals["receipts_qty"] += d["in_qty"] or 0
        totals["receipts_value"] += round((d["in_qty"] or 0) * price, 2)
        totals["in_value"] += (d["in_qty"] or 0) * price
        totals["out_value"] += (d["out_qty"] or 0) * price
        totals["txn_count"] += d["txns"]
        if cons > 0:
            totals["items_consumed"] += 1
            per_item.append({"item_code": d["_id"], "description": it.get("description", ""), "uom": it.get("uom", ""),
                             "consumption_qty": cons, "consumption_value": cons_val})
    for k in ("consumption_value", "receipts_value", "in_value", "out_value"):
        totals[k] = round(totals[k], 2)
    top_consumed = sorted(per_item, key=lambda r: r["consumption_value"], reverse=True)[:10]
    return totals, top_consumed


async def net_value_after(ym: str) -> float:
    """Net movement value (IN value - OUT value) for all transactions after the end of month ym."""
    pipeline = [
        {"$match": {"date": {"$gt": f"{ym}-99"}}},
        {"$group": {
            "_id": "$item_code",
            "in_qty": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", 0]}},
            "out_qty": {"$sum": {"$cond": [{"$eq": ["$direction", "OUT"]}, "$qty", 0]}},
        }},
    ]
    data = await db.transactions.aggregate(pipeline).to_list(100000)
    codes = [d["_id"] for d in data]
    prices = {}
    if codes:
        async for it in db.items.find({"item_code": {"$in": codes}}, {"_id": 0, "item_code": 1, "unit_price": 1}):
            prices[it["item_code"]] = it.get("unit_price", 0) or 0
    net = 0.0
    for d in data:
        p = prices.get(d["_id"], 0)
        net += ((d["in_qty"] or 0) - (d["out_qty"] or 0)) * p
    return round(net, 2)


def pct_change(cur, prev):
    if not prev:
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


async def critical_below_min_trend(end_ym: str, months_back: int = 6):
    """Count Tier 1 & 2 (critical) items that were below their minimum at each month-end
    for the last `months_back` months ending at `end_ym`.

    Month-end stock is reconstructed authoritatively from current stock by reversing all
    net movements that occurred after that month-end (robust to how opening balances are stored).
    """
    crit_items = await db.items.find(
        {"criticality": {"$in": [1, 2]}},
        {"_id": 0, "item_code": 1, "min_qty": 1, "current_qty": 1, "criticality": 1},
    ).to_list(100000)

    months = [shift_month(end_ym, -(months_back - 1) + k) for k in range(months_back)]

    if not crit_items:
        return {"months": [{"month": m, "below_min_count": 0} for m in months], "critical_total": 0}

    codes = [i["item_code"] for i in crit_items]
    pipeline = [
        {"$match": {"item_code": {"$in": codes}}},
        {"$group": {
            "_id": {"code": "$item_code", "month": {"$substrCP": ["$date", 0, 7]}},
            "net": {"$sum": {"$cond": [{"$eq": ["$direction", "IN"]}, "$qty", {"$multiply": ["$qty", -1]}]}},
        }},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(1000000)
    net_map = {}
    for r in rows:
        net_map.setdefault(r["_id"]["code"], {})[r["_id"]["month"]] = r["net"] or 0

    result = []
    for m in months:
        below = 0
        for it in crit_items:
            movements = net_map.get(it["item_code"], {})
            after = sum(v for mm, v in movements.items() if mm > m)
            stock_end = (it.get("current_qty", 0) or 0) - after
            if stock_end < (it.get("min_qty", 0) or 0):
                below += 1
        result.append({"month": m, "below_min_count": below})
    return {"months": result, "critical_total": len(crit_items)}


async def build_monthly_snapshot(month: Optional[str] = None):
    now = datetime.now(timezone.utc)
    ym = month or now.strftime("%Y-%m")
    try:
        datetime.strptime(ym, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")
    prev = shift_month(ym, -1)
    cur_stats, top_consumed = await month_movement_stats(ym)
    prev_stats, _ = await month_movement_stats(prev)

    agg = await db.items.aggregate([{"$group": {"_id": None, "v": {"$sum": "$total_value"}}}]).to_list(1)
    current_total_value = round(agg[0]["v"], 2) if agg else 0.0
    end_value_cur = round(current_total_value - await net_value_after(ym), 2)
    net_cur = round(cur_stats["in_value"] - cur_stats["out_value"], 2)
    end_value_prev = round(end_value_cur - net_cur, 2)

    return {
        "month": ym,
        "prev_month": prev,
        "current": {**cur_stats, "end_inventory_value": end_value_cur},
        "previous": {**prev_stats, "end_inventory_value": end_value_prev},
        "deltas": {
            "consumption_qty": cur_stats["consumption_qty"] - prev_stats["consumption_qty"],
            "consumption_value": round(cur_stats["consumption_value"] - prev_stats["consumption_value"], 2),
            "consumption_value_pct": pct_change(cur_stats["consumption_value"], prev_stats["consumption_value"]),
            "receipts_value": round(cur_stats["receipts_value"] - prev_stats["receipts_value"], 2),
            "receipts_value_pct": pct_change(cur_stats["receipts_value"], prev_stats["receipts_value"]),
            "inventory_value": round(end_value_cur - end_value_prev, 2),
            "inventory_value_pct": pct_change(end_value_cur, end_value_prev),
            "txn_count": cur_stats["txn_count"] - prev_stats["txn_count"],
        },
        "top_consumed": top_consumed,
        "critical_trend": await critical_below_min_trend(ym, 6),
    }


@api_router.get("/reports/monthly-snapshot")
async def monthly_snapshot(month: Optional[str] = None):
    return await build_monthly_snapshot(month)


@api_router.get("/export/monthly-snapshot")
async def export_monthly_snapshot(month: Optional[str] = None):
    snap = await build_monthly_snapshot(month)
    cur, prv, d = snap["current"], snap["previous"], snap["deltas"]
    summary = pd.DataFrame([
        {"Metric": "End-of-Month Inventory Value (USD)", f"{snap['month']}": cur["end_inventory_value"], f"{snap['prev_month']}": prv["end_inventory_value"], "Change": d["inventory_value"], "Change %": d["inventory_value_pct"]},
        {"Metric": "Consumption Value (USD)", f"{snap['month']}": cur["consumption_value"], f"{snap['prev_month']}": prv["consumption_value"], "Change": d["consumption_value"], "Change %": d["consumption_value_pct"]},
        {"Metric": "Consumption Quantity (units)", f"{snap['month']}": cur["consumption_qty"], f"{snap['prev_month']}": prv["consumption_qty"], "Change": d["consumption_qty"], "Change %": None},
        {"Metric": "Receipts Value (USD)", f"{snap['month']}": cur["receipts_value"], f"{snap['prev_month']}": prv["receipts_value"], "Change": d["receipts_value"], "Change %": d["receipts_value_pct"]},
        {"Metric": "Receipts Quantity (units)", f"{snap['month']}": cur["receipts_qty"], f"{snap['prev_month']}": prv["receipts_qty"], "Change": None, "Change %": None},
        {"Metric": "Transactions Count", f"{snap['month']}": cur["txn_count"], f"{snap['prev_month']}": prv["txn_count"], "Change": d["txn_count"], "Change %": None},
        {"Metric": "Items with Consumption", f"{snap['month']}": cur["items_consumed"], f"{snap['prev_month']}": prv["items_consumed"], "Change": None, "Change %": None},
    ])
    top = pd.DataFrame([{
        "Item Code": t["item_code"], "Item Description": t["description"], "UOM": t["uom"],
        "Consumption Qty": t["consumption_qty"], "Consumption Value (USD)": t["consumption_value"],
    } for t in snap["top_consumed"]])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        summary.to_excel(writer, index=False, sheet_name="Monthly Snapshot", startrow=4)
        ws = writer.sheets["Monthly Snapshot"]
        write_report_header(writer.book, ws, f"Monthly Snapshot - {snap['month']} vs {snap['prev_month']}")
        for i, col in enumerate(summary.columns):
            ws.set_column(i, i, max(14, min(40, int(summary[col].fillna("").astype(str).str.len().max()) + 2)))
        start2 = 4 + len(summary) + 3
        bold = writer.book.add_format({"bold": True, "font_size": 11})
        ws.write(start2 - 1, 0, f"Top 10 Consumed Items - {snap['month']}", bold)
        if len(top):
            top.to_excel(writer, index=False, sheet_name="Monthly Snapshot", startrow=start2)
        else:
            ws.write(start2, 0, "No consumption recorded this month.")

        # Critical materials below-minimum trend
        trend = snap.get("critical_trend", {})
        trend_df = pd.DataFrame([{"Month": t["month"], "Critical Items Below Minimum": t["below_min_count"]}
                                 for t in trend.get("months", [])])
        start3 = start2 + max(len(top), 1) + 3
        ws.write(start3 - 1, 0, f"Critical Items Below Minimum - Last 6 Months (of {trend.get('critical_total', 0)} critical items)", bold)
        if len(trend_df):
            trend_df.to_excel(writer, index=False, sheet_name="Monthly Snapshot", startrow=start3)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=monthly_snapshot_{snap['month']}.xlsx"},
    )


# ---------------------------- Transaction Bulk Import ----------------------------

TXN_HEADER_MAP = {
    "date": "date", "transactiondate": "date", "txndate": "date",
    "itemcode": "item_code", "code": "item_code", "materialcode": "item_code",
    "direction": "direction", "inout": "direction", "transactiondirection": "direction",
    "qty": "qty", "quantity": "qty",
    "transactiontype": "txn_type", "type": "txn_type", "txntype": "txn_type",
    "referenceno": "reference_no", "reference": "reference_no", "referencenumber": "reference_no", "refno": "reference_no",
    "notes": "notes", "remarks": "notes", "comment": "notes",
}


def parse_txn_import_file(content: bytes, filename: str):
    name = filename.lower()
    if name.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise ValueError("Unsupported file type. Please upload .xlsx or .csv")
    cols = {}
    for c in df.columns:
        mapped = TXN_HEADER_MAP.get(norm_header(c))
        if mapped and mapped not in cols.values():
            cols[c] = mapped
    df = df.rename(columns=cols)
    for required in ("date", "item_code", "direction", "qty"):
        if required not in df.columns:
            raise ValueError(f"Missing required column: '{required}'. Required: Date, Item Code, Direction (IN/OUT), Quantity. Optional: Transaction Type, Reference No, Notes")
    rows = []
    errors = []
    for idx, rec in enumerate(df.to_dict("records")):
        rownum = idx + 2
        code = to_code(rec.get("item_code"))
        if not code:
            errors.append({"row": rownum, "error": "Missing item code"})
            continue
        try:
            date_val = pd.to_datetime(rec.get("date"), errors="coerce")
        except Exception:
            date_val = None
        if date_val is None or pd.isna(date_val):
            errors.append({"row": rownum, "error": f"Invalid date for item {code}"})
            continue
        direction = str(rec.get("direction") or "").strip().upper()
        if direction in ("RECEIPT", "RECEIVE", "I"):
            direction = "IN"
        if direction in ("ISSUE", "O"):
            direction = "OUT"
        if direction not in ("IN", "OUT"):
            errors.append({"row": rownum, "error": f"Invalid direction '{rec.get('direction')}' for item {code} (must be IN or OUT)"})
            continue
        qty = to_float(rec.get("qty"), default=None)
        if qty is None or qty <= 0:
            errors.append({"row": rownum, "error": f"Invalid quantity for item {code}"})
            continue
        txn_type = rec.get("txn_type")
        if isinstance(txn_type, float) and math.isnan(txn_type):
            txn_type = None
        txn_type = str(txn_type).strip() if txn_type else None
        if txn_type not in TXN_TYPES:
            txn_type = "Purchase Order" if direction == "IN" else "Work Order"
        ref = rec.get("reference_no")
        if isinstance(ref, float) and math.isnan(ref):
            ref = ""
        notes = rec.get("notes")
        if isinstance(notes, float) and math.isnan(notes):
            notes = ""
        rows.append({
            "item_code": code,
            "date": date_val.strftime("%Y-%m-%d"),
            "direction": direction,
            "qty": qty,
            "txn_type": txn_type,
            "reference_no": str(ref).strip() if ref is not None else "",
            "notes": str(notes).strip() if notes is not None else "",
        })
    return rows, errors


@api_router.get("/import/transactions/template")
async def transaction_import_template():
    df = pd.DataFrame([
        {"Date": "2025-01-15", "Item Code": "1001", "Direction": "IN", "Quantity": 10, "Transaction Type": "Purchase Order", "Reference No": "PO-2025-001", "Notes": ""},
        {"Date": "2025-02-03", "Item Code": "1001", "Direction": "OUT", "Quantity": 4, "Transaction Type": "Work Order", "Reference No": "WO-2025-114", "Notes": ""},
        {"Date": "2025-02-20", "Item Code": "1002", "Direction": "IN", "Quantity": 2, "Transaction Type": "Return from Work Order", "Reference No": "WO-2025-114", "Notes": "Unused material returned"},
    ])
    return df_to_excel_response(df, "Transactions Template", "transactions_import_template.xlsx", title="Transaction Import Template")


@api_router.post("/import/transactions")
async def import_transactions(file: UploadFile = File(...), apply_to_stock: bool = Query(False)):
    content = await file.read()
    if len(content) > 60 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 60MB)")
    try:
        rows, errors = await asyncio.to_thread(parse_txn_import_file, content, file.filename or "upload.xlsx")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not rows and not errors:
        raise HTTPException(status_code=400, detail="No rows found in file")

    valid_codes = set(await db.items.distinct("item_code"))
    ts = now_iso()
    docs = []
    desc_cache = {}
    unknown = 0
    for r in rows:
        if r["item_code"] not in valid_codes:
            unknown += 1
            if len(errors) < 50:
                errors.append({"row": None, "error": f"Item code '{r['item_code']}' not found in item master"})
            continue
        docs.append({
            "id": str(uuid.uuid4()), "date": r["date"], "item_code": r["item_code"],
            "item_description": "", "direction": r["direction"], "qty": r["qty"],
            "txn_type": r["txn_type"], "reference_no": r["reference_no"], "notes": r["notes"],
            "created_at": ts, "source": "bulk_import",
        })

    # Fill descriptions in bulk
    codes_needed = list({d["item_code"] for d in docs})
    if codes_needed:
        async for it in db.items.find({"item_code": {"$in": codes_needed}}, {"_id": 0, "item_code": 1, "description": 1}):
            desc_cache[it["item_code"]] = it["description"]
    for d in docs:
        d["item_description"] = desc_cache.get(d["item_code"], "")

    BATCH = 2000
    for i in range(0, len(docs), BATCH):
        await db.transactions.insert_many(docs[i:i + BATCH], ordered=False)

    items_affected = 0
    negative_stock_items = 0
    if apply_to_stock and docs:
        deltas = {}
        for d in docs:
            deltas[d["item_code"]] = deltas.get(d["item_code"], 0) + (d["qty"] if d["direction"] == "IN" else -d["qty"])
        affected = {}
        async for it in db.items.find({"item_code": {"$in": list(deltas.keys())}}, {"_id": 0}):
            affected[it["item_code"]] = it
        ops = []
        for code, delta in deltas.items():
            it = affected.get(code)
            if not it:
                continue
            new_qty = it["current_qty"] + delta
            if new_qty < 0:
                negative_stock_items += 1
                new_qty = 0
            ops.append(UpdateOne({"item_code": code}, {"$set": {
                "current_qty": new_qty,
                "status": compute_status(new_qty, it["min_qty"], it["max_qty"]),
                "total_value": round(new_qty * it.get("unit_price", 0), 2),
                "updated_at": ts,
            }}))
        for i in range(0, len(ops), BATCH):
            await db.items.bulk_write(ops[i:i + BATCH], ordered=False)
        items_affected = len(ops)

    return {
        "total_rows": len(rows) + len([e for e in errors if e.get("row") is not None]),
        "imported": len(docs),
        "skipped": (len(rows) - len(docs)) + len([e for e in errors if e.get("row") is not None]),
        "unknown_item_codes": unknown,
        "errors_sample": errors[:20],
        "stock_applied": apply_to_stock,
        "items_affected": items_affected,
        "negative_stock_clamped": negative_stock_items,
    }


# ---------------------------- Offline Desktop App download ----------------------------

OFFLINE_APP_DIR = ROOT_DIR / "offline_app"


@api_router.get("/download/offline-app")
async def download_offline_app():
    """Package the self-contained offline desktop edition as a ZIP for download."""
    if not OFFLINE_APP_DIR.exists():
        raise HTTPException(status_code=404, detail="Offline app package not found")
    import zipfile
    buf = io.BytesIO()
    top = "PetroChina-GPP-Inventory-Offline"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(OFFLINE_APP_DIR.iterdir()):
            if f.is_file():
                zf.write(f, arcname=f"{top}/{f.name}")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{top}.zip"'},
    )


# ---------------------------- App wiring ----------------------------

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def create_indexes():
    await db.items.create_index([("item_code", ASCENDING)], unique=True)
    await db.items.create_index([("item_type", ASCENDING)])
    await db.items.create_index([("status", ASCENDING)])
    await db.items.create_index([("total_value", DESCENDING)])
    await db.items.create_index([("description", ASCENDING)])
    await db.transactions.create_index([("item_code", ASCENDING), ("date", DESCENDING)])
    await db.transactions.create_index([("date", DESCENDING)])
    await db.transactions.create_index([("direction", ASCENDING)])
    await db.transactions.create_index([("txn_type", ASCENDING)])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
