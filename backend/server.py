"""TonersCart FastAPI backend — Supabase edition.

All persistence (auth, DB, storage) lives in Supabase. This service exposes
a thin /api layer that:
  - Verifies Supabase access tokens (Bearer)
  - Reads/writes Postgres tables via supabase-py service-role client
  - Handles supplier signup → suppliers_pending row + auth user
  - Admin approval flips suppliers_pending → suppliers
  - Hosts the Claude AI chat endpoint (TonerBot)
"""
import os
import re
import uuid
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from supabase_client import sb_admin, sb_anon, get_user_from_token
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / ".env")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tonerscart")

app = FastAPI(title="TonersCart API (Supabase)")
api = APIRouter(prefix="/api")


# ===== Helpers =================================================================

def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def get_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


def require_user(request: Request) -> dict:
    """Returns {"id", "email", "role", ...} from public.users for authenticated requests."""
    token = get_token(request)
    uid, profile = get_user_from_token(token) if token else (None, None)
    if not uid or not profile:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return profile


def require_role(*roles: str):
    def dep(request: Request):
        u = require_user(request)
        if u.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return u
    return dep


# ===== Models ==================================================================

class SignupCustomer(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    phone: Optional[str] = ""
    city: Optional[str] = ""


class SignupSupplier(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    business_name: str
    contact_person: str
    phone: str
    city: str
    gst_number: Optional[str] = ""
    annual_turnover: Optional[str] = ""
    business_address: str


class ListingCreate(BaseModel):
    toner_id: str
    price: float = Field(ge=0)
    stock: int = Field(ge=0)
    toner_type: str  # "Original" | "Compatible"
    image_url: Optional[str] = ""


class ListingUpdate(BaseModel):
    price: Optional[float] = None
    stock: Optional[int] = None
    toner_type: Optional[str] = None
    image_url: Optional[str] = None


class OrderCreate(BaseModel):
    listing_id: str
    qty: int = Field(gt=0)
    customer_name: str
    customer_phone: str
    delivery_address: str
    notes: Optional[str] = ""


class OrderStatusUpdate(BaseModel):
    status: str
    tracking_number: Optional[str] = None


class RejectPayload(BaseModel):
    reason: Optional[str] = ""


# ===== Auth / Profile ==========================================================

@api.post("/auth/signup-customer")
def signup_customer(payload: SignupCustomer):
    """Customer signup — creates Supabase Auth user + public.users row."""
    try:
        created = sb_admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"name": payload.name, "role": "customer"},
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise HTTPException(400, "Email already registered") from e
        raise HTTPException(400, str(e)) from e

    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid,
        "email": payload.email,
        "name": payload.name,
        "role": "customer",
        "phone": payload.phone or None,
        "city": payload.city or None,
    }, on_conflict="id").execute()

    return {"ok": True, "user_id": uid}


@api.post("/auth/signup-supplier")
def signup_supplier(payload: SignupSupplier):
    """Supplier signup — creates auth user, profile (role=supplier), AND a
    suppliers_pending row. The user can sign in but listings are blocked
    until an admin moves their pending row into the suppliers table."""
    try:
        created = sb_admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"name": payload.contact_person, "role": "supplier"},
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise HTTPException(400, "Email already registered") from e
        raise HTTPException(400, str(e)) from e

    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid,
        "email": payload.email,
        "name": payload.contact_person,
        "role": "supplier",
        "phone": payload.phone,
        "company": payload.business_name,
        "city": payload.city,
    }, on_conflict="id").execute()

    sb_admin.table("suppliers_pending").upsert({
        "user_id": uid,
        "business_name": payload.business_name,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "email": payload.email,
        "city": payload.city,
        "gst_number": payload.gst_number or None,
        "annual_turnover": payload.annual_turnover or None,
        "business_address": payload.business_address,
        "status": "pending",
    }, on_conflict="user_id").execute()

    return {"ok": True, "user_id": uid, "status": "pending"}


@api.get("/auth/me")
def me(user: dict = Depends(require_user)):
    """Returns the user profile + (for suppliers) their supplier status."""
    out = dict(user)
    if user.get("role") == "supplier":
        # Approved?
        s = sb_admin.table("suppliers").select("id,business_name,city,approved_at").eq(
            "user_id", user["id"]
        ).maybe_single().execute()
        if s and s.data:
            out["supplier_status"] = "approved"
            out["supplier"] = s.data
        else:
            p = sb_admin.table("suppliers_pending").select(
                "id,business_name,status,rejection_reason,submitted_at"
            ).eq("user_id", user["id"]).maybe_single().execute()
            out["supplier_status"] = (p.data["status"] if p and p.data else "pending")
            out["application"] = p.data if p else None
    return out


# ===== Toner master ============================================================

@api.get("/toner-master")
def toner_master(q: Optional[str] = None, brand: Optional[str] = None, limit: int = 100):
    qry = sb_admin.table("toner_master").select("*").order("brand").order("model_number").limit(limit)
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    return qry.execute().data or []


@api.get("/toner-master/brands")
def toner_master_brands():
    rows = sb_admin.table("toner_master").select("brand").execute().data or []
    return sorted({r["brand"] for r in rows})


# ===== Listings (read for everyone, write for approved suppliers) =============

@api.get("/listings/search")
def search_listings(q: Optional[str] = None, brand: Optional[str] = None,
                    city: Optional[str] = None, toner_type: Optional[str] = None,
                    limit: int = 200):
    qry = sb_admin.table("listings").select(
        "*,suppliers!inner(business_name,city)"
    ).order("price").limit(limit)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if city and city != "all":
        qry = qry.eq("city", city)
    if toner_type and toner_type != "all":
        qry = qry.eq("toner_type", toner_type)
    rows = qry.execute().data or []
    # Flatten
    for r in rows:
        s = r.pop("suppliers", None) or {}
        r["supplier_name"] = s.get("business_name")
        r["supplier_city"] = s.get("city")
    return rows


@api.get("/listings/facets")
def listing_facets():
    rows = sb_admin.table("listings").select("brand,city").execute().data or []
    return {
        "brands": sorted({r["brand"] for r in rows if r.get("brand")}),
        "cities": sorted({r["city"] for r in rows if r.get("city")}),
        "toner_types": ["Original", "Compatible"],
    }


@api.get("/listings/grouped")
def listings_grouped(city: Optional[str] = None, limit: int = 12):
    """Group listings by toner model — used by Landing 'Top in <city>' grid."""
    qry = sb_admin.table("listings").select("brand,model_number,color,price,city")
    if city and city != "all":
        qry = qry.eq("city", city)
    rows = qry.execute().data or []
    grouped = {}
    for r in rows:
        key = r["model_number"]
        g = grouped.setdefault(key, {
            "model_number": key,
            "brand": r["brand"],
            "color": r.get("color") or "Black",
            "min_price": r["price"],
            "supplier_count": 0,
            "cities": set(),
        })
        g["min_price"] = min(g["min_price"], r["price"])
        g["supplier_count"] += 1
        g["cities"].add(r.get("city") or "")
    out = []
    for g in grouped.values():
        g["cities"] = sorted([c for c in g["cities"] if c])
        out.append(g)
    out.sort(key=lambda x: x["supplier_count"], reverse=True)
    return out[:limit]


# ===== Supplier listings =======================================================

def _approved_supplier(user: dict) -> dict:
    """Returns the supplier row for this user; 403 if not approved."""
    s = sb_admin.table("suppliers").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    return s.data


@api.get("/supplier/listings")
def supplier_listings(user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    rows = sb_admin.table("listings").select("*").eq("supplier_id", s["id"]).order(
        "created_at", desc=True
    ).execute().data or []
    return rows


@api.post("/supplier/listings")
def create_listing(payload: ListingCreate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    if payload.toner_type not in ("Original", "Compatible"):
        raise HTTPException(400, "toner_type must be Original or Compatible")
    tm = sb_admin.table("toner_master").select("*").eq("id", payload.toner_id).maybe_single().execute()
    if not tm or not tm.data:
        raise HTTPException(400, "Invalid toner_id")
    t = tm.data
    row = {
        "supplier_id": s["id"],
        "toner_id": t["id"],
        "brand": t["brand"],
        "model_number": t["model_number"],
        "search_norm": t["search_norm"],
        "color": t.get("color") or "Black",
        "toner_type": payload.toner_type,
        "price": payload.price,
        "stock": payload.stock,
        "image_url": payload.image_url or None,
        "city": s["city"],
    }
    res = sb_admin.table("listings").insert(row).execute()
    return res.data[0] if res.data else row


@api.put("/supplier/listings/{listing_id}")
def update_listing(listing_id: str, payload: ListingUpdate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    existing = sb_admin.table("listings").select("supplier_id").eq("id", listing_id).maybe_single().execute()
    if not existing or not existing.data or existing.data["supplier_id"] != s["id"]:
        raise HTTPException(404, "Listing not found")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible"):
        raise HTTPException(400, "toner_type must be Original or Compatible")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb_admin.table("listings").update(upd).eq("id", listing_id).execute()
    return {"ok": True}


@api.delete("/supplier/listings/{listing_id}")
def delete_listing(listing_id: str, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    sb_admin.table("listings").delete().eq("id", listing_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


# ===== Orders ==================================================================

@api.post("/orders")
def create_order(payload: OrderCreate, user: dict = Depends(require_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Only customers can place orders")
    lst = sb_admin.table("listings").select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data
    if payload.qty > (L.get("stock") or 0):
        raise HTTPException(400, "Insufficient stock")
    total = float(L["price"]) * payload.qty
    row = {
        "customer_id": user["id"],
        "supplier_id": L["supplier_id"],
        "listing_id": L["id"],
        "qty": payload.qty,
        "unit_price": L["price"],
        "total": total,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "delivery_address": payload.delivery_address,
        "notes": payload.notes or None,
        "status": "requested",
    }
    res = sb_admin.table("orders").insert(row).execute()
    # Decrement stock (best effort)
    sb_admin.table("listings").update({"stock": L["stock"] - payload.qty}).eq("id", L["id"]).execute()
    return res.data[0] if res.data else row


@api.get("/orders/mine")
def my_orders(user: dict = Depends(require_user)):
    if user["role"] == "customer":
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url),suppliers(business_name,city)").eq("customer_id", user["id"]).order("created_at", desc=True).execute().data or []
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url)").eq("supplier_id", s["id"]).order("created_at", desc=True).execute().data or []
    else:
        rows = sb_admin.table("orders").select("*").order("created_at", desc=True).limit(500).execute().data or []
    return rows


@api.put("/orders/{order_id}/status")
def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(require_user)):
    allowed = {"requested", "accepted", "shipped", "delivered", "rejected", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid status")
    o = sb_admin.table("orders").select("*").eq("id", order_id).maybe_single().execute()
    if not o or not o.data:
        raise HTTPException(404, "Order not found")
    O_row = o.data
    if user["role"] == "customer":
        if O_row["customer_id"] != user["id"] or payload.status != "cancelled":
            raise HTTPException(403, "Customers can only cancel their own orders")
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        if O_row["supplier_id"] != s["id"]:
            raise HTTPException(403, "Not your order")
    upd = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.tracking_number:
        upd["tracking_number"] = payload.tracking_number
    sb_admin.table("orders").update(upd).eq("id", order_id).execute()
    return {"ok": True}


# ===== Admin approval ==========================================================

@api.get("/admin/suppliers/pending")
def admin_pending(user: dict = Depends(require_role("admin"))):
    rows = sb_admin.table("suppliers_pending").select("*").eq("status", "pending").order("submitted_at", desc=True).execute().data or []
    return rows


@api.get("/admin/suppliers")
def admin_suppliers(user: dict = Depends(require_role("admin"))):
    return sb_admin.table("suppliers").select("*").order("approved_at", desc=True).execute().data or []


@api.post("/admin/suppliers/{pending_id}/approve")
def admin_approve(pending_id: str, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    P = p.data
    if P["status"] != "pending":
        raise HTTPException(400, f"Already {P['status']}")
    # Insert into suppliers (idempotent on user_id)
    sb_admin.table("suppliers").upsert({
        "user_id": P["user_id"],
        "business_name": P["business_name"],
        "contact_person": P["contact_person"],
        "phone": P["phone"],
        "email": P["email"],
        "city": P["city"],
        "gst_number": P.get("gst_number"),
        "annual_turnover": P.get("annual_turnover"),
        "business_address": P["business_address"],
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="user_id").execute()
    sb_admin.table("suppliers_pending").update({
        "status": "approved",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    return {"ok": True}


@api.post("/admin/suppliers/{pending_id}/reject")
def admin_reject(pending_id: str, payload: RejectPayload, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("status").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    if p.data["status"] != "pending":
        raise HTTPException(400, f"Already {p.data['status']}")
    sb_admin.table("suppliers_pending").update({
        "status": "rejected",
        "rejection_reason": payload.reason or "Not approved",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    return {"ok": True}


@api.get("/admin/stats")
def admin_stats(user: dict = Depends(require_role("admin"))):
    def cnt(table, **filters):
        q = sb_admin.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0
    return {
        "toner_master": cnt("toner_master"),
        "suppliers_pending": cnt("suppliers_pending", status="pending"),
        "suppliers_approved": cnt("suppliers"),
        "listings": cnt("listings"),
        "orders": cnt("orders"),
    }


# ===== AI Chat (TonerBot) ======================================================

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


CHAT_SYSTEM = (
    "You are TonerBot, a concise expert assistant for TonersCart — India's B2B printer-toner marketplace. "
    "You help buyers identify the right toner cartridge for their printer, explain Original vs Compatible, "
    "estimate page yield expectations, recommend trusted brands (HP, Canon, Brother, Samsung, Ricoh, Epson, Xerox, Kyocera), "
    "and answer bulk-purchase / sourcing questions in the Indian B2B context. "
    "Keep replies short (under 120 words) and practical. When you suggest a toner, mention the model number "
    "(e.g., HP 88A, Canon 925, Brother TN-2365) and ask the buyer to search it on TonersCart. "
    "If the user asks about anything unrelated to printers/toners, politely steer back to toner queries."
)


@api.post("/chat")
async def chat(payload: ChatRequest):
    if not payload.messages:
        raise HTTPException(400, "messages required")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "LLM key not configured")
    session_id = payload.session_id or str(uuid.uuid4())
    try:
        chat_client = LlmChat(
            api_key=api_key, session_id=session_id, system_message=CHAT_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        latest = payload.messages[-1]
        if latest.role != "user":
            raise HTTPException(400, "last message must be from user")
        reply = await chat_client.send_message(UserMessage(text=latest.content))
        return {"reply": str(reply), "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(502, f"Chat unavailable: {e}") from e


@api.get("/")
def root():
    return {"service": "TonersCart API (Supabase)", "ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
