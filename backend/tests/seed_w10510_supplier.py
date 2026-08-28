"""Seed a temporary APPROVED supplier + toner listings for Wave 105.9/105.10 UI tests.

Usage:
    python seed_w10510_supplier.py            # create
    python seed_w10510_supplier.py cleanup <email>
"""
import sys
import uuid

import requests
from dotenv import dotenv_values

sys.path.insert(0, "/app/backend")
from server import sb_admin  # noqa: E402

PWD = "Test@1234"


def create():
    email = f"qa.w10510.ui.{uuid.uuid4().hex[:8]}@example.com"
    u = sb_admin.auth.admin.create_user({
        "email": email, "password": PWD, "email_confirm": True,
        "user_metadata": {"name": "QA UI W105.10", "role": "supplier"},
    })
    uid = u.user.id
    sb_admin.table("users").upsert({
        "id": uid, "email": email, "name": "QA UI W105.10", "role": "supplier",
        "phone": "9000111333", "company": "QA UI W10510 Co", "city": "Bangalore",
    }, on_conflict="id").execute()
    sup = sb_admin.table("suppliers").upsert({
        "user_id": uid, "business_name": "QA UI W10510 Co", "contact_person": "QA UI",
        "phone": "9000111333", "email": email, "city": "Bangalore",
        "business_address": "1 QA Street, Bangalore",
    }, on_conflict="user_id").execute().data[0]
    sid = sup["id"]
    rows = [
        {"brand": "HP", "model_number": "TEST-UI-HP-26A", "color": "Black", "price": 3200,
         "stock": 5, "toner_type": "Compatible", "page_yield": 3100, "oem_part_number": "CF226A",
         "compatible_models": "LaserJet M402", "image_url": "", "image_urls": []},
        {"brand": "Canon", "model_number": "TEST-UI-CN-052", "color": "Cyan", "price": 5400,
         "stock": 2, "toner_type": "Original", "page_yield": 3100, "oem_part_number": "CRG052",
         "compatible_models": "LBP212", "image_url": "", "image_urls": []},
        {"brand": "Epson", "model_number": "TEST-UI-EP-664", "color": "Magenta", "price": 900,
         "stock": 9, "toner_type": "Compatible", "page_yield": 4000, "oem_part_number": "T6642",
         "compatible_models": "L360", "image_url": "https://placehold.co/200x200.jpg",
         "image_urls": ["https://placehold.co/200x200.jpg"]},
    ]
    api = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
    tok = requests.post(f"{api}/auth/login", json={"email": email, "password": PWD}, timeout=40).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    for r in rows:
        imgs = r.pop("image_urls"); img = r.pop("image_url")
        res = requests.post(f"{api}/supplier/listings", headers=h, json=r, timeout=60)
        assert res.status_code == 200, res.text[:300]
        if img:
            requests.put(f"{api}/supplier/listings/{res.json()['id']}", headers=h,
                         json={"image_url": img, "image_urls": imgs}, timeout=40)
    print(f"EMAIL={email}\nPASSWORD={PWD}\nUSER_ID={uid}\nSUPPLIER_ID={sid}")


def cleanup(email):
    res = sb_admin.table("users").select("id").eq("email", email).execute().data or []
    for row in res:
        uid = row["id"]
        sup = sb_admin.table("suppliers").select("id").eq("user_id", uid).execute().data or []
        for s in sup:
            sb_admin.table("listings").delete().eq("supplier_id", s["id"]).execute()
        sb_admin.table("suppliers").delete().eq("user_id", uid).execute()
        sb_admin.table("users").delete().eq("id", uid).execute()
        try:
            sb_admin.auth.admin.delete_user(uid)
        except Exception as e:
            print("auth delete failed", e)
        print("cleaned", email)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "cleanup":
        cleanup(sys.argv[2])
    else:
        create()
