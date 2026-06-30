"""Wave 101 hotfix-5 — Backfill doc fields from suppliers_pending → suppliers
for ALREADY-approved dealers.

The old `admin_approve` only copied `doc_id_proof` (one doc) and left
`doc_gst`, `doc_pan`, `doc_bank_proof`, `doc_address_proof`,
`doc_brand_authorization`, `doc_shop_photo` stranded in `suppliers_pending`.
This is why approved dealers like ZION / VERVE / BIG C see "3 docs missing"
on their dashboard — the Phase2Banner reads from `suppliers` which has
NULLs while `suppliers_pending` has the actual paths.

This script is idempotent: it only fills NULL fields in `suppliers`.
"""
import sys
sys.path.insert(0, "/app/backend")
from server import sb_admin  # noqa: E402

DOC_FIELDS = (
    "doc_gst",
    "doc_pan",
    "doc_id_proof",
    "doc_address_proof",
    "doc_bank_proof",
    "doc_brand_authorization",
    "doc_shop_photo",
)


def main():
    sups = sb_admin.table("suppliers").select("id,user_id,business_name," + ",".join(DOC_FIELDS)).execute().data or []
    print(f"Scanning {len(sups)} approved suppliers …")

    fixed = 0
    skipped = 0
    for s in sups:
        uid = s.get("user_id")
        if not uid:
            continue
        # What's missing?
        missing = [f for f in DOC_FIELDS if not s.get(f)]
        if not missing:
            continue
        try:
            p = sb_admin.table("suppliers_pending").select(",".join(DOC_FIELDS)).eq("user_id", uid).maybe_single().execute()
        except Exception:
            p = None
        pdata = (p.data if p else None) or {}
        # Build a patch — only fill the NULLs in `suppliers` from non-NULL `suppliers_pending` values.
        patch = {}
        for f in missing:
            v = pdata.get(f)
            if v:
                patch[f] = v
        if not patch:
            skipped += 1
            continue
        print(f"  {s.get('business_name', '')[:35]:35} ← {list(patch.keys())}")
        sb_admin.table("suppliers").update(patch).eq("id", s["id"]).execute()
        fixed += 1

    print(f"\nDone. fixed={fixed} skipped={skipped} unchanged={len(sups) - fixed - skipped}")


if __name__ == "__main__":
    main()
