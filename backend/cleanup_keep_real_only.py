"""Aggressive cleanup — keep ONLY the admin account and the real dealer
(Big C Technologies) + their listings. Wipe everything else from analytics-
impacting tables: orders, quotations, procurement, customer accounts,
visitor events, dispute threads, supplier-side junk.

Run via:

    set -a && . ./.env && set +a && python cleanup_keep_real_only.py --apply

Dry-run by default.
"""
from __future__ import annotations

import os
import sys
import logging

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("cleanup_keep_real_only")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
sb = create_client(SUPABASE_URL, SERVICE_KEY)

# The single real dealer we keep. Identified by business_name (case-insensitive).
KEEP_BUSINESS_NAME_SUBSTRINGS = ("big c",)
# Always keep the admin support email (defensive — admins should never be wiped).
KEEP_EMAIL_SUBSTRINGS = ("support@tonerscart.com", "admin@tonerscart.com")


def _ids(rows, key="id"):
    return [r[key] for r in (rows or []) if r.get(key)]


def _is_real_supplier(row: dict) -> bool:
    name = (row.get("business_name") or "").lower()
    return any(tok in name for tok in KEEP_BUSINESS_NAME_SUBSTRINGS)


def _is_kept_user(row: dict) -> bool:
    email = (row.get("email") or "").lower()
    return any(tok in email for tok in KEEP_EMAIL_SUBSTRINGS)


def main(apply: bool):
    log.info("Starting cleanup (apply=%s)", apply)

    suppliers = sb.table("suppliers").select("id,business_name,user_id").execute().data or []
    real_supplier_ids = {s["id"] for s in suppliers if _is_real_supplier(s)}
    real_supplier_user_ids = {s["user_id"] for s in suppliers if _is_real_supplier(s) and s.get("user_id")}
    junk_supplier_ids = {s["id"] for s in suppliers if not _is_real_supplier(s)}
    junk_supplier_user_ids = {s["user_id"] for s in suppliers if not _is_real_supplier(s) and s.get("user_id")}

    log.info("Real suppliers kept: %d (%s)", len(real_supplier_ids),
             ", ".join(s["business_name"] for s in suppliers if _is_real_supplier(s)) or "—")
    log.info("Junk suppliers to delete: %d", len(junk_supplier_ids))

    users = sb.table("users").select("id,email,role").execute().data or []
    kept_user_ids = {u["id"] for u in users if _is_kept_user(u)} | real_supplier_user_ids
    junk_user_ids = {u["id"] for u in users if u["id"] not in kept_user_ids}
    log.info("Kept users: %d, junk users to delete: %d", len(kept_user_ids), len(junk_user_ids))

    summary: dict[str, int] = {}

    def wipe(table: str, filter_fn=None, ids_to_delete=None, in_col=None):
        """Helper — counts rows that will be deleted and (if apply) deletes them."""
        try:
            if in_col and ids_to_delete is not None:
                ids = list(ids_to_delete)
                if not ids:
                    summary[table] = 0
                    return
                rows = sb.table(table).select("id").in_(in_col, ids).execute().data or []
                count = len(rows)
                if apply and count:
                    # Chunk delete to keep URLs short.
                    for i in range(0, count, 100):
                        chunk = [r["id"] for r in rows[i:i + 100]]
                        sb.table(table).delete().in_("id", chunk).execute()
            elif filter_fn is None:
                # Wipe entire table.
                rows = sb.table(table).select("id").limit(5000).execute().data or []
                count = len(rows)
                if apply and count:
                    for i in range(0, count, 100):
                        chunk = [r["id"] for r in rows[i:i + 100]]
                        sb.table(table).delete().in_("id", chunk).execute()
            else:
                rows = sb.table(table).select("*").limit(5000).execute().data or []
                matched = [r for r in rows if filter_fn(r)]
                count = len(matched)
                if apply and count:
                    for i in range(0, count, 100):
                        chunk = [r["id"] for r in matched[i:i + 100]]
                        sb.table(table).delete().in_("id", chunk).execute()
            summary[table] = count
            log.info("%s · %s rows", table, count)
        except Exception as e:
            log.warning("skip %s: %s", table, e)
            summary[table] = -1

    # 1) Wipe child records of junk suppliers first (FK safety).
    wipe("orders", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("order_status_events", filter_fn=None)  # no-op if table missing; safe wipe
    wipe("procurement_orders", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("procurement_quotations", filter_fn=None)
    wipe("procurement_quotation_requests", filter_fn=None)
    wipe("listings", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("printer_listings", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("paper_listings", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("consumable_listings", in_col="supplier_id", ids_to_delete=junk_supplier_ids)
    wipe("scanner_listings", in_col="supplier_id", ids_to_delete=junk_supplier_ids)

    # 2) Wipe junk supplier rows themselves + their pending applications.
    wipe("suppliers", in_col="id", ids_to_delete=junk_supplier_ids)
    wipe("suppliers_pending", filter_fn=lambda r: r.get("user_id") in junk_user_ids)

    # 3) Wipe orders that aren't tied to real supplier OR real user.
    wipe("orders", filter_fn=lambda r: r.get("supplier_id") not in real_supplier_ids)

    # 4) Wipe customer-side & analytics noise (tables that exist in this app).
    for t in ("disputes", "dispute_messages", "messages", "message_threads",
              "visitor_events", "analytics_events", "page_views",
              "customer_addresses", "customer_phone_otps", "cart_items",
              "credit_ledger", "procurement_users", "oem_applications",
              "featured_supplier_applications", "agreements_acceptance",
              "saved_searches", "cms_pages_drafts"):
        wipe(t, filter_fn=None)

    # 5) Wipe non-kept users LAST (after their owned rows are gone to avoid FK).
    wipe("users", in_col="id", ids_to_delete=junk_user_ids)

    log.info("DONE summary: %s", summary)
    log.info("APPLIED=%s", apply)


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
