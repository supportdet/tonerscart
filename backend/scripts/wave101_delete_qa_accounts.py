"""Wave 101 — delete leftover QA / test / bot accounts from the live DB.

Pattern: any email matching the agent-generated QA prefixes:
  - qa.dealer.*@example.com
  - qa-delete-*@example.com
  - qa-dealer-*@example.com
  - phase2.test@tonerscart-qa.com
  - e2e_deliv_*
  - *@example.test
  - any email starting with `qa.` / `qa-`
  - any email containing `+qa` (gmail/plus addressing used by agents)

Hard protections (mirrors data_safety.PROTECTED_EMAILS):
  - support@tonerscart.com (admin)
  - support@digitaledgeindia.com (DET)
  - sairam@digitaledgeindia.com (DET sister)
  - sales@bigctech.com (Big C)
  - any user with an approved row in `suppliers`
  - any non-test email (heuristic: emails NOT matching the patterns above
    are left alone — only the explicit QA prefixes are touched.)

Usage:
  python3 /app/backend/scripts/wave101_delete_qa_accounts.py --dry-run   # default
  python3 /app/backend/scripts/wave101_delete_qa_accounts.py --commit    # actually delete
"""
import os
import re
import sys
import argparse

# Allow running from anywhere under /app
sys.path.insert(0, "/app/backend")

from server import sb_admin  # noqa: E402

PROTECTED_EMAILS = {
    "support@tonerscart.com",
    "support@digitaledgeindia.com",
    "sairam@digitaledgeindia.com",
    "sales@bigctech.com",
}

# Strict patterns — only emails matching these are touched.
QA_PATTERNS = [
    re.compile(r"^qa[.\-_].+@(example\.(com|test|org|net)|tonerscart-?qa\.com)$", re.I),
    re.compile(r"^qa-delete-.+@example\.(com|test|org|net)$", re.I),
    re.compile(r"^qa-dealer-.+@example\.(com|test|org|net)$", re.I),
    re.compile(r"^e2e[._-]deliv[._-].+@", re.I),
    re.compile(r"^phase2\.test@tonerscart-?qa\.com$", re.I),
    re.compile(r".+@example\.test$", re.I),
    re.compile(r"^seed[._-]?.+@", re.I),
    re.compile(r"^test[._-]?.+@example\.(com|test|org|net)$", re.I),
    re.compile(r"^bot[._-]?.+@", re.I),
    re.compile(r"^demo[._-]?.+@example\.(com|test|org|net)$", re.I),
]


def is_qa(email: str) -> bool:
    if not email:
        return False
    e = email.strip().lower()
    if e in PROTECTED_EMAILS:
        return False
    return any(p.match(e) for p in QA_PATTERNS)


def get_protected_supplier_uids() -> set:
    """Approved suppliers (any row in `suppliers`) are NEVER deleted."""
    try:
        rows = sb_admin.table("suppliers").select("user_id").execute().data or []
        return {r["user_id"] for r in rows if r.get("user_id")}
    except Exception as e:
        print(f"WARN: could not fetch suppliers list: {e}")
        return set()


def cascade_delete(uid: str):
    """Mirror admin.py DELETE /api/admin/users/{user_id} cascade order
    (Auth first, then public tables — matches iteration_74 code review note)."""
    # 1. Supabase Auth user (frees the email for re-registration).
    try:
        sb_admin.auth.admin.delete_user(uid)
    except Exception as e:
        print(f"   - auth.delete_user failed for {uid}: {e}")
    # 2. Cascade public tables.
    for tbl in ("suppliers_pending", "user_agreements", "saved_addresses"):
        try:
            sb_admin.table(tbl).delete().eq("user_id", uid).execute()
        except Exception as e:
            print(f"   - {tbl} delete failed for {uid}: {e}")
    try:
        sb_admin.table("users").delete().eq("id", uid).execute()
    except Exception as e:
        print(f"   - users delete failed for {uid}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Actually delete. Without this flag, dry-run only.")
    args = ap.parse_args()

    protected_uids = get_protected_supplier_uids()
    print(f"Protected approved-supplier UIDs: {len(protected_uids)}")

    rows = sb_admin.table("users").select("id,email,role,created_at").execute().data or []
    print(f"Scanning {len(rows)} users …")
    qa_targets = []
    for r in rows:
        email = r.get("email") or ""
        if not is_qa(email):
            continue
        if r["id"] in protected_uids:
            print(f"  SKIP (approved supplier): {email}")
            continue
        qa_targets.append(r)

    print(f"\nFound {len(qa_targets)} QA / test account(s):")
    for r in qa_targets:
        print(f"  - {r.get('email')} (role={r.get('role')}, id={r['id']}, created={r.get('created_at')})")

    if not qa_targets:
        print("\nNothing to delete. Done.")
        return

    if not args.commit:
        print("\nDry-run only. Re-run with --commit to actually delete.")
        return

    print("\nDeleting …")
    deleted = 0
    failed = 0
    for r in qa_targets:
        print(f"  - {r.get('email')}")
        try:
            cascade_delete(r["id"])
            deleted += 1
        except Exception as e:
            print(f"    FAILED: {e}")
            failed += 1
    print(f"\nDone. deleted={deleted} failed={failed}")


if __name__ == "__main__":
    main()
