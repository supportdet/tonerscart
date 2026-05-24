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
import asyncio
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from supabase_client import sb_admin, sb_anon, get_user_from_token
from email_service import (
    email_application_received,
    email_application_approved,
    email_application_rejected,
    email_mps_inquiry,
    email_order_placed,
    email_featured_applicant_reply,
    email_quotation,
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
    "doc_address_proof",
]


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
    spec_pdf_url: Optional[str] = None


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


class FeaturedStatusUpdate(BaseModel):
    status: str  # "new" | "contacted" | "active" | "rejected"


class SupplierFeaturedToggle(BaseModel):
    is_featured: bool


class SpecPdfPath(BaseModel):
    listing_id: str
    listing_type: str = "toner"  # "toner" | "printer"
    spec_pdf_url: str


# ===== Auth / Profile ==========================================================

@api.post("/auth/oauth-bootstrap")
def oauth_bootstrap(payload: dict, request: Request):
    """Called after a Google OAuth redirect lands. Creates the public.users
    profile row if missing. Default role = customer."""
    token = get_token(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        uid_resp = sb_anon.auth.get_user(token)
    except Exception:
        uid_resp = None
    if not uid_resp or not uid_resp.user:
        raise HTTPException(401, "Not authenticated")
    user = uid_resp.user
    uid = user.id
    existing = sb_admin.table("users").select("id,role").eq("id", uid).maybe_single().execute()
    if existing and existing.data:
        return {"ok": True, "role": existing.data["role"], "created": False}
    intended = (payload or {}).get("role") if isinstance(payload, dict) else None
    role = intended if intended in ("customer", "supplier") else "customer"
    name = (user.user_metadata or {}).get("full_name") or (user.user_metadata or {}).get("name") or (user.email or "").split("@")[0]
    sb_admin.table("users").insert({
        "id": uid,
        "email": user.email,
        "name": name,
        "role": role,
    }).execute()
    return {"ok": True, "role": role, "created": True}


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
async def signup_supplier(payload: SignupSupplier):
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

    application = {
        "user_id": uid,
        "business_name": payload.business_name,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "email": payload.email,
        "city": payload.city,
        "state": payload.state or None,
        "pincode": payload.pincode or None,
        "cities_served": payload.cities_served or [],
        "gst_number": payload.gst_number or None,
        "pan_number": payload.pan_number or None,
        "annual_turnover": payload.annual_turnover or None,
        "years_in_business": payload.years_in_business,
        "business_address": payload.business_address,
        "seller_types": payload.seller_types or [],
        "compatible_brands": payload.compatible_brands or [],
        "testing_before_delivery": payload.testing_before_delivery,
        "doc_brand_authorization": payload.doc_brand_authorization or None,
        "doc_shop_photo": payload.doc_shop_photo or None,
        "doc_gst": payload.doc_gst or None,
        "doc_pan": payload.doc_pan or None,
        "doc_bank_proof": payload.doc_bank_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "status": "pending",
    }
    sb_admin.table("suppliers_pending").upsert(application, on_conflict="user_id").execute()

    # Fire-and-forget AI document check (best effort) + email notifications
    try:
        await _run_ai_check(uid, application)
    except Exception as e:
        logger.warning("AI check skipped: %s", e)

    try:
        await email_application_received(application)
    except Exception as e:
        logger.warning("application email skipped: %s", e)

    return {"ok": True, "user_id": uid, "status": "pending"}


class SupplierDocPaths(BaseModel):
    doc_brand_authorization: Optional[str] = None
    doc_shop_photo: Optional[str] = None
    doc_gst: Optional[str] = None
    doc_pan: Optional[str] = None
    doc_bank_proof: Optional[str] = None
    doc_address_proof: Optional[str] = None


@api.post("/auth/apply-seller")
async def apply_seller(payload: SellerApplication, user: dict = Depends(require_user)):
    """Logged-in user submits an application to become a seller.
    users.role is NOT changed — only admin approval flips it to 'supplier'."""
    if user.get("role") == "supplier":
        raise HTTPException(400, "You are already a seller")
    if user.get("role") == "admin":
        raise HTTPException(400, "Admins cannot apply as sellers")

    application = {
        "user_id": user["id"],
        "business_name": payload.business_name,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "email": user.get("email"),
        "city": payload.city,
        "state": payload.state or None,
        "pincode": payload.pincode or None,
        "cities_served": payload.cities_served or [],
        "gst_number": payload.gst_number or None,
        "pan_number": payload.pan_number or None,
        "annual_turnover": payload.annual_turnover or None,
        "years_in_business": payload.years_in_business,
        "business_address": payload.business_address,
        "seller_types": payload.seller_types or [],
        "compatible_brands": payload.compatible_brands or [],
        "testing_before_delivery": payload.testing_before_delivery,
        "doc_brand_authorization": payload.doc_brand_authorization or None,
        "doc_shop_photo": payload.doc_shop_photo or None,
        "doc_gst": payload.doc_gst or None,
        "doc_pan": payload.doc_pan or None,
        "doc_bank_proof": payload.doc_bank_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "status": "pending",
        "rejection_reason": None,
    }
    sb_admin.table("suppliers_pending").upsert(application, on_conflict="user_id").execute()

    async def _bg_ai():
        try:
            await _run_ai_check(user["id"], application)
        except Exception as e:
            logger.warning("background AI check (apply) skipped: %s", e)
    asyncio.create_task(_bg_ai())

    try:
        await email_application_received(application)
    except Exception as e:
        logger.warning("application email skipped: %s", e)

    return {"ok": True, "status": "pending"}


@api.post("/auth/supplier-documents")
async def supplier_documents_patch(payload: SupplierDocPaths, user: dict = Depends(require_user)):
    """Called by the supplier client after files are uploaded to
    supplier-documents/<uid>/... — saves paths and queues the AI check in the background
    so the client gets an immediate response."""
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v}
    if not upd:
        return {"ok": True}
    sb_admin.table("suppliers_pending").update(upd).eq("user_id", user["id"]).execute()
    p = sb_admin.table("suppliers_pending").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if p and p.data:
        async def _bg_ai():
            try:
                await _run_ai_check(user["id"], p.data)
            except Exception as e:
                logger.warning("background AI check skipped: %s", e)
        asyncio.create_task(_bg_ai())
    return {"ok": True}


@api.post("/auth/supplier-document-upload")
async def supplier_document_upload(
    field: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    """Upload one supplier KYC document via the backend (service role) —
    bypasses storage RLS so an applicant (still role=customer) can submit.
    Returns the storage path which the client then sends to /auth/supplier-documents."""
    allowed = {
        "doc_brand_authorization", "doc_shop_photo", "doc_gst",
        "doc_pan", "doc_bank_proof", "doc_address_proof",
    }
    if field not in allowed:
        raise HTTPException(400, "Invalid document field")
    if not file.content_type or not (file.content_type.startswith("image/") or file.content_type == "application/pdf"):
        raise HTTPException(400, "Only images and PDF are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin").lower()
    path = f"{user['id']}/{field}-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("supplier doc upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"path": path, "field": field}


@api.post("/supplier/business-logo")
async def supplier_business_logo_upload(
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    """Approved supplier uploads/replaces their business logo.
    Stored in the private `supplier-documents` bucket and the path is
    persisted on `suppliers.business_logo`. Returns a short-lived signed
    URL the client can immediately preview."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved suppliers can upload a logo")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Logo must be an image (PNG / JPG / WEBP)")
    content = await file.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(400, "Logo must be under 3 MB")

    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "png").lower()
    path = f"{user['id']}/business-logo-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("business logo upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e

    sb_admin.table("suppliers").update({"business_logo": path}).eq("user_id", user["id"]).execute()

    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
        signed_url = signed.get("signedURL")
    except Exception:
        signed_url = None
    return {"path": path, "url": signed_url}


@api.get("/supplier/business-logo")
def supplier_business_logo_get(user: dict = Depends(require_user)):
    """Returns the supplier's current logo path + a fresh signed URL."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved suppliers can read their logo")
    s = sb_admin.table("suppliers").select("business_logo").eq(
        "user_id", user["id"]
    ).maybe_single().execute()
    path = (s.data or {}).get("business_logo") if s else None
    if not path:
        return {"path": None, "url": None}
    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
        return {"path": path, "url": signed.get("signedURL")}
    except Exception:
        return {"path": path, "url": None}


@api.get("/auth/me")
def me(user: dict = Depends(require_user)):
    """Returns the user profile + application status if any.
    Roles: 'admin' | 'supplier' (= seller) | 'customer' (= buyer).
    application_status: 'pending' | 'rejected' | None — derived from suppliers_pending."""
    out = dict(user)
    # Buyer GSTIN (optional, used for B2B invoicing on orders)
    try:
        u = sb_admin.table("users").select("gst_number").eq("id", user["id"]).maybe_single().execute()
        out["gst_number"] = (u.data or {}).get("gst_number") if u else None
    except Exception:
        out["gst_number"] = None
    # Approved supplier?
    if user.get("role") == "supplier":
        s = sb_admin.table("suppliers").select(
            "id,business_name,city,approved_at,business_logo"
        ).eq("user_id", user["id"]).maybe_single().execute()
        if s and s.data:
            out["supplier_status"] = "approved"
            out["application_status"] = None
            sd = dict(s.data)
            logo_path = sd.get("business_logo")
            if logo_path:
                try:
                    sd["business_logo_url"] = sb_admin.storage.from_(
                        "supplier-documents"
                    ).create_signed_url(logo_path, 60 * 60)["signedURL"]
                except Exception:
                    sd["business_logo_url"] = None
            else:
                sd["business_logo_url"] = None
            out["supplier"] = sd
            return out
        # Edge case: role=supplier but no row in suppliers (shouldn't normally happen)
        out["supplier_status"] = "pending"
        out["application_status"] = "pending"
        return out

    # For non-suppliers, look up any pending/rejected application
    p = sb_admin.table("suppliers_pending").select(
        "id,business_name,status,rejection_reason,submitted_at"
    ).eq("user_id", user["id"]).maybe_single().execute()
    if p and p.data:
        out["application_status"] = p.data["status"]  # pending | approved | rejected
        out["application"] = p.data
    else:
        out["application_status"] = None
    return out


class ProfileUpdate(BaseModel):
    gst_number: Optional[str] = None


_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@api.patch("/auth/me")
def update_me(payload: ProfileUpdate, user: dict = Depends(require_user)):
    """Buyer can save an optional GST number for B2B invoicing.
    Pass an empty string to clear. Format is validated server-side."""
    updates: dict = {}
    if payload.gst_number is not None:
        v = (payload.gst_number or "").strip().upper()
        if v and not _GSTIN_RE.match(v):
            raise HTTPException(400, "Invalid GSTIN — must be 15 alphanumeric chars (e.g. 22AAAAA0000A1Z5)")
        updates["gst_number"] = v or None
    if not updates:
        return {"ok": True, "updated": []}
    sb_admin.table("users").update(updates).eq("id", user["id"]).execute()
    return {"ok": True, "updated": list(updates.keys()), **updates}


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
        "toner_types": ["Original", "Compatible", "Refilled"],
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
    if payload.toner_type not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")

    # Resolve toner_master row: use toner_id if given, else find/create by (brand, model)
    t = None
    if payload.toner_id:
        tm = sb_admin.table("toner_master").select("*").eq("id", payload.toner_id).maybe_single().execute()
        t = tm.data if tm and tm.data else None
    if not t:
        if not (payload.brand and payload.model_number):
            raise HTTPException(400, "Provide toner_id or brand+model_number")
        brand = payload.brand.strip()
        model = payload.model_number.strip()
        # Find existing
        existing = sb_admin.table("toner_master").select("*").eq("brand", brand).eq("model_number", model).maybe_single().execute()
        if existing and existing.data:
            t = existing.data
        else:
            insert = {
                "brand": brand,
                "model_number": model,
                "model_normalized": model.lower(),
                "search_norm": re.sub(r"[^a-z0-9]", "", f"{brand}{model}".lower()),
                "color": payload.color or "Black",
                "page_yield": payload.page_yield,
            }
            res = sb_admin.table("toner_master").insert(insert).execute()
            t = res.data[0] if res.data else insert

    row = {
        "supplier_id": s["id"],
        "toner_id": t["id"],
        "brand": t["brand"],
        "model_number": t["model_number"],
        "search_norm": t.get("search_norm") or re.sub(r"[^a-z0-9]", "", f"{t['brand']}{t['model_number']}".lower()),
        "color": payload.color or t.get("color") or "Black",
        "toner_type": payload.toner_type,
        "price": payload.price,
        "stock": payload.stock,
        "image_url": payload.image_url or None,
        "city": s["city"],
        "spec_pdf_url": payload.spec_pdf_url or None,
    }
    try:
        res = sb_admin.table("listings").insert(row).execute()
    except Exception as e:
        # Graceful fallback if spec_pdf_url column hasn't been migrated yet
        if "spec_pdf_url" in str(e):
            row.pop("spec_pdf_url", None)
            res = sb_admin.table("listings").insert(row).execute()
        else:
            raise
    return res.data[0] if res.data else row


@api.put("/supplier/listings/{listing_id}")
def update_listing(listing_id: str, payload: ListingUpdate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    existing = sb_admin.table("listings").select("supplier_id").eq("id", listing_id).maybe_single().execute()
    if not existing or not existing.data or existing.data["supplier_id"] != s["id"]:
        raise HTTPException(404, "Listing not found")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
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
async def create_order(payload: OrderCreate, user: dict = Depends(require_user)):
    if user["role"] not in ("customer", "supplier"):
        raise HTTPException(403, "Only signed-in buyers and sellers can place orders")
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
    created = res.data[0] if res.data else row

    # Fire confirmation emails (best effort — never block the order)
    try:
        sup = sb_admin.table("suppliers").select(
            "business_name,city,gst_number,contact_email"
        ).eq("id", L["supplier_id"]).maybe_single().execute()
        buyer_row = sb_admin.table("users").select("email,name,gst_number").eq("id", user["id"]).maybe_single().execute()
        order_for_email = dict(created)
        order_for_email["buyer_gst_number"] = (buyer_row.data or {}).get("gst_number") if buyer_row else None
        order_for_email["supplier_gst_number"] = (sup.data or {}).get("gst_number") if sup else None
        await email_order_placed(
            order=order_for_email,
            listing=L,
            supplier=(sup.data if sup else {}) or {},
            buyer=(buyer_row.data if buyer_row else {}) or {},
        )
    except Exception:
        logger.exception("order confirmation email failed (non-fatal)")

    return created


@api.get("/orders/mine")
def my_orders(user: dict = Depends(require_user)):
    if user["role"] == "customer":
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url),suppliers(business_name,city,gst_number)").eq("customer_id", user["id"]).order("created_at", desc=True).execute().data or []
        # Attach buyer GST (same for all rows since it's the same buyer)
        try:
            u = sb_admin.table("users").select("gst_number").eq("id", user["id"]).maybe_single().execute()
            buyer_gst = (u.data or {}).get("gst_number") if u else None
        except Exception:
            buyer_gst = None
        for r in rows:
            r["buyer_gst_number"] = buyer_gst
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url)").eq("supplier_id", s["id"]).order("created_at", desc=True).execute().data or []
        if rows:
            buyer_ids = list({r["customer_id"] for r in rows if r.get("customer_id")})
            buyer_map: dict = {}
            if buyer_ids:
                ulist = sb_admin.table("users").select("id,gst_number,email").in_("id", buyer_ids).execute().data or []
                buyer_map = {u["id"]: u for u in ulist}
            for r in rows:
                u = buyer_map.get(r.get("customer_id")) or {}
                r["buyer_gst_number"] = u.get("gst_number")
                r["buyer_email"] = u.get("email")
                r["supplier_gst_number"] = s.get("gst_number")
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
async def admin_approve(pending_id: str, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    P = p.data
    if P["status"] != "pending":
        raise HTTPException(400, f"Already {P['status']}")
    sb_admin.table("suppliers").upsert({
        "user_id": P["user_id"],
        "business_name": P["business_name"],
        "contact_person": P["contact_person"],
        "phone": P["phone"],
        "email": P["email"],
        "city": P["city"],
        "state": P.get("state"),
        "pincode": P.get("pincode"),
        "cities_served": P.get("cities_served") or [],
        "gst_number": P.get("gst_number"),
        "pan_number": P.get("pan_number"),
        "annual_turnover": P.get("annual_turnover"),
        "years_in_business": P.get("years_in_business"),
        "business_address": P["business_address"],
        "seller_types": P.get("seller_types") or [],
        "compatible_brands": P.get("compatible_brands") or [],
        "testing_before_delivery": P.get("testing_before_delivery") or False,
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="user_id").execute()
    sb_admin.table("suppliers_pending").update({
        "status": "approved",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    # Flip the user's role to supplier (= seller). This is the only place role becomes 'supplier'.
    sb_admin.table("users").update({"role": "supplier"}).eq("id", P["user_id"]).execute()
    try:
        await email_application_approved(P)
    except Exception as e:
        logger.warning("approval email failed: %s", e)
    return {"ok": True}


@api.post("/admin/suppliers/{pending_id}/reject")
async def admin_reject(pending_id: str, payload: RejectPayload, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    if p.data["status"] != "pending":
        raise HTTPException(400, f"Already {p.data['status']}")
    reason = payload.reason or "Not approved"
    sb_admin.table("suppliers_pending").update({
        "status": "rejected",
        "rejection_reason": reason,
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    try:
        await email_application_rejected(p.data, reason)
    except Exception as e:
        logger.warning("rejection email failed: %s", e)
    return {"ok": True}


@api.get("/admin/suppliers/{pending_id}/documents")
def admin_documents(pending_id: str, user: dict = Depends(require_role("admin"))):
    """Returns short-lived signed URLs for each uploaded supplier document."""
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    return {"documents": _signed_doc_urls(p.data, ttl=300), "ai_check": p.data.get("ai_check") or {}}


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


# ===== Printers + MPS =========================================================

PRINTER_USAGES = {"home", "corporate", "commercial", "print_shop"}
PRINTER_CATEGORIES = {"inkjet", "laser", "tank", "thermal", "production", "digital_press", "label_barcode", "ink", "other"}
PRINTER_CONDITIONS = {"new", "refurbished"}
PRINTER_COLORS = {"color", "bw", "both"}


class PrinterListingCreate(BaseModel):
    brand: str
    model_number: str
    description: Optional[str] = ""
    image_url: str
    condition: str = "new"
    usage_type: str
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


def _supplier_id_for(user: dict) -> str:
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Only approved sellers can manage printers")
    return s.data["id"]


@api.post("/supplier/printer-image")
async def upload_printer_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Upload a printer image via the backend (service role) — bypasses storage RLS."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload printer images")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg").lower()
    path = f"{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("printer image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    public_url = sb_admin.storage.from_("printer-images").get_public_url(path)
    return {"url": public_url, "path": path}




@api.post("/supplier/printers")
def create_printer(payload: PrinterListingCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list printers")
    if payload.condition not in PRINTER_CONDITIONS:
        raise HTTPException(400, "Invalid condition")
    if payload.usage_type not in PRINTER_USAGES:
        raise HTTPException(400, "Invalid usage_type")
    if payload.category not in PRINTER_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if payload.color not in PRINTER_COLORS:
        raise HTTPException(400, "Invalid color")
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(400, "price and stock must be non-negative")
    if not payload.image_url:
        raise HTTPException(400, "Image is required")
    sid = _supplier_id_for(user)
    row = {
        "supplier_id": sid,
        "brand": payload.brand.strip(),
        "model_number": payload.model_number.strip(),
        "description": payload.description or "",
        "image_url": payload.image_url,
        "condition": payload.condition,
        "usage_type": payload.usage_type,
        "category": payload.category,
        "color": payload.color,
        "paper_sizes": payload.paper_sizes or [],
        "functions": payload.functions or [],
        "connectivity": payload.connectivity or [],
        "features": payload.features or [],
        "monthly_volume_min": int(payload.monthly_volume_min or 0),
        "monthly_volume_max": int(payload.monthly_volume_max or 0),
        "price": float(payload.price),
        "stock": int(payload.stock),
        "spec_pdf_url": payload.spec_pdf_url or None,
    }
    try:
        res = sb_admin.table("printer_listings").insert(row).execute()
    except Exception as e:
        if "spec_pdf_url" in str(e):
            row.pop("spec_pdf_url", None)
            res = sb_admin.table("printer_listings").insert(row).execute()
        else:
            raise
    if not res.data:
        raise HTTPException(500, "Failed to insert printer")
    return {"id": res.data[0]["id"]}


@api.delete("/supplier/printers/{printer_id}")
def delete_printer(printer_id: str, user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    sb_admin.table("printer_listings").delete().eq("id", printer_id).eq("supplier_id", sid).execute()
    return {"ok": True}


@api.get("/supplier/printers/mine")
def my_printers(user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    res = sb_admin.table("printer_listings").select("*").eq("supplier_id", sid).order("created_at", desc=True).execute()
    return res.data or []


@api.get("/printers")
def list_printers(
    usage_type: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    paper_size: Optional[str] = None,
    function_: Optional[str] = None,
    connectivity: Optional[str] = None,
    feature: Optional[str] = None,
    min_volume: Optional[int] = None,
    max_volume: Optional[int] = None,
    city: Optional[str] = None,
    brand: Optional[str] = None,
    q: Optional[str] = None,
):
    """Public browse endpoint with optional filters from the MPS flow."""
    sel = (
        "id,brand,model_number,description,image_url,condition,usage_type,category,"
        "color,paper_sizes,functions,connectivity,features,monthly_volume_min,monthly_volume_max,"
        "price,stock,spec_pdf_url,supplier:suppliers(business_name,city)"
    )
    sel_no_brochure = sel.replace(",spec_pdf_url", "")
    def _build_query(select_str):
        qry = sb_admin.table("printer_listings").select(select_str).gt("stock", 0)
        if usage_type and usage_type in PRINTER_USAGES:
            qry = qry.eq("usage_type", usage_type)
        if category and category in PRINTER_CATEGORIES:
            qry = qry.eq("category", category)
        if condition and condition in PRINTER_CONDITIONS:
            qry = qry.eq("condition", condition)
        if color and color in PRINTER_COLORS:
            if color == "color":
                qry = qry.in_("color", ["color", "both"])
            elif color == "bw":
                qry = qry.in_("color", ["bw", "both"])
            else:
                qry = qry.eq("color", "both")
        if paper_size:
            qry = qry.contains("paper_sizes", [paper_size])
        if function_:
            qry = qry.contains("functions", [function_])
        if connectivity:
            qry = qry.contains("connectivity", [connectivity])
        if feature:
            qry = qry.contains("features", [feature])
        if min_volume is not None:
            qry = qry.gte("monthly_volume_max", min_volume)
        if max_volume is not None:
            qry = qry.lte("monthly_volume_min", max_volume)
        if brand:
            qry = qry.ilike("brand", f"%{brand}%")
        if q:
            qry = qry.or_(f"brand.ilike.%{q}%,model_number.ilike.%{q}%,description.ilike.%{q}%")
        return qry.order("created_at", desc=True).limit(200)
    try:
        res = _build_query(sel).execute()
    except Exception as e:
        if "spec_pdf_url" in str(e):
            res = _build_query(sel_no_brochure).execute()
        else:
            raise
    rows = res.data or []
    out = []
    # Treat common India city aliases as equivalent for filtering
    _CITY_ALIASES = {
        "bangalore": {"bangalore", "bengaluru"},
        "bengaluru": {"bangalore", "bengaluru"},
        "bombay": {"bombay", "mumbai"},
        "mumbai": {"bombay", "mumbai"},
        "calcutta": {"calcutta", "kolkata"},
        "kolkata": {"calcutta", "kolkata"},
        "madras": {"madras", "chennai"},
        "chennai": {"madras", "chennai"},
    }
    want = (city or "").lower()
    accepted = _CITY_ALIASES.get(want, {want}) if want else None
    for r in rows:
        sup = r.pop("supplier", None) or {}
        r["supplier_name"] = sup.get("business_name", "")
        r["city"] = sup.get("city", "")
        if accepted is not None and r["city"].lower() not in accepted:
            continue
        out.append(r)
    return out


class MPSInquiry(BaseModel):
    name: str
    email: EmailStr
    phone: str
    description: Optional[str] = ""
    estimated_printers: str
    selections: Optional[dict] = None


@api.post("/mps/inquiry")
async def mps_inquiry(payload: MPSInquiry, request: Request):
    user_id = None
    tok = get_token(request)
    if tok:
        try:
            u = get_user_from_token(tok)
            if u:
                user_id = u.id
        except Exception:
            user_id = None
    row = {
        "user_id": user_id,
        "name": payload.name.strip(),
        "email": str(payload.email),
        "phone": payload.phone.strip(),
        "description": payload.description or "",
        "estimated_printers": payload.estimated_printers,
        "selections": payload.selections or {},
    }
    sb_admin.table("mps_inquiries").insert(row).execute()
    try:
        await email_mps_inquiry(row)
    except Exception as e:
        logger.warning("MPS email failed: %s", e)
    return {"ok": True}


# ===== Featured Supplier — applications + admin + landing =====================

@api.post("/featured/apply")
async def featured_apply(payload: FeaturedAppCreate):
    """Public — accepts a Get Featured application from a dealer/OEM/distributor.
    Best-effort DB insert (table may not be migrated yet); always emails support + applicant."""
    row = {
        "company": payload.company.strip(),
        "contact_person": payload.contact_person.strip(),
        "phone": payload.phone.strip(),
        "email": str(payload.email).strip(),
        "city": (payload.city or "").strip() or None,
        "pincode": (payload.pincode or "").strip() or None,
        "business_type": (payload.business_type or "dealer").strip() or "dealer",
        "description": (payload.description or "").strip() or None,
        "status": "new",
    }
    try:
        sb_admin.table("featured_applications").insert(row).execute()
    except Exception as e:
        logger.warning("featured_applications insert skipped (migration pending?): %s", e)

    # Notify support inbox (reuse the MPS inquiry helper for consistency)
    try:
        await email_mps_inquiry({
            "name": row["contact_person"],
            "email": row["email"],
            "phone": row["phone"],
            "description": row.get("description") or "",
            "estimated_printers": "—",
            "selections": {
                "type": "featured_application",
                "company": row["company"],
                "city": row.get("city"),
                "pincode": row.get("pincode"),
                "business_type": row.get("business_type"),
            },
        })
    except Exception as e:
        logger.warning("featured admin notify failed: %s", e)

    # Auto-reply to applicant with pricing tiers
    try:
        await email_featured_applicant_reply(row)
    except Exception as e:
        logger.warning("featured applicant auto-reply failed: %s", e)

    return {"ok": True}


@api.get("/featured/suppliers")
def featured_suppliers_public(limit: int = 6):
    """Public — return suppliers where is_featured = true, with signed logo URLs.
    Returns [] gracefully if the migration has not been run yet."""
    try:
        rows = sb_admin.table("suppliers").select(
            "id,business_name,city,state,business_logo,is_featured,seller_types"
        ).eq("is_featured", True).limit(limit).execute().data or []
    except Exception as e:
        logger.warning("featured_suppliers (column likely missing): %s", e)
        return []
    out = []
    for s in rows:
        item = {
            "id": s["id"],
            "business_name": s.get("business_name"),
            "city": s.get("city"),
            "state": s.get("state"),
            "seller_types": s.get("seller_types") or [],
            "logo_url": None,
        }
        if s.get("business_logo"):
            try:
                signed = sb_admin.storage.from_("supplier-documents").create_signed_url(
                    s["business_logo"], 60 * 60
                )
                item["logo_url"] = signed.get("signedURL") or signed.get("signed_url")
            except Exception:
                item["logo_url"] = None
        out.append(item)
    return out


@api.get("/admin/featured/applications")
def admin_featured_applications(user: dict = Depends(require_role("admin"))):
    try:
        rows = sb_admin.table("featured_applications").select("*").order(
            "created_at", desc=True
        ).limit(500).execute().data or []
        return rows
    except Exception as e:
        logger.warning("featured_applications table missing: %s", e)
        return []


@api.put("/admin/featured/applications/{app_id}/status")
def admin_featured_status(app_id: str, payload: FeaturedStatusUpdate,
                          user: dict = Depends(require_role("admin"))):
    if payload.status not in {"new", "contacted", "active", "rejected"}:
        raise HTTPException(400, "Invalid status")
    sb_admin.table("featured_applications").update({
        "status": payload.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()
    return {"ok": True}


@api.put("/admin/suppliers/{supplier_id}/featured")
def admin_toggle_supplier_featured(supplier_id: str, payload: SupplierFeaturedToggle,
                                    user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("suppliers").update({"is_featured": bool(payload.is_featured)}).eq(
            "id", supplier_id
        ).execute()
    except Exception as e:
        logger.warning("toggle featured failed (column missing?): %s", e)
        raise HTTPException(500, "is_featured column not yet migrated — run supabase_schema_quotation_featured.sql") from e
    return {"ok": True, "is_featured": bool(payload.is_featured)}


# ===== Brochure (spec PDF) upload + signed download ===========================

@api.post("/supplier/spec-pdf")
async def upload_spec_pdf(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Approved supplier uploads a product brochure (PDF, max 10 MB).
    Stored in the private `supplier-documents` bucket. Returns the storage path."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload brochures")
    if not file.content_type or file.content_type != "application/pdf":
        raise HTTPException(400, "Brochure must be a PDF")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Brochure must be under 10 MB")
    path = f"{user['id']}/brochure-{uuid.uuid4().hex}.pdf"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": "application/pdf", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("brochure upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"path": path}


@api.get("/listings/{listing_id}/brochure")
def listing_brochure_url(listing_id: str, listing_type: str = "toner",
                         user: dict = Depends(require_user)):
    """Returns a short-lived signed URL for the brochure PDF, if any.
    Authenticated buyers / sellers only."""
    table = "printer_listings" if listing_type == "printer" else "listings"
    try:
        row = sb_admin.table(table).select("spec_pdf_url").eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        logger.warning("spec_pdf_url column missing (migration pending): %s", e)
        raise HTTPException(404, "No brochure available") from e
    if not row or not row.data:
        raise HTTPException(404, "Listing not found")
    path = (row.data or {}).get("spec_pdf_url")
    if not path:
        raise HTTPException(404, "No brochure available")
    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 5)
        return {"url": signed.get("signedURL") or signed.get("signed_url")}
    except Exception as e:
        logger.warning("brochure sign failed: %s", e)
        raise HTTPException(500, "Could not generate download URL") from e


# ===== Quotation ===============================================================

def _gen_quote_number() -> str:
    """Format: TC-YYYYMMDD-XXXXX (5-char alphanumeric suffix)."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:5].upper()
    return f"TC-{today}-{suffix}"


@api.post("/quotation")
async def create_quotation(payload: QuotationRequest, user: dict = Depends(require_user)):
    """Authenticated buyer requests a quotation. Sends a professional
    quotation email to the buyer's address + a copy to support@tonerscart.com.
    Dealer details are intentionally NOT included — only 'Verified Supplier on TonersCart'.
    """
    if payload.listing_type not in ("toner", "printer"):
        raise HTTPException(400, "listing_type must be 'toner' or 'printer'")

    table = "printer_listings" if payload.listing_type == "printer" else "listings"
    lst = sb_admin.table(table).select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data
    qty = max(1, int(payload.qty or 1))
    unit = float(L.get("price") or 0)
    total = round(unit * qty, 2)

    # Buyer details (name, email, gst, phone)
    u = sb_admin.table("users").select("name,email,phone,gst_number").eq(
        "id", user["id"]
    ).maybe_single().execute()
    buyer = u.data or {}

    qnum = _gen_quote_number()

    # Audit row (best-effort, no failure to the user)
    try:
        sb_admin.table("quotations").insert({
            "quote_number": qnum,
            "buyer_id": user["id"],
            "buyer_email": buyer.get("email"),
            "buyer_name": buyer.get("name"),
            "buyer_phone": buyer.get("phone"),
            "buyer_gst": buyer.get("gst_number"),
            "listing_id": payload.listing_id,
            "listing_type": payload.listing_type,
            "brand": L.get("brand"),
            "model_number": L.get("model_number"),
            "color": L.get("color"),
            "unit_price": unit,
            "qty": qty,
            "total": total,
            "supplier_id": L.get("supplier_id"),
        }).execute()
    except Exception as e:
        logger.warning("quotation audit insert failed: %s", e)

    item = {
        "brand": L.get("brand"),
        "model_number": L.get("model_number"),
        "color": L.get("color") or "—",
        "type": L.get("toner_type") if payload.listing_type == "toner" else L.get("condition"),
        "unit_price": unit,
        "qty": qty,
        "total": total,
        "listing_type": payload.listing_type,
    }
    try:
        await email_quotation(
            quote_number=qnum,
            buyer={
                "name": buyer.get("name"),
                "email": buyer.get("email"),
                "phone": buyer.get("phone"),
                "gst": buyer.get("gst_number"),
            },
            item=item,
        )
    except Exception as e:
        logger.exception("quotation email failed")
        raise HTTPException(502, "Could not send quotation email — please try again") from e

    return {"ok": True, "quote_number": qnum, "email": buyer.get("email")}


@api.post("/supplier/listing-spec-pdf")
def attach_spec_pdf(payload: SpecPdfPath, user: dict = Depends(require_user)):
    """Approved supplier attaches an uploaded brochure path to one of their listings."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can update listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    table = "printer_listings" if payload.listing_type == "printer" else "listings"
    try:
        sb_admin.table(table).update({"spec_pdf_url": payload.spec_pdf_url}).eq(
            "id", payload.listing_id
        ).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        logger.warning("attach_spec_pdf failed (column missing?): %s", e)
        raise HTTPException(500, "spec_pdf column not yet migrated — run supabase_schema_quotation_featured.sql") from e
    return {"ok": True}




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
    session_id = payload.session_id or str(uuid.uuid4())
    latest = payload.messages[-1]
    if latest.role != "user":
        raise HTTPException(400, "last message must be from user")

    google_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if google_key:
        # Preferred path: direct Google GenAI SDK
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=google_key)
            # Build content history (Gemini uses 'user'/'model' roles)
            contents = []
            for m in payload.messages:
                role = "user" if m.role == "user" else "model"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m.content)]))
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=CHAT_SYSTEM),
            )
            reply = (resp.text or "").strip()
            if not reply:
                raise RuntimeError("empty Gemini response")
            return {"reply": reply, "session_id": session_id}
        except Exception:
            logger.exception("Gemini chat failed")
            raise HTTPException(502, "Chat unavailable — try again shortly")

    raise HTTPException(
        500,
        "LLM key not configured (set GOOGLE_API_KEY in backend/.env to enable the chatbot)",
    )


@api.get("/")
def root():
    return {"service": "TonersCart API (Supabase)", "ok": True}


app.include_router(api)

# CORS — explicit origin list (browsers reject the wildcard "*" combined with allow_credentials=True,
# which silently strips the Access-Control-Allow-Origin header on the response).
_default_origins = [
    "https://www.tonerscart.com",
    "https://tonerscart.com",
    "https://toners-marketplace.preview.emergentagent.com",
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
