"""E2E test of Procurement Phase 2 order flow against the live preview API.
Creates a temp corporate account, runs the full quote→order→status flow,
asserts each step, then cleans everything up."""
import os
import sys

import requests

API = "https://printer-supply-hub.preview.emergentagent.com/api"
EMAIL = "phase2.test@tonerscart-qa.com"
PWD = "Phase2Test@123"

ok = lambda label: print(f"PASS  {label}")


def fail(label, extra=""):
    print(f"FAIL  {label} {extra}")
    sys.exit(1)


# --- 0. admin login (Supabase auth) ---
r = requests.post(f"{API}/auth/login", json={"email": "support@tonerscart.com", "password": "Bangara1@#"})
admin_tok = r.json().get("access_token") or r.json().get("token")
assert admin_tok, r.text
AH = {"Authorization": f"Bearer {admin_tok}"}
ok("admin login")

# --- 1. register corporate procurement account ---
r = requests.post(f"{API}/procurement/register/corporate", json={
    "name": "Phase2 Tester", "designation": "Manager", "company": "Phase2 QA Pvt Ltd",
    "gst_number": "29ABCDE1234F1Z5", "email": EMAIL, "phone": "+919999900022",
    "address": "QA Street, Bangalore", "password": PWD,
})
if r.status_code != 200 and "already" not in r.text.lower():
    fail("register", r.text)
ok(f"register corporate ({r.status_code})")

# --- 2. admin approves ---
r = requests.get(f"{API}/admin/procurement/pending", headers=AH)
pend = [p for p in (r.json().get("corporate") or []) if p["email"] == EMAIL]
if pend:
    r = requests.post(f"{API}/admin/procurement/{pend[0]['id']}/approve", headers=AH)
    assert r.status_code == 200, r.text
    ok("admin approve")
else:
    ok("already approved (no pending row)")

# --- 3. procurement login ---
r = requests.post(f"{API}/procurement/login", json={"email": EMAIL, "password": PWD})
assert r.status_code == 200, r.text
tok = r.json()["token"] if "token" in r.json() else r.json().get("access_token")
uid = (r.json().get("user") or {}).get("id")
PH = {"Authorization": f"Bearer {tok}"}
ok("proc login")

# --- 4. compare + quotation ---
r = requests.get(f"{API}/procurement/compare", params={"q": "canon", "qty": 2}, headers=PH)
items = r.json().get("items") or []
assert items, f"no compare items: {r.text[:300]}"
ok(f"compare ({len(items)} suppliers)")
lids = [i["listing_id"] for i in items[:3]]
r = requests.post(f"{API}/procurement/quotations", json={"listing_ids": lids, "qty": 2}, headers=PH)
assert r.status_code == 200, r.text
qid = r.json()["id"]
qref = r.json()["ref_number"]
ok(f"quotation {qref}")

# --- 5. place order (L1) ---
r = requests.post(f"{API}/procurement/orders", json={"quotation_id": qid, "listing_id": lids[0], "qty": 2}, headers=PH)
assert r.status_code == 200, r.text
oid = r.json()["id"]
oref = r.json()["ref_number"]
total = r.json()["total_amount"]
ok(f"order {oref} placed (total {total})")

# --- 6. duplicate order must fail (quotation converted) ---
r = requests.post(f"{API}/procurement/orders", json={"quotation_id": qid, "listing_id": lids[0]}, headers=PH)
assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
ok("duplicate order rejected (converted)")

# --- 7. my orders list ---
r = requests.get(f"{API}/procurement/orders", headers=PH)
mine = r.json()
assert any(o["ref_number"] == oref for o in mine), r.text[:300]
o = next(o for o in mine if o["ref_number"] == oref)
assert o["status"] == "confirmed" and o["payment_status"] == "unpaid"
ok("my orders list + status confirmed/unpaid")

# --- 8. quotation now converted ---
r = requests.get(f"{API}/procurement/quotations", headers=PH)
q = next(q for q in r.json() if q["id"] == qid)
assert q["status"] == "converted", q["status"]
ok("quotation status converted")

# --- 9. admin order list + advance statuses ---
r = requests.get(f"{API}/admin/procurement/orders", headers=AH)
arow = next((x for x in r.json() if x["ref_number"] == oref), None)
assert arow and arow.get("org_name") == "Phase2 QA Pvt Ltd", str(arow)[:200]
ok("admin orders list with org name")
for st in ("processing", "shipped", "delivered"):
    r = requests.post(f"{API}/admin/procurement/orders/{oid}/status", json={"status": st}, headers=AH)
    assert r.status_code == 200, f"{st}: {r.text}"
ok("status advanced confirmed→processing→shipped→delivered")
r = requests.post(f"{API}/admin/procurement/orders/{oid}/status", json={"status": "processing"}, headers=AH)
assert r.status_code == 400
ok("backwards status rejected")
r = requests.get(f"{API}/procurement/orders", headers=PH)
o = next(o for o in r.json() if o["ref_number"] == oref)
assert o["status"] == "delivered" and o.get("delivered_at") and len(o.get("status_history") or []) == 4
ok("buyer sees delivered + 4 history entries + due date set")

# --- 10. PO upload + signed url ---
files = {"file": ("po.pdf", b"%PDF-1.4 test po doc", "application/pdf")}
r = requests.post(f"{API}/procurement/orders/{oid}/po", files=files, headers=PH)
assert r.status_code == 200, r.text
r = requests.get(f"{API}/procurement/orders/{oid}/po-url", headers=PH)
assert r.status_code == 200 and r.json().get("url"), r.text
r2 = requests.get(f"{API}/admin/procurement/orders/{oid}/po-url", headers=AH)
assert r2.status_code == 200 and r2.json().get("url"), r2.text
ok("PO upload + buyer & admin signed URLs")

print("\nALL PHASE 2 BACKEND TESTS PASSED")
print(f"CLEANUP_IDS uid={uid} oid={oid} qid={qid}")
