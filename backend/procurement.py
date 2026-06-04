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
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr, Field

from supabase_client import sb_admin, get_user_from_token
from email_service import (
    email_proc_registration_received,
    email_proc_approved,
    email_proc_rejected,
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
