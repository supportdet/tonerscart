"""Wave 5 batch tests — admin cleanup, public product endpoints, supplier
listing-image, search variants[] field, /api/listings/{id} regression.

Migrations supabase_schema_v3.sql / v4.sql / papers.sql may not be run.
Endpoints are written to degrade gracefully (variants=[]). Treat that as OK.
"""
import os
import time
import pytest
import requests

def _bootstrap_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k.strip(), v)
_bootstrap_env()

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL", "https://mlvtaozdosufrhzhvgdg.supabase.co")
SUPABASE_ANON = os.environ.get("REACT_APP_SUPABASE_ANON_KEY", "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s")

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"
BUYER_EMAIL = "buyer1@test.com"
BUYER_PASSWORD = "Test@123"

BAD_UUID = "00000000-0000-0000-0000-000000000000"


def sb_login(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    tok = sb_login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("admin Supabase login failed")
    return tok


@pytest.fixture(scope="session")
def buyer_token(api):
    tok = sb_login(BUYER_EMAIL, BUYER_PASSWORD)
    if tok:
        return tok
    import uuid as _u
    email = f"w5.buyer.{_u.uuid4().hex[:8]}@tonerscarttest.com"
    password = "Test@12345"
    r = api.post(f"{BASE_URL}/api/auth/signup-customer", json={
        "email": email, "password": password, "name": "TEST W5 Buyer",
        "phone": "9000000099", "city": "Mumbai",
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"buyer signup failed: {r.status_code} {r.text[:200]}")
    tok = sb_login(email, password)
    if not tok:
        pytest.skip("buyer login failed after signup")
    return tok


@pytest.fixture(scope="session")
def first_listing_id(api):
    r = api.get(f"{BASE_URL}/api/listings/search", params={"limit": 5})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and rows, "no listings to test against"
    return rows[0]["id"]


# ---------------------------------------------------------------- search variants
class TestSearchVariants:
    def test_search_rows_contain_variants_field(self, api):
        r = api.get(f"{BASE_URL}/api/listings/search", params={"limit": 5})
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            for row in rows:
                assert "variants" in row, f"row {row.get('id')} missing variants"
                assert isinstance(row["variants"], list)


# ------------------------------------------------------------- public endpoints
class TestPublicProductEndpoints:
    def test_listing_public_404_for_missing(self, api):
        r = api.get(f"{BASE_URL}/api/listings/{BAD_UUID}/public")
        assert r.status_code == 404

    def test_listing_public_returns_variants_field(self, api, first_listing_id):
        r = api.get(f"{BASE_URL}/api/listings/{first_listing_id}/public")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == first_listing_id
        assert "variants" in body and isinstance(body["variants"], list)
        # Basic shape
        for k in ("brand", "model_number", "price", "stock"):
            assert k in body
        # supplier joined
        assert "supplier_name" in body

    def test_listing_public_no_auth_required(self, api, first_listing_id):
        s = requests.Session()  # fresh, no cookies/headers
        r = s.get(f"{BASE_URL}/api/listings/{first_listing_id}/public")
        assert r.status_code == 200

    def test_printer_public_404_for_missing(self, api):
        r = api.get(f"{BASE_URL}/api/printers/{BAD_UUID}/public")
        assert r.status_code == 404

    def test_paper_public_404_for_missing(self, api):
        r = api.get(f"{BASE_URL}/api/papers/{BAD_UUID}/public")
        # 404 if table exists, 503 if migration not run; both are acceptable
        assert r.status_code in (404, 503)


# ------------------------------------------------- /api/listings/{id} regression
class TestListingsByIdRegression:
    def test_listings_get_missing_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/listings/{BAD_UUID}")
        assert r.status_code == 404

    def test_listings_get_real_id(self, api, first_listing_id):
        r = api.get(f"{BASE_URL}/api/listings/{first_listing_id}")
        # 200 if in stock + not suspended; 410 otherwise — never 500
        assert r.status_code in (200, 410)


# -------------------------------------------------- admin cleanup-test-data
class TestAdminCleanup:
    def test_cleanup_unauth_401(self, api):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/admin/cleanup-test-data")
        assert r.status_code in (401, 403)

    def test_cleanup_buyer_403(self, api, buyer_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/cleanup-test-data",
            headers={"Authorization": f"Bearer {buyer_token}"},
        )
        assert r.status_code == 403

    def test_cleanup_admin_dry_run_preview(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/cleanup-test-data",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # preview dict — should NOT have already applied destructive ops
        assert isinstance(body, dict)
        # Common preview keys (any of)
        assert any(
            k in body for k in ("preview", "would_delete", "candidates", "summary", "ok", "counts")
        ), f"unexpected preview body keys: {list(body)[:6]}"


# ------------------------------------------------ supplier listing-image upload
class TestSupplierListingImage:
    def test_unauth_returns_401(self, api):
        r = requests.post(f"{BASE_URL}/api/supplier/listing-image")
        assert r.status_code in (401, 403, 422)

    def test_buyer_forbidden(self, buyer_token):
        # try multipart upload as buyer — must be 403
        files = {"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/supplier/listing-image",
            headers={"Authorization": f"Bearer {buyer_token}"},
            files=files,
        )
        assert r.status_code in (401, 403), f"got {r.status_code} {r.text[:200]}"


# -------------------------------------------------- orders variant_id flow (negative)
class TestOrdersVariantIdFallback:
    def test_orders_unauth(self, api):
        r = api.post(f"{BASE_URL}/api/orders", json={"listing_id": BAD_UUID, "qty": 1})
        assert r.status_code in (401, 403, 422)

    def test_orders_invalid_listing_404_or_400(self, buyer_token):
        r = requests.post(
            f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {buyer_token}"},
            json={
                "listing_id": BAD_UUID,
                "qty": 1,
                "variant_id": BAD_UUID,
                "delivery_address": "Test Addr",
                "phone": "9999999999",
            },
        )
        # Must NOT 500. graceful path → 404/400/410/503
        assert r.status_code in (400, 404, 410, 422, 503), f"unexpected {r.status_code} {r.text[:300]}"
