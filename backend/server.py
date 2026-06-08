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
import json
import secrets
import re
import uuid
import asyncio
import logging
import httpx
from pathlib import Path
from typing import List, Optional, Any
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, ValidationError

from supabase_client import sb_admin, sb_anon, get_user_from_token
from email_service import (
    email_application_received,
    email_application_approved,
    email_application_rejected,
    email_mps_inquiry,
    email_order_placed,
    email_featured_applicant_reply,
    email_quotation,
    email_order_shipped,
    email_order_confirmed,
    email_order_delivered_confirm,
    email_order_delivered_support,
    email_dealer_suspended,
    email_dealer_unsuspended,
    email_admin_reply,
    _commission_breakdown,
)
from ai_check import check_documents

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


SIGNED_URL_TTL = 60  # seconds — admin viewing supplier KYC docs

DOC_FIELDS = [
    "doc_brand_authorization",
    "doc_shop_photo",
    "doc_gst",
    "doc_pan",
    "doc_bank_proof",
    "doc_id_proof",
    "doc_address_proof",
]

# Columns that require the bank-details / ID-proof migration. We strip these on
# the fly if the migration has not been run yet, so seller onboarding never breaks.
_BANK_OPT_COLS = (
    "account_holder_name", "account_number", "ifsc_code",
    "bank_name", "bank_branch", "doc_id_proof", "seller_id",
)


def _exec_dropping_cols(builder, payload: dict, optional_cols=_BANK_OPT_COLS):
    """Run a Supabase write; if it fails because an optional column is missing
    (migration not run), drop that column and retry. Returns the response."""
    p = dict(payload)
    for _ in range(len(optional_cols) + 2):
        try:
            return builder(p)
        except Exception as e:
            msg = str(e).lower()
            dropped = False
            for c in optional_cols:
                if c in p and c in msg and any(t in msg for t in ("column", "does not exist", "schema cache", "could not find")):
                    p.pop(c, None)
                    dropped = True
                    break
            if not dropped:
                raise
    return builder(p)


def _generate_seller_id() -> Optional[str]:
    """Next sequential human-readable dealer ID: TC-DLR-{year}-{NNNN}.
    Returns None if the seller_id column hasn't been migrated yet."""
    year = datetime.now(timezone.utc).year
    prefix = f"TC-DLR-{year}-"
    nums = []
    for tbl in ("users", "suppliers"):
        try:
            rows = sb_admin.table(tbl).select("seller_id").like("seller_id", f"{prefix}%").execute().data or []
        except Exception:
            return None  # column not migrated
        for r in rows:
            tail = (r.get("seller_id") or "").rsplit("-", 1)[-1]
            if tail.isdigit():
                nums.append(int(tail))
    nxt = (max(nums) + 1) if nums else 1
    return f"{prefix}{nxt:04d}"


def _signed_doc_urls(application: dict, ttl: int = SIGNED_URL_TTL) -> dict:
    """Build a {field: signed_url} map for whichever doc paths exist in the
    application. Returns empty dict on failure (never raises)."""
    out = {}
    for f in DOC_FIELDS:
        path = application.get(f)
        if not path:
            continue
        try:
            res = sb_admin.storage.from_("supplier-documents").create_signed_url(path, ttl)
            url = res.get("signedURL") or res.get("signed_url") or res.get("signedUrl")
            if url:
                out[f] = url
        except Exception as e:
            logger.warning("sign url failed for %s: %s", path, e)
    return out


async def _run_ai_check(user_id: str, application: dict):
    """Best-effort AI document clarity check. Writes into suppliers_pending.ai_check."""
    docs = {f: application.get(f) for f in DOC_FIELDS if application.get(f)}
    if not docs:
        return
    signed = _signed_doc_urls(application, ttl=120)
    if not signed:
        return
    results = await check_documents(signed)
    sb_admin.table("suppliers_pending").update({"ai_check": results}).eq("user_id", user_id).execute()


# ===== Models ==================================================================

class SignupCustomer(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    phone: Optional[str] = ""
    city: Optional[str] = ""
    user_type: Optional[str] = None  # personal | corporate | dealer | referred_to_procurement


class SellerApplication(BaseModel):
    """Submitted by a logged-in user (any role) to apply to become a seller.
    Does not change users.role — only admin-approval can do that."""
    business_name: str
    contact_person: str
    phone: str
    city: str
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    cities_served: List[str] = Field(default_factory=list)
    gst_number: Optional[str] = ""
    pan_number: Optional[str] = ""
    annual_turnover: Optional[str] = ""
    years_in_business: Optional[int] = None
    business_address: str
    seller_types: List[str] = Field(default_factory=list)
    compatible_brands: List[str] = Field(default_factory=list)
    testing_before_delivery: bool = False
    doc_brand_authorization: Optional[str] = ""
    doc_shop_photo: Optional[str] = ""
    doc_gst: Optional[str] = ""
    doc_pan: Optional[str] = ""
    doc_bank_proof: Optional[str] = ""
    doc_address_proof: Optional[str] = ""
    doc_id_proof: Optional[str] = ""
    account_holder_name: Optional[str] = ""
    account_number: Optional[str] = ""
    ifsc_code: Optional[str] = ""
    bank_name: Optional[str] = ""
    bank_branch: Optional[str] = ""
    agreed_to_terms: bool = False


class SignupSupplier(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    business_name: str
    contact_person: str
    phone: str
    city: str
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    cities_served: List[str] = Field(default_factory=list)
    gst_number: Optional[str] = ""
    pan_number: Optional[str] = ""
    annual_turnover: Optional[str] = ""
    years_in_business: Optional[int] = None
    business_address: str
    seller_types: List[str] = Field(default_factory=list)        # ["Original","Compatible","Refilled"]
    compatible_brands: List[str] = Field(default_factory=list)
    testing_before_delivery: bool = False
    # Storage paths inside supplier-documents bucket (relative paths)
    doc_brand_authorization: Optional[str] = ""
    doc_shop_photo: Optional[str] = ""
    doc_gst: Optional[str] = ""
    doc_pan: Optional[str] = ""
    doc_bank_proof: Optional[str] = ""
    doc_address_proof: Optional[str] = ""
    doc_id_proof: Optional[str] = ""
    account_holder_name: Optional[str] = ""
    account_number: Optional[str] = ""
    ifsc_code: Optional[str] = ""
    bank_name: Optional[str] = ""
    bank_branch: Optional[str] = ""


class ListingVariantIn(BaseModel):
    color: str = Field(min_length=1, max_length=40)
    price: float = Field(gt=0)
    stock: int = Field(ge=0)
    id: Optional[str] = None  # for updates


class ListingCreate(BaseModel):
    # Either a toner_id from catalog, or brand+model_number for a new entry
    toner_id: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    color: Optional[str] = "Black"
    page_yield: Optional[int] = None
    price: float = Field(ge=0)
    stock: int = Field(ge=0)
    toner_type: str  # "Original" | "Compatible" | "Refilled"
    image_url: Optional[str] = ""
    image_urls: List[str] = Field(default_factory=list)
    spec_pdf_url: Optional[str] = None
    variants: List[ListingVariantIn] = Field(default_factory=list)
    # Structured specs (Wave 4 — degrade gracefully when columns missing)
    compatible_models: Optional[str] = None
    oem_part_number: Optional[str] = None
    cartridge_weight: Optional[int] = None
    pack_size: Optional[int] = None
    warranty: Optional[str] = None
    print_technology: Optional[str] = None
    intercity_delivery_charge: Optional[float] = 0
    gst_rate: Optional[int] = 18
    # D2D (Dealer-to-Dealer) marketplace — Wave 10
    d2d_enabled: Optional[bool] = False
    d2d_price: Optional[float] = None


class ListingUpdate(BaseModel):
    price: Optional[float] = None
    stock: Optional[int] = None
    toner_type: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    variants: Optional[List[ListingVariantIn]] = None


class OrderCreate(BaseModel):
    listing_id: str
    listing_kind: Optional[str] = "toner"  # toner | paper | consumable
    qty: int = Field(gt=0)
    customer_name: str
    customer_phone: str
    delivery_address: str
    notes: Optional[str] = ""
    variant_id: Optional[str] = None
    # Structured address (optional — falls back to delivery_address)
    street_address: Optional[str] = None
    area: Optional[str] = None
    order_city: Optional[str] = None
    order_state: Optional[str] = None
    pincode: Optional[str] = None
    delivery_charge: Optional[float] = 0
    # Wave 9 — GST
    gst_rate: Optional[int] = None
    gst_amount: Optional[float] = None


class OrderStatusUpdate(BaseModel):
    status: str
    tracking_number: Optional[str] = None
    courier_name: Optional[str] = None


class RejectPayload(BaseModel):
    reason: Optional[str] = ""


class QuotationRequest(BaseModel):
    listing_id: str
    listing_type: str = "toner"  # "toner" | "printer"
    qty: int = Field(default=1, ge=1)


class FeaturedAppCreate(BaseModel):
    company: str
    contact_person: str
    phone: str
    email: EmailStr
    city: Optional[str] = ""
    pincode: Optional[str] = ""
    business_type: Optional[str] = "dealer"
    description: Optional[str] = ""
    image_path: Optional[str] = None


class FeaturedStatusUpdate(BaseModel):
    status: str  # "new" | "contacted" | "active" | "rejected"


class SupplierFeaturedToggle(BaseModel):
    is_featured: bool


class SpecPdfPath(BaseModel):
    listing_id: str
    listing_type: str = "toner"  # "toner" | "printer"
    spec_pdf_url: str


# ===== Auth / Profile ==========================================================

# --- Auth / profile / onboarding routes moved to routes/auth.py ---
# ===== Toner master ============================================================





# ===== Listings (read for everyone, write for approved suppliers) =============

# ---------------------------------------------------------------------------
# Location helpers — same-city-first ordering for search / browse endpoints.
# ---------------------------------------------------------------------------
_CITY_EQUIV = {
    "bangalore": "bengaluru", "bengaluru": "bengaluru",
    "bombay": "mumbai", "mumbai": "mumbai",
    "calcutta": "kolkata", "kolkata": "kolkata",
    "madras": "chennai", "chennai": "chennai",
    "gurgaon": "gurugram", "gurugram": "gurugram",
    "pondicherry": "puducherry", "puducherry": "puducherry",
}


def _city_key(c: Optional[str]) -> str:
    k = (c or "").strip().lower()
    return _CITY_EQUIV.get(k, k)


def _fmt_validation_error(ve: ValidationError) -> str:
    """Turn a Pydantic ValidationError into a short, dealer-friendly message."""
    parts = []
    for e in ve.errors()[:4]:
        loc = ".".join(str(x) for x in e.get("loc", []) if x != "body") or "field"
        parts.append(f"{loc}: {e.get('msg', 'invalid')}")
    return "; ".join(parts) or "Invalid row"


def _sort_by_near_city(rows: list, near_city: Optional[str]) -> list:
    """Stable partition so listings in the buyer's city come first.
    Preserves the existing within-group order (price / recency)."""
    want = _city_key(near_city)
    if not want or not rows:
        return rows

    def row_city(r):
        return _city_key(r.get("city") or r.get("supplier_city") or "")

    local = [r for r in rows if row_city(r) == want]
    other = [r for r in rows if row_city(r) != want]
    return local + other




# Wave 12 — D2D marketplace aggregator (toners + printers + papers in one fetch).


# Wave 12 — verified-dealer status check (gate for /dealer page).




# =============================================================================
# AI-powered search — Gemini parses a natural-language query into structured
# filters, then runs the existing universal search + price/condition filters.
# Falls back gracefully (ai=False) when no Gemini key is configured, so the
# frontend can keep showing instant keyword results.
# =============================================================================

_AI_SEARCH_INSTRUCTION = (
    "You parse shopping search queries for an Indian marketplace that sells printer "
    "TONERS, PRINTERS, PAPERS and CONSUMABLES (drums/fusers/maintenance kits), plus OEM products. "
    "Given a user's natural-language query, extract structured search filters. "
    "Return STRICT JSON ONLY (no markdown) with exactly these keys: "
    "category (one of 'toner','printer','paper','consumable','oem','any'), "
    "brand (brand name string or null, e.g. HP, Canon, Brother, Epson, Xerox, Ricoh, Kyocera), "
    "model (model/part number string or null), "
    "min_price (integer INR or null), max_price (integer INR or null), "
    "condition (one of 'original','compatible','new','refurbished' or null), "
    "intent (short phrase describing the need), "
    "keywords (a 1-4 word string best for matching a product brand/model in a database), "
    "answer (one helpful sentence, max 160 chars, summarising what you're showing). "
    "Infer category from context (cartridge->toner, office printer->printer, A4 sheets->paper, "
    "drum unit->consumable). Parse prices: 'under 20000'/'below 20k' -> max_price 20000; "
    "'k' = thousand, 'lakh'/'L' = 100000."
)


def _gemini_parse_query(q: str) -> Optional[dict]:
    google_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not google_key:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=google_key)
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=q)])],
            config=types.GenerateContentConfig(
                system_instruction=_AI_SEARCH_INSTRUCTION,
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        raw = (resp.text or "").strip()
        if not raw:
            return None
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception as e:
        logger.warning("Gemini query parse failed: %s", e)
        return None


def _row_price(row: dict, kind: str):
    if kind == "papers":
        return row.get("price_per_ream") or row.get("price")
    return row.get("price")








# ===== Supplier listings =======================================================

def _approved_supplier(user: dict) -> dict:
    """Returns the supplier row for this user; 403 if not approved."""
    s = sb_admin.table("suppliers").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    return s.data








# Wave 11 — Bulk upload of toner listings (CSV / spreadsheet flow).


# ===== Orders ==================================================================

async def _create_direct_order(payload: "OrderCreate", user: dict, kind: str):
    """Order path for direct-purchase products that live outside the `listings`
    table (papers, consumables). Inserts an order with the matching
    {kind}_listing_id + denormalised product columns and decrements stock."""
    table = "paper_listings" if kind == "paper" else "consumable_listings"
    lst = sb_admin.table(table).select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data
    available = int(L.get("stock") or 0)
    if payload.qty > available:
        raise HTTPException(400, "Insufficient stock")
    if kind == "paper":
        unit_price = float(L.get("price_per_ream") or 0)
        brand = L.get("brand")
        model = f"{L.get('size')} · {L.get('gsm')} GSM"
    else:
        unit_price = float(L.get("price") or 0)
        brand = L.get("brand")
        model = L.get("model_number")
    total = unit_price * payload.qty

    row = {
        "customer_id": user["id"],
        "supplier_id": L["supplier_id"],
        "listing_id": None,
        f"{kind}_listing_id": L["id"],
        "product_brand": brand,
        "product_model": model,
        "product_image": L.get("image_url"),
        "qty": payload.qty,
        "unit_price": unit_price,
        "total": total,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "delivery_address": payload.delivery_address,
        "notes": payload.notes or None,
        "status": "requested",
    }
    for k, v in {
        "street_address": payload.street_address,
        "area": payload.area,
        "order_city": payload.order_city,
        "order_state": payload.order_state,
        "pincode": payload.pincode,
        "delivery_charge": (float(payload.delivery_charge) if payload.delivery_charge else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "gst_amount": (float(payload.gst_amount) if payload.gst_amount is not None else None),
    }.items():
        if v is not None and v != "":
            row[k] = v

    res = None
    while True:
        try:
            res = sb_admin.table("orders").insert(row).execute()
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("consumable_listing_id", "paper_listing_id", "product_brand", "product_model",
                      "product_image", "street_address", "area", "order_city", "order_state",
                      "pincode", "delivery_charge", "gst_rate", "gst_amount"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    created = res.data[0] if res and res.data else row
    try:
        sb_admin.table(table).update({"stock": max(0, available - payload.qty)}).eq("id", L["id"]).execute()
    except Exception as e:
        logger.warning("direct order stock decrement failed: %s", e)

    # Confirmation emails (best effort)
    try:
        sup = sb_admin.table("suppliers").select(
            "*"
        ).eq("id", L["supplier_id"]).maybe_single().execute()
        buyer_row = sb_admin.table("users").select("email,name,gst_number").eq("id", user["id"]).maybe_single().execute()
        order_for_email = dict(created)
        order_for_email["buyer_gst_number"] = (buyer_row.data or {}).get("gst_number") if buyer_row else None
        order_for_email["supplier_gst_number"] = (sup.data or {}).get("gst_number") if sup else None
        await email_order_placed(
            order=order_for_email,
            listing={"brand": brand, "model_number": model, "toner_type": kind.title()},
            supplier=(sup.data if sup else {}) or {},
            buyer=(buyer_row.data if buyer_row else {}) or {},
        )
    except Exception:
        logger.exception("direct order confirmation email failed (non-fatal)")
    return created




def _attach_direct_product(rows: list):
    """For direct (paper/consumable) orders the listings join is null — synthesise
    a `listings` dict from the denormalised product_* columns so dashboards render."""
    for r in rows:
        if not r.get("listings") and (r.get("product_brand") or r.get("product_model")):
            r["listings"] = {
                "brand": r.get("product_brand"),
                "model_number": r.get("product_model"),
                "toner_type": "Consumable" if r.get("consumable_listing_id") else "Paper",
                "image_url": r.get("product_image"),
            }
    return rows




def _safe_order_update(order_id: str, upd: dict) -> dict:
    """Apply an orders update, transparently dropping any column that does not
    exist yet so the flow keeps working before the order-tracking migration is run."""
    u = dict(upd)
    protected = {"status", "updated_at"}
    while True:
        try:
            sb_admin.table("orders").update(u).eq("id", order_id).execute()
            return u
        except Exception as e:
            msg = str(e)
            dropped = next((k for k in u if k not in protected and k in msg), None)
            if dropped is None:
                raise
            u.pop(dropped, None)
            logger.warning("orders.update: column '%s' missing — run order-tracking migration", dropped)




# ===== Admin approval ==========================================================

















# ===== Printers + MPS =========================================================

PRINTER_USAGES = {"home", "corporate", "commercial", "print_shop"}
PRINTER_CATEGORIES = {"inkjet", "laser", "tank", "thermal", "production", "digital_press", "label_barcode", "ink", "other"}
PRINTER_CONDITIONS = {"new", "refurbished"}
PRINTER_COLORS = {"color", "bw", "both"}


class PrinterListingCreate(BaseModel):
    brand: str
    model_number: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    image_urls: List[str] = Field(default_factory=list)
    condition: str = "new"
    usage_type: Optional[str] = None
    category: str
    color: str = "color"
    paper_sizes: List[str] = Field(default_factory=list)
    functions: List[str] = Field(default_factory=list)
    connectivity: List[str] = Field(default_factory=list)
    features: List[str] = Field(default_factory=list)
    monthly_volume_min: int = 0
    monthly_volume_max: int = 0
    price: float
    stock: int = 1
    spec_pdf_url: Optional[str] = None
    # Structured specs
    print_speed_ppm: Optional[int] = None
    duty_cycle: Optional[int] = None
    display_type: Optional[str] = None
    dimensions: Optional[str] = None
    weight_kg: Optional[float] = None
    printer_warranty: Optional[str] = None
    max_resolution: Optional[str] = None
    mobile_printing: List[str] = Field(default_factory=list)
    monthly_volume_recommended: Optional[int] = None
    intercity_delivery_charge: Optional[float] = 0
    gst_rate: Optional[int] = 18
    # Wave 9: multi-select usage + special features
    usage_types: List[str] = Field(default_factory=list)
    special_features: List[str] = Field(default_factory=list)
    # Wave 10 — D2D marketplace
    d2d_enabled: Optional[bool] = False
    d2d_price: Optional[float] = None


def _supplier_id_for(user: dict) -> str:
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Only approved sellers can manage printers")
    return s.data["id"]


















class MPSInquiry(BaseModel):
    # Generic enquiry envelope. Used by MPS, Buy-Bulk, OEM Application,
    # Featured-application, and lightweight interest captures
    # (Consumables / Scanners "Notify me"). Phone / estimated_printers
    # are optional so simple email-only captures work.
    name: Optional[str] = ""
    email: EmailStr
    phone: Optional[str] = ""
    description: Optional[str] = ""
    estimated_printers: Optional[str] = "—"
    selections: Optional[dict] = None




# ===== Featured Supplier — applications + admin + landing =====================





class FeaturedFromApplication(BaseModel):
    application_id: str
    supplier_id: str


_FEATURED_CACHE: dict = {}
_FEATURED_TTL_SECS = 120














# ===== Brochure (spec PDF) upload + signed download ===========================





# ===== Quotation ===============================================================

def _gen_quote_number() -> str:
    """Format: TC-YYYYMMDD-XXXXX (5-char alphanumeric suffix)."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:5].upper()
    return f"TC-{today}-{suffix}"








# ===== AI Chat (TonerBot) ======================================================

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


CHAT_SYSTEM = (
    "You are TonerBot, a concise expert assistant for TonersCart — India's printer, toner & supplies marketplace for offices and homes. "
    "You help buyers identify the right toner cartridge for their printer, explain Original vs Compatible, "
    "estimate page yield expectations, recommend trusted brands (HP, Canon, Brother, Samsung, Ricoh, Epson, Xerox, Kyocera), "
    "and answer bulk-purchase / sourcing questions in the Indian context. "
    "Keep replies short (under 120 words) and practical. When you suggest a toner, mention the model number "
    "(e.g., HP 88A, Canon 925, Brother TN-2365) and ask the buyer to search it on TonersCart. "
    "If the user asks about anything unrelated to printers/toners, politely steer back to toner queries."
)




# =============================================================================
# Admin v2 — analytics, dealer mgmt, order mgmt, site config
# =============================================================================

from collections import Counter, defaultdict  # noqa: E402
import csv  # noqa: E402
import io  # noqa: E402
from datetime import timedelta as _td  # noqa: E402


def _safe_int(n):
    try:
        return int(n)
    except Exception:
        return 0


def _supplier_is_suspended(sid: str, suspended_ids: set) -> bool:
    return sid in suspended_ids




# ---------- Dealer management ----------



class SupplierNotes(BaseModel):
    admin_notes: str = ""




class SupplierEdit(BaseModel):
    business_name: Optional[str] = None
    city: Optional[str] = None




def _set_suspended(supplier_id: str, value: bool):
    try:
        sb_admin.table("suppliers").update({"is_suspended": value}).eq("id", supplier_id).execute()
    except Exception as e:
        if "is_suspended" in str(e):
            raise HTTPException(503, "is_suspended column not yet migrated — run supabase_schema_admin_v2.sql") from e
        raise










# ---------- Order management ----------





# ---------- Site config (popular_chips, marquee_brands) ----------

# Defaults used when no row exists yet — also returned by the public GET so the
# frontend never has to ship its own hardcoded fallback.
_CONFIG_DEFAULTS = {
    "popular_chips": [
        {"label": "HP 88A",        "query": "HP 88A"},
        {"label": "Canon 337",     "query": "Canon 337"},
        {"label": "Brother TN-2365", "query": "TN-2365"},
        {"label": "Xerox 3020",    "query": "Xerox 3020"},
    ],
    "marquee_brands": [
        {"name": "HP",      "color": "#0096D6"},
        {"name": "Canon",   "color": "#CC0000"},
        {"name": "Brother", "color": "#2D3192"},
        {"name": "Epson",   "color": "#003399"},
        {"name": "Ricoh",   "color": "#D71921"},
        {"name": "Xerox",   "color": "#000000"},
        {"name": "Kyocera", "color": "#C00000"},
        {"name": "Samsung", "color": "#1428A0"},
    ],
}




class ConfigPayload(BaseModel):
    value: Any




# ---------- Stats overlay for landing (real numbers, no auth) ----------








# =============================================================================
# Wave 3 — Finance, Papers, Pagination, Image compression, Rate limit, Sanitize
# =============================================================================

import re as _re  # noqa: E402
import time as _time  # noqa: E402
from io import BytesIO  # noqa: E402
from collections import defaultdict as _dd  # noqa: E402


# ---------- Input sanitizer ----------
_HTML_TAG_RX = _re.compile(r"<[^>]+>")
def sanitize(s: Optional[str], max_len: int = 2000) -> str:
    if s is None:
        return ""
    s = _HTML_TAG_RX.sub("", str(s)).strip()
    return s[:max_len]


# ---------- Pillow image compression ----------
def compress_image(content: bytes, *, max_side: int = 1200, quality: int = 85) -> bytes:
    """Resize an image so the longest side ≤ max_side and re-encode as JPEG 85%.
    Returns original bytes if Pillow can't handle the format (svg, etc.)."""
    try:
        from PIL import Image  # noqa: WPS433
        im = Image.open(BytesIO(content))
        im.load()
        if im.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
            im = bg
        else:
            im = im.convert("RGB")
        w, h = im.size
        scale = max(w, h) / max_side
        if scale > 1:
            im = im.resize((int(w / scale), int(h / scale)), Image.LANCZOS)
        out = BytesIO()
        im.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception as e:
        logger.debug("compress_image fallback (returning original): %s", e)
        return content


# ---------- In-memory rate limiter ----------
_RATE_BUCKETS: dict = _dd(list)
_RATE_RULES = {
    "/api/quotation":               (5, 3600),
    "/api/mps/inquiry":             (10, 3600),
    "/api/featured/apply":          (3, 3600),
    "/api/chat":                    (30, 3600),
    "/api/auth/signup-customer":    (10, 3600),
    "/api/auth/signup-supplier":    (5, 3600),
}


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return (req.client.host if req.client else "anon") or "anon"


@app.middleware("http")
async def _rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    rule = _RATE_RULES.get(path)
    if rule and request.method == "POST":
        limit, window = rule
        ip = _client_ip(request)
        now = _time.time()
        key = f"{ip}:{path}"
        bucket = [t for t in _RATE_BUCKETS[key] if now - t < window]
        if len(bucket) >= limit:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                {"detail": "Too many requests. Please try again in an hour."},
                status_code=429,
            )
        bucket.append(now)
        _RATE_BUCKETS[key] = bucket
    return await call_next(request)


# =============================================================================
# Finance — admin views + dealer self-view
# =============================================================================

def _orders_with_listings(supplier_id: Optional[str] = None, limit: int = 10000):
    qry = sb_admin.table("orders").select(
        "*,listings(brand,model_number,toner_type)"
    ).order("created_at", desc=True)
    if supplier_id:
        qry = qry.eq("supplier_id", supplier_id)
    rows = qry.limit(limit).execute().data or []
    for r in rows:
        L = r.pop("listings", None) or {}
        r["brand"] = L.get("brand")
        r["model_number"] = L.get("model_number")
        r["toner_type"] = L.get("toner_type")
    return rows










# ===== Admin activity log =====================================================

def _log_admin_action(admin: dict, action: str, entity_type: str = None,
                      entity_id=None, details: dict = None):
    """Best-effort admin audit log. Never raises (no-op if table missing)."""
    try:
        sb_admin.table("admin_activity_log").insert({
            "admin_id": admin.get("id"),
            "admin_email": admin.get("email"),
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id is not None else None,
            "details": details or {},
        }).execute()
    except Exception as e:
        logger.info("admin_activity_log skipped: %s", str(e)[:120])




# ===== Admin customers ========================================================





# ===== Admin finance — procurement dues =======================================



# ===== Admin order disputes ===================================================

_DISPUTE_COLS = ["is_flagged", "dispute_status", "dispute_notes", "flagged_at", "flagged_by"]


def _update_order_dispute_cols(order_id: str, upd: dict):
    """Update dispute columns, dropping any that aren't migrated yet.
    Raises 503 if NONE of the dispute columns exist."""
    p = dict(upd)
    for _ in range(len(_DISPUTE_COLS) + 2):
        if not p:
            raise HTTPException(503, "Dispute columns not migrated — run supabase_schema_admin_extras.sql")
        try:
            sb_admin.table("orders").update(p).eq("id", order_id).execute()
            return
        except Exception as e:
            msg = str(e).lower()
            dropped = False
            for c in _DISPUTE_COLS:
                if c in p and c in msg:
                    p.pop(c, None)
                    dropped = True
                    break
            if not dropped:
                raise
    raise HTTPException(503, "Dispute columns not migrated — run supabase_schema_admin_extras.sql")


class OrderFlag(BaseModel):
    flag: bool = True




class DisputeUpdate(BaseModel):
    dispute_status: Optional[str] = None  # open | investigating | resolved
    dispute_notes: Optional[str] = None






# ===== Admin messages (contact-form submissions) ==============================



class MessageRead(BaseModel):
    is_read: bool = True




class MessageReply(BaseModel):
    subject: str = Field(min_length=1)
    message: str = Field(min_length=1)







# =============================================================================
# Papers — buyer feed + supplier CRUD
# =============================================================================

class PaperCreate(BaseModel):
    brand: str = Field(min_length=1, max_length=80)
    size: str  # "A4" | "A3" | "A5" | "Letter"
    gsm: int = Field(ge=40, le=400)
    reams_per_box: int = Field(ge=1, le=200, default=10)
    price_per_ream: float = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    city: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    # Structured specs
    brightness: Optional[int] = None
    thickness_microns: Optional[int] = None
    acid_free: Optional[bool] = None
    suitable_for: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    intercity_delivery_charge: Optional[float] = 0
    gst_rate: Optional[int] = 18
    # Wave 10 — D2D marketplace
    d2d_enabled: Optional[bool] = False
    d2d_price: Optional[float] = None












# =============================================================================
# Consumables (ink cartridges, drums, fusers, maintenance kits, etc.) — Wave 19
# =============================================================================

CONSUMABLE_SUBCATEGORIES = {
    "Ink Cartridges", "Drums", "Fusers", "Maintenance Kits",
    "Staple Cartridges", "Transfer Belts", "Other",
}


class ConsumableCreate(BaseModel):
    subcategory: str
    subcategory_other: Optional[str] = None
    brand: str = Field(min_length=1, max_length=80)
    model_number: str = Field(min_length=1, max_length=80)
    compatible_models: Optional[str] = None
    condition: Optional[str] = "New"   # New | Refurbished | Compatible
    price: float = Field(gt=0)
    gst_rate: Optional[int] = 18
    stock: int = Field(ge=0, default=0)
    description: Optional[str] = None
    city: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    intercity_delivery_charge: Optional[float] = 0
    d2d_enabled: Optional[bool] = False
    d2d_price: Optional[float] = None


def _consumable_supplier(user: dict) -> dict:
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list consumables")
    s = sb_admin.table("suppliers").select("id,city").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    return s.data








class ConsumablePatch(BaseModel):
    subcategory: Optional[str] = None
    subcategory_other: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    compatible_models: Optional[str] = None
    condition: Optional[str] = None
    price: Optional[float] = None
    gst_rate: Optional[int] = None
    stock: Optional[int] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    intercity_delivery_charge: Optional[float] = None
    d2d_enabled: Optional[bool] = None
    d2d_price: Optional[float] = None












# =============================================================================
# Listing view analytics (location-based dealer insights) — Wave 15
# =============================================================================

class ListingViewPing(BaseModel):
    kind: Optional[str] = "toner"   # toner | printer | paper
    city: Optional[str] = None






# =============================================================================
# Paginated search (additive)
# =============================================================================



# =============================================================================
# Bulk stock + Duplicate listing endpoints
# =============================================================================

class ListingPatch(BaseModel):
    # Toner fields
    stock: Optional[int] = None
    price: Optional[float] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    color: Optional[str] = None
    toner_type: Optional[str] = None
    page_yield: Optional[int] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    compatible_models: Optional[str] = None
    oem_part_number: Optional[str] = None
    cartridge_weight: Optional[int] = None
    warranty: Optional[str] = None
    print_technology: Optional[str] = None
    intercity_delivery_charge: Optional[float] = None
    # Printer-specific
    description: Optional[str] = None
    usage_type: Optional[str] = None
    category: Optional[str] = None
    functions: Optional[List[str]] = None
    monthly_volume_min: Optional[int] = None
    monthly_volume_max: Optional[int] = None
    monthly_volume_recommended: Optional[int] = None
    print_speed_ppm: Optional[int] = None
    duty_cycle: Optional[int] = None
    connectivity: Optional[List[str]] = None
    paper_sizes: Optional[List[str]] = None
    mobile_printing: Optional[List[str]] = None
    max_resolution: Optional[str] = None
    condition: Optional[str] = None
    # Paper-specific
    size: Optional[str] = None
    gsm: Optional[int] = None
    brightness: Optional[int] = None
    thickness_microns: Optional[float] = None
    acid_free: Optional[bool] = None
    suitable_for: Optional[List[str]] = None
    reams_per_box: Optional[int] = None
    price_per_ream: Optional[float] = None
    # Wave 9 — GST + printer multi-select
    gst_rate: Optional[int] = None
    usage_types: Optional[List[str]] = None
    special_features: Optional[List[str]] = None
    # Wave 10 — D2D marketplace
    d2d_enabled: Optional[bool] = None
    d2d_price: Optional[float] = None












# =============================================================================
# Listing existence check (for buyer one-click reorder)
# =============================================================================











# =============================================================================
# Sitemap + robots
# =============================================================================

_SITEMAP_CITIES = ["Bangalore", "Mumbai", "Delhi", "Chennai", "Hyderabad",
                    "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Surat"]


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    txt = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /admin\n"
        "Sitemap: https://www.tonerscart.com/sitemap.xml\n"
    )
    return Response(content=txt, media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    base = "https://www.tonerscart.com"
    static = [
        ("/", "1.0"),
        ("/search", "0.9"),
        ("/printers", "0.9"),
        ("/papers", "0.9"),
        ("/mps", "0.8"),
        ("/sell", "0.8"),
        ("/get-featured", "0.8"),
        ("/terms", "0.4"),
        ("/privacy", "0.4"),
        ("/contact", "0.6"),
    ]
    today = datetime.now(timezone.utc).date().isoformat()
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, prio in static:
        parts.append(f"<url><loc>{base}{path}</loc><lastmod>{today}</lastmod><priority>{prio}</priority></url>")
    for c in _SITEMAP_CITIES:
        parts.append(f"<url><loc>{base}/search?city={c}</loc><lastmod>{today}</lastmod><priority>0.7</priority></url>")
        parts.append(f"<url><loc>{base}/printers?city={c}</loc><lastmod>{today}</lastmod><priority>0.7</priority></url>")
    parts.append("</urlset>")
    return Response(content="\n".join(parts), media_type="application/xml")


# =============================================================================
# Password reset trigger (Supabase Auth)
# =============================================================================

# --- Password-reset route moved to routes/auth.py ---
# CORS sentinel — see end of file for the actual middleware install.

def _generate_order_number() -> Optional[str]:
    year = datetime.now(timezone.utc).year
    try:
        # Find the highest existing order_number for the year
        res = sb_admin.table("orders").select("order_number").like("order_number", f"TC-{year}-%").order(
            "order_number", desc=True
        ).limit(1).execute()
        rows = res.data or []
        if rows and rows[0].get("order_number"):
            last = rows[0]["order_number"]
            try:
                n = int(last.split("-")[-1]) + 1
            except Exception:
                n = 1
        else:
            n = 1
        return f"TC-{year}-{n:06d}"
    except Exception as e:
        if "order_number" in str(e):
            logger.warning("order_number column missing — run supabase_schema_v3.sql")
            return None
        logger.warning("order_number generation failed: %s", e)
        return None


# =============================================================================
# Visitor analytics — anonymous page_views
# =============================================================================

class PageView(BaseModel):
    page: str = Field(min_length=1, max_length=512)
    timezone: Optional[str] = Field(default=None, max_length=80)
    device_type: Optional[str] = Field(default="desktop", max_length=20)
    referrer: Optional[str] = Field(default=None, max_length=200)


@app.post("/api/analytics/pageview", include_in_schema=False)
async def record_pageview(payload: PageView, request: Request):
    """Anonymous page view tracking — fire-and-forget. Returns 200 immediately
    even when the page_views table has not been migrated yet."""
    try:
        # Categorise referrer
        ref = (payload.referrer or "").lower()
        if not ref:
            ref_cat = "Direct"
        elif "google" in ref:
            ref_cat = "Google"
        elif "whatsapp" in ref or "wa.me" in ref:
            ref_cat = "WhatsApp"
        elif "instagram" in ref or "instagr.am" in ref:
            ref_cat = "Instagram"
        elif "facebook" in ref or "fb.com" in ref:
            ref_cat = "Facebook"
        else:
            ref_cat = "Other"

        ip = None
        try:
            ip = request.client.host if request.client else None
            xff = request.headers.get("x-forwarded-for")
            if xff:
                ip = xff.split(",")[0].strip()
        except Exception:
            pass

        sb_admin.table("page_views").insert({
            "page": (payload.page or "/")[:512],
            "timezone": (payload.timezone or "")[:80],
            "device_type": (payload.device_type or "desktop")[:20],
            "referrer": ref_cat,
            "ip_hash": (str(hash((ip or "") + datetime.now(timezone.utc).strftime("%Y-%m-%d"))) if ip else None),
        }).execute()
    except Exception as e:
        if "page_views" not in str(e):
            logger.warning("pageview insert failed: %s", e)
    return {"ok": True}




# =============================================================================
# Featured supplier — admin image upload endpoint (matched to FE)
# =============================================================================



# =============================================================================
# Unified landing-data endpoint with in-memory cache (5 min TTL)
# =============================================================================

_LANDING_CACHE: dict = {"data": None, "ts": 0.0}
_LANDING_TTL_SECS = 300




def _bust_landing_cache():
    _LANDING_CACHE["data"] = None
    _LANDING_CACHE["ts"] = 0.0


# ===== Background scheduler: auto-confirm delivered orders after 5 days ========
from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: E402

_scheduler = None


async def _auto_confirm_delivered_orders():
    """If a buyer doesn't confirm receipt within 5 days of the dealer marking an
    order Delivered, auto-confirm it → Completed and start the 5-day payout timer.
    Protects dealers from unresponsive customers."""
    try:
        cutoff = (datetime.now(timezone.utc) - _td(days=5)).isoformat()
        try:
            rows = sb_admin.table("orders").select("*").eq("status", "delivered").lte("delivered_at", cutoff).execute().data or []
        except Exception as e:
            logger.debug("auto-confirm skipped (delivered_at not migrated?): %s", e)
            return
        for O_row in rows:
            now = datetime.now(timezone.utc)
            _safe_order_update(O_row["id"], {
                "status": "completed",
                "updated_at": now.isoformat(),
                "completed_at": now.isoformat(),
                "payout_eligible_at": (now + _td(days=5)).isoformat(),
                "auto_confirmed": True,
            })
            try:
                listing = sb_admin.table("listings").select("brand,model_number").eq("id", O_row["listing_id"]).maybe_single().execute().data or {}
                supplier = sb_admin.table("suppliers").select("business_name").eq("id", O_row["supplier_id"]).maybe_single().execute().data or {}
                buyer = sb_admin.table("users").select("email,name").eq("id", O_row["customer_id"]).maybe_single().execute().data or {}
                await email_order_delivered_support({**O_row, "auto_confirmed": True}, listing, supplier, buyer)
            except Exception as e:
                logger.warning("auto-confirm email failed for %s: %s", O_row.get("id"), e)
            logger.info("auto-confirmed order %s (no buyer confirmation in 5 days)", O_row.get("id"))
    except Exception:
        logger.exception("auto-confirm job crashed")


@app.on_event("startup")
async def _start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _auto_confirm_delivered_orders, "interval", minutes=30,
        id="auto_confirm_delivered", replace_existing=True,
        next_run_time=datetime.now(timezone.utc) + _td(seconds=60),
    )
    _scheduler.start()
    logger.info("APScheduler started — auto-confirm delivered orders every 30 min")


app.include_router(api)

from routes.auth import router as auth_router  # noqa: E402
app.include_router(auth_router)
from routes.search import router as search_router  # noqa: E402
app.include_router(search_router)
from routes.products import router as products_router  # noqa: E402
app.include_router(products_router)
from routes.orders import router as orders_router  # noqa: E402
app.include_router(orders_router)
from routes.admin import router as admin_router  # noqa: E402
app.include_router(admin_router)
from routes.suppliers import router as suppliers_router  # noqa: E402
app.include_router(suppliers_router)

# Procurement module (Govt & Corporate) — self-contained, separate from the
# regular Supabase-Auth customer/dealer/admin flow.
from procurement import proc_router, proc_admin_router  # noqa: E402
app.include_router(proc_router)
app.include_router(proc_admin_router)

# OEM (manufacturer) showcase module — reuses Supabase Auth (role=oem).
from oem import oem_router, oem_admin_router  # noqa: E402
app.include_router(oem_router)
app.include_router(oem_admin_router)

# User agreement acceptance tracking.
from agreements import agreements_router, agreements_admin_router  # noqa: E402
app.include_router(agreements_router)
app.include_router(agreements_admin_router)


# CORS — explicit origin list (browsers reject the wildcard "*" combined with allow_credentials=True,
# which silently strips the Access-Control-Allow-Origin header on the response).
_default_origins = [
    "https://www.tonerscart.com",
    "https://tonerscart.com",
    "https://printer-supply-hub.preview.emergentagent.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_env_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
_allowed_origins = sorted(set(_default_origins + _env_origins))
logger.info("CORS allowed origins: %s", _allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    # Also allow Vercel/Railway preview subdomains and any *.tonerscart.com host
    allow_origin_regex=r"^https://([a-z0-9-]+\.)?tonerscart\.com$|^https://[a-z0-9-]+\.preview\.emergentagent\.com$",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)
