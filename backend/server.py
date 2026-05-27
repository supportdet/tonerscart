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
import secrets
import re
import uuid
import asyncio
import logging
from pathlib import Path
from typing import List, Optional, Any
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import Response
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
    email_order_shipped,
    email_order_delivered_support,
    email_dealer_suspended,
    email_dealer_unsuspended,
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
    if not payload.agreed_to_terms:
        raise HTTPException(400, "You must accept the TonersCart Seller Terms to apply")

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
    # Resize + JPEG re-encode for storage hygiene
    content = compress_image(content, max_side=600, quality=88)

    ext = "jpg"
    path = f"{user['id']}/business-logo-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": "image/jpeg", "upsert": "false"}
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
                    supplier_id: Optional[str] = None,
                    d2d_only: bool = False,
                    limit: int = 200):
    qry = sb_admin.table("listings").select(
        "*,suppliers!inner(business_name,city,is_suspended)"
    ).order("price").limit(limit)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if city and city != "all":
        qry = qry.eq("city", city)
    if toner_type and toner_type != "all":
        qry = qry.eq("toner_type", toner_type)
    if supplier_id:
        qry = qry.eq("supplier_id", supplier_id)
    if d2d_only:
        # Defensive — if column doesn't exist yet, surface a sensible empty
        # result instead of crashing.
        try:
            qry = qry.eq("d2d_enabled", True)
        except Exception:
            pass
    try:
        rows = qry.execute().data or []
    except Exception as e:
        msg = str(e)
        # If D2D filter referenced a missing column, return [] (migration pending).
        if d2d_only and "d2d_enabled" in msg:
            return []
        # Graceful fallback if is_suspended column is not yet migrated
        if "is_suspended" in msg:
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
            if supplier_id:
                qry = qry.eq("supplier_id", supplier_id)
            rows = qry.execute().data or []
        else:
            raise
    out = []
    for r in rows:
        s = r.pop("suppliers", None) or {}
        if s.get("is_suspended"):
            continue
        r["supplier_name"] = s.get("business_name")
        r["supplier_city"] = s.get("city")
        out.append(r)
    # Bulk attach variants for all returned listings (one round-trip)
    if out:
        try:
            ids = [r["id"] for r in out if r.get("id")]
            vrows = sb_admin.table("listing_variants").select("id,listing_id,color,price,stock").in_(
                "listing_id", ids
            ).execute().data or []
            by_listing = {}
            for v in vrows:
                by_listing.setdefault(v["listing_id"], []).append(v)
            for r in out:
                r["variants"] = by_listing.get(r["id"], [])
        except Exception as e:
            if "listing_variants" not in str(e):
                logger.warning("variant bulk attach failed: %s", e)
            for r in out:
                r["variants"] = []
    return out


# Wave 12 — D2D marketplace aggregator (toners + printers + papers in one fetch).
@api.get("/d2d/listings")
def d2d_listings(q: Optional[str] = None, limit_per_type: int = 60):
    """Returns all D2D-enabled listings across the three product tables.
    Each section gracefully returns [] if the d2d_enabled column is missing
    (migration not yet applied)."""
    needle = (q or "").strip().lower()

    def safe(table, select_cols):
        try:
            qry = sb_admin.table(table).select(select_cols).eq("d2d_enabled", True).order("created_at", desc=True).limit(limit_per_type)
            rows = qry.execute().data or []
        except Exception as e:
            if "d2d_enabled" in str(e):
                return []
            logger.warning("d2d_listings %s failed: %s", table, e)
            return []
        if needle:
            def m(r):
                return needle in (r.get("brand", "") + " " + r.get("model_number", "") + " " + (r.get("size") or "")).lower()
            rows = [r for r in rows if m(r)]
        # Flatten supplier join
        for r in rows:
            sup = r.get("suppliers") or {}
            if isinstance(sup, dict):
                r["supplier_name"] = sup.get("business_name")
                r["supplier_city"] = sup.get("city")
        return rows

    toners = safe("listings", "*,suppliers(business_name,city)")
    printers = safe("printer_listings", "*,suppliers(business_name,city)")
    papers = safe("paper_listings", "*,suppliers(business_name,city)")
    return {
        "toners": toners, "printers": printers, "papers": papers,
        "counts": {"toners": len(toners), "printers": len(printers), "papers": len(papers)},
    }


# Wave 12 — verified-dealer status check (gate for /dealer page).
@api.get("/d2d/me")
def d2d_me(user: dict = Depends(require_user)):
    """Returns whether the calling user is a verified (approved) dealer."""
    if user.get("role") != "supplier":
        return {"verified": False, "reason": "not_supplier"}
    s = sb_admin.table("suppliers").select("id,business_name,is_approved").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        return {"verified": False, "reason": "no_supplier_record"}
    if not s.data.get("is_approved"):
        return {"verified": False, "reason": "not_approved", "business_name": s.data.get("business_name")}
    return {"verified": True, "business_name": s.data.get("business_name"), "supplier_id": s.data["id"]}


@api.get("/search/universal")
def search_universal(q: str, limit_per_type: int = 12):
    """Wave 9 — universal fuzzy search across toners, printers and papers.
    Matches brand / model_number / description (ilike %q%). Returns three lists.
    Results are sorted with exact brand matches first, then partial."""
    q_norm = (q or "").strip()
    if not q_norm:
        return {"q": "", "toners": [], "printers": [], "papers": [], "counts": {"toners": 0, "printers": 0, "papers": 0}}
    needle = q_norm.lower()

    def _rank(rows, brand_key="brand", model_key="model_number"):
        """Exact-brand matches first, then partial-brand, then model/description."""
        ranked = []
        for r in rows:
            b = (r.get(brand_key) or "").lower()
            m = (r.get(model_key) or "").lower()
            d = (r.get("description") or "").lower()
            if b == needle:
                score = 0
            elif b.startswith(needle):
                score = 1
            elif needle in b:
                score = 2
            elif needle in m:
                score = 3
            elif needle in d:
                score = 4
            else:
                score = 5
            ranked.append((score, r))
        ranked.sort(key=lambda x: x[0])
        return [r for _, r in ranked]

    # --- Toners ---
    toners: list = []
    try:
        sel_t = "id,brand,model_number,toner_type,color,price,stock,image_url,image_urls,gst_rate,intercity_delivery_charge,supplier_id,suppliers!inner(business_name,city,is_suspended)"
        def _run_toners(sel):
            return sb_admin.table("listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,compatible_models.ilike.%{q_norm}%"
            ).gt("stock", 0).limit(200).execute().data or []
        t_rows = []
        for _ in range(6):
            try:
                t_rows = _run_toners(sel_t)
                break
            except Exception as e:
                msg = str(e)
                dropped = False
                # Drop the offending column from select string
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended"):
                    if k in msg and k in sel_t:
                        sel_t = sel_t.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped and "compatible_models" in msg:
                    try:
                        t_rows = sb_admin.table("listings").select(sel_t).or_(
                            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%"
                        ).gt("stock", 0).limit(200).execute().data or []
                        break
                    except Exception:
                        t_rows = []
                        break
                elif not dropped:
                    raise
        for r in t_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            toners.append(r)
        toners = _rank(toners)[:limit_per_type]
    except Exception as e:
        logger.warning("universal search toners failed: %s", e)

    # --- Printers ---
    printers: list = []
    try:
        sel_p = "id,brand,model_number,description,price,stock,image_url,image_urls,condition,usage_type,category,color,gst_rate,intercity_delivery_charge,supplier_id,supplier:suppliers!inner(business_name,city,is_suspended)"
        def _run_printers(sel):
            return sb_admin.table("printer_listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,description.ilike.%{q_norm}%"
            ).gt("stock", 0).limit(200).execute().data or []
        p_rows = []
        for _ in range(6):
            try:
                p_rows = _run_printers(sel_p)
                break
            except Exception as e:
                msg = str(e)
                dropped = False
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended"):
                    if k in msg and k in sel_p:
                        sel_p = sel_p.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped:
                    raise
        for r in p_rows:
            sup = r.pop("supplier", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            printers.append(r)
        printers = _rank(printers)[:limit_per_type]
    except Exception as e:
        logger.warning("universal search printers failed: %s", e)

    # --- Papers ---
    papers: list = []
    try:
        sel_pp = "id,brand,size,gsm,reams_per_box,price_per_ream,stock,image_url,image_urls,gst_rate,intercity_delivery_charge,supplier_id,suppliers!inner(business_name,city,is_suspended)"
        def _run_papers(sel):
            return sb_admin.table("paper_listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,size.ilike.%{q_norm}%"
            ).gt("stock", 0).limit(200).execute().data or []
        pp_rows = []
        for _ in range(6):
            try:
                pp_rows = _run_papers(sel_pp)
                break
            except Exception as e:
                msg = str(e)
                if "paper_listings" in msg and "does not exist" in msg:
                    pp_rows = []
                    break
                dropped = False
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended"):
                    if k in msg and k in sel_pp:
                        sel_pp = sel_pp.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped:
                    raise
        for r in pp_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            papers.append(r)
        papers = _rank(papers, brand_key="brand", model_key="size")[:limit_per_type]
    except Exception as e:
        logger.warning("universal search papers failed: %s", e)

    return {
        "q": q_norm,
        "toners": toners,
        "printers": printers,
        "papers": papers,
        "counts": {
            "toners": len(toners),
            "printers": len(printers),
            "papers": len(papers),
        },
    }



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
        "brand": sanitize(t["brand"], 80),
        "model_number": sanitize(t["model_number"], 50),
        "search_norm": t.get("search_norm") or re.sub(r"[^a-z0-9]", "", f"{t['brand']}{t['model_number']}".lower()),
        "color": payload.color or t.get("color") or "Black",
        "toner_type": payload.toner_type,
        "price": payload.price,
        "stock": payload.stock,
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
        "city": s["city"],
        "spec_pdf_url": payload.spec_pdf_url or None,
    }
    # Structured specs + image_urls — gracefully degrade per-column when migration not run
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "compatible_models": payload.compatible_models,
        "oem_part_number": payload.oem_part_number,
        "cartridge_weight": payload.cartridge_weight,
        "pack_size": payload.pack_size,
        "warranty": payload.warranty,
        "print_technology": payload.print_technology,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    listing_row = None
    while True:
        try:
            res = sb_admin.table("listings").insert(row).execute()
            listing_row = res.data[0] if res.data else row
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("spec_pdf_url", "image_urls", "compatible_models", "oem_part_number", "cartridge_weight", "pack_size", "warranty", "print_technology", "intercity_delivery_charge", "gst_rate", "d2d_enabled", "d2d_price"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    # Variants — write each as its own row in listing_variants (best effort)
    saved_variants = []
    if payload.variants and listing_row and listing_row.get("id"):
        try:
            vrows = [
                {"listing_id": listing_row["id"], "color": sanitize(v.color, 40), "price": float(v.price), "stock": int(v.stock)}
                for v in payload.variants[:15]
            ]
            if vrows:
                vres = sb_admin.table("listing_variants").insert(vrows).execute()
                saved_variants = vres.data or vrows
                # Sync top-level listing.price + stock with the cheapest variant for backward compatibility
                cheapest = min(vrows, key=lambda x: x["price"])
                total_stock = sum(int(v["stock"] or 0) for v in vrows)
                try:
                    sb_admin.table("listings").update({"price": cheapest["price"], "stock": total_stock}).eq("id", listing_row["id"]).execute()
                    listing_row["price"] = cheapest["price"]
                    listing_row["stock"] = total_stock
                except Exception:
                    pass
        except Exception as e:
            if "listing_variants" in str(e):
                logger.warning("listing_variants table not migrated — variants ignored")
            else:
                logger.warning("variant insert failed: %s", e)
    listing_row = dict(listing_row or {})
    listing_row["variants"] = saved_variants
    return listing_row


@api.delete("/supplier/listings/{listing_id}")
def delete_listing(listing_id: str, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    sb_admin.table("listings").delete().eq("id", listing_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


# Wave 11 — Bulk upload of toner listings (CSV / spreadsheet flow).
@api.post("/supplier/listings/bulk")
def create_listings_bulk(payload: List[ListingCreate], user: dict = Depends(require_role("supplier"))):
    """Create many listings at once. Reuses the single create path per row to
    keep validation / specs / variants / D2D logic identical. Returns
    `{created: [...], errors: [{row, message}]}` with any per-row failures so
    the dealer can fix only the bad rows without losing the rest.
    """
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")

    created: List[dict] = []
    errors: List[dict] = []
    for idx, row in enumerate(payload):
        try:
            listing = create_listing(row, user=user)
            created.append(listing)
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


# ===== Orders ==================================================================

@api.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(require_user)):
    if user["role"] not in ("customer", "supplier"):
        raise HTTPException(403, "Only signed-in buyers and sellers can place orders")
    lst = sb_admin.table("listings").select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data

    # Variant resolution — when buyer picked a colour swatch, deduct from the variant's stock
    variant = None
    if payload.variant_id:
        try:
            v = sb_admin.table("listing_variants").select("*").eq("id", payload.variant_id).maybe_single().execute()
            if v and v.data and v.data.get("listing_id") == L["id"]:
                variant = v.data
        except Exception as e:
            if "listing_variants" not in str(e):
                logger.warning("variant lookup failed: %s", e)

    available = int(variant["stock"] if variant else (L.get("stock") or 0))
    if payload.qty > available:
        raise HTTPException(400, "Insufficient stock")
    unit_price = float(variant["price"]) if variant else float(L["price"])
    total = unit_price * payload.qty

    row = {
        "customer_id": user["id"],
        "supplier_id": L["supplier_id"],
        "listing_id": L["id"],
        "qty": payload.qty,
        "unit_price": unit_price,
        "total": total,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "delivery_address": payload.delivery_address,
        "notes": payload.notes or None,
        "status": "requested",
    }
    if variant:
        row["variant_id"] = variant["id"]
    # Optional structured address — drop columns that aren't migrated yet
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
    while True:
        try:
            res = sb_admin.table("orders").insert(row).execute()
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("variant_id", "street_address", "area", "order_city", "order_state", "pincode", "delivery_charge", "gst_rate", "gst_amount"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    # Decrement stock — variant if any, else listing
    try:
        if variant:
            sb_admin.table("listing_variants").update({"stock": max(0, int(variant["stock"]) - payload.qty)}).eq("id", variant["id"]).execute()
            # Also recompute total stock on parent listing
            try:
                allv = sb_admin.table("listing_variants").select("stock").eq("listing_id", L["id"]).execute().data or []
                sb_admin.table("listings").update({"stock": sum(int(x.get("stock") or 0) for x in allv)}).eq("id", L["id"]).execute()
            except Exception:
                pass
        else:
            sb_admin.table("listings").update({"stock": max(0, int(L.get("stock") or 0) - payload.qty)}).eq("id", L["id"]).execute()
    except Exception as e:
        logger.warning("stock decrement failed: %s", e)
    created = res.data[0] if res.data else row

    # Generate TC-YYYY-NNNNN order_number (best effort — gracefully degrades if column missing)
    try:
        order_number = _generate_order_number()
        if order_number and created.get("id"):
            upd = sb_admin.table("orders").update({"order_number": order_number}).eq("id", created["id"]).execute()
            if upd and upd.data:
                created["order_number"] = order_number
    except Exception:
        logger.exception("order_number generation skipped")

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
async def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(require_user)):
    allowed = {"requested", "accepted", "shipped", "delivered", "rejected", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid status")
    o = sb_admin.table("orders").select("*").eq("id", order_id).maybe_single().execute()
    if not o or not o.data:
        raise HTTPException(404, "Order not found")
    O_row = o.data
    if user["role"] == "customer":
        # Buyer can cancel a pending order OR confirm delivery on a shipped order
        if O_row["customer_id"] != user["id"]:
            raise HTTPException(403, "Not your order")
        if payload.status == "cancelled" and O_row.get("status") in ("requested", "accepted"):
            pass  # ok
        elif payload.status == "delivered" and O_row.get("status") == "shipped":
            pass  # ok
        else:
            raise HTTPException(403, "Customers can only cancel pending orders or confirm shipped orders")
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        if O_row["supplier_id"] != s["id"]:
            raise HTTPException(403, "Not your order")
    upd = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.tracking_number:
        try:
            upd["tracking_number"] = payload.tracking_number
            sb_admin.table("orders").update(upd).eq("id", order_id).execute()
        except Exception as e:
            if "tracking_number" in str(e):
                upd.pop("tracking_number", None)
                sb_admin.table("orders").update(upd).eq("id", order_id).execute()
            else:
                raise
    else:
        sb_admin.table("orders").update(upd).eq("id", order_id).execute()

    # --- Side-effects: emails ---
    if payload.status == "shipped" and payload.tracking_number:
        try:
            listing = sb_admin.table("listings").select(
                "brand,model_number"
            ).eq("id", O_row["listing_id"]).maybe_single().execute().data or {}
            buyer = sb_admin.table("users").select("email,name").eq(
                "id", O_row["customer_id"]
            ).maybe_single().execute().data or {}
            await email_order_shipped(
                {**O_row, "tracking_number": payload.tracking_number},
                listing,
                buyer,
            )
        except Exception as e:
            logger.warning("shipped email failed: %s", e)
    elif payload.status == "delivered" and user["role"] == "customer":
        try:
            listing = sb_admin.table("listings").select(
                "brand,model_number"
            ).eq("id", O_row["listing_id"]).maybe_single().execute().data or {}
            supplier = sb_admin.table("suppliers").select(
                "business_name"
            ).eq("id", O_row["supplier_id"]).maybe_single().execute().data or {}
            buyer = sb_admin.table("users").select("email,name").eq(
                "id", O_row["customer_id"]
            ).maybe_single().execute().data or {}
            await email_order_delivered_support(O_row, listing, supplier, buyer)
        except Exception as e:
            logger.warning("delivered notify failed: %s", e)
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
    # Compress / resize so storage stays cheap and pages load fast
    content = compress_image(content, max_side=1200, quality=85)
    ext = "jpg"
    path = f"{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": "image/jpeg", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("printer image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    public_url = sb_admin.storage.from_("printer-images").get_public_url(path)
    return {"url": public_url, "path": path}


@api.post("/supplier/listing-image")
async def upload_listing_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Upload a toner / paper listing image via the backend (service role).
    Stored in the `printer-images` bucket (re-used for all product imagery — has public read)."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload listing images")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    content = compress_image(content, max_side=1200, quality=85)
    path = f"{user['id']}/{uuid.uuid4().hex}.jpg"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": "image/jpeg", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("listing image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"url": sb_admin.storage.from_("printer-images").get_public_url(path), "path": path}




@api.post("/supplier/printers")
def create_printer(payload: PrinterListingCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list printers")
    if payload.condition not in PRINTER_CONDITIONS:
        raise HTTPException(400, "Invalid condition")
    # Wave 9 — usage_type is now optional/backward-compat; usage_types[] is canonical.
    # Accept either, derive the other.
    usage_types = list(payload.usage_types or [])
    if not usage_types and payload.usage_type:
        usage_types = [payload.usage_type]
    if not usage_types:
        raise HTTPException(400, "At least one usage type is required")
    usage_types = [u for u in usage_types if u in PRINTER_USAGES]
    if not usage_types:
        raise HTTPException(400, "Invalid usage_types")
    primary_usage = usage_types[0]
    if payload.category not in PRINTER_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if payload.color not in PRINTER_COLORS:
        raise HTTPException(400, "Invalid color")
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(400, "price and stock must be non-negative")
    # Wave 12 — printer image upload is now optional (animated fallback in UI)
    sid = _supplier_id_for(user)
    row = {
        "supplier_id": sid,
        "brand": payload.brand.strip(),
        "model_number": payload.model_number.strip(),
        "description": payload.description or "",
        "image_url": payload.image_url or "",
        "condition": payload.condition,
        "usage_type": primary_usage,
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
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "print_speed_ppm": payload.print_speed_ppm,
        "duty_cycle": payload.duty_cycle,
        "display_type": payload.display_type,
        "dimensions": payload.dimensions,
        "weight_kg": payload.weight_kg,
        "printer_warranty": payload.printer_warranty,
        "max_resolution": payload.max_resolution,
        "mobile_printing": payload.mobile_printing or None,
        "monthly_volume_recommended": payload.monthly_volume_recommended,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "usage_types": usage_types,
        "special_features": payload.special_features or None,
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("printer_listings").insert(row).execute()
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("spec_pdf_url", "image_urls", "print_speed_ppm", "duty_cycle", "display_type", "dimensions", "weight_kg", "printer_warranty", "max_resolution", "mobile_printing", "monthly_volume_recommended", "intercity_delivery_charge", "gst_rate", "usage_types", "special_features", "d2d_enabled", "d2d_price"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
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
    special_feature: Optional[str] = None,
    min_volume: Optional[int] = None,
    max_volume: Optional[int] = None,
    city: Optional[str] = None,
    brand: Optional[str] = None,
    supplier_id: Optional[str] = None,
    q: Optional[str] = None,
):
    """Public browse endpoint with optional filters from the MPS flow.
    Wave 9 — supports cascading filter fallback: if strict filters return < 3 rows,
    relax the most-restrictive ones one at a time and re-run, tagging the relaxed
    rows with is_relaxed_match=true."""
    sel = (
        "id,brand,model_number,description,image_url,condition,usage_type,category,"
        "color,paper_sizes,functions,connectivity,features,monthly_volume_min,monthly_volume_max,"
        "price,stock,spec_pdf_url,supplier:suppliers(business_name,city,is_suspended)"
    )
    sel_no_suspend = sel.replace(",is_suspended", "")
    sel_no_brochure = sel_no_suspend.replace(",spec_pdf_url", "")
    # Mutable filter dict so we can progressively pop entries during cascading fallback
    filters = {
        "special_feature": special_feature,
        "feature": feature,
        "connectivity": connectivity,
        "paper_size": paper_size,
        "function_": function_,
        "usage_type": usage_type,
        "category": category,
        "condition": condition,
        "color": color,
        "min_volume": min_volume,
        "max_volume": max_volume,
        "brand": brand,
        "supplier_id": supplier_id,
        "q": q,
    }
    # Cascade order — drop in this order until we have ≥3 results.
    CASCADE_ORDER = ["special_feature", "feature", "connectivity", "paper_size", "function_", "usage_type"]

    def _build_query(select_str, f):
        qry = sb_admin.table("printer_listings").select(select_str).gt("stock", 0)
        if f.get("usage_type") and f["usage_type"] in PRINTER_USAGES:
            # Match either canonical usage_types[] array OR legacy usage_type column
            qry = qry.or_(
                f"usage_type.eq.{f['usage_type']},"
                f"usage_types.cs.{{{f['usage_type']}}}"
            )
        if f.get("category") and f["category"] in PRINTER_CATEGORIES:
            qry = qry.eq("category", f["category"])
        if f.get("condition") and f["condition"] in PRINTER_CONDITIONS:
            qry = qry.eq("condition", f["condition"])
        if f.get("color") and f["color"] in PRINTER_COLORS:
            if f["color"] == "color":
                qry = qry.in_("color", ["color", "both"])
            elif f["color"] == "bw":
                qry = qry.in_("color", ["bw", "both"])
            else:
                qry = qry.eq("color", "both")
        if f.get("paper_size"):
            qry = qry.contains("paper_sizes", [f["paper_size"]])
        if f.get("function_"):
            qry = qry.contains("functions", [f["function_"]])
        if f.get("connectivity"):
            qry = qry.contains("connectivity", [f["connectivity"]])
        if f.get("feature"):
            qry = qry.contains("features", [f["feature"]])
        if f.get("special_feature"):
            qry = qry.contains("special_features", [f["special_feature"]])
        if f.get("min_volume") is not None:
            qry = qry.gte("monthly_volume_max", f["min_volume"])
        if f.get("max_volume") is not None:
            qry = qry.lte("monthly_volume_min", f["max_volume"])
        if f.get("brand"):
            qry = qry.ilike("brand", f"%{f['brand']}%")
        if f.get("supplier_id"):
            qry = qry.eq("supplier_id", f["supplier_id"])
        if f.get("q"):
            qry = qry.or_(f"brand.ilike.%{f['q']}%,model_number.ilike.%{f['q']}%,description.ilike.%{f['q']}%")
        return qry.order("created_at", desc=True).limit(200)

    def _run(select_str, f):
        try:
            return _build_query(select_str, f).execute()
        except Exception as e:
            msg = str(e)
            # Fallback when columns missing from migrations
            for column in ("special_features", "usage_types", "is_suspended", "spec_pdf_url"):
                if column in msg:
                    # Re-run with that filter dropped or with a lighter select string
                    if column == "special_features":
                        f = {**f, "special_feature": None}
                        return _run(select_str, f)
                    if column == "usage_types":
                        # Fall back to plain usage_type equality
                        ut = f.get("usage_type")
                        f = {**f, "usage_type": None}
                        try:
                            qry = _build_query(select_str, f)
                            if ut:
                                qry = qry.eq("usage_type", ut)
                            return qry.execute()
                        except Exception:
                            return _run(select_str, f)
                    if column == "is_suspended":
                        return _run(sel_no_suspend, f)
                    if column == "spec_pdf_url":
                        return _run(sel_no_brochure, f)
            raise

    # Initial strict run
    strict_filters = dict(filters)
    res = _run(sel, strict_filters)
    rows = res.data or []
    relaxed = False
    dropped_filters: List[str] = []
    # Cascade until we have ≥3 results or no more relaxable filters
    f_state = dict(strict_filters)
    for key in CASCADE_ORDER:
        if len(rows) >= 3:
            break
        if not f_state.get(key):
            continue
        dropped_filters.append(key)
        f_state[key] = None
        relaxed = True
        res = _run(sel, f_state)
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
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name", "")
        r["city"] = sup.get("city", "")
        if accepted is not None and r["city"].lower() not in accepted:
            continue
        if relaxed:
            r["is_relaxed_match"] = True
        out.append(r)
    return out


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
        "name": (payload.name or "").strip(),
        "email": str(payload.email),
        "phone": (payload.phone or "").strip(),
        "description": payload.description or "",
        "estimated_printers": payload.estimated_printers or "—",
        "selections": payload.selections or {},
    }
    # Best-effort DB insert; some enquiry types may not have a matching row in
    # the mps_inquiries table (e.g. interest captures). Email send is always
    # attempted so support@tonerscart.com is notified regardless.
    try:
        sb_admin.table("mps_inquiries").insert(row).execute()
    except Exception as e:
        logger.warning("mps_inquiries insert skipped: %s", e)
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
        "image_path": (payload.image_path or "").strip() or None,
        "status": "new",
    }
    try:
        sb_admin.table("featured_applications").insert(row).execute()
    except Exception as e:
        if "image_path" in str(e):
            row.pop("image_path", None)
            try:
                sb_admin.table("featured_applications").insert(row).execute()
            except Exception as e2:
                logger.warning("featured_applications insert skipped (migration pending?): %s", e2)
        else:
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


@api.post("/featured/apply-image")
async def featured_apply_image(file: UploadFile = File(...)):
    """Public — applicant uploads a banner image while filling the Get Featured form.
    Stored in supplier-documents/featured-applications/. Returns storage path that
    the client posts back in the application payload."""
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 5 MB)")
    ext = (file.filename or "banner.png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(400, "Only PNG, JPG or WEBP images accepted")
    safe = secrets.token_hex(8)
    path = f"featured-applications/{int(datetime.now(timezone.utc).timestamp())}-{safe}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, raw, {"content-type": file.content_type or f"image/{ext}", "upsert": "true"}
        )
    except Exception as e:
        logger.exception("featured apply image upload failed")
        raise HTTPException(503, f"Image upload failed: {e}") from e
    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
        preview = signed.get("signedURL") or signed.get("signed_url")
    except Exception:
        preview = None
    return {"path": path, "preview_url": preview}


class FeaturedFromApplication(BaseModel):
    application_id: str
    supplier_id: str


@api.get("/featured/suppliers")
def featured_suppliers_public(limit: int = 6):
    """Public — return suppliers where is_featured = true, with signed logo + banner URLs.
    Returns [] gracefully if the migration has not been run yet."""
    try:
        rows = sb_admin.table("suppliers").select(
            "id,business_name,city,state,business_logo,is_featured,seller_types,featured_image_url,tagline"
        ).eq("is_featured", True).limit(limit).execute().data or []
    except Exception as e:
        # Retry without new columns if featured_image_url/tagline not migrated yet
        if "featured_image_url" in str(e) or "tagline" in str(e):
            try:
                rows = sb_admin.table("suppliers").select(
                    "id,business_name,city,state,business_logo,is_featured,seller_types"
                ).eq("is_featured", True).limit(limit).execute().data or []
            except Exception as e2:
                logger.warning("featured_suppliers (column likely missing): %s", e2)
                return []
        else:
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
            "tagline": s.get("tagline") or None,
            "logo_url": None,
            "featured_image_url": None,
        }
        # Surface logo (legacy field)
        if s.get("business_logo"):
            try:
                signed = sb_admin.storage.from_("supplier-documents").create_signed_url(
                    s["business_logo"], 60 * 60
                )
                item["logo_url"] = signed.get("signedURL") or signed.get("signed_url")
            except Exception:
                item["logo_url"] = None
        # Surface featured banner image
        fp = s.get("featured_image_url")
        if fp:
            if fp.startswith("http://") or fp.startswith("https://"):
                item["featured_image_url"] = fp
            else:
                try:
                    signed = sb_admin.storage.from_("supplier-documents").create_signed_url(fp, 60 * 60)
                    item["featured_image_url"] = signed.get("signedURL") or signed.get("signed_url")
                except Exception:
                    item["featured_image_url"] = None
        out.append(item)
    return out


@api.get("/admin/featured/applications")
def admin_featured_applications(user: dict = Depends(require_role("admin"))):
    try:
        rows = sb_admin.table("featured_applications").select("*").order(
            "created_at", desc=True
        ).limit(500).execute().data or []
    except Exception as e:
        logger.warning("featured_applications table missing: %s", e)
        return []
    # Surface a signed URL for any uploaded banner image
    for r in rows:
        path = r.get("image_path")
        if path:
            try:
                signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
                r["image_url"] = signed.get("signedURL") or signed.get("signed_url")
            except Exception:
                r["image_url"] = None
        else:
            r["image_url"] = None
    return rows


@api.post("/admin/featured/feature-from-application")
def admin_feature_from_application(payload: FeaturedFromApplication,
                                    user: dict = Depends(require_role("admin"))):
    """Admin clicks "Feature this company" on an application.
    Marks the chosen supplier is_featured=true, copies the application's
    company tagline (description) into suppliers.tagline, and stores the
    application's image_path as the supplier's featured_image_url."""
    app_row = sb_admin.table("featured_applications").select("*").eq(
        "id", payload.application_id
    ).maybe_single().execute()
    if not app_row or not app_row.data:
        raise HTTPException(404, "Application not found")
    sup_row = sb_admin.table("suppliers").select("id").eq("id", payload.supplier_id).maybe_single().execute()
    if not sup_row or not sup_row.data:
        raise HTTPException(404, "Supplier not found")
    a = app_row.data
    upd = {"is_featured": True}
    if a.get("image_path"):
        upd["featured_image_url"] = a["image_path"]
    if a.get("description"):
        upd["tagline"] = a["description"][:280]
    try:
        sb_admin.table("suppliers").update(upd).eq("id", payload.supplier_id).execute()
    except Exception as e:
        msg = str(e)
        # Drop missing columns and retry
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("suppliers").update(retry).eq("id", payload.supplier_id).execute()
        else:
            raise HTTPException(503, f"Featuring failed — missing column: {msg}") from e
    # Move application to 'active' status
    try:
        sb_admin.table("featured_applications").update({
            "status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", payload.application_id).execute()
    except Exception as e:
        logger.warning("featured_applications status update failed: %s", e)
    return {"ok": True, "supplier_id": payload.supplier_id, "featured": True}


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
        raise HTTPException(503, "is_featured column not yet migrated — run supabase_schema_quotation_featured.sql") from e
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
    if listing_type not in ("toner", "printer"):
        raise HTTPException(400, "listing_type must be 'toner' or 'printer'")
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


@api.get("/admin/analytics")
def admin_analytics(user: dict = Depends(require_role("admin"))):
    """Single payload powering the admin Analytics dashboard.
    Everything is computed from live Supabase tables — no cached or hardcoded numbers.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - _td(days=7)
    month_ago = now - _td(days=30)
    today_date = now.date()

    # Pull every order (limit reasonably for now; orders table is small in MVP)
    # Brand/model live on the joined listings row; supplier city → "orders by city".
    orders = sb_admin.table("orders").select(
        "id,total,unit_price,qty,status,supplier_id,customer_id,delivery_address,created_at,"
        "listings(brand,model_number,city)"
    ).order("created_at", desc=True).limit(5000).execute().data or []
    # Flatten the join so the rest of the function can reference o['brand']/o['model_number']/o['city']
    for o in orders:
        L = o.pop("listings", None) or {}
        o["brand"] = L.get("brand")
        o["model_number"] = L.get("model_number")
        o["delivery_city"] = L.get("city")

    suppliers = sb_admin.table("suppliers").select(
        "id,business_name,city,approved_at"
    ).execute().data or []
    suppliers_by_id = {s["id"]: s for s in suppliers}

    users = sb_admin.table("users").select("id,role,name,created_at").execute().data or []
    listings_cnt = sb_admin.table("listings").select("id", count="exact").execute().count or 0
    printers_cnt = sb_admin.table("printer_listings").select("id", count="exact").execute().count or 0

    # Aggregates
    total_gmv = 0.0
    total_commission = 0.0
    orders_week = 0
    orders_month = 0
    by_day_orders = defaultdict(int)
    by_day_commission = defaultdict(float)
    by_model = Counter()
    by_dealer_gmv = defaultdict(float)
    by_city = Counter()

    # Pre-seed last-30-day buckets so charts have continuous x-axis
    for i in range(30):
        d = (today_date - _td(days=i)).isoformat()
        by_day_orders[d] = 0
        by_day_commission[d] = 0.0

    for o in orders:
        total = float(o.get("total") or 0)
        total_gmv += total
        commission, _payout, _label = _commission_breakdown(total)
        total_commission += commission

        created = o.get("created_at")
        if created:
            try:
                cdt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            except Exception:
                cdt = None
        else:
            cdt = None

        if cdt:
            if cdt >= week_ago:
                orders_week += 1
            if cdt >= month_ago:
                orders_month += 1
                day_key = cdt.date().isoformat()
                by_day_orders[day_key] += 1
                by_day_commission[day_key] += float(commission)

        model_label = f"{o.get('brand') or '—'} {o.get('model_number') or ''}".strip()
        by_model[model_label] += 1

        sid = o.get("supplier_id")
        if sid:
            by_dealer_gmv[sid] += total

        city = (o.get("delivery_city") or "").strip()
        if city:
            by_city[city] += 1

    new_dealers_week = sum(
        1 for s in suppliers
        if (s.get("approved_at") or "") and
        datetime.fromisoformat(s["approved_at"].replace("Z", "+00:00")) >= week_ago
    )
    buyers = [u for u in users if u.get("role") == "customer"]
    new_buyers_week = sum(
        1 for u in buyers
        if (u.get("created_at") or "") and
        datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")) >= week_ago
    )

    top_dealers = sorted(by_dealer_gmv.items(), key=lambda x: x[1], reverse=True)[:5]
    top_dealers_out = [
        {
            "supplier_id": sid,
            "name": (suppliers_by_id.get(sid) or {}).get("business_name") or "Unknown",
            "gmv": round(g, 2),
        }
        for sid, g in top_dealers
    ]

    return {
        "stats": {
            "total_gmv": round(total_gmv, 2),
            "total_commission": round(total_commission, 2),
            "total_orders": len(orders),
            "orders_week": orders_week,
            "orders_month": orders_month,
            "total_dealers": len(suppliers),
            "new_dealers_week": new_dealers_week,
            "total_buyers": len(buyers),
            "new_buyers_week": new_buyers_week,
            "active_listings": int(listings_cnt) + int(printers_cnt),
        },
        "orders_per_day": [
            {"date": d, "count": by_day_orders[d]}
            for d in sorted(by_day_orders.keys())
        ],
        "commission_per_day": [
            {"date": d, "amount": round(by_day_commission[d], 2)}
            for d in sorted(by_day_commission.keys())
        ],
        "top_models": [
            {"model": m, "count": c}
            for m, c in by_model.most_common(5)
        ],
        "top_dealers": top_dealers_out,
        "orders_by_city": [
            {"city": c, "count": n}
            for c, n in by_city.most_common(8)
        ],
    }


# ---------- Dealer management ----------

@api.get("/admin/suppliers/{supplier_id}/detail")
def admin_supplier_detail(supplier_id: str, user: dict = Depends(require_role("admin"))):
    s = sb_admin.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(404, "Supplier not found")
    toners = sb_admin.table("listings").select("*").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).execute().data or []
    printers = sb_admin.table("printer_listings").select("*").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).execute().data or []
    orders = sb_admin.table("orders").select("*,listings(brand,model_number)").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).limit(500).execute().data or []
    for o in orders:
        L = o.pop("listings", None) or {}
        o["brand"] = L.get("brand")
        o["model_number"] = L.get("model_number")
    gmv = sum(float(o.get("total") or 0) for o in orders)
    return {
        "supplier": s.data,
        "toner_listings": toners,
        "printer_listings": printers,
        "orders": orders,
        "stats": {
            "listing_count": len(toners) + len(printers),
            "order_count": len(orders),
            "gmv": round(gmv, 2),
        },
    }


class SupplierEdit(BaseModel):
    business_name: Optional[str] = None
    city: Optional[str] = None


@api.put("/admin/suppliers/{supplier_id}")
def admin_edit_supplier(supplier_id: str, payload: SupplierEdit,
                        user: dict = Depends(require_role("admin"))):
    upd = {}
    if payload.business_name is not None and payload.business_name.strip():
        upd["business_name"] = payload.business_name.strip()
    if payload.city is not None and payload.city.strip():
        upd["city"] = payload.city.strip()
    if not upd:
        return {"ok": True, "updated": []}
    sb_admin.table("suppliers").update(upd).eq("id", supplier_id).execute()
    return {"ok": True, "updated": list(upd.keys())}


def _set_suspended(supplier_id: str, value: bool):
    try:
        sb_admin.table("suppliers").update({"is_suspended": value}).eq("id", supplier_id).execute()
    except Exception as e:
        if "is_suspended" in str(e):
            raise HTTPException(503, "is_suspended column not yet migrated — run supabase_schema_admin_v2.sql") from e
        raise


@api.post("/admin/suppliers/{supplier_id}/suspend")
async def admin_suspend_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    _set_suspended(supplier_id, True)
    try:
        sup = sb_admin.table("suppliers").select("business_name,city,email,contact_person,user_id").eq("id", supplier_id).maybe_single().execute()
        if sup and sup.data:
            sd = dict(sup.data)
            # Fall back to users.email if suppliers row has no email
            if not sd.get("email") and sd.get("user_id"):
                u = sb_admin.table("users").select("email").eq("id", sd["user_id"]).maybe_single().execute()
                if u and u.data:
                    sd["email"] = u.data.get("email")
            asyncio.create_task(email_dealer_suspended(sd))
    except Exception as e:
        logger.warning("suspend email skipped: %s", e)
    return {"ok": True, "is_suspended": True}


@api.post("/admin/suppliers/{supplier_id}/unsuspend")
async def admin_unsuspend_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    _set_suspended(supplier_id, False)
    try:
        sup = sb_admin.table("suppliers").select("business_name,city,email,contact_person,user_id").eq("id", supplier_id).maybe_single().execute()
        if sup and sup.data:
            sd = dict(sup.data)
            if not sd.get("email") and sd.get("user_id"):
                u = sb_admin.table("users").select("email").eq("id", sd["user_id"]).maybe_single().execute()
                if u and u.data:
                    sd["email"] = u.data.get("email")
            asyncio.create_task(email_dealer_unsuspended(sd))
    except Exception as e:
        logger.warning("unsuspend email skipped: %s", e)
    return {"ok": True, "is_suspended": False}


@api.delete("/admin/listings/{listing_id}")
def admin_delete_listing(listing_id: str, user: dict = Depends(require_role("admin"))):
    sb_admin.table("listings").delete().eq("id", listing_id).execute()
    return {"ok": True}


@api.delete("/admin/printers/{printer_id}")
def admin_delete_printer(printer_id: str, user: dict = Depends(require_role("admin"))):
    sb_admin.table("printer_listings").delete().eq("id", printer_id).execute()
    return {"ok": True}


# ---------- Order management ----------

@api.get("/admin/orders")
def admin_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("admin")),
):
    page = max(1, page)
    limit = max(1, min(limit, 200))
    qry = sb_admin.table("orders").select("*,listings(brand,model_number,toner_type)").order("created_at", desc=True)
    if status and status != "all":
        qry = qry.eq("status", status)
    rows = qry.limit(2000).execute().data or []
    # Flatten join
    for r in rows:
        L = r.pop("listings", None) or {}
        r["brand"] = L.get("brand")
        r["model_number"] = L.get("model_number")
        r["toner_type"] = L.get("toner_type")
    if search:
        s = search.lower()
        rows = [
            r for r in rows
            if s in (r.get("customer_name") or "").lower()
            or s in (r.get("model_number") or "").lower()
            or s in (r.get("brand") or "").lower()
            or s in (r.get("customer_phone") or "")
        ]
    suppliers = sb_admin.table("suppliers").select("id,business_name").execute().data or []
    sup_map = {s["id"]: s.get("business_name") for s in suppliers}
    total = len(rows)
    start = (page - 1) * limit
    end = start + limit
    page_rows = rows[start:end]
    for r in page_rows:
        c, p, lbl = _commission_breakdown(r.get("total") or 0)
        r["commission"] = c
        r["payout"] = p
        r["commission_rate"] = lbl
        r["supplier_name"] = sup_map.get(r.get("supplier_id")) or "—"
        # Apply search filter to brand/model after flatten (already done above)
    return {"rows": page_rows, "total": total, "page": page, "limit": limit}


@api.get("/admin/orders/export")
def admin_orders_export(user: dict = Depends(require_role("admin"))):
    orders = sb_admin.table("orders").select("*,listings(brand,model_number,toner_type)").order("created_at", desc=True).limit(5000).execute().data or []
    suppliers = sb_admin.table("suppliers").select("id,business_name").execute().data or []
    sup_map = {s["id"]: s.get("business_name") for s in suppliers}
    buf = io.StringIO()
    buf.write("\ufeff")  # UTF-8 BOM for Excel
    writer = csv.writer(buf)
    writer.writerow([
        "Order ID", "Created", "Status", "Tracking",
        "Buyer Name", "Buyer Phone", "Delivery Address",
        "Brand", "Model", "Type", "Qty", "Unit Price", "Total",
        "Commission Rate", "Commission", "Payout",
        "Dealer Name",
    ])
    for o in orders:
        L = o.get("listings") or {}
        total = float(o.get("total") or 0)
        c, p, label = _commission_breakdown(total)
        writer.writerow([
            o.get("id"),
            o.get("created_at"),
            o.get("status"),
            o.get("tracking_number") or "",
            o.get("customer_name") or "",
            o.get("customer_phone") or "",
            o.get("delivery_address") or "",
            L.get("brand") or "",
            L.get("model_number") or "",
            L.get("toner_type") or "",
            o.get("qty") or 0,
            o.get("unit_price") or 0,
            total,
            label,
            c,
            p,
            sup_map.get(o.get("supplier_id")) or "",
        ])
    csv_text = buf.getvalue()
    headers = {
        "Content-Disposition": 'attachment; filename="tonerscart_orders.csv"',
    }
    return Response(content=csv_text, media_type="text/csv; charset=utf-8", headers=headers)


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


@api.get("/config/{key}")
def get_site_config(key: str):
    """Public — site_config value with a sensible default fallback."""
    if key not in _CONFIG_DEFAULTS and key not in {"popular_chips", "marquee_brands"}:
        # Allow any key but require it exists; otherwise just 404
        pass
    try:
        row = sb_admin.table("site_config").select("value").eq("key", key).maybe_single().execute()
    except Exception as e:
        logger.warning("site_config select failed: %s", e)
        row = None
    if row and row.data and row.data.get("value") is not None:
        val = row.data["value"]
        if isinstance(val, list) and len(val) > 0:
            return {"key": key, "value": val}
        if isinstance(val, dict) and val:
            return {"key": key, "value": val}
    return {"key": key, "value": _CONFIG_DEFAULTS.get(key, [])}


class ConfigPayload(BaseModel):
    value: Any


@api.post("/admin/config/{key}")
def set_site_config(key: str, payload: ConfigPayload, user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("site_config").upsert({
            "key": key,
            "value": payload.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="key").execute()
    except Exception as e:
        if "site_config" in str(e):
            raise HTTPException(503, "site_config table not yet migrated — run supabase_schema_admin_v2.sql") from e
        raise
    return {"ok": True, "key": key}


# ---------- Stats overlay for landing (real numbers, no auth) ----------

@api.get("/stats/public")
def public_stats():
    """Lightweight public counters for the landing-page stats strip."""
    sup_rows = None
    try:
        sup_rows = sb_admin.table("suppliers").select(
            "id,city", count="exact"
        ).eq("is_suspended", False).execute()
    except Exception as e:
        if "is_suspended" in str(e):
            try:
                sup_rows = sb_admin.table("suppliers").select(
                    "id,city", count="exact"
                ).execute()
            except Exception:
                sup_rows = None
        else:
            logger.warning("public_stats suppliers failed: %s", e)
    sup_count = (sup_rows.count if sup_rows else 0) or 0
    cities = {(r.get("city") or "").strip() for r in ((sup_rows.data if sup_rows else []) or []) if r.get("city")}

    try:
        brands_rows = sb_admin.table("listings").select("brand").limit(2000).execute().data or []
        brands = {(r.get("brand") or "").strip() for r in brands_rows if r.get("brand")}
    except Exception:
        brands = set()
    try:
        prn_brands = sb_admin.table("printer_listings").select("brand").limit(2000).execute().data or []
        brands.update({(r.get("brand") or "").strip() for r in prn_brands if r.get("brand")})
    except Exception:
        pass

    return {
        "suppliers": sup_count,
        "cities": len(cities),
        "brands": len(brands),
    }



@api.get("/")
def root():
    return {"service": "TonersCart API (Supabase)", "ok": True}




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


@api.get("/admin/finance/summary")
def admin_finance_summary(user: dict = Depends(require_role("admin"))):
    orders = _orders_with_listings()
    buckets: dict = {}
    for o in orders:
        ts = o.get("created_at") or ""
        if not ts:
            continue
        try:
            d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            continue
        key = d.strftime("%Y-%m")
        b = buckets.setdefault(key, {"month": key, "orders": 0, "gmv": 0.0, "commission": 0.0, "payout": 0.0})
        total = float(o.get("total") or 0)
        c, p, _label = _commission_breakdown(total)
        b["orders"] += 1
        b["gmv"] += total
        b["commission"] += float(c)
        b["payout"] += float(p)
    rows = sorted(buckets.values(), key=lambda r: r["month"], reverse=True)
    for r in rows:
        r["gmv"] = round(r["gmv"], 2)
        r["commission"] = round(r["commission"], 2)
        r["payout"] = round(r["payout"], 2)
    return rows


@api.get("/admin/finance/dealers")
def admin_finance_dealers(user: dict = Depends(require_role("admin"))):
    orders = _orders_with_listings()
    suppliers = sb_admin.table("suppliers").select("id,business_name,city").execute().data or []
    by_sid: dict = {s["id"]: {"id": s["id"], "name": s.get("business_name") or "—", "city": s.get("city") or "—",
                                "orders": 0, "gmv": 0.0, "commission": 0.0, "payout": 0.0}
                       for s in suppliers}
    for o in orders:
        sid = o.get("supplier_id")
        if not sid or sid not in by_sid:
            continue
        total = float(o.get("total") or 0)
        c, p, _label = _commission_breakdown(total)
        by_sid[sid]["orders"] += 1
        by_sid[sid]["gmv"] += total
        by_sid[sid]["commission"] += float(c)
        by_sid[sid]["payout"] += float(p)
    rows = [r for r in by_sid.values() if r["orders"] > 0]
    for r in rows:
        r["gmv"] = round(r["gmv"], 2)
        r["commission"] = round(r["commission"], 2)
        r["payout"] = round(r["payout"], 2)
    rows.sort(key=lambda r: r["gmv"], reverse=True)
    return rows


@api.get("/admin/finance/export")
def admin_finance_export(user: dict = Depends(require_role("admin"))):
    summary = admin_finance_summary(user)
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(["Month", "Orders", "GMV (₹)", "Commission (₹)", "Dealer payouts (₹)"])
    for r in summary:
        w.writerow([r["month"], r["orders"], r["gmv"], r["commission"], r["payout"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tonerscart_monthly_report.csv"'},
    )


@api.get("/admin/finance/dealer-payouts/export")
def admin_finance_dealers_export(user: dict = Depends(require_role("admin"))):
    rows = admin_finance_dealers(user)
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(["Dealer", "City", "Orders", "GMV (₹)", "Commission taken (₹)", "Net payout (₹)"])
    for r in rows:
        w.writerow([r["name"], r["city"], r["orders"], r["gmv"], r["commission"], r["payout"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tonerscart_dealer_payouts.csv"'},
    )


@api.get("/supplier/earnings")
def supplier_earnings(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can view earnings")
    s = sb_admin.table("suppliers").select("id,business_name").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    orders = _orders_with_listings(supplier_id=s.data["id"])
    items = []
    total_gmv = 0.0
    total_commission = 0.0
    total_net = 0.0
    for o in orders:
        total = float(o.get("total") or 0)
        c, p, label = _commission_breakdown(total)
        total_gmv += total
        total_commission += float(c)
        total_net += float(p)
        items.append({
            "id": o.get("id"),
            "brand": o.get("brand"),
            "model_number": o.get("model_number"),
            "qty": o.get("qty"),
            "total": total,
            "commission": c,
            "commission_rate": label,
            "payout": p,
            "status": o.get("status"),
            "created_at": o.get("created_at"),
        })
    return {
        "stats": {
            "total_gmv":        round(total_gmv, 2),
            "total_commission": round(total_commission, 2),
            "total_net":        round(total_net, 2),
            "orders":           len(items),
        },
        "orders": items,
    }


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
    intercity_delivery_charge: Optional[float] = 0
    gst_rate: Optional[int] = 18
    # Wave 10 — D2D marketplace
    d2d_enabled: Optional[bool] = False
    d2d_price: Optional[float] = None


@api.post("/supplier/papers")
def create_paper(payload: PaperCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list papers")
    s = sb_admin.table("suppliers").select("id,city").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    row = {
        "supplier_id": s.data["id"],
        "brand": sanitize(payload.brand, 80),
        "size": payload.size,
        "gsm": int(payload.gsm),
        "reams_per_box": int(payload.reams_per_box),
        "price_per_ream": float(payload.price_per_ream),
        "stock": int(payload.stock),
        "city": payload.city or s.data.get("city"),
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
    }
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "brightness": payload.brightness,
        "thickness_microns": payload.thickness_microns,
        "acid_free": payload.acid_free,
        "suitable_for": payload.suitable_for or None,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("paper_listings").insert(row).execute()
            return res.data[0] if res.data else row
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("image_urls", "brightness", "thickness_microns", "acid_free", "suitable_for", "intercity_delivery_charge", "gst_rate", "d2d_enabled", "d2d_price"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if dropped:
                continue
            logger.warning("create_paper failed: %s", e)
            raise HTTPException(503, "paper_listings table not yet migrated — run supabase_schema_papers.sql") from e


@api.get("/supplier/papers/mine")
def my_papers(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        return []
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        return []
    try:
        rows = sb_admin.table("paper_listings").select("*").eq("supplier_id", s.data["id"]).order(
            "created_at", desc=True
        ).execute().data or []
        return rows
    except Exception:
        return []


@api.delete("/supplier/papers/{paper_id}")
def delete_paper(paper_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can delete papers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    sb_admin.table("paper_listings").delete().eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True}


@api.get("/papers")
def list_papers(brand: Optional[str] = None, size: Optional[str] = None,
                 gsm: Optional[int] = None, city: Optional[str] = None,
                 limit: int = 200):
    try:
        qry = sb_admin.table("paper_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).gt("stock", 0).order("created_at", desc=True).limit(limit)
        if brand:
            qry = qry.ilike("brand", f"%{brand}%")
        if size:
            qry = qry.eq("size", size)
        if gsm:
            qry = qry.eq("gsm", int(gsm))
        if city:
            qry = qry.eq("city", city)
        rows = qry.execute().data or []
    except Exception as e:
        msg = str(e)
        if "is_suspended" in msg or "paper_listings" in msg:
            try:
                qry = sb_admin.table("paper_listings").select(
                    "*,suppliers(business_name,city)"
                ).gt("stock", 0).order("created_at", desc=True).limit(limit)
                if brand:
                    qry = qry.ilike("brand", f"%{brand}%")
                if size:
                    qry = qry.eq("size", size)
                if gsm:
                    qry = qry.eq("gsm", int(gsm))
                if city:
                    qry = qry.eq("city", city)
                rows = qry.execute().data or []
            except Exception:
                return []
        else:
            raise
    out = []
    for r in rows:
        sup = r.pop("suppliers", None) or {}
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name")
        r["supplier_city"] = sup.get("city")
        out.append(r)
    return out


# =============================================================================
# Paginated search (additive)
# =============================================================================

@api.get("/listings/search/paginated")
def search_listings_paginated(
    q: Optional[str] = None, brand: Optional[str] = None,
    city: Optional[str] = None, toner_type: Optional[str] = None,
    supplier_id: Optional[str] = None,
    page: int = 1, limit: int = 20,
):
    all_rows = search_listings(q=q, brand=brand, city=city, toner_type=toner_type, supplier_id=supplier_id, limit=2000)
    total = len(all_rows)
    page = max(1, page)
    limit = max(1, min(limit, 100))
    pages = max(1, (total + limit - 1) // limit)
    start = (page - 1) * limit
    return {
        "results": all_rows[start:start + limit],
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit,
    }


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


@api.put("/supplier/listings/{listing_id}")
def supplier_patch_listing(listing_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    # Numeric guards
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price is not None and payload.price > 0:
        upd["price"] = float(payload.price)
    if payload.page_yield is not None:
        upd["page_yield"] = int(payload.page_yield)
    if payload.cartridge_weight is not None:
        upd["cartridge_weight"] = int(payload.cartridge_weight)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    # Text / list pass-through fields
    for k in ("brand", "model_number", "color", "toner_type", "image_url", "image_urls",
              "compatible_models", "oem_part_number", "warranty", "print_technology"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    if not upd:
        return {"ok": True, "updated": []}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Best-effort: drop columns that may not exist (degrade gracefully)
    try:
        sb_admin.table("listings").update(upd).eq("id", listing_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        # Surface a clear error when the request is *only* about D2D fields
        # and the corresponding columns are missing — silent success here
        # would mislead the dealer into thinking D2D is on.
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = {k for k in upd.keys() if k != "updated_at"}
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("listings").update(retry).eq("id", listing_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True, "updated": list(upd.keys())}


@api.put("/supplier/printers/{printer_id}")
def supplier_patch_printer(printer_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit printers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price is not None and payload.price > 0:
        upd["price"] = float(payload.price)
    if payload.print_speed_ppm is not None:
        upd["print_speed_ppm"] = int(payload.print_speed_ppm)
    if payload.duty_cycle is not None:
        upd["duty_cycle"] = int(payload.duty_cycle)
    if payload.monthly_volume_min is not None:
        upd["monthly_volume_min"] = int(payload.monthly_volume_min)
    if payload.monthly_volume_max is not None:
        upd["monthly_volume_max"] = int(payload.monthly_volume_max)
    if payload.monthly_volume_recommended is not None:
        upd["monthly_volume_recommended"] = int(payload.monthly_volume_recommended)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.usage_types is not None:
        upd["usage_types"] = payload.usage_types
        if payload.usage_types:
            upd["usage_type"] = payload.usage_types[0]
    if payload.special_features is not None:
        upd["special_features"] = payload.special_features
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    for k in ("brand", "model_number", "description", "image_url", "image_urls",
              "usage_type", "category", "color", "functions", "connectivity",
              "paper_sizes", "mobile_printing", "max_resolution", "condition"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if not upd:
        return {"ok": True, "updated": []}
    try:
        sb_admin.table("printer_listings").update(upd).eq("id", printer_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = set(upd.keys())
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("printer_listings").update(retry).eq("id", printer_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True, "updated": list(upd.keys())}


@api.post("/supplier/listings/{listing_id}/duplicate")
def duplicate_listing(listing_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can duplicate listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    src = sb_admin.table("listings").select("*").eq("id", listing_id).eq("supplier_id", s.data["id"]).maybe_single().execute()
    if not src or not src.data:
        raise HTTPException(404, "Listing not found")
    row = {k: v for k, v in src.data.items() if k not in {"id", "created_at", "updated_at"}}
    row["stock"] = 1
    res = sb_admin.table("listings").insert(row).execute()
    return res.data[0] if res.data else row


@api.post("/supplier/printers/{printer_id}/duplicate")
def duplicate_printer(printer_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can duplicate printers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    src = sb_admin.table("printer_listings").select("*").eq("id", printer_id).eq("supplier_id", s.data["id"]).maybe_single().execute()
    if not src or not src.data:
        raise HTTPException(404, "Printer not found")
    row = {k: v for k, v in src.data.items() if k not in {"id", "created_at", "updated_at"}}
    row["stock"] = 1
    res = sb_admin.table("printer_listings").insert(row).execute()
    return res.data[0] if res.data else row


@api.put("/supplier/papers/{paper_id}")
def patch_paper(paper_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    """Edit paper listings — price, stock, size, gsm, specs, intercity delivery."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit papers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price_per_ream is not None and payload.price_per_ream > 0:
        upd["price_per_ream"] = float(payload.price_per_ream)
    elif payload.price is not None and payload.price > 0:
        upd["price_per_ream"] = float(payload.price)
    if payload.gsm is not None:
        upd["gsm"] = int(payload.gsm)
    if payload.brightness is not None:
        upd["brightness"] = int(payload.brightness)
    if payload.thickness_microns is not None:
        upd["thickness_microns"] = int(round(float(payload.thickness_microns)))
    if payload.acid_free is not None:
        upd["acid_free"] = bool(payload.acid_free)
    if payload.reams_per_box is not None:
        upd["reams_per_box"] = int(payload.reams_per_box)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    for k in ("brand", "size", "image_url", "image_urls", "suitable_for"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if not upd:
        return {"ok": True, "updated": []}
    try:
        sb_admin.table("paper_listings").update(upd).eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        if "paper_listings" in msg and "does not exist" in msg:
            raise HTTPException(503, "paper_listings table not yet migrated") from e
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = set(upd.keys())
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("paper_listings").update(retry).eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True, "updated": list(upd.keys())}


# =============================================================================
# Listing existence check (for buyer one-click reorder)
# =============================================================================

@api.get("/listings/{listing_id}")
def get_listing(listing_id: str):
    """Single listing lookup for buyer one-click reorder. Falls back gracefully when
    the optional `suppliers.is_suspended` column has not been migrated yet."""
    try:
        r = sb_admin.table("listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        msg = str(e)
        if "is_suspended" in msg:
            try:
                r = sb_admin.table("listings").select(
                    "*,suppliers(business_name,city)"
                ).eq("id", listing_id).maybe_single().execute()
            except Exception:
                r = None
        else:
            logger.warning("get_listing select failed: %s", e)
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Listing not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    if sup.get("is_suspended"):
        raise HTTPException(410, "This product is no longer available from this supplier")
    if (data.get("stock") or 0) <= 0:
        raise HTTPException(410, "Out of stock")
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    # Attach variants (best effort)
    try:
        v = sb_admin.table("listing_variants").select("*").eq("listing_id", data["id"]).order("price").execute()
        data["variants"] = v.data or []
    except Exception:
        data["variants"] = []
    return data


@api.post("/admin/cleanup-test-data")
def admin_cleanup_test_data(apply: bool = False, user: dict = Depends(require_role("admin"))):
    """Find and (optionally) delete any test / seed / demo / dummy data from the database.

    Pass `?apply=true` to actually delete. Without it, returns a dry-run preview.
    """
    try:
        from cleanup_test_data import run as _run_cleanup
        return _run_cleanup(apply=bool(apply))
    except Exception as e:
        logger.exception("cleanup_test_data failed")
        raise HTTPException(500, f"Cleanup failed: {e}") from e


@api.get("/listings/{listing_id}/public")
def get_listing_public(listing_id: str):
    """Viewable-without-login product page. Same shape as /listings/{id} but does NOT 410 on out-of-stock —
    just attaches stock=0 so the UI can disable the Add to Cart / Buy Now buttons."""
    try:
        r = sb_admin.table("listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("listings").select("*,suppliers(business_name,city)").eq("id", listing_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Listing not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    try:
        v = sb_admin.table("listing_variants").select("*").eq("listing_id", data["id"]).order("price").execute()
        data["variants"] = v.data or []
    except Exception:
        data["variants"] = []
    return data


@api.get("/printers/{printer_id}/public")
def get_printer_public(printer_id: str):
    try:
        r = sb_admin.table("printer_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", printer_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("printer_listings").select("*,suppliers(business_name,city)").eq("id", printer_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Printer not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    return data


@api.get("/papers/{paper_id}/public")
def get_paper_public(paper_id: str):
    try:
        r = sb_admin.table("paper_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", paper_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("paper_listings").select("*,suppliers(business_name,city)").eq("id", paper_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Paper not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    return data


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

class PasswordResetRequest(BaseModel):
    email: EmailStr


@api.post("/auth/password-reset")
def password_reset(payload: PasswordResetRequest):
    """Trigger Supabase Auth password-reset email."""
    try:
        sb_admin.auth.reset_password_for_email(
            str(payload.email),
            {"redirect_to": "https://www.tonerscart.com/reset-password"},
        )
    except Exception as e:
        logger.warning("password reset failed: %s", e)
        # Always return success-shaped response to avoid enumeration
    return {"ok": True}


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


@api.get("/admin/visitor-analytics")
def admin_visitor_analytics(user: dict = Depends(require_role("admin"))):
    """Aggregated page_views — never errors out, returns empty bucket if migration not run."""
    try:
        rows = sb_admin.table("page_views").select("page,device_type,referrer,ip_hash,created_at").order(
            "created_at", desc=True
        ).limit(20000).execute().data or []
    except Exception:
        rows = []
    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()
    week_start = today - _td(days=7)
    week_iso = week_start.isoformat()
    month_start = today - _td(days=30)
    month_iso = month_start.isoformat()
    today_count = sum(1 for r in rows if (r.get("created_at") or "").startswith(today_iso))
    week_count = sum(1 for r in rows if (r.get("created_at") or "") >= week_iso)
    month_count = sum(1 for r in rows if (r.get("created_at") or "") >= month_iso)
    pages = Counter([r.get("page") or "/" for r in rows])
    devices = Counter([r.get("device_type") or "desktop" for r in rows])
    refs = Counter([r.get("referrer") or "Direct" for r in rows])
    unique = len({r.get("ip_hash") for r in rows if r.get("ip_hash")})
    return {
        "total": len(rows),
        "today": today_count,
        "week": week_count,
        "month": month_count,
        "unique_estimate": unique,
        "top_pages": [{"page": p, "views": c} for p, c in pages.most_common(5)],
        "devices": [{"name": k, "value": v} for k, v in devices.items()],
        "referrers": [{"name": k, "value": v} for k, v in refs.items()],
    }


# =============================================================================
# Featured supplier — admin image upload endpoint (matched to FE)
# =============================================================================

@api.post("/admin/suppliers/{supplier_id}/featured-image")
async def admin_upload_featured_image(supplier_id: str, file: UploadFile = File(...), user: dict = Depends(require_role("admin"))):
    """Upload a feature-banner / logo for a supplier. Stored via the existing
    supplier-documents bucket and the public-ish signed URL is persisted in
    suppliers.business_logo. Sets is_featured=true atomically."""
    # Validate supplier exists FIRST to avoid orphaned blobs
    sup_row = sb_admin.table("suppliers").select("id").eq("id", supplier_id).maybe_single().execute()
    if not sup_row or not sup_row.data:
        raise HTTPException(404, "Supplier not found")
    try:
        raw = await file.read()
        if len(raw) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 5 MB)")
        ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "webp"):
            ext = "png"
        path = f"{supplier_id}/featured-logo-{int(datetime.now(timezone.utc).timestamp())}.{ext}"
        sb_admin.storage.from_("supplier-documents").upload(path, raw, {"content-type": file.content_type or f"image/{ext}", "upsert": "true"})
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60 * 24 * 365)
        url = signed.get("signedURL") or signed.get("signed_url")
        try:
            sb_admin.table("suppliers").update({"business_logo": path, "is_featured": True}).eq("id", supplier_id).execute()
        except Exception as e:
            if "is_featured" in str(e):
                sb_admin.table("suppliers").update({"business_logo": path}).eq("id", supplier_id).execute()
            else:
                raise
        return {"ok": True, "path": path, "url": url}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("upload featured image failed")
        raise HTTPException(500, f"Failed to upload featured image: {e}") from e


# =============================================================================
# Unified landing-data endpoint with in-memory cache (5 min TTL)
# =============================================================================

_LANDING_CACHE: dict = {"data": None, "ts": 0.0}
_LANDING_TTL_SECS = 300


@api.get("/landing-data")
def landing_data():
    now = _time.time()
    if _LANDING_CACHE["data"] is not None and (now - _LANDING_CACHE["ts"]) < _LANDING_TTL_SECS:
        return _LANDING_CACHE["data"]
    # Stats
    try:
        suppliers_n = len(sb_admin.table("suppliers").select("id").execute().data or [])
    except Exception:
        suppliers_n = 0
    try:
        listings_n = len(sb_admin.table("listings").select("id").gt("stock", 0).execute().data or [])
    except Exception:
        listings_n = 0
    try:
        cities = list({(r.get("city") or "").strip() for r in (sb_admin.table("suppliers").select("city").execute().data or []) if r.get("city")})
        cities_n = len([c for c in cities if c])
    except Exception:
        cities_n = 0
    # Featured suppliers — fall back to empty when column missing
    featured = []
    try:
        rows = sb_admin.table("suppliers").select(
            "id,business_name,city,business_logo"
        ).eq("is_featured", True).limit(8).execute().data or []
        for r in rows:
            logo_url = None
            if r.get("business_logo"):
                try:
                    s = sb_admin.storage.from_("supplier-documents").create_signed_url(r["business_logo"], 3600)
                    logo_url = s.get("signedURL") or s.get("signed_url")
                except Exception:
                    logo_url = None
            featured.append({"id": r["id"], "business_name": r.get("business_name"), "city": r.get("city"), "logo_url": logo_url})
    except Exception:
        featured = []
    # Site config: chips + marquee
    chips = []
    marquee = []
    try:
        cfg = sb_admin.table("site_config").select("key,value").in_("key", ["popular_chips", "marquee_brands"]).execute().data or []
        for row in cfg:
            if row.get("key") == "popular_chips":
                chips = row.get("value") or []
            elif row.get("key") == "marquee_brands":
                marquee = row.get("value") or []
    except Exception:
        pass
    payload = {
        "stats": {"suppliers": suppliers_n, "listings": listings_n, "cities": cities_n},
        "featured": featured,
        "popular_chips": chips,
        "marquee_brands": marquee,
    }
    _LANDING_CACHE["data"] = payload
    _LANDING_CACHE["ts"] = now
    return payload


def _bust_landing_cache():
    _LANDING_CACHE["data"] = None
    _LANDING_CACHE["ts"] = 0.0


app.include_router(api)


# CORS — explicit origin list (browsers reject the wildcard "*" combined with allow_credentials=True,
# which silently strips the Access-Control-Allow-Origin header on the response).
_default_origins = [
    "https://www.tonerscart.com",
    "https://tonerscart.com",
    "https://b2b-checkout-2.preview.emergentagent.com",
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
