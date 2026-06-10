"""Iteration 37 — sign-in speed, admin doc download, bulk hub, Scanners (public + dealer create).

Covers:
- POST /api/auth/login admin + dealer (both should return user/profile with proper role)
- GET /api/admin/suppliers/{id}/document?field=...&download=... (200 + reachable signed URL)
- GET /api/scanners (200, may be [] if migration not yet run)
- POST /api/supplier/scanners (expect 200 or graceful 503 'scanner_listings ... not yet migrated')
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASS = "Admin@123"
DEALER_EMAIL = "qadealer@tonerscart.in"
DEALER_PASS = "Dealer@123"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        pytest.skip("no admin token in login response")
    return tok


@pytest.fixture(scope="module")
def dealer_token():
    r = _login(DEALER_EMAIL, DEALER_PASS)
    assert r.status_code == 200, f"dealer login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        pytest.skip("no dealer token in login response")
    return tok


# ---- sign-in routing / role
class TestSignIn:
    def test_admin_login_role(self, admin_token):
        # Verify app role via /auth/me (Supabase 'role' on login is always 'authenticated')
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{API}/auth/me", headers=h, timeout=10)
        assert r.status_code == 200, r.text[:200]
        prof = r.json()
        assert prof.get("role") == "admin", f"expected admin, got {prof.get('role')}"
        assert prof.get("email") == ADMIN_EMAIL

    def test_dealer_login_role(self, dealer_token):
        h = {"Authorization": f"Bearer {dealer_token}"}
        r = requests.get(f"{API}/auth/me", headers=h, timeout=10)
        assert r.status_code == 200, r.text[:200]
        prof = r.json()
        assert prof.get("role") == "supplier", f"expected supplier, got {prof.get('role')}"

    def test_admin_me_fast(self, admin_token):
        import time
        h = {"Authorization": f"Bearer {admin_token}"}
        start = time.time()
        r = requests.get(f"{API}/auth/me", headers=h, timeout=10)
        elapsed = time.time() - start
        assert r.status_code == 200
        assert elapsed < 5.0, f"/auth/me took {elapsed:.2f}s (>5s)"


# ---- admin document download (signed URL)
SUPPLIER_ID = "2c8d2c95-5de0-4d1c-917c-c8edd3d4904b"


class TestAdminDocDownload:
    def test_doc_view_and_download(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        # NOTE: /admin/suppliers/{id}/documents is for pending applications; for an
        # APPROVED supplier we probe the single-document endpoint directly with known
        # DOC_FIELDS keys defined in backend/server.py.
        field = None
        for guess in ("doc_pan", "doc_gst", "doc_brand_authorization", "doc_shop_photo",
                      "doc_bank_proof", "doc_id_proof", "doc_address_proof"):
            rr = requests.get(
                f"{API}/admin/suppliers/{SUPPLIER_ID}/document",
                params={"field": guess}, headers=h, timeout=15)
            if rr.status_code == 200:
                field = guess
                break

        if not field:
            pytest.skip(f"supplier {SUPPLIER_ID} has no resolvable KYC documents in storage")

        # View
        r1 = requests.get(f"{API}/admin/suppliers/{SUPPLIER_ID}/document",
                          params={"field": field, "download": "false"}, headers=h, timeout=15)
        assert r1.status_code == 200, f"view failed: {r1.status_code} {r1.text[:200]}"
        url1 = r1.json().get("url")
        assert url1 and url1.startswith("http"), f"bad url: {url1}"
        u1 = requests.get(url1, timeout=20, allow_redirects=True)
        assert u1.status_code == 200, f"signed view URL unreachable: {u1.status_code}"
        assert len(u1.content) > 100, "view URL returned empty/tiny body"

        # Download
        r2 = requests.get(f"{API}/admin/suppliers/{SUPPLIER_ID}/document",
                          params={"field": field, "download": "true"}, headers=h, timeout=15)
        assert r2.status_code == 200, r2.text[:200]
        url2 = r2.json().get("url")
        assert url2 and url2.startswith("http")
        u2 = requests.get(url2, timeout=20, allow_redirects=True)
        assert u2.status_code == 200


# ---- scanners (public + dealer)
class TestScanners:
    def test_public_list(self):
        r = requests.get(f"{API}/scanners", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"

    def test_dealer_create_scanner_graceful(self, dealer_token):
        h = {"Authorization": f"Bearer {dealer_token}"}
        payload = {
            "brand": "Canon",
            "model_number": "TEST_QA_Scanner_X1",
            "scanner_type": "Flatbed",
            "condition": "New",
            "scan_resolution": "1200 dpi",
            "color_mode": "Color",
            "connectivity": ["USB"],
            "scan_speed_ppm": 25,
            "warranty": "1 year",
            "price": 12000,
            "stock": 1,
            "gst_rate": 18,
            "description": "QA test",
            "image_urls": [],
        }
        r = requests.post(f"{API}/supplier/scanners", json=payload, headers=h, timeout=20)
        # Either 200/201 (migration done) OR 503 with the graceful message
        assert r.status_code in (200, 201, 503), f"unexpected: {r.status_code} {r.text[:200]}"
        if r.status_code == 503:
            assert "scanner_listings" in r.text and "not yet migrated" in r.text, r.text[:200]
