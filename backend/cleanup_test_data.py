"""One-time cleanup of test/seed/demo data.

Run via the dedicated admin endpoint `POST /api/admin/cleanup-test-data` OR directly with:

    python -m cleanup_test_data --apply

Without `--apply` it does a dry-run.

Rules (any one of these makes a row a deletion candidate):

* Supplier email contains `test`, `seed`, `demo`, `example`, `dummy`, `fake`, or `tonerscart.test`
* listings.model_number that looks like a random 8+ char alphanumeric token (e.g. `99992F5391`, `9999AC4451`, `9999856D38`)
* printer_listings / paper_listings rows belonging to a deletion-candidate supplier
* orders rows belonging to a deletion-candidate listing/supplier
"""

import os
import re
import sys
import logging
from typing import Iterable

from supabase import create_client

logger = logging.getLogger("cleanup_test_data")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

TEST_TOKENS = ("test", "seed", "demo", "example", "dummy", "fake", "tonerscart.test", "sample")
FAKE_MODEL_RE = re.compile(r"^[0-9]{4,}[A-Z0-9]{4,}$|^[A-Z0-9]{10,}$|^9999[A-Z0-9]{4,}$")


def _is_test_email(email: str) -> bool:
    e = (email or "").lower()
    return any(tok in e for tok in TEST_TOKENS)


def _is_fake_model(m: str) -> bool:
    m = (m or "").strip().upper()
    if not m:
        return False
    return bool(FAKE_MODEL_RE.match(m))


def find_test_suppliers() -> list[dict]:
    """Returns suppliers whose linked user email looks like a test/seed/demo account."""
    users = sb.table("users").select("id,email").execute().data or []
    test_user_ids = {u["id"] for u in users if _is_test_email(u.get("email"))}
    if not test_user_ids:
        return []
    sups = sb.table("suppliers").select("id,business_name,user_id").in_(
        "user_id", list(test_user_ids)
    ).execute().data or []
    return sups


def find_fake_listings() -> list[dict]:
    listings = sb.table("listings").select("id,model_number,supplier_id").limit(5000).execute().data or []
    out = []
    for L in listings:
        if _is_fake_model(L.get("model_number")):
            out.append(L)
    return out


def _delete_many(table: str, ids: Iterable[str], apply: bool):
    ids = list({i for i in ids if i})
    if not ids:
        return 0
    if not apply:
        return len(ids)
    deleted = 0
    BATCH = 100
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        try:
            sb.table(table).delete().in_("id", chunk).execute()
            deleted += len(chunk)
        except Exception as e:
            logger.warning("Failed to delete batch from %s: %s", table, e)
    return deleted


def run(apply: bool = False) -> dict:
    report = {"applied": apply}

    test_suppliers = find_test_suppliers()
    test_supplier_ids = [s["id"] for s in test_suppliers]
    test_user_ids = [s["user_id"] for s in test_suppliers if s.get("user_id")]
    fake_listings = find_fake_listings()
    fake_listing_ids = [L["id"] for L in fake_listings]

    # Listings tied to test suppliers
    sup_listings = []
    if test_supplier_ids:
        sup_listings = sb.table("listings").select("id").in_(
            "supplier_id", test_supplier_ids
        ).execute().data or []
    listings_to_delete = list({*fake_listing_ids, *[L["id"] for L in sup_listings]})

    # Printer/paper listings tied to test suppliers
    printer_ids, paper_ids = [], []
    if test_supplier_ids:
        try:
            pr = sb.table("printer_listings").select("id").in_("supplier_id", test_supplier_ids).execute().data or []
            printer_ids = [r["id"] for r in pr]
        except Exception:
            pass
        try:
            pp = sb.table("paper_listings").select("id").in_("supplier_id", test_supplier_ids).execute().data or []
            paper_ids = [r["id"] for r in pp]
        except Exception:
            pass

    # Orders attached to test suppliers OR listings
    order_ids = []
    if test_supplier_ids:
        os1 = sb.table("orders").select("id").in_("supplier_id", test_supplier_ids).execute().data or []
        order_ids.extend(o["id"] for o in os1)
    if listings_to_delete:
        for i in range(0, len(listings_to_delete), 100):
            chunk = listings_to_delete[i:i + 100]
            os2 = sb.table("orders").select("id").in_("listing_id", chunk).execute().data or []
            order_ids.extend(o["id"] for o in os2)

    # Quotation rows for these listings
    quot_ids = []
    if listings_to_delete:
        try:
            for i in range(0, len(listings_to_delete), 100):
                chunk = listings_to_delete[i:i + 100]
                qr = sb.table("quotations").select("id").in_("listing_id", chunk).execute().data or []
                quot_ids.extend(q["id"] for q in qr)
        except Exception:
            pass

    report["preview"] = {
        "test_suppliers": len(test_suppliers),
        "test_users": len(test_user_ids),
        "fake_listings_by_model": len(fake_listings),
        "listings": len(listings_to_delete),
        "printers": len(printer_ids),
        "papers": len(paper_ids),
        "orders": len(order_ids),
        "quotations": len(quot_ids),
    }

    # Order of deletion to respect FKs
    report["deleted"] = {
        "orders":     _delete_many("orders", order_ids, apply),
        "quotations": _delete_many("quotations", quot_ids, apply),
        "listings":   _delete_many("listings", listings_to_delete, apply),
        "printers":   _delete_many("printer_listings", printer_ids, apply),
        "papers":     _delete_many("paper_listings", paper_ids, apply),
        "suppliers":  _delete_many("suppliers", test_supplier_ids, apply),
        "users":      _delete_many("users", test_user_ids, apply),
    }
    logger.info("Cleanup result: %s", report)
    return report


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    out = run(apply=apply)
    print(out)
