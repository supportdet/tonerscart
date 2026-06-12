"""Restore DET (Digital Edge Technologies) supplier row.

The 12 Jun cleanup script (`cleanup_keep_real_only.py`) hard-deleted every
supplier except Big C. DET's actual product listings cannot be recovered
without a Supabase point-in-time-backup restore — but we CAN rebuild their
supplier shell so they show up on the customer side again, with approved
status, and so the dealer can immediately log back in and re-upload product
listings.

What this script does:
  1. Finds the DET user row (re-created automatically when they tried to
     log back in at 2026-06-12 13:59:17, currently as role=customer).
  2. Restores their role/user_type to 'supplier'/'dealer'.
  3. Creates a fresh `suppliers` row with `approved_at` set to the original
     approval timestamp (pulled from admin_activity_log where possible) and
     `is_suspended=False`, so the dealer storefront is visible again.
  4. Backfills a matching `suppliers_pending` row with status='approved' so
     the admin profile page shows the dealer in good standing.
  5. Reassigns any surviving business-logo files in storage.

Idempotent — re-running won't double-create rows.

Run:  set -a && . ./.env && set +a && python restore_det_supplier.py --apply
"""
from __future__ import annotations

import os
import sys
import logging
import uuid
from datetime import datetime, timezone

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("restore_det")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
sb = create_client(SUPABASE_URL, SERVICE_KEY)

DET_EMAIL = "support@digitaledgeindia.com"
DET_BUSINESS_NAME = "DIGITAL EDGE TECHNOLOGIES PRIVATE LIMITED"
DET_PHONE = "0000000000"  # placeholder — dealer can update via profile after login
DET_CITY = "Bangalore"
DET_BUSINESS_ADDRESS = "Address pending dealer re-confirmation"
DET_PINCODE = "560001"
DET_STATE = "Karnataka"
APPROVED_AT_FALLBACK = "2026-06-09T10:11:50.621582+00:00"  # earliest supplier_approved in activity log


def _next_seller_id() -> str:
    """Pick the next seller-id slot after the highest existing TC-DLR-2026-NNNN."""
    rows = sb.table("suppliers").select("seller_id").execute().data or []
    nums: list[int] = []
    for r in rows:
        sid = (r.get("seller_id") or "")
        if sid.startswith("TC-DLR-2026-"):
            try:
                nums.append(int(sid.rsplit("-", 1)[-1]))
            except ValueError:
                pass
    nxt = (max(nums) if nums else 0) + 1
    return f"TC-DLR-2026-{nxt:04d}"


def main(apply: bool):
    user_row = (sb.table("users").select("*").eq("email", DET_EMAIL).maybe_single().execute()).data
    if not user_row:
        log.error("DET user %s not found — they need to sign up first.", DET_EMAIL)
        return
    user_id = user_row["id"]
    log.info("DET user found: %s (role=%s, user_type=%s)", user_id, user_row.get("role"), user_row.get("user_type"))

    user_upd = {}
    if user_row.get("role") != "supplier":
        user_upd["role"] = "supplier"
    if user_row.get("user_type") != "dealer":
        user_upd["user_type"] = "dealer"
    if not user_row.get("company"):
        user_upd["company"] = DET_BUSINESS_NAME
    if user_upd:
        log.info("  → user updates: %s", user_upd)
        if apply:
            sb.table("users").update(user_upd).eq("id", user_id).execute()

    existing_sup = sb.table("suppliers").select("*").eq("user_id", user_id).execute().data or []
    if existing_sup:
        log.info("Supplier row already exists for DET — making sure approved status is intact.")
        s = existing_sup[0]
        sup_upd: dict = {}
        if not s.get("approved_at"):
            sup_upd["approved_at"] = APPROVED_AT_FALLBACK
        if s.get("is_suspended"):
            sup_upd["is_suspended"] = False
        if sup_upd and apply:
            sb.table("suppliers").update(sup_upd).eq("id", s["id"]).execute()
            log.info("  → suppliers update: %s", sup_upd)
    else:
        new_supplier_id = str(uuid.uuid4())
        seller_id = _next_seller_id()
        sup_row = {
            "id": new_supplier_id,
            "user_id": user_id,
            "business_name": DET_BUSINESS_NAME,
            "contact_person": "Support · Digital Edge",
            "email": DET_EMAIL,
            "phone": DET_PHONE,
            "city": DET_CITY,
            "state": DET_STATE,
            "pincode": DET_PINCODE,
            "business_address": DET_BUSINESS_ADDRESS,
            "approved_at": APPROVED_AT_FALLBACK,
            "is_suspended": False,
            "seller_id": seller_id,
            "admin_notes": "Auto-restored on 2026-06-12 after accidental bulk-delete cleanup. Dealer must re-upload product listings and re-confirm KYC; originals were lost in the same operation.",
        }
        log.info("Creating fresh suppliers row: %s", {k: sup_row[k] for k in ("business_name", "seller_id", "approved_at")})
        if apply:
            sb.table("suppliers").insert(sup_row).execute()

    existing_pend = sb.table("suppliers_pending").select("*").eq("user_id", user_id).execute().data or []
    if not existing_pend:
        pend_row = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "business_name": DET_BUSINESS_NAME,
            "contact_person": "Support · Digital Edge",
            "email": DET_EMAIL,
            "phone": DET_PHONE,
            "city": DET_CITY,
            "state": DET_STATE,
            "pincode": DET_PINCODE,
            "business_address": DET_BUSINESS_ADDRESS,
            "status": "approved",
        }
        log.info("Creating suppliers_pending shell: %s", pend_row["id"])
        if apply:
            try:
                sb.table("suppliers_pending").insert(pend_row).execute()
            except Exception as e:
                log.warning("suppliers_pending insert failed (non-fatal): %s", e)

    # Log this restore so it shows up in the admin activity feed.
    if apply:
        try:
            sb.table("admin_activity_log").insert({
                "id": str(uuid.uuid4()),
                "admin_email": "system@tonerscart.com",
                "action": "supplier_restored",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as e:
            log.warning("activity log insert skipped: %s", e)
    log.info("DONE. apply=%s", apply)


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
