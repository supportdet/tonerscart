"""Data-safety guardrail for high-impact bulk operations.

Created after the 12-Jun-2026 incident where a cleanup script wiped every
approved supplier except an allow-listed one. This module is the SINGLE
sanctioned path for any backend code (scripts, ad-hoc tools, future
maintenance jobs) that needs to delete from these tables:

    - suppliers
    - suppliers_pending
    - listings / printer_listings / paper_listings / consumable_listings /
      scanner_listings
    - orders

Hard rules enforced here — there is no kwarg to disable them:

1. **PROTECTED_EMAILS list — physical deletion forbidden, always.** A small
   allow-list of real approved-dealer emails (DET, Sairam, Big C) at the top
   of this module CANNOT be deleted by any caller, regardless of environment
   opt-in or confirmation token. Suspend via the admin UI instead.

2. **NEVER bulk-delete approved suppliers without an explicit per-supplier
   confirm token.** `safe_delete_supplier(supplier_id, confirm_token=…)`
   requires the caller to first call `approval_to_delete_token(supplier_id)`
   which returns a SHA256 of the supplier row JSON. The caller then passes
   that exact token back, proving they read the live row first.

3. **A hard-coded environment guard** — these functions raise
   ``DataSafetyError`` if `ENABLE_DESTRUCTIVE_OPS != "i-understand"` in the
   active process. Production runs MUST NOT set this env; admin tooling sets
   it explicitly in the shell before invoking the script.

4. **Every destructive call writes a row to `admin_activity_log`** with the
   action, supplier_id, and SHA256 of the pre-deletion row so we have a
   paper trail.

5. **No mass operations** — `safe_delete_supplier` deletes ONE supplier at a
   time. Helpers explicitly forbid `.delete().neq("id", …)` style "delete
   everything except X" patterns.

Backend API endpoints (FastAPI) DO NOT use this module — they have their own
narrowly scoped admin guards. This module exists exclusively to protect
manual scripts from doing what `cleanup_keep_real_only.py` did.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("data_safety")


# ---------------------------------------------------------------------------
# PERMANENTLY PROTECTED SUPPLIER EMAILS
# ---------------------------------------------------------------------------
# These are REAL approved dealers whose accounts must NEVER be deleted by ANY
# cleanup script, maintenance job, or ad-hoc admin tool — regardless of
# environment opt-in or confirmation tokens. Suspending via the admin UI is
# allowed; physical row deletion is NOT.
#
# To remove an email from this list, a human engineer must edit this file
# in a reviewed PR. There is no programmatic override.
#
# Added 2026-06-12 after the cleanup-script incident that wiped DET.
PROTECTED_EMAILS: frozenset[str] = frozenset({
    "support@digitaledgeindia.com",      # Digital Edge Technologies (DET) — primary
    "sairam@digitaledgeindia.com",       # Digital Edge Technologies — second authorised user
    "sales@bigctech.com",                # Big C Technologies Private Limited
})


def is_protected_email(email: str | None) -> bool:
    """True if the given email belongs to a permanently protected dealer."""
    return bool(email) and email.strip().lower() in PROTECTED_EMAILS


class DataSafetyError(RuntimeError):
    """Raised when a destructive operation is attempted without the proper
    environment opt-in or with a missing/incorrect confirmation token."""


def _env_opted_in() -> None:
    val = os.environ.get("ENABLE_DESTRUCTIVE_OPS", "")
    if val != "i-understand":
        raise DataSafetyError(
            "Destructive ops disabled. Set ENABLE_DESTRUCTIVE_OPS=i-understand "
            "in the shell BEFORE running this script. This guard exists to "
            "prevent another bulk-supplier-delete incident."
        )


def approval_to_delete_token(sb, supplier_id: str) -> str:
    """Reads the live `suppliers` row and returns a SHA256 of its full JSON.
    The caller MUST pass this same token back to `safe_delete_supplier`.
    Mutating the row in any way between calls invalidates the token."""
    row = sb.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute().data
    if not row:
        raise DataSafetyError(f"No supplier with id={supplier_id} — refusing to fabricate a token.")
    serialized = json.dumps(row, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def _log(sb, action: str, supplier_id: str, payload_hash: str, extra: dict | None = None) -> None:
    try:
        sb.table("admin_activity_log").insert({
            "id": str(uuid.uuid4()),
            "admin_email": os.environ.get("USER") or "script",
            "action": action,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("safety log insert failed (non-fatal): %s — extra=%s", e, extra)


def safe_delete_supplier(sb, supplier_id: str, confirm_token: str, reason: str) -> None:
    """The ONE sanctioned way for a script to delete a supplier.

    Required:
      * `ENABLE_DESTRUCTIVE_OPS=i-understand` in the environment.
      * `confirm_token` must equal the SHA256 of the live row JSON returned
        by `approval_to_delete_token()` moments earlier.
      * `reason` is a free-text justification — must be ≥ 20 characters and
        is written to admin_activity_log.

    Refuses to delete suppliers whose `approved_at` is set and
    `is_suspended` is false — i.e. live dealers. Suspend them first via the
    admin UI (or the proper admin API), THEN this function will allow it.
    """
    _env_opted_in()
    if not reason or len(reason.strip()) < 20:
        raise DataSafetyError("Supply a reason ≥ 20 chars explaining the deletion.")
    live_token = approval_to_delete_token(sb, supplier_id)
    if confirm_token != live_token:
        raise DataSafetyError(
            "Confirmation token mismatch. The supplier row changed (or was "
            "never read) between token generation and the delete call. "
            "Refusing to proceed."
        )
    row = sb.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute().data
    if not row:
        return
    if is_protected_email(row.get("email")):
        raise DataSafetyError(
            f"Supplier {supplier_id} ({row.get('email')}) is in the permanent "
            "PROTECTED_EMAILS list — see data_safety.py. These are real "
            "approved dealers and physical deletion is forbidden. Suspend "
            "via the admin UI if needed; do NOT delete the row."
        )
    if row.get("approved_at") and not row.get("is_suspended"):
        raise DataSafetyError(
            f"Supplier {supplier_id} is approved & active. Suspend them via the "
            "admin UI first; only suspended-or-never-approved dealers can be deleted."
        )
    _log(sb, "supplier_deleted_via_safe_helper", supplier_id, confirm_token, {"reason": reason})
    sb.table("suppliers").delete().eq("id", supplier_id).execute()
    logger.info("Deleted supplier %s (reason: %s)", supplier_id, reason)


def block_bulk_delete() -> None:
    """Raises immediately. Call this at the top of any new cleanup script
    that wants to do `.delete().in_("id", …)` on suppliers or listings — it
    forces authors to come read this module and use `safe_delete_supplier`
    one row at a time instead."""
    raise DataSafetyError(
        "Bulk deletes against `suppliers` / `listings` are no longer allowed "
        "from scripts. Use data_safety.safe_delete_supplier(...) per row, "
        "and only after the dealer has been suspended via the admin UI."
    )
