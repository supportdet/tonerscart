"""One-shot seed for Supabase:
  1. Inserts admin user into auth.users + public.users (if missing)
  2. Loads /app/backend/toner_master_seed.py (174 SKUs) into public.toner_master

Idempotent — safe to re-run. Drops "Refilled" toner type variants.
"""
import os
import re
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv(Path(__file__).parent / ".env")

from supabase_client import sb_admin
from toner_master_seed import TONER_MASTER

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@tonerscart.in")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def ensure_admin():
    # Find by email in auth.users
    existing = sb_admin.auth.admin.list_users()
    admin_user = None
    for u in existing:
        if (getattr(u, "email", None) or "").lower() == ADMIN_EMAIL:
            admin_user = u
            break
    if admin_user is None:
        created = sb_admin.auth.admin.create_user({
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"name": "TonersCart Admin", "role": "admin"},
        })
        admin_user = created.user
        print(f"  ↳ Created auth user {admin_user.id} ({ADMIN_EMAIL})")
    else:
        print(f"  ↳ Auth user already exists ({ADMIN_EMAIL})")

    # Upsert public.users profile row
    sb_admin.table("users").upsert({
        "id": admin_user.id,
        "email": ADMIN_EMAIL,
        "name": "TonersCart Admin",
        "role": "admin",
    }, on_conflict="id").execute()
    print("  ↳ Profile row upserted (role=admin)")


def seed_toner_master():
    # Filter Refilled (per spec — Original/Compatible only)
    rows = []
    seen = set()
    for entry in TONER_MASTER:
        # Original seed format: (brand, model, compat, type, color, yield)
        brand, model, compat, ttype, color, yld = entry
        if ttype == "Refilled":
            continue
        # Dedup: each unique (brand, model_number) only once for the catalog
        key = (brand, model)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "brand": brand,
            "model_number": model,
            "model_normalized": model.lower().strip(),
            "search_norm": normalize(f"{brand}{model}"),
            "printer_compatibility": compat,
            "color": color,
            "page_yield": yld,
        })

    print(f"  ↳ {len(rows)} unique catalog entries to upsert (Refilled filtered out)")
    # Upsert in chunks
    CHUNK = 100
    inserted = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i : i + CHUNK]
        sb_admin.table("toner_master").upsert(
            chunk, on_conflict="brand,model_number"
        ).execute()
        inserted += len(chunk)
    # Verify
    cnt = sb_admin.table("toner_master").select("id", count="exact").execute()
    print(f"  ↳ Upserted {inserted}; total in DB: {cnt.count}")


if __name__ == "__main__":
    print("→ Seeding admin user")
    ensure_admin()
    print("→ Seeding toner_master")
    seed_toner_master()
    print("✅ Done")
