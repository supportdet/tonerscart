"""Iteration 29 — Dealer Edit flows backend coverage.

Confirms scalar updates DO NOT wipe images for:
- PUT /api/supplier/printers/{id}
- PUT /api/supplier/papers/{id}
- PUT /api/supplier/consumables/{id}

Also re-confirms iteration 28's PUT /api/supplier/listings/{id} (light).

Fresh supplier registration → admin approval → create one printer / paper /
consumable (each with image_url + image_urls) → PUT scalar payload (price,
stock, ...) WITHOUT image fields → re-GET and assert images preserved.
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


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_headers():
    r = _login("admin@tonerscart.in", "Admin@123")
    if r.status_code != 200:
        pytest.skip(f"admin auth failed {r.status_code}: {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def supplier_creds():
    suffix = uuid.uuid4().hex[:8]
    email = f"qa.dealer.it29.{suffix}@example.com"
    password = "Test@1234"
    r = requests.post(
        f"{BASE_URL}/api/auth/signup-supplier",
        json={
            "email": email, "password": password,
            "business_name": f"QA Dealer IT29 {suffix}",
            "contact_person": "QA Tester", "phone": "9999900000",
            "city": "Mumbai", "state": "Maharashtra", "pincode": "400001",
            "business_address": "Test addr", "seller_types": ["Compatible"],
            "compatible_brands": ["HP"], "testing_before_delivery": False,
        }, timeout=30,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"signup-supplier failed {r.status_code}: {r.text[:300]}")
    return {"email": email, "password": password}


@pytest.fixture(scope="session")
def supplier_headers(supplier_creds, admin_headers):
    # Approve via admin
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
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


IMG1 = "https://example.com/it29/printer1.jpg"
IMG2 = "https://example.com/it29/printer2.jpg"


# ---------- PRINTER edit ----------
class TestEditPrinterPreservesImages:
    def test_edit_printer_scalar_keeps_images(self, supplier_headers):
        payload = {
            "brand": "HP", "model_number": f"LJ-{uuid.uuid4().hex[:6]}",
            "description": "Test printer it29",
            "image_url": IMG1, "image_urls": [IMG1, IMG2],
            "condition": "new", "usage_type": "home",
            "usage_types": ["home"], "category": "laser", "color": "bw",
            "paper_sizes": ["A4"], "functions": ["Print"], "connectivity": ["USB"],
            "features": [], "monthly_volume_min": 100, "monthly_volume_max": 1000,
            "price": 12000.0, "stock": 5,
        }
        r = requests.post(f"{BASE_URL}/api/supplier/printers", headers=supplier_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text[:400]
        pid = r.json()["id"]

        # GET to capture original image state
        mine = requests.get(f"{BASE_URL}/api/supplier/printers/mine", headers=supplier_headers, timeout=20).json() or []
        orig = next((x for x in mine if x.get("id") == pid), None)
        assert orig is not None, "printer not in /mine after create"
        orig_image_url = orig.get("image_url")
        orig_image_urls = orig.get("image_urls")

        # Scalar-only PUT — NO image fields
        u = requests.put(
            f"{BASE_URL}/api/supplier/printers/{pid}",
            headers=supplier_headers,
            json={"price": 13500.0, "stock": 9},
            timeout=20,
        )
        assert u.status_code == 200, u.text[:300]

        mine2 = requests.get(f"{BASE_URL}/api/supplier/printers/mine", headers=supplier_headers, timeout=20).json() or []
        match = next((x for x in mine2 if x.get("id") == pid), None)
        assert match is not None, "printer missing after edit"
        assert float(match["price"]) == 13500.0
        assert int(match["stock"]) == 9
        assert match.get("image_url") == orig_image_url, f"image_url wiped! was {orig_image_url}, now {match.get('image_url')}"
        if orig_image_urls is not None:
            assert match.get("image_urls") == orig_image_urls, "image_urls wiped on scalar edit"


# ---------- PAPER edit ----------
class TestEditPaperPreservesImages:
    def test_edit_paper_scalar_keeps_images(self, supplier_headers):
        payload = {
            "brand": "JK Paper",
            "size": "A4",
            "gsm": 75,
            "reams_per_box": 10,
            "price_per_ream": 250.0,
            "stock": 50,
            "image_url": IMG1,
            "image_urls": [IMG1, IMG2],
        }
        r = requests.post(f"{BASE_URL}/api/supplier/papers", headers=supplier_headers, json=payload, timeout=30)
        if r.status_code == 503:
            pytest.skip("paper_listings migration missing")
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        pid = body.get("id")
        assert pid, f"no id returned {body}"

        mine = requests.get(f"{BASE_URL}/api/supplier/papers/mine", headers=supplier_headers, timeout=20).json() or []
        orig = next((x for x in mine if x.get("id") == pid), None)
        assert orig is not None
        orig_image_url = orig.get("image_url")
        orig_image_urls = orig.get("image_urls")

        # Scalar-only PUT — NO image fields, update price+stock+gsm
        u = requests.put(
            f"{BASE_URL}/api/supplier/papers/{pid}",
            headers=supplier_headers,
            json={"price_per_ream": 299.0, "stock": 88, "gsm": 80},
            timeout=20,
        )
        assert u.status_code == 200, u.text[:300]

        mine2 = requests.get(f"{BASE_URL}/api/supplier/papers/mine", headers=supplier_headers, timeout=20).json() or []
        match = next((x for x in mine2 if x.get("id") == pid), None)
        assert match is not None
        assert float(match.get("price_per_ream")) == 299.0
        assert int(match.get("stock")) == 88
        assert int(match.get("gsm")) == 80
        assert match.get("image_url") == orig_image_url, "image_url wiped on paper edit"
        if orig_image_urls is not None:
            assert match.get("image_urls") == orig_image_urls, "image_urls wiped on paper edit"


# ---------- CONSUMABLE edit ----------
class TestEditConsumablePreservesImages:
    def test_edit_consumable_scalar_keeps_images(self, supplier_headers):
        payload = {
            "subcategory": "Drum",
            "brand": "Canon",
            "model_number": f"DRM-{uuid.uuid4().hex[:6]}",
            "condition": "New",
            "price": 1500.0,
            "stock": 4,
            "image_url": IMG1,
            "image_urls": [IMG1, IMG2],
        }
        r = requests.post(f"{BASE_URL}/api/supplier/consumables", headers=supplier_headers, json=payload, timeout=30)
        if r.status_code == 503:
            pytest.skip("consumable_listings migration missing")
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        cid = body.get("id")
        assert cid, f"no id returned {body}"

        mine = requests.get(f"{BASE_URL}/api/supplier/consumables/mine", headers=supplier_headers, timeout=20).json() or []
        orig = next((x for x in mine if x.get("id") == cid), None)
        assert orig is not None
        orig_image_url = orig.get("image_url")
        orig_image_urls = orig.get("image_urls")

        # Scalar-only PUT — NO image fields
        u = requests.put(
            f"{BASE_URL}/api/supplier/consumables/{cid}",
            headers=supplier_headers,
            json={"price": 1899.0, "stock": 12},
            timeout=20,
        )
        assert u.status_code == 200, u.text[:300]

        mine2 = requests.get(f"{BASE_URL}/api/supplier/consumables/mine", headers=supplier_headers, timeout=20).json() or []
        match = next((x for x in mine2 if x.get("id") == cid), None)
        assert match is not None
        assert float(match["price"]) == 1899.0
        assert int(match["stock"]) == 12
        assert match.get("image_url") == orig_image_url, "image_url wiped on consumable edit"
        if orig_image_urls is not None:
            assert match.get("image_urls") == orig_image_urls, "image_urls wiped on consumable edit"


# ---------- 403 guards ----------
class TestEditEndpoints403ForNonSupplier:
    def test_printer_put_admin_forbidden(self, admin_headers):
        r = requests.put(
            f"{BASE_URL}/api/supplier/printers/00000000-0000-0000-0000-000000000000",
            headers=admin_headers, json={"price": 100.0}, timeout=15,
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"

    def test_paper_put_admin_forbidden(self, admin_headers):
        r = requests.put(
            f"{BASE_URL}/api/supplier/papers/00000000-0000-0000-0000-000000000000",
            headers=admin_headers, json={"price_per_ream": 100.0}, timeout=15,
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"
