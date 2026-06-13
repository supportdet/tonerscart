"""Wave 47 — D2D dedicated detail endpoint.

Covers GET /api/d2d/listing/{kind}/{id} auth/role gating, invalid kinds,
and d2d_enabled=False rejection. We do NOT test the verified-supplier
happy path here because that requires creating + approving a fresh
supplier account, which mutates production data.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
SAMPLE_TONER_ID = "46805c13-91f7-4636-8db1-4e62877d1946"

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token") or (data.get("session") or {}).get("access_token")
    if not tok:
        pytest.skip("No admin token in response")
    return tok


class TestD2DListingDetail:
    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/d2d/listing/toner/{SAMPLE_TONER_ID}", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_admin_returns_403_not_supplier(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/d2d/listing/toner/{SAMPLE_TONER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"
        detail = (r.json() or {}).get("detail", "")
        assert "approved dealer" in detail.lower() or "supplier" in detail.lower(), f"unexpected detail: {detail}"

    def test_invalid_kind_returns_404(self, admin_token):
        # Even though admin will fail role check, kind validation should
        # happen first (per implementation: kind check is before role check).
        r = requests.get(
            f"{BASE_URL}/api/d2d/listing/widget/{SAMPLE_TONER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404 for invalid kind, got {r.status_code}: {r.text[:200]}"
        detail = (r.json() or {}).get("detail", "")
        assert "unknown" in detail.lower() or "not found" in detail.lower() or "kind" in detail.lower()

    def test_unauthenticated_printer_kind_also_401(self):
        r = requests.get(f"{BASE_URL}/api/d2d/listing/printer/{SAMPLE_TONER_ID}", timeout=15)
        assert r.status_code == 401

    def test_unauthenticated_paper_kind_also_401(self):
        r = requests.get(f"{BASE_URL}/api/d2d/listing/paper/{SAMPLE_TONER_ID}", timeout=15)
        assert r.status_code == 401


class TestRegressionWave46:
    """Wave 46 invariants that must still hold."""

    def test_sample_listing_customer_price_5100(self):
        # The sample toner used throughout Wave 47 — confirm customer-facing
        # price is ₹5,100 (D2D price ₹4,800 will only be visible to verified
        # dealers via /api/d2d/listing/...).
        r = requests.get(f"{BASE_URL}/api/listings/{SAMPLE_TONER_ID}", timeout=15)
        assert r.status_code == 200, f"listing fetch failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert float(data["price"]) == 5100.0, f"sample listing price drift: {data['price']}"

    def test_terms_page_returns_html(self):
        # Just make sure the public terms route is reachable (frontend SPA fallback)
        r = requests.get(f"{BASE_URL}/terms", timeout=15)
        assert r.status_code == 200
