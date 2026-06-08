"""Auth, profile and supplier-onboarding routes (extracted from server.py)."""
# ruff: noqa: F403, F405  (names provided by the shared-kernel star import from server)
from typing import List, Optional
import os
import uuid
import asyncio
import httpx

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from pydantic import BaseModel, EmailStr, Field

from server import *  # noqa: F401,F403  shared kernel: clients, models, helpers, deps
from server import _td, _re, _time, _dd  # noqa: F401  import-alias kernel helpers
from server import _exec_dropping_cols, _run_ai_check, _client_ip  # underscore helpers

router = APIRouter(prefix="/api")


@router.post("/auth/oauth-bootstrap")
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


# ---- Server-side login with brute-force protection ---------------------------
_SB_URL = os.environ.get("SUPABASE_URL")
_SB_ANON = os.environ.get("SUPABASE_ANON_KEY")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# Per-IP FAILED-login tracking (in-memory, single process). Successful logins
# clear the counter. 5 fails / IP / 10 min → block that IP for 30 min.
_LOGIN_FAILS: dict = {}
_LOGIN_MAX_FAILS = 5
_LOGIN_WINDOW_SECS = 600     # 10 minutes
_LOGIN_BLOCK_SECS = 1800     # 30 minutes


@router.post("/auth/login")
async def auth_login(payload: LoginRequest, request: Request):
    """Server-side Supabase password sign-in so login can be rate-limited.
    Only FAILED attempts count toward the limit: 5 fails / IP / 10 min → 30-min block.
    On success returns the Supabase session for the client to hydrate."""
    import time as _t
    ip = _client_ip(request)
    now = _t.time()
    rec = _LOGIN_FAILS.get(ip)
    if rec and rec.get("blocked_until", 0) > now:
        raise HTTPException(429, "Too many attempts, try again in 30 minutes.")
    try:
        async with httpx.AsyncClient(timeout=15.0, http2=False) as client:
            r = await client.post(
                f"{_SB_URL}/auth/v1/token",
                params={"grant_type": "password"},
                headers={"apikey": _SB_ANON, "Content-Type": "application/json"},
                json={"email": (payload.email or "").lower().strip(), "password": payload.password},
            )
    except Exception as e:
        logger.warning("login upstream error: %s", e)
        raise HTTPException(503, "Sign-in service unavailable. Please try again.")
    if r.status_code == 200:
        _LOGIN_FAILS.pop(ip, None)
        data = r.json()
        return {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "token_type": data.get("token_type"),
            "user": data.get("user"),
        }
    # Failed credentials — record the attempt against this IP (sliding window).
    rec = _LOGIN_FAILS.get(ip) or {"fails": [], "blocked_until": 0}
    rec["fails"] = [t for t in rec.get("fails", []) if now - t < _LOGIN_WINDOW_SECS]
    rec["fails"].append(now)
    if len(rec["fails"]) >= _LOGIN_MAX_FAILS:
        rec["blocked_until"] = now + _LOGIN_BLOCK_SECS
        rec["fails"] = []
        _LOGIN_FAILS[ip] = rec
        raise HTTPException(429, "Too many attempts, try again in 30 minutes.")
    _LOGIN_FAILS[ip] = rec
    raise HTTPException(401, "Incorrect email or password")


@router.post("/auth/signup-customer")
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
        **({"user_type": payload.user_type} if payload.user_type in _VALID_USER_TYPES else {}),
    }, on_conflict="id").execute()

    return {"ok": True, "user_id": uid}


@router.post("/auth/signup-supplier")
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
        "doc_id_proof": payload.doc_id_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "account_holder_name": payload.account_holder_name or None,
        "account_number": payload.account_number or None,
        "ifsc_code": payload.ifsc_code or None,
        "bank_name": payload.bank_name or None,
        "bank_branch": payload.bank_branch or None,
        "status": "pending",
    }
    _exec_dropping_cols(lambda a: sb_admin.table("suppliers_pending").upsert(a, on_conflict="user_id").execute(), application)

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
    doc_id_proof: Optional[str] = None


@router.post("/auth/apply-seller")
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
        "doc_id_proof": payload.doc_id_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "account_holder_name": payload.account_holder_name or None,
        "account_number": payload.account_number or None,
        "ifsc_code": payload.ifsc_code or None,
        "bank_name": payload.bank_name or None,
        "bank_branch": payload.bank_branch or None,
        "status": "pending",
        "rejection_reason": None,
    }
    _exec_dropping_cols(lambda a: sb_admin.table("suppliers_pending").upsert(a, on_conflict="user_id").execute(), application)

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


@router.post("/auth/supplier-documents")
async def supplier_documents_patch(payload: SupplierDocPaths, user: dict = Depends(require_user)):
    """Called by the supplier client after files are uploaded to
    supplier-documents/<uid>/... — saves paths and queues the AI check in the background
    so the client gets an immediate response."""
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v}
    if not upd:
        return {"ok": True}
    _exec_dropping_cols(lambda a: sb_admin.table("suppliers_pending").update(a).eq("user_id", user["id"]).execute(), upd)
    p = sb_admin.table("suppliers_pending").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if p and p.data:
        async def _bg_ai():
            try:
                await _run_ai_check(user["id"], p.data)
            except Exception as e:
                logger.warning("background AI check skipped: %s", e)
        asyncio.create_task(_bg_ai())
    return {"ok": True}


@router.post("/auth/supplier-document-upload")
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
        "doc_pan", "doc_bank_proof", "doc_id_proof", "doc_address_proof",
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


@router.post("/supplier/business-logo")
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


@router.get("/supplier/business-logo")
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


class SupplierProfileUpdate(BaseModel):
    business_name: Optional[str] = None


@router.put("/supplier/profile")
def supplier_update_profile(payload: SupplierProfileUpdate, user: dict = Depends(require_user)):
    """Approved supplier edits their own business / company name."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved suppliers can edit their profile")
    upd: dict = {}
    if payload.business_name and payload.business_name.strip():
        upd["business_name"] = sanitize(payload.business_name.strip(), 120)
    if not upd:
        raise HTTPException(400, "Nothing to update")
    sb_admin.table("suppliers").update(upd).eq("user_id", user["id"]).execute()
    # Keep the denormalised users.company in sync (best-effort)
    try:
        sb_admin.table("users").update({"company": upd["business_name"]}).eq("id", user["id"]).execute()
    except Exception:
        pass
    return {"ok": True, "business_name": upd.get("business_name")}


@router.get("/auth/me")
def me(user: dict = Depends(require_user)):
    """Returns the user profile + application status if any.
    Roles: 'admin' | 'supplier' (= seller) | 'customer' (= buyer).
    application_status: 'pending' | 'rejected' | None — derived from suppliers_pending."""
    out = dict(user)
    # Buyer GSTIN (optional, used for GST invoicing on orders) + segmentation type
    try:
        u = sb_admin.table("users").select("gst_number,user_type").eq("id", user["id"]).maybe_single().execute()
        out["gst_number"] = (u.data or {}).get("gst_number") if u else None
        out["user_type"] = (u.data or {}).get("user_type") if u else None
    except Exception:
        out["gst_number"] = None
        out["user_type"] = None
    # Approved supplier?
    if user.get("role") == "supplier":
        try:
            s = sb_admin.table("suppliers").select(
                "id,business_name,city,approved_at,business_logo,seller_id"
            ).eq("user_id", user["id"]).maybe_single().execute()
        except Exception:
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


class UserTypeUpdate(BaseModel):
    user_type: str  # personal | corporate | dealer | referred_to_procurement


_VALID_USER_TYPES = {"personal", "corporate", "dealer", "referred_to_procurement"}


@router.post("/auth/user-type")
def set_user_type(payload: UserTypeUpdate, user: dict = Depends(require_user)):
    """One-time buyer segmentation. Stored on users.user_type; the onboarding
    screen shows only when this is null. Idempotent — re-setting just updates."""
    if payload.user_type not in _VALID_USER_TYPES:
        raise HTTPException(400, "Invalid user_type")
    try:
        sb_admin.table("users").update({"user_type": payload.user_type}).eq("id", user["id"]).execute()
    except Exception as e:
        if "user_type" in str(e):
            raise HTTPException(503, "user_type column not migrated — run supabase_schema_consumables.sql") from e
        raise
    return {"ok": True, "user_type": payload.user_type}


_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@router.patch("/auth/me")
def update_me(payload: ProfileUpdate, user: dict = Depends(require_user)):
    """Buyer can save an optional GST number for GST invoicing.
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


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/auth/password-reset")
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
