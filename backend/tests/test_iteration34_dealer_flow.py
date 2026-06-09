"""Iteration 34 — Dealer flow + SEO sitemap/robots integration tests.

Creates a fresh supplier via /auth/signup-supplier, has admin approve it,
then verifies the dealer can persist `compatible_models` on TONER,
CONSUMABLE and PRINTER listings (printer field must degrade gracefully
when the supabase_schema_printer_compat.sql migration is NOT applied).

Cleans up everything (listings, supplier rows, auth user) at the end.

Run: cd /app/backend && python3 -m pytest tests/test_iteration34_dealer_flow.py -q
"""
import os
import time
import uuid
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"

# Shared state across the ordered tests in this module
STATE: dict = {}


def _login(email: str, password: str) -> str:
    r = httpx.post(f"{API}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# SEO — robots.txt + sitemap with /compatible/ entries + live listings
# ---------------------------------------------------------------------------

def test_robots_txt_disallows_protected_areas():
    r = httpx.get(f"{API}/robots.txt", timeout=30, follow_redirects=True)
    # Some ingress setups only expose /api/*; if so we still consider it pass
    # if the same content is served from /api/robots.txt.
    if r.status_code == 404:
        r = httpx.get(f"{API}/api/robots.txt", timeout=30, follow_redirects=True)
    assert r.status_code == 200, r.text[:200]
    body = r.text
    for path in ("/admin", "/supplier", "/procurement", "/checkout", "/api"):
        assert f"Disallow: {path}" in body, f"robots.txt missing Disallow {path}"


def test_sitemap_has_compatible_and_listing_urls():
    r = httpx.get(f"{API}/api/sitemap.xml", timeout=60)
    assert r.status_code == 200
    body = r.text
    # programmatic SEO pages
    assert "/compatible/hp-laserjet-m1005-mfp" in body
    # at least one of the product feeds must be present (live data dependent;
    # if no in-stock product exists this is environment-only, not a bug)
    has_any_listing = any(p in body for p in ("/toner/", "/printer/", "/paper/", "/consumable/"))
    assert has_any_listing, "sitemap has no /toner|/printer|/paper|/consumable URL"


# ---------------------------------------------------------------------------
# Dealer flow — signup → admin approve → create listings → cleanup
# ---------------------------------------------------------------------------

def test_supplier_signup():
    suffix = uuid.uuid4().hex[:8]
    email = f"qa.dealer.it34.{suffix}@example.com"
    password = "Test@1234"
    payload = {
        "email": email,
        "password": password,
        "business_name": f"QA Dealer It34 {suffix}",
        "contact_person": "QA Tester",
        "phone": "9999999999",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "cities_served": ["Bangalore"],
        "business_address": "Test address, Bangalore",
        "seller_types": ["Compatible"],
        "compatible_brands": ["HP"],
        "testing_before_delivery": False,
        "years_in_business": 1,
    }
    r = httpx.post(f"{API}/api/auth/signup-supplier", json=payload, timeout=60)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("ok") is True
    STATE["email"] = email
    STATE["password"] = password
    STATE["user_id"] = body["user_id"]


def test_admin_approves_supplier():
    if "user_id" not in STATE:
        pytest.skip("signup did not complete")
    admin_tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    h = {"Authorization": f"Bearer {admin_tok}"}
    # Find pending row for this user
    r = httpx.get(f"{API}/api/admin/suppliers/pending", headers=h, timeout=30)
    assert r.status_code == 200, r.text[:200]
    rows = r.json()
    pending = next((x for x in rows if x.get("user_id") == STATE["user_id"]), None)
    assert pending, f"pending row not found for {STATE['user_id']}"
    pending_id = pending["id"]
    a = httpx.post(f"{API}/api/admin/suppliers/{pending_id}/approve", headers=h, timeout=60)
    assert a.status_code == 200, f"approve failed: {a.status_code} {a.text[:300]}"
    STATE["admin_token"] = admin_tok


def _dealer_headers() -> dict:
    if "dealer_token" not in STATE:
        STATE["dealer_token"] = _login(STATE["email"], STATE["password"])
    return {"Authorization": f"Bearer {STATE['dealer_token']}"}


def test_dealer_create_toner_with_compatible_models():
    if "user_id" not in STATE:
        pytest.skip("supplier not created")
    h = _dealer_headers()
    payload = {
        "brand": "HP",
        "model_number": f"QA88A-{uuid.uuid4().hex[:6]}",
        "color": "Black",
        "page_yield": 1500,
        "price": 1299.0,
        "stock": 5,
        "toner_type": "Compatible",
        "compatible_models": "HP LaserJet M1005 MFP, HP LaserJet 1018",
    }
    r = httpx.post(f"{API}/api/supplier/listings", json=payload, headers=h, timeout=60)
    assert r.status_code == 200, f"listing create failed: {r.status_code} {r.text[:300]}"
    listing = r.json()
    assert listing.get("id"), listing
    STATE["toner_listing_id"] = listing["id"]
    # Persistence assertion — read back via supplier listings
    g = httpx.get(f"{API}/api/supplier/listings", headers=h, timeout=30)
    assert g.status_code == 200
    rows = g.json()
    mine = next((x for x in rows if x.get("id") == listing["id"]), None)
    assert mine, "freshly created listing not returned in /supplier/listings"
    # compatible_models should round-trip when the DB column exists
    assert mine.get("compatible_models") and "M1005" in mine["compatible_models"], mine


def test_dealer_create_consumable_with_compatible_models():
    if "user_id" not in STATE:
        pytest.skip("supplier not created")
    h = _dealer_headers()
    payload = {
        "subcategory": "Drums",
        "brand": "HP",
        "model_number": f"QA-DRUM-{uuid.uuid4().hex[:6]}",
        "compatible_models": "HP LaserJet M1005 MFP",
        "condition": "New",
        "price": 2499.0,
        "stock": 3,
        "description": "QA test drum",
    }
    r = httpx.post(f"{API}/api/supplier/consumables", json=payload, headers=h, timeout=60)
    assert r.status_code == 200, f"consumable create failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("id"), body
    STATE["consumable_id"] = body["id"]
    g = httpx.get(f"{API}/api/supplier/consumables/mine", headers=h, timeout=30)
    assert g.status_code == 200
    mine = next((x for x in g.json() if x.get("id") == body["id"]), None)
    assert mine, "consumable not in /supplier/consumables/mine"
    assert mine.get("compatible_models") and "M1005" in mine["compatible_models"], mine


def test_dealer_create_printer_graceful():
    """compatible_models for printers depends on supabase_schema_printer_compat.sql
    which may not be applied — endpoint MUST still return 200 (column dropped)."""
    if "user_id" not in STATE:
        pytest.skip("supplier not created")
    h = _dealer_headers()
    payload = {
        "brand": "HP",
        "model_number": f"QA-PRINTER-{uuid.uuid4().hex[:6]}",
        "category": "laser",
        "color": "bw",
        "functions": ["Print"],
        "usage_types": ["home"],
        "condition": "new",
        "price": 9999.0,
        "stock": 1,
        "compatible_models": "88A, 12A",
    }
    r = httpx.post(f"{API}/api/supplier/printers", json=payload, headers=h, timeout=60)
    assert r.status_code == 200, f"printer create did NOT degrade gracefully: {r.status_code} {r.text[:400]}"
    body = r.json()
    assert body.get("id"), body
    STATE["printer_id"] = body["id"]


# ---------------------------------------------------------------------------
# Cleanup — best-effort, must NOT fail the suite
# ---------------------------------------------------------------------------

def test_cleanup_dealer_artifacts():
    if "user_id" not in STATE:
        pytest.skip("nothing to clean")
    try:
        h = _dealer_headers()
    except Exception:
        return
    for tid in (STATE.get("toner_listing_id"),):
        if tid:
            httpx.delete(f"{API}/api/supplier/listings/{tid}", headers=h, timeout=30)
    cid = STATE.get("consumable_id")
    if cid:
        httpx.delete(f"{API}/api/supplier/consumables/{cid}", headers=h, timeout=30)
    pid = STATE.get("printer_id")
    if pid:
        httpx.delete(f"{API}/api/supplier/printers/{pid}", headers=h, timeout=30)

    # Drop supplier + auth user via supabase-admin client (best-effort)
    try:
        import sys
        sys.path.insert(0, "/app/backend")
        from server import sb_admin  # noqa: WPS433
        sb_admin.table("suppliers").delete().eq("user_id", STATE["user_id"]).execute()
        sb_admin.table("suppliers_pending").delete().eq("user_id", STATE["user_id"]).execute()
        sb_admin.table("users").delete().eq("id", STATE["user_id"]).execute()
        sb_admin.auth.admin.delete_user(STATE["user_id"])
    except Exception as e:  # noqa: BLE001
        print(f"cleanup warning: {e}")
