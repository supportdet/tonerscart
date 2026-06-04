"""TonersCart — OEM (manufacturer) showcase module.

Verified OEM / brand partners showcase products on the public /oem page
(showcase + enquiry only — no checkout). Reuses the app's Supabase Auth:
an applicant submits the OEM form → admin approves → a Supabase user with
role='oem' is created and emailed credentials → the OEM signs in at /login
and manages products from the OEM dashboard.

Persistence: public.oem_partners + public.oem_products (supabase_schema_oem.sql).
Degrades gracefully (503 / empty) until the migration is applied.
"""
import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from pydantic import BaseModel, EmailStr

from supabase_client import sb_admin, get_user_from_token
from email_service import (
    email_oem_application_received,
    email_oem_approved,
    email_oem_rejected,
    email_oem_enquiry,
)

logger = logging.getLogger("tonerscart.oem")

oem_router = APIRouter(prefix="/api/oem", tags=["oem"])
oem_admin_router = APIRouter(prefix="/api/admin/oem", tags=["oem-admin"])

CATEGORIES = ("toner", "printer", "paper", "other")
_PARTNER_PUBLIC = (
    "id", "company", "brand", "contact_name", "email", "phone",
    "products_note", "logo_url", "status", "rejection_reason",
    "approved_at", "created_at",
)


def _bearer(request: Request):
    auth = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    return auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None


def require_admin(request: Request) -> dict:
    tok = _bearer(request)
    uid, profile = get_user_from_token(tok) if tok else (None, None)
    if not uid or not profile or profile.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return profile


def require_oem(request: Request) -> dict:
    """Supabase-authed user with role=oem + their oem_partner row."""
    tok = _bearer(request)
    uid, profile = get_user_from_token(tok) if tok else (None, None)
    if not uid or not profile:
        raise HTTPException(401, "Not authenticated")
    if profile.get("role") != "oem":
        raise HTTPException(403, "OEM access only")
    p = sb_admin.table("oem_partners").select("*").eq("user_id", uid).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(403, "OEM profile not found")
    return {"profile": profile, "partner": p.data}


def _partners_ready_or_503():
    try:
        sb_admin.table("oem_partners").select("id").limit(1).execute()
    except Exception as e:
        if "oem_partners" in str(e):
            raise HTTPException(503, "OEM module not enabled — run supabase_schema_oem.sql") from e
        raise


# ---- Models -----------------------------------------------------------------
class OemApply(BaseModel):
    company: str
    brand: str
    contact_name: str
    email: EmailStr
    phone: str | None = ""
    products_note: str | None = ""


class OemProductIn(BaseModel):
    name: str
    category: str = "toner"
    model_number: str | None = ""
    description: str | None = ""
    image_url: str | None = ""
    moq: str | None = ""
    price_note: str | None = ""


class OemProductPatch(BaseModel):
    name: str | None = None
    category: str | None = None
    model_number: str | None = None
    description: str | None = None
    image_url: str | None = None
    moq: str | None = None
    price_note: str | None = None
    is_active: bool | None = None


class OemEnquiry(BaseModel):
    product_id: str
    name: str
    email: EmailStr
    phone: str | None = ""
    message: str | None = ""


class OemReject(BaseModel):
    reason: str | None = ""


# ---- Public: apply ----------------------------------------------------------
@oem_router.post("/apply")
async def oem_apply(payload: OemApply):
    _partners_ready_or_503()
    row = {
        "company": payload.company.strip(),
        "brand": payload.brand.strip(),
        "contact_name": payload.contact_name.strip(),
        "email": payload.email.strip().lower(),
        "phone": (payload.phone or "").strip(),
        "products_note": (payload.products_note or "").strip(),
        "status": "pending",
    }
    try:
        res = sb_admin.table("oem_partners").insert(row).execute()
        created = res.data[0] if res.data else row
    except Exception as e:
        logger.exception("oem apply insert failed")
        raise HTTPException(500, "Could not submit application") from e
    try:
        await email_oem_application_received(created)
    except Exception as e:
        logger.warning("oem application email skipped: %s", e)
    return {"ok": True, "status": "pending"}


# ---- Public: showcase listing ----------------------------------------------
@oem_router.get("/public")
def oem_public():
    try:
        partners = sb_admin.table("oem_partners").select("*").eq("status", "approved").execute().data or []
    except Exception as e:
        if "oem_partners" in str(e):
            return {"partners": []}
        raise
    if not partners:
        return {"partners": []}
    ids = [p["id"] for p in partners]
    try:
        prods = (
            sb_admin.table("oem_products").select("*")
            .eq("is_active", True).in_("oem_id", ids)
            .order("created_at", desc=True).execute().data or []
        )
    except Exception:
        prods = []
    out = []
    for p in partners:
        items = [pr for pr in prods if pr.get("oem_id") == p["id"]]
        if not items:
            continue
        out.append({
            "id": p["id"], "brand": p.get("brand"), "company": p.get("company"),
            "logo_url": p.get("logo_url"), "products": items,
        })
    return {"partners": out}


# ---- Public: enquire --------------------------------------------------------
@oem_router.post("/enquire")
async def oem_enquire(payload: OemEnquiry):
    pr = sb_admin.table("oem_products").select("*").eq("id", payload.product_id).maybe_single().execute()
    if not pr or not pr.data:
        raise HTTPException(404, "Product not found")
    product = pr.data
    partner = sb_admin.table("oem_partners").select("*").eq("id", product["oem_id"]).maybe_single().execute()
    partner = partner.data if partner else None
    if not partner:
        raise HTTPException(404, "Brand not found")
    try:
        await email_oem_enquiry(partner, product, payload.model_dump())
    except Exception as e:
        logger.warning("oem enquiry email skipped: %s", e)
    return {"ok": True}


# ---- OEM: profile + product management --------------------------------------
@oem_router.get("/me")
def oem_me(ctx: dict = Depends(require_oem)):
    p = ctx["partner"]
    return {k: p.get(k) for k in _PARTNER_PUBLIC}


@oem_router.get("/products")
def oem_my_products(ctx: dict = Depends(require_oem)):
    return (
        sb_admin.table("oem_products").select("*")
        .eq("oem_id", ctx["partner"]["id"]).order("created_at", desc=True)
        .execute().data or []
    )


@oem_router.post("/products")
def oem_add_product(payload: OemProductIn, ctx: dict = Depends(require_oem)):
    if not payload.name.strip():
        raise HTTPException(400, "Product name is required")
    cat = payload.category if payload.category in CATEGORIES else "other"
    row = {
        "oem_id": ctx["partner"]["id"],
        "brand": ctx["partner"].get("brand"),
        "name": payload.name.strip(),
        "category": cat,
        "model_number": (payload.model_number or "").strip(),
        "description": (payload.description or "").strip(),
        "image_url": (payload.image_url or "").strip(),
        "moq": (payload.moq or "").strip(),
        "price_note": (payload.price_note or "").strip(),
        "is_active": True,
    }
    res = sb_admin.table("oem_products").insert(row).execute()
    return res.data[0] if res.data else row


@oem_router.patch("/products/{pid}")
def oem_update_product(pid: str, payload: OemProductPatch, ctx: dict = Depends(require_oem)):
    existing = sb_admin.table("oem_products").select("oem_id").eq("id", pid).maybe_single().execute()
    if not existing or not existing.data or existing.data.get("oem_id") != ctx["partner"]["id"]:
        raise HTTPException(404, "Product not found")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "category" in upd and upd["category"] not in CATEGORIES:
        upd["category"] = "other"
    if upd:
        sb_admin.table("oem_products").update(upd).eq("id", pid).execute()
    return {"ok": True}


@oem_router.delete("/products/{pid}")
def oem_delete_product(pid: str, ctx: dict = Depends(require_oem)):
    existing = sb_admin.table("oem_products").select("oem_id").eq("id", pid).maybe_single().execute()
    if not existing or not existing.data or existing.data.get("oem_id") != ctx["partner"]["id"]:
        raise HTTPException(404, "Product not found")
    sb_admin.table("oem_products").delete().eq("id", pid).execute()
    return {"ok": True}


@oem_router.post("/product-image")
async def oem_product_image(file: UploadFile = File(...), ctx: dict = Depends(require_oem)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only images are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg").lower()
    path = f"oem/{ctx['partner']['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"url": sb_admin.storage.from_("printer-images").get_public_url(path), "path": path}


@oem_router.post("/logo")
async def oem_logo(file: UploadFile = File(...), ctx: dict = Depends(require_oem)):
    """Upload the brand logo and persist it on the OEM partner row."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only images are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png").lower()
    path = f"oem/{ctx['partner']['id']}/logo-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}") from e
    url = sb_admin.storage.from_("printer-images").get_public_url(path)
    sb_admin.table("oem_partners").update({"logo_url": url}).eq("id", ctx["partner"]["id"]).execute()
    return {"url": url}


# ---- Admin ------------------------------------------------------------------
@oem_admin_router.get("/pending")
def admin_oem_pending(admin: dict = Depends(require_admin)):
    try:
        rows = (
            sb_admin.table("oem_partners").select("*").eq("status", "pending")
            .order("created_at", desc=True).execute().data or []
        )
    except Exception as e:
        if "oem_partners" in str(e):
            return {"partners": [], "count": 0}
        raise
    return {"partners": rows, "count": len(rows)}


@oem_admin_router.get("/partners")
def admin_oem_partners(admin: dict = Depends(require_admin)):
    try:
        return (
            sb_admin.table("oem_partners").select("*")
            .order("created_at", desc=True).execute().data or []
        )
    except Exception as e:
        if "oem_partners" in str(e):
            return []
        raise


@oem_admin_router.post("/{pid}/approve")
async def admin_oem_approve(pid: str, admin: dict = Depends(require_admin)):
    p = sb_admin.table("oem_partners").select("*").eq("id", pid).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Application not found")
    partner = p.data
    if partner.get("status") == "approved":
        raise HTTPException(400, "Already approved")
    email = (partner.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Application has no email")

    temp_password = secrets.token_urlsafe(9) + "A1"
    uid = None
    try:
        created = sb_admin.auth.admin.create_user({
            "email": email,
            "password": temp_password,
            "email_confirm": True,
            "user_metadata": {"name": partner.get("contact_name"), "role": "oem"},
        })
        uid = created.user.id
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            try:
                for u in sb_admin.auth.admin.list_users():
                    if (getattr(u, "email", None) or "").lower() == email:
                        uid = u.id
                        break
            except Exception:
                pass
            temp_password = None  # existing account — password unchanged
        if not uid:
            logger.exception("oem approve user creation failed")
            raise HTTPException(500, "Could not create OEM account") from e

    sb_admin.table("users").upsert({
        "id": uid, "email": email, "name": partner.get("contact_name"),
        "role": "oem", "company": partner.get("company"),
    }, on_conflict="id").execute()
    sb_admin.table("oem_partners").update({
        "status": "approved",
        "user_id": uid,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": None,
    }).eq("id", pid).execute()

    try:
        await email_oem_approved(partner, email, temp_password)
    except Exception as e:
        logger.warning("oem approval email skipped: %s", e)
    return {"ok": True}


@oem_admin_router.post("/{pid}/reject")
async def admin_oem_reject(pid: str, payload: OemReject, admin: dict = Depends(require_admin)):
    p = sb_admin.table("oem_partners").select("*").eq("id", pid).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Application not found")
    reason = (payload.reason or "Not approved").strip()
    sb_admin.table("oem_partners").update(
        {"status": "rejected", "rejection_reason": reason}
    ).eq("id", pid).execute()
    try:
        await email_oem_rejected(p.data, reason)
    except Exception as e:
        logger.warning("oem rejection email skipped: %s", e)
    return {"ok": True}
