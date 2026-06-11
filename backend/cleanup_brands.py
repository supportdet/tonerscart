"""One-off data cleanup: normalize junk brand values in `listings` and
`toner_master`. e.g. brand "CARTRIDGE CANON 071" becomes brand="Canon" with the
old brand text moved into model_number (the toner's display name).
Also deletes leftover TEST_* rows in toner_master (when unreferenced) and fixes
the 'Xeroc' typo in consumable_listings.

Run:  cd /app/backend && python cleanup_brands.py
"""
import re

from supabase_client import sb_admin

BRANDS = ["Konica Minolta", "HP", "Canon", "Brother", "Epson", "Ricoh",
          "Xerox", "Kyocera", "Samsung", "Pantum", "Riso", "Sharp"]


def extract(raw: str):
    s = (raw or "").lower()
    for b in BRANDS:
        if re.search(r"(^|[^a-z])" + re.escape(b.lower()) + r"([^a-z]|$)", s):
            return b
    return None


def clean_model(old_brand: str, brand: str) -> str:
    m = (old_brand or "").strip()
    # Strip a redundant LEADING brand token only ("Canon CRG 303" -> "CRG 303"),
    # but keep inner mentions ("CARTRIDGE CANON 071" stays intact).
    if m.lower().startswith(brand.lower() + " "):
        m = m[len(brand):].strip()
    return m[:50]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def fix_table(table: str):
    rows = sb_admin.table(table).select("id,brand,model_number").execute().data or []
    for r in rows:
        brand = (r.get("brand") or "").strip()
        if brand in BRANDS:
            continue
        b = extract(brand)
        if not b:
            print(f"SKIP  {table} {r['id'][:8]}: unrecognized brand {brand!r}")
            continue
        new_model = clean_model(brand, b)
        upd = {"brand": b, "model_number": new_model, "search_norm": norm(b + new_model)}
        if table == "toner_master":
            upd["model_normalized"] = new_model.lower()
        try:
            sb_admin.table(table).update(upd).eq("id", r["id"]).execute()
            print(f"FIXED {table} {r['id'][:8]}: {brand!r} -> brand={b!r} model={new_model!r}")
        except Exception as e:
            print(f"ERROR {table} {r['id'][:8]}: {e}")


def delete_test_toner_master():
    rows = sb_admin.table("toner_master").select("id,brand").like("brand", "TEST_%").execute().data or []
    for r in rows:
        refs = sb_admin.table("listings").select("id").eq("toner_id", r["id"]).limit(1).execute().data or []
        if refs:
            print(f"KEEP  toner_master {r['id'][:8]} ({r['brand']!r}) — referenced by a listing")
            continue
        sb_admin.table("toner_master").delete().eq("id", r["id"]).execute()
        print(f"DELETED toner_master {r['id'][:8]} ({r['brand']!r})")


def fix_xeroc_typo():
    rows = sb_admin.table("consumable_listings").select("id,brand").eq("brand", "Xeroc").execute().data or []
    for r in rows:
        sb_admin.table("consumable_listings").update({"brand": "Xerox"}).eq("id", r["id"]).execute()
        print(f"FIXED consumable_listings {r['id'][:8]}: 'Xeroc' -> 'Xerox'")


if __name__ == "__main__":
    fix_table("listings")
    fix_table("toner_master")
    delete_test_toner_master()
    fix_xeroc_typo()
    print("Done.")
