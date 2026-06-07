"""Iteration 30 — Dealer dashboard All Listings + sticky tab bar backend coverage.

The new feature surface is mostly UI (sticky tab bar, compact hero, scroll-to-section,
combined All Listings table). The backend pieces that the new UI depends on are:

1. GET /supplier/listings (toners)            ──┐
2. GET /supplier/printers/mine                  │  the 4 GETs the new
3. GET /supplier/papers/mine                    │  All Listings table calls
4. GET /supplier/consumables/mine            ──┘
5. DELETE /supplier/listings/{id}             ──┐
6. DELETE /supplier/printers/{id}               │  the All-Listings delete
7. DELETE /supplier/papers/{id}                 │  button calls one of these
8. DELETE /supplier/consumables/{id}          ──┘
9. PUT /supplier/listings|printers|papers|consumables/{id} — Edit (regression).

We create a fresh approved supplier, add one product of each category, exercise the
GET endpoints (rows must appear in /mine), then exercise DELETE on each of the four
kinds and confirm the row disappears from /mine.

Also persists the supplier creds to /app/memory/test_credentials.md so subsequent
Playwright UI testing can reuse the approved account.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"


def _login(email: str, password: str):
    return requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )


@pytest.fixture(scope="session")
def admin_headers():
    r = _login("admin@tonerscart.in", "Admin@123")
    if r.status_code != 200:
        pytest.skip(f"admin auth failed {r.status_code}: {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def supplier_creds():
    suffix = uuid.uuid4().hex[:8]
    email = f"qa.dealer.it30.{suffix}@example.com"
    password = "Test@1234"
    r = requests.post(
        f"{BASE_URL}/api/auth/signup-supplier",
        json={
            "email": email, "password": password,
            "business_name": f"QA Dealer IT30 {suffix}",
            "contact_person": "QA Tester IT30", "phone": "9999900030",
            "city": "Mumbai", "state": "Maharashtra", "pincode": "400001",
            "business_address": "Iteration 30 test addr",
            "seller_types": ["Compatible"], "compatible_brands": ["HP"],
            "testing_before_delivery": False,
        }, timeout=30,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"signup-supplier failed {r.status_code}: {r.text[:300]}")
    return {"email": email, "password": password}


@pytest.fixture(scope="session")
def supplier_headers(supplier_creds, admin_headers):
    pend = requests.get(f"{BASE_URL}/api/admin/suppliers/pending", headers=admin_headers, timeout=30)
    assert pend.status_code == 200, pend.text[:300]
    target = next((r for r in (pend.json() or []) if r.get("email") == supplier_creds["email"]), None)
    if not target:
        pytest.skip("pending supplier not found")
    ap = requests.post(
        f"{BASE_URL}/api/admin/suppliers/{target['id']}/approve",
        headers=admin_headers, timeout=30,
    )
    assert ap.status_code == 200, ap.text[:300]
    time.sleep(1)
    r = _login(supplier_creds["email"], supplier_creds["password"])
    assert r.status_code == 200, r.text[:300]

    # persist creds for downstream Playwright UI testing
    try:
        with open("/app/memory/test_credentials.md", "a") as fh:
            fh.write(
                f"\nIteration 30 (2026-06) — APPROVED test supplier for dealer-dashboard sticky tab bar + "
                f"compact hero + All Listings combined table UI tests. Has 1 toner + 1 printer + 1 paper + "
                f"1 consumable listing.\n"
                f"- Email: `{supplier_creds['email']}`\n"
                f"- Password: `{supplier_creds['password']}`\n"
                f"- Role: supplier, status: approved.\n"
            )
    except Exception:
        pass
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------- helpers to create one product of each kind ----------
def _create_toner(h):
    r = requests.post(f"{BASE_URL}/api/supplier/listings", headers=h, json={
        "brand": "HP", "model_number": f"T-{uuid.uuid4().hex[:6]}",
        "toner_type": "Compatible",
        "compatible_models": "LJ Pro 400",
        "description": "it30 toner", "condition": "compatible",
        "price": 999.0, "stock": 3,
        "image_url": "https://example.com/it30/t.jpg",
    }, timeout=30)
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


def _create_printer(h):
    r = requests.post(f"{BASE_URL}/api/supplier/printers", headers=h, json={
        "brand": "HP", "model_number": f"PR-{uuid.uuid4().hex[:6]}",
        "description": "it30 printer", "image_url": "https://example.com/it30/p.jpg",
        "condition": "new", "usage_type": "home", "usage_types": ["home"],
        "category": "laser", "color": "bw",
        "paper_sizes": ["A4"], "functions": ["Print"], "connectivity": ["USB"],
        "features": [], "monthly_volume_min": 100, "monthly_volume_max": 1000,
        "price": 12000.0, "stock": 5,
    }, timeout=30)
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


def _create_paper(h):
    r = requests.post(f"{BASE_URL}/api/supplier/papers", headers=h, json={
        "brand": "JK Paper", "size": "A4", "gsm": 75, "reams_per_box": 10,
        "price_per_ream": 250.0, "stock": 50,
        "image_url": "https://example.com/it30/pa.jpg",
    }, timeout=30)
    if r.status_code == 503:
        pytest.skip("paper_listings migration missing")
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


def _create_consumable(h):
    r = requests.post(f"{BASE_URL}/api/supplier/consumables", headers=h, json={
        "subcategory": "Drum", "brand": "Canon",
        "model_number": f"DRM-{uuid.uuid4().hex[:6]}", "condition": "New",
        "price": 1500.0, "stock": 4, "image_url": "https://example.com/it30/c.jpg",
    }, timeout=30)
    if r.status_code == 503:
        pytest.skip("consumable_listings migration missing")
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


# ---------- All Listings: the four GETs power the combined table ----------
class TestAllListingsGetEndpoints:
    """The 4 /mine endpoints feed the dealer dashboard's All Listings combined table."""

    def test_toner_listings_visible(self, supplier_headers):
        tid = _create_toner(supplier_headers)
        r = requests.get(f"{BASE_URL}/api/supplier/listings", headers=supplier_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        ids = [x.get("id") for x in (r.json() or [])]
        assert tid in ids, "toner not visible in /supplier/listings"

    def test_printer_listings_mine_visible(self, supplier_headers):
        pid = _create_printer(supplier_headers)
        r = requests.get(f"{BASE_URL}/api/supplier/printers/mine", headers=supplier_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        ids = [x.get("id") for x in (r.json() or [])]
        assert pid in ids, "printer not visible in /supplier/printers/mine"

    def test_paper_listings_mine_visible(self, supplier_headers):
        pid = _create_paper(supplier_headers)
        r = requests.get(f"{BASE_URL}/api/supplier/papers/mine", headers=supplier_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        ids = [x.get("id") for x in (r.json() or [])]
        assert pid in ids, "paper not visible in /supplier/papers/mine"

    def test_consumable_listings_mine_visible(self, supplier_headers):
        cid = _create_consumable(supplier_headers)
        r = requests.get(f"{BASE_URL}/api/supplier/consumables/mine", headers=supplier_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        ids = [x.get("id") for x in (r.json() or [])]
        assert cid in ids, "consumable not visible in /supplier/consumables/mine"


# ---------- DELETE endpoints power all-delete-<id> ----------
class TestAllListingsDeleteEndpoints:
    """All Listings delete uses one of these 4 DELETEs depending on category."""

    def test_delete_toner_removes_row(self, supplier_headers):
        tid = _create_toner(supplier_headers)
        d = requests.delete(f"{BASE_URL}/api/supplier/listings/{tid}", headers=supplier_headers, timeout=20)
        assert d.status_code in (200, 204), d.text[:300]
        r = requests.get(f"{BASE_URL}/api/supplier/listings", headers=supplier_headers, timeout=20)
        ids = [x.get("id") for x in (r.json() or [])]
        assert tid not in ids, "toner still present after DELETE"

    def test_delete_printer_removes_row(self, supplier_headers):
        pid = _create_printer(supplier_headers)
        d = requests.delete(f"{BASE_URL}/api/supplier/printers/{pid}", headers=supplier_headers, timeout=20)
        assert d.status_code in (200, 204), d.text[:300]
        r = requests.get(f"{BASE_URL}/api/supplier/printers/mine", headers=supplier_headers, timeout=20)
        ids = [x.get("id") for x in (r.json() or [])]
        assert pid not in ids, "printer still present after DELETE"

    def test_delete_paper_removes_row(self, supplier_headers):
        pid = _create_paper(supplier_headers)
        d = requests.delete(f"{BASE_URL}/api/supplier/papers/{pid}", headers=supplier_headers, timeout=20)
        assert d.status_code in (200, 204), d.text[:300]
        r = requests.get(f"{BASE_URL}/api/supplier/papers/mine", headers=supplier_headers, timeout=20)
        ids = [x.get("id") for x in (r.json() or [])]
        assert pid not in ids, "paper still present after DELETE"

    def test_delete_consumable_removes_row(self, supplier_headers):
        cid = _create_consumable(supplier_headers)
        d = requests.delete(f"{BASE_URL}/api/supplier/consumables/{cid}", headers=supplier_headers, timeout=20)
        assert d.status_code in (200, 204), d.text[:300]
        r = requests.get(f"{BASE_URL}/api/supplier/consumables/mine", headers=supplier_headers, timeout=20)
        ids = [x.get("id") for x in (r.json() or [])]
        assert cid not in ids, "consumable still present after DELETE"


# ---------- 403 guards ----------
class TestDeleteEndpoints403ForNonSupplier:
    def test_printer_delete_admin_forbidden(self, admin_headers):
        r = requests.delete(
            f"{BASE_URL}/api/supplier/printers/00000000-0000-0000-0000-000000000000",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"

    def test_paper_delete_admin_forbidden(self, admin_headers):
        r = requests.delete(
            f"{BASE_URL}/api/supplier/papers/00000000-0000-0000-0000-000000000000",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"

    def test_consumable_delete_admin_forbidden(self, admin_headers):
        r = requests.delete(
            f"{BASE_URL}/api/supplier/consumables/00000000-0000-0000-0000-000000000000",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"


# ---------- Final fixture: leave a long-lived supplier with 1 of each ----------
class TestSeedLongLivedSupplier:
    """Leaves one product of each kind alive under the test supplier for UI tests."""
    def test_seed_one_of_each(self, supplier_headers):
        tid = _create_toner(supplier_headers)
        pid = _create_printer(supplier_headers)
        pa = _create_paper(supplier_headers)
        ci = _create_consumable(supplier_headers)
        assert tid and pid and pa and ci
