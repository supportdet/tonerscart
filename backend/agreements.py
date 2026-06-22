"""TonersCart — user agreement acceptance.

Tracks one-time (versioned) acceptance of role-specific agreements:
  - seller      → role=supplier
  - oem         → role=oem
  - customer    → role=customer
  - procurement → procurement_users (handled in procurement.py, same table)

Persistence: public.user_agreements (supabase_schema_agreements.sql).
Fails OPEN if the table is missing (never locks users out before migration).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from supabase_client import sb_admin, get_user_from_token

logger = logging.getLogger("tonerscart.agreements")

agreements_router = APIRouter(prefix="/api/agreements", tags=["agreements"])
agreements_admin_router = APIRouter(prefix="/api/admin/agreements", tags=["agreements-admin"])

# Bump a version to force existing users to re-accept that agreement.
AGREEMENT_VERSIONS = {"seller": "2.0", "oem": "1.0", "customer": "1.0", "procurement": "1.0"}
ROLE_TO_TYPE = {"supplier": "seller", "oem": "oem", "customer": "customer"}


def _bearer(request: Request):
    auth = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    return auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None


def client_ip(request: Request):
    fwd = request.headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def record_acceptance(user_id: str, agreement_type: str, version: str, ip: str | None):
    """Upsert an acceptance row. Shared by Supabase + procurement flows."""
    sb_admin.table("user_agreements").upsert({
        "user_id": user_id,
        "agreement_type": agreement_type,
        "version": version,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "ip_address": ip,
    }, on_conflict="user_id,agreement_type").execute()


def has_accepted(user_id: str, agreement_type: str, version: str) -> bool:
    try:
        r = (
            sb_admin.table("user_agreements").select("version")
            .eq("user_id", user_id).eq("agreement_type", agreement_type)
            .maybe_single().execute()
        )
        return bool(r and r.data and r.data.get("version") == version)
    except Exception as e:
        if "user_agreements" in str(e):
            return True  # fail open — table not migrated yet
        raise


class AcceptIn(BaseModel):
    agreement_type: str | None = None


@agreements_router.get("/status")
def agreement_status(request: Request):
    uid, profile = get_user_from_token(_bearer(request))
    if not uid or not profile:
        raise HTTPException(401, "Not authenticated")
    atype = ROLE_TO_TYPE.get(profile.get("role"))
    if not atype:
        return {"required": False}
    version = AGREEMENT_VERSIONS[atype]
    return {"required": True, "agreement_type": atype, "version": version,
            "accepted": has_accepted(uid, atype, version)}


@agreements_router.post("/accept")
def agreement_accept(request: Request):
    uid, profile = get_user_from_token(_bearer(request))
    if not uid or not profile:
        raise HTTPException(401, "Not authenticated")
    atype = ROLE_TO_TYPE.get(profile.get("role"))
    if not atype:
        raise HTTPException(400, "No agreement applies to this role")
    version = AGREEMENT_VERSIONS[atype]
    try:
        record_acceptance(uid, atype, version, client_ip(request))
    except Exception as e:
        if "user_agreements" in str(e):
            raise HTTPException(503, "Agreement tracking not enabled — run supabase_schema_agreements.sql") from e
        raise
    return {"ok": True, "version": version}


@agreements_admin_router.get("")
def admin_agreements(request: Request):
    uid, profile = get_user_from_token(_bearer(request))
    if not uid or not profile or profile.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    try:
        rows = sb_admin.table("user_agreements").select("*").order("accepted_at", desc=True).execute().data or []
    except Exception as e:
        if "user_agreements" in str(e):
            return {"acceptances": [], "versions": AGREEMENT_VERSIONS}
        raise
    return {"acceptances": rows, "versions": AGREEMENT_VERSIONS}
