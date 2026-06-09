"""Iteration 36 — Compatibility SEO refinements pytest.

Covers:
 1. same_brand_toners on TONER page filtered by toner.type (no ink/drum mix).
 2. Related cards include printers_count / toners_count + type for rich UI.
 3. _public_listing exposes price/gst_rate/total_price/intercity_delivery_charge,
    and toner-page listings include dealer_name + are sorted by total_price asc.

Refinement (3) creates+approves a supplier, accepts the agreement, POSTs a
Q2612A listing, validates, then tears everything down.
"""
import os
import time
import uuid
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"

STATE: dict = {}


def _login(email: str, password: str) -> str:
    r = httpx.post(f"{API}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


# ---------------- Refinement 1 ----------------

def test_brother_tn2280_same_brand_all_toner_type():
    r = httpx.get(f"{API}/api/compat/toner-page/brother-tn-2280", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["toner"]["type"] == "toner"
    sb = body["related"]["same_brand_toners"]
    assert len(sb) >= 1
    types = {c["type"] for c in sb}
    assert types == {"toner"}, f"unexpected types mixed in: {types}"
    models = {c["model"].upper() for c in sb}
    forbidden = {"BT-5000C", "BT5000C", "LC-3619XLBK", "LC3619XLBK"}
    assert not (models & forbidden), f"ink/drum leaked: {models & forbidden}"


def test_ink_page_same_brand_only_inks():
    r = httpx.get(f"{API}/api/compat/toners", params={"q": "BT"}, timeout=30)
    assert r.status_code == 200
    ink_slug = None
    for c in r.json():
        tr = httpx.get(f"{API}/api/compat/toner-page/{c['slug']}", timeout=30)
        if tr.status_code == 200 and tr.json()["toner"]["type"] == "ink":
            ink_slug = c["slug"]
            break
    if not ink_slug:
        pytest.skip("No ink-type cartridge surfaced by search")
    body = httpx.get(f"{API}/api/compat/toner-page/{ink_slug}", timeout=30).json()
    types = {c["type"] for c in body["related"]["same_brand_toners"]}
    assert types <= {"ink"}, f"expected ink-only but got {types}"


# ---------------- Refinement 2 ----------------

def test_toner_related_cards_have_type_and_printers_count():
    r = httpx.get(f"{API}/api/compat/toner-page/brother-tn-2280", timeout=30)
    assert r.status_code == 200
    rel = r.json()["related"]
    for key in ("same_brand_toners", "same_printers_toners"):
        for c in rel.get(key, []):
            assert "type" in c and c["type"]
            assert isinstance(c.get("printers_count"), int)
            assert c.get("url", "").startswith("/toner/")


def test_printer_related_cards_have_counts():
    r = httpx.get(f"{API}/api/compat/printer/hp-laserjet-m1005", timeout=30)
    assert r.status_code == 200
    rel = r.json()["related"]
    assert len(rel["same_brand_printers"]) >= 1
    for c in rel["same_brand_printers"]:
        assert "type" in c
        assert isinstance(c.get("toners_count"), int)
        assert c["url"].startswith("/compatible/")
    for c in rel["compatible_toner_models"]:
        assert "type" in c
        assert isinstance(c.get("printers_count"), int)
        assert c["url"].startswith("/toner/")


# ---------------- Refinement 3 ----------------

def test_supplier_signup():
    suffix = uuid.uuid4().hex[:8]
    email = f"qa.dealer.it36.{suffix}@example.com"
    password = "Test@1234"
    payload = {
        "email": email, "password": password,
        "business_name": f"QA Dealer It36 {suffix}",
        "contact_person": "QA Tester",
        "phone": "9000000036",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560001",
        "cities_served": ["Bengaluru"],
        "business_address": "QA test address, Bengaluru",
        "seller_types": ["Compatible"],
        "compatible_brands": ["HP"],
        "testing_before_delivery": False,
        "years_in_business": 1,
    }
    r = httpx.post(f"{API}/api/auth/signup-supplier", json=payload, timeout=60)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:300]}"
    STATE["email"] = email
    STATE["password"] = password
    STATE["user_id"] = r.json()["user_id"]


def test_admin_approves_supplier():
    if "user_id" not in STATE:
        pytest.skip("signup did not complete")
    admin_tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    h = {"Authorization": f"Bearer {admin_tok}"}
    r = httpx.get(f"{API}/api/admin/suppliers/pending", headers=h, timeout=30)
    assert r.status_code == 200
    pending = next((x for x in r.json() if x.get("user_id") == STATE["user_id"]), None)
    assert pending, "pending row not found"
    a = httpx.post(f"{API}/api/admin/suppliers/{pending['id']}/approve", headers=h, timeout=60)
    assert a.status_code == 200, f"approve failed: {a.text[:300]}"
    STATE["admin_token"] = admin_tok


def _dealer_headers():
    if "dealer_token" not in STATE:
        STATE["dealer_token"] = _login(STATE["email"], STATE["password"])
    return {"Authorization": f"Bearer {STATE['dealer_token']}"}


def test_dealer_create_q2612a_listing():
    if "user_id" not in STATE:
        pytest.skip("supplier not created")
    h = _dealer_headers()
    # Accept seller agreement first (idempotent on backend)
    try:
        httpx.post(f"{API}/api/agreements/accept",
                   headers=h, json={"agreement_type": "seller"}, timeout=30)
    except Exception:
        pass
    payload = {
        "brand": "HP",
        "model_number": "Q2612A",
        "color": "Black",
        "page_yield": 2000,
        "price": 1200.0,
        "gst_rate": 18,
        "stock": 5,
        "intercity_delivery_charge": 150,
        "toner_type": "Compatible",
        "compatible_models": "HP LaserJet 1010",
    }
    r = httpx.post(f"{API}/api/supplier/listings", json=payload, headers=h, timeout=60)
    assert r.status_code == 200, f"listing create failed: {r.status_code} {r.text[:300]}"
    listing = r.json()
    assert listing.get("id")
    STATE["toner_listing_id"] = listing["id"]
    time.sleep(1)


def test_listing_shape_and_sort_on_toner_page():
    if "toner_listing_id" not in STATE:
        pytest.skip("no listing created")
    listing_id = STATE["toner_listing_id"]
    r = httpx.get(f"{API}/api/compat/toner-page/hp-q2612a", timeout=30)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    listings = body["listings"]
    assert any(L["id"] == listing_id for L in listings), \
        f"new listing not present (count={len(listings)}, ids={[L['id'] for L in listings[:3]]})"
    for L in listings:
        for k in ("price", "gst_rate", "total_price",
                  "intercity_delivery_charge", "dealer_name"):
            assert k in L, f"missing key {k} in {L}"
        assert L["total_price"] == round(L["price"] * (1 + L["gst_rate"] / 100.0))
    totals = [L["total_price"] for L in listings]
    assert totals == sorted(totals), f"not sorted asc: {totals}"
    ours = next(L for L in listings if L["id"] == listing_id)
    assert ours["price"] == 1200
    assert ours["gst_rate"] == 18
    assert ours["total_price"] == 1416
    assert ours["intercity_delivery_charge"] == 150
    assert ours["dealer_name"]


# ---------------- Cleanup ----------------

def test_cleanup_dealer_artifacts():
    if "user_id" not in STATE:
        pytest.skip("nothing to clean")
    try:
        h = _dealer_headers()
        if STATE.get("toner_listing_id"):
            httpx.delete(f"{API}/api/supplier/listings/{STATE['toner_listing_id']}",
                         headers=h, timeout=30)
    except Exception as e:
        print(f"listing cleanup warn: {e}")
    try:
        import sys
        sys.path.insert(0, "/app/backend")
        from server import sb_admin  # noqa
        sb_admin.table("suppliers").delete().eq("user_id", STATE["user_id"]).execute()
        sb_admin.table("suppliers_pending").delete().eq("user_id", STATE["user_id"]).execute()
        sb_admin.table("users").delete().eq("id", STATE["user_id"]).execute()
        sb_admin.auth.admin.delete_user(STATE["user_id"])
    except Exception as e:
        print(f"cleanup warning: {e}")
