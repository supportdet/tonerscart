"""Iteration 82 — add ONE printer listing WITHOUT image_url to the Wave 105.10 QA
supplier so /supplier/bulk-images can be verified to list printers (FIX 1).

Usage: python seed_w10510_printer.py <email> [password]
"""
import sys

import requests
from dotenv import dotenv_values

API = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"


def main(email, pwd="Test@1234"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=60)
    print("login", r.status_code)
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    mine = requests.get(f"{API}/supplier/printers/mine", headers=h, timeout=40)
    print("GET /supplier/printers/mine ->", mine.status_code, len(mine.json() or []))

    payload = {
        "brand": "HP", "model_number": "TEST-UI-PR-M404", "category": "laser",
        "condition": "new", "usage_types": ["Office"], "color": "bw",
        "price": 24500, "stock": 3, "image_url": "", "image_urls": [],
        "paper_sizes": ["A4"], "functions": ["Print"], "connectivity": ["USB"],
        "monthly_volume_min": 500, "monthly_volume_max": 4000,
    }
    existing = [p for p in (mine.json() or []) if p.get("model_number") == payload["model_number"]]
    if existing:
        print("printer already seeded:", existing[0]["id"], "image_url=", repr(existing[0].get("image_url")))
    else:
        c = requests.post(f"{API}/supplier/printers", headers=h, json=payload, timeout=60)
        print("create printer ->", c.status_code, c.text[:400])

    mine2 = requests.get(f"{API}/supplier/printers/mine", headers=h, timeout=40).json()
    for p in mine2:
        print(" printer:", p["id"], p["brand"], p["model_number"], "img=", repr(p.get("image_url")), p.get("image_urls"))
    lis = requests.get(f"{API}/supplier/listings", headers=h, timeout=40).json()
    for p in lis:
        print(" toner:", p["id"], p["brand"], p["model_number"], "img=", repr(p.get("image_url")), p.get("image_urls"))


if __name__ == "__main__":
    main(*sys.argv[1:])
