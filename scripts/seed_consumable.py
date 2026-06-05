"""Seed one Brother DR-2305 drum + one HP ink for UI testing."""
import os, sys, time, requests, json
sys.path.insert(0, "/app/backend/tests")
from test_wave19 import sb_login, _auth, _bootstrap_supplier, API

tok = _bootstrap_supplier()
print("supplier token:", bool(tok))
h = _auth(tok)
# Verify
me = requests.get(f"{API}/auth/me", headers=h, timeout=20)
print("me:", me.status_code, me.text[:200])

payloads = [
    {"subcategory":"Drums","brand":"Brother","model_number":"DR-2305",
     "condition":"New","price":3499.0,"stock":20,"city":"Bangalore","gst_rate":18,
     "description":"Genuine OEM-compatible drum unit. Yields ~12000 pages."},
    {"subcategory":"Ink Cartridges","brand":"HP","model_number":"GT53",
     "condition":"New","price":799.0,"stock":50,"city":"Bangalore","gst_rate":18,
     "description":"Black ink bottle for HP smart tank printers."},
]
for p in payloads:
    r = requests.post(f"{API}/supplier/consumables", json=p, headers=h, timeout=30)
    print(p["brand"], p["model_number"], "→", r.status_code, r.text[:160])
    time.sleep(0.5)

print("\nPublic listing now contains:")
print(json.dumps(requests.get(f"{API}/consumables", timeout=15).json(), indent=2)[:1500])
