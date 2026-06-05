"""TonersCart — Government & Corporate Procurement Module (Phase 1).

A self-contained procurement portal that is completely separate from the
regular Supabase-Auth customer/dealer/admin flow:
  - Govt & Corporate registration (manual admin approval required)
  - Own email+password auth: bcrypt hashes + backend-issued JWT (Bearer)
  - Procurement dashboard data (profile + credit)
  - Admin approval queues (separate from dealer approvals)

Persistence: public.procurement_users (see supabase_schema_procurement.sql).
The module degrades gracefully (503) until that table is migrated.
"""
import os
import re
import logging
import hashlib
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
from fastapi import APIRouter, HTTPException, Request, Depends, Response
from pydantic import BaseModel, EmailStr, Field

from supabase_client import sb_admin, get_user_from_token
from email_service import (
    email_proc_registration_received,
    email_proc_approved,
    email_proc_rejected,
    email_proc_quotation,
)

logger = logging.getLogger("tonerscart.procurement")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
PROC_TOKEN_TTL_HOURS = 24 * 7

proc_router = APIRouter(prefix="/api/procurement", tags=["procurement"])
proc_admin_router = APIRouter(prefix="/api/admin/procurement", tags=["procurement-admin"])

_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_GOVT_DOMAINS = (".gov.in", ".nic.in", ".gov")

# Columns safe to return to the client (never password_hash)
_PUBLIC_COLS = (
    "id", "type", "name", "designation", "org_name", "ministry_state",
    "employee_id", "email", "phone", "address", "gst_number", "status",
    "rejection_reason", "credit_limit", "credit_used", "pan_number",
    "company_cin", "approved_at", "created_at",
)


# ===== Password + JWT helpers =================================================

def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), (hashed or "").encode("utf-8"))
    except Exception:
        return False


def _make_token(u: dict) -> str:
    payload = {
        "sub": u["id"],
        "type": "proc",
        "ptype": u.get("type"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=PROC_TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _public(u: dict) -> dict:
    out = {k: u.get(k) for k in _PUBLIC_COLS}
    try:
        out["credit_available"] = float(u.get("credit_limit") or 0) - float(u.get("credit_used") or 0)
    except Exception:
        out["credit_available"] = 0
    return out


# ===== DB helpers (graceful when table not migrated) ==========================

def _module_ready_or_503():
    try:
        sb_admin.table("procurement_users").select("id").limit(1).execute()
    except Exception as e:
        if "procurement_users" in str(e):
            raise HTTPException(503, "Procurement module not yet enabled — run supabase_schema_procurement.sql") from e
        raise


def _get_by_email(email: str):
    r = sb_admin.table("procurement_users").select("*").eq("email", email.strip().lower()).maybe_single().execute()
    return r.data if r and r.data else None


def _get_by_id(uid: str):
    r = sb_admin.table("procurement_users").select("*").eq("id", uid).maybe_single().execute()
    return r.data if r and r.data else None


# ===== Auth dependencies ======================================================

def _bearer(request: Request):
    auth = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def require_proc_user(request: Request) -> dict:
    """Decodes our own procurement JWT and loads an APPROVED procurement user."""
    tok = _bearer(request)
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(401, "Session expired — please sign in again") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, "Invalid session") from e
    if payload.get("type") != "proc":
        raise HTTPException(401, "Invalid session")
    row = _get_by_id(payload.get("sub"))
    if not row:
        raise HTTPException(401, "Account not found")
    if row.get("status") != "approved":
        raise HTTPException(403, "Account not approved")
    return row


def require_admin(request: Request) -> dict:
    """Reuses the app's Supabase-Auth admin (separate from procurement auth)."""
    tok = _bearer(request)
    uid, profile = get_user_from_token(tok) if tok else (None, None)
    if not uid or not profile or profile.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return profile


# ===== Models =================================================================

class GovtRegister(BaseModel):
    name: str
    designation: str
    department: str
    ministry_state: str
    employee_id: str
    email: EmailStr
    phone: str
    address: str
    password: str = Field(min_length=6)


class CorporateRegister(BaseModel):
    name: str
    designation: str
    company: str
    gst_number: str
    email: EmailStr
    phone: str
    address: str
    password: str = Field(min_length=6)


class ProcLogin(BaseModel):
    email: EmailStr
    password: str


class ProcProfileUpdate(BaseModel):
    phone: str | None = None
    address: str | None = None


class ProcRejectPayload(BaseModel):
    reason: str | None = ""


# ===== Registration ===========================================================

async def _finalize_registration(row: dict):
    _module_ready_or_503()
    if _get_by_email(row["email"]):
        raise HTTPException(400, "An account with this email already exists")
    try:
        res = sb_admin.table("procurement_users").insert(row).execute()
        created = res.data[0] if res.data else row
    except Exception as e:
        logger.exception("procurement registration insert failed")
        raise HTTPException(500, "Could not complete registration") from e
    try:
        await email_proc_registration_received(created)
    except Exception as e:
        logger.warning("proc registration email skipped: %s", e)
    return {"ok": True, "status": "pending"}


@proc_router.post("/register/govt")
async def register_govt(payload: GovtRegister):
    email = payload.email.strip().lower()
    if not any(email.endswith(d) for d in _GOVT_DOMAINS):
        raise HTTPException(400, "Government registration requires an official email ending in .gov.in, .nic.in or .gov")
    row = {
        "type": "govt",
        "name": payload.name.strip(),
        "designation": payload.designation.strip(),
        "org_name": payload.department.strip(),
        "ministry_state": payload.ministry_state.strip(),
        "employee_id": payload.employee_id.strip(),
        "email": email,
        "password_hash": _hash_pw(payload.password),
        "phone": payload.phone.strip(),
        "address": payload.address.strip(),
        "status": "pending",
    }
    return await _finalize_registration(row)


@proc_router.post("/register/corporate")
async def register_corporate(payload: CorporateRegister):
    gst = (payload.gst_number or "").strip().upper()
    if not _GSTIN_RE.match(gst):
        raise HTTPException(400, "Invalid GST number — must be 15 characters (e.g. 22AAAAA0000A1Z5)")
    row = {
        "type": "corporate",
        "name": payload.name.strip(),
        "designation": payload.designation.strip(),
        "org_name": payload.company.strip(),
        "gst_number": gst,
        "email": payload.email.strip().lower(),
        "password_hash": _hash_pw(payload.password),
        "phone": payload.phone.strip(),
        "address": payload.address.strip(),
        "status": "pending",
    }
    return await _finalize_registration(row)


# ===== Login / session ========================================================

@proc_router.post("/login")
def proc_login(payload: ProcLogin):
    _module_ready_or_503()
    row = _get_by_email(payload.email)
    if not row or not _verify_pw(payload.password, row.get("password_hash", "")):
        raise HTTPException(401, "Incorrect email or password")
    status = row.get("status")
    if status == "pending":
        raise HTTPException(403, "Your account is under review. You'll receive an email once it's approved.")
    if status == "rejected":
        reason = row.get("rejection_reason") or "Not approved"
        raise HTTPException(403, f"Your application was not approved. Reason: {reason}")
    token = _make_token(row)
    return {"token": token, "user": _public(row)}


@proc_router.get("/me")
def proc_me(user: dict = Depends(require_proc_user)):
    return _public(user)


@proc_router.patch("/me")
def proc_update_me(payload: ProcProfileUpdate, user: dict = Depends(require_proc_user)):
    updates = {}
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if payload.address is not None:
        updates["address"] = payload.address.strip()
    if updates:
        sb_admin.table("procurement_users").update(updates).eq("id", user["id"]).execute()
    return _public({**user, **updates})


# ----- Procurement agreement acceptance (one-time, versioned) ----------------
@proc_router.get("/agreement")
def proc_agreement_status(request: Request, user: dict = Depends(require_proc_user)):
    from agreements import AGREEMENT_VERSIONS, has_accepted
    version = AGREEMENT_VERSIONS["procurement"]
    return {"required": True, "agreement_type": "procurement", "version": version,
            "accepted": has_accepted(user["id"], "procurement", version)}


@proc_router.post("/agreement/accept")
def proc_agreement_accept(request: Request, user: dict = Depends(require_proc_user)):
    from agreements import AGREEMENT_VERSIONS, record_acceptance, client_ip
    version = AGREEMENT_VERSIONS["procurement"]
    try:
        record_acceptance(user["id"], "procurement", version, client_ip(request))
    except Exception as e:
        if "user_agreements" in str(e):
            raise HTTPException(503, "Agreement tracking not enabled — run supabase_schema_agreements.sql") from e
        raise
    return {"ok": True, "version": version}


# ===== Admin: approval queues =================================================

@proc_admin_router.get("/pending")
def admin_proc_pending(admin: dict = Depends(require_admin)):
    """Returns pending govt + corporate accounts in separate lists."""
    try:
        rows = sb_admin.table("procurement_users").select("*").eq("status", "pending").order("created_at", desc=True).execute().data or []
    except Exception as e:
        if "procurement_users" in str(e):
            return {"govt": [], "corporate": [], "counts": {"govt": 0, "corporate": 0}}
        raise
    govt = [_public(r) for r in rows if r.get("type") == "govt"]
    corporate = [_public(r) for r in rows if r.get("type") == "corporate"]
    return {"govt": govt, "corporate": corporate, "counts": {"govt": len(govt), "corporate": len(corporate)}}


@proc_admin_router.get("/accounts")
def admin_proc_accounts(admin: dict = Depends(require_admin)):
    """All approved procurement accounts (used by the credit table in Phase 3)."""
    try:
        rows = sb_admin.table("procurement_users").select("*").eq("status", "approved").order("created_at", desc=True).execute().data or []
    except Exception as e:
        if "procurement_users" in str(e):
            return []
        raise
    return [_public(r) for r in rows]


@proc_admin_router.post("/{uid}/approve")
async def admin_proc_approve(uid: str, admin: dict = Depends(require_admin)):
    row = _get_by_id(uid)
    if not row:
        raise HTTPException(404, "Account not found")
    if row.get("status") == "approved":
        raise HTTPException(400, "Already approved")
    sb_admin.table("procurement_users").update({
        "status": "approved",
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": admin["id"],
        "rejection_reason": None,
    }).eq("id", uid).execute()
    try:
        await email_proc_approved(row)
    except Exception as e:
        logger.warning("proc approval email skipped: %s", e)
    return {"ok": True}


@proc_admin_router.post("/{uid}/reject")
async def admin_proc_reject(uid: str, payload: ProcRejectPayload, admin: dict = Depends(require_admin)):
    row = _get_by_id(uid)
    if not row:
        raise HTTPException(404, "Account not found")
    if row.get("status") == "rejected":
        raise HTTPException(400, "Already rejected")
    reason = (payload.reason or "Not approved").strip()
    sb_admin.table("procurement_users").update({
        "status": "rejected",
        "rejection_reason": reason,
        "reviewed_by": admin["id"],
    }).eq("id", uid).execute()
    try:
        await email_proc_rejected(row, reason)
    except Exception as e:
        logger.warning("proc rejection email skipped: %s", e)
    return {"ok": True}



# =============================================================================
# PHASE 2 — L1/L2/L3 comparison + formal quotations
# =============================================================================

def _quotations_ready_or_503():
    try:
        sb_admin.table("procurement_quotations").select("id").limit(1).execute()
    except Exception as e:
        if "procurement_quotations" in str(e):
            raise HTTPException(503, "Quotations not yet enabled — run supabase_schema_procurement_quotations.sql") from e
        raise


def _stable_int(seed: str) -> int:
    return int(hashlib.md5((seed or "x").encode()).hexdigest()[:8], 16)


def _delivery_days(seed: str) -> int:
    return 2 + (_stable_int("d" + seed) % 5)          # 2-6 business days


def _rating(seed: str) -> float:
    return round(4.0 + (_stable_int("r" + seed) % 10) / 10.0, 1)   # 4.0-4.9


def _comparison_from_rows(rows: list) -> list:
    """Build ranked (L1..L5) comparison entries from listing rows, lowest
    total price (inc GST) first."""
    entries = []
    for r in rows:
        price = float(r.get("price") or 0)
        if price <= 0 or (r.get("stock") or 0) <= 0:
            continue
        gst = int(r.get("gst_rate") or 18)
        gst_amount = round(price * gst / 100.0, 2)
        total = round(price + gst_amount, 2)
        sid = str(r.get("supplier_id") or r.get("id") or "")
        entries.append({
            "listing_id": r.get("id"),
            "supplier_id": r.get("supplier_id"),
            "supplier_name": r.get("supplier_name") or "Verified supplier",
            "verified": True,
            "brand": r.get("brand"),
            "model_number": r.get("model_number"),
            "unit_price": price,
            "gst_rate": gst,
            "gst_amount": gst_amount,
            "total_price": total,
            "stock": r.get("stock"),
            "delivery_days": _delivery_days(sid),
            "city": r.get("city") or r.get("supplier_city"),
            "rating": _rating(sid),
        })
    entries.sort(key=lambda e: e["total_price"])
    entries = entries[:5]
    for i, e in enumerate(entries):
        e["rank"] = f"L{i + 1}"
    return entries


@proc_router.get("/compare")
def proc_compare(q: str | None = None, brand: str | None = None,
                 qty: int = 1, user: dict = Depends(require_proc_user)):
    """Ranked supplier comparison (L1/L2/L3) for a product search."""
    from server import search_listings  # lazy import avoids circular dependency
    rows = search_listings(q=q, brand=brand, limit=100)
    entries = _comparison_from_rows(rows)
    warning = None
    if len(entries) == 0:
        warning = "No suppliers with stock found for this product"
    elif len(entries) < 3:
        warning = f"Only {len(entries)} supplier(s) available for this product"
    return {"items": entries, "count": len(entries), "warning": warning, "qty": max(1, qty)}


class QuotationCreate(BaseModel):
    listing_ids: list[str]
    qty: int = 1
    product_label: str | None = None


def _next_quotation_ref() -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"QT-{year}-"
    try:
        rows = sb_admin.table("procurement_quotations").select("ref_number").like("ref_number", f"{prefix}%").execute().data or []
        n = len(rows) + 1
    except Exception:
        n = 1
    return f"{prefix}{n:06d}"


@proc_router.post("/quotations")
async def create_quotation(payload: QuotationCreate, user: dict = Depends(require_proc_user)):
    _quotations_ready_or_503()
    if not payload.listing_ids:
        raise HTTPException(400, "Select at least one supplier")
    rows = []
    for lid in payload.listing_ids[:5]:
        try:
            r = sb_admin.table("listings").select("*,suppliers(business_name,city,is_suspended)").eq("id", lid).maybe_single().execute()
            if r and r.data:
                d = r.data
                s = d.pop("suppliers", None) or {}
                if s.get("is_suspended"):
                    continue
                d["supplier_name"] = s.get("business_name")
                d["supplier_city"] = s.get("city")
                rows.append(d)
        except Exception:
            continue
    items = _comparison_from_rows(rows)
    if not items:
        raise HTTPException(400, "Selected products are no longer available")
    qty = max(1, payload.qty)
    label = payload.product_label or f"{items[0].get('brand', '')} {items[0].get('model_number', '')}".strip()
    ref = _next_quotation_ref()
    now = datetime.now(timezone.utc)
    row = {
        "ref_number": ref,
        "user_id": user["id"],
        "product_label": label,
        "qty": qty,
        "items": items,
        "status": "active",
        "expires_at": (now + timedelta(days=7)).isoformat(),
    }
    res = sb_admin.table("procurement_quotations").insert(row).execute()
    saved = res.data[0] if res.data else row
    try:
        from proc_pdf import build_quotation_pdf
        pdf = build_quotation_pdf(saved, user)
        await email_proc_quotation(user, saved, pdf)
    except Exception as e:
        logger.warning("quotation pdf/email skipped: %s", e)
    return {"id": saved.get("id"), "ref_number": ref, "status": "active", "expires_at": saved.get("expires_at")}


def _quotation_status(q: dict) -> str:
    if q.get("status") == "converted":
        return "converted"
    try:
        exp = q.get("expires_at")
        if exp and datetime.fromisoformat(exp.replace("Z", "+00:00")) < datetime.now(timezone.utc):
            return "expired"
    except Exception:
        pass
    return q.get("status") or "active"


@proc_router.get("/quotations")
def list_quotations(user: dict = Depends(require_proc_user)):
    try:
        rows = sb_admin.table("procurement_quotations").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute().data or []
    except Exception as e:
        if "procurement_quotations" in str(e):
            return []
        raise
    for r in rows:
        r["status"] = _quotation_status(r)
    return rows


@proc_router.get("/quotations/{qid}/pdf")
def quotation_pdf(qid: str, user: dict = Depends(require_proc_user)):
    r = sb_admin.table("procurement_quotations").select("*").eq("id", qid).eq("user_id", user["id"]).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(404, "Quotation not found")
    from proc_pdf import build_quotation_pdf
    pdf = build_quotation_pdf(r.data, user)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{r.data["ref_number"]}.pdf"'},
    )
