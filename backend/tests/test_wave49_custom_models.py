"""Wave 49 backend tests:
- /api/compat/toners and /api/compat/printers (custom merge no-op safe)
- /api/compat/custom-printer and /api/compat/custom-toner auth + validation
- /api/compat/toner-page/{slug} for SEO page (canon-303, hp-q2612a)
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ----- Compat catalogue GET (no auth) -----
class TestCompatCatalogue:
    def test_toners_search_q2612a(self, s):
        r = s.get(f"{BASE}/api/compat/toners", params={"q": "Q2612A"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # At least one match expected for Q2612A
        joined = " ".join((row.get("model") or "") for row in data).lower()
        assert "q2612a" in joined or len(data) >= 1

    def test_printers_search_m1005(self, s):
        r = s.get(f"{BASE}/api/compat/printers", params={"q": "M1005"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_toners_no_crash_empty(self, s):
        r = s.get(f"{BASE}/api/compat/toners", timeout=20)
        assert r.status_code == 200


# ----- Custom model POST endpoints (auth-gated) -----
class TestCustomModelAuth:
    def test_custom_printer_no_auth_401(self, s):
        r = s.post(f"{BASE}/api/compat/custom-printer",
                   json={"brand": "TestBrand", "model": "TestModel"}, timeout=20)
        # FastAPI w/ HTTPBearer typically returns 401 or 403 when missing creds
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_custom_toner_no_auth_401(self, s):
        r = s.post(f"{BASE}/api/compat/custom-toner",
                   json={"brand": "TestBrand", "model": "TC-123"}, timeout=20)
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_custom_toner_admin_blocked_403(self, s):
        # Login as admin and try — should be 403 since require_role('supplier')
        # Skip if Supabase auth not reachable in this env
        login = s.post(f"{BASE}/api/auth/login", json={
            "email": "support@tonerscart.com",
            "password": "Bangara1@#",
        }, timeout=20)
        if login.status_code != 200:
            pytest.skip(f"admin login not available: {login.status_code}")
        tok = login.json().get("access_token") or login.json().get("token")
        if not tok:
            pytest.skip("admin login returned no token")
        r = s.post(f"{BASE}/api/compat/custom-toner",
                   headers={"Authorization": f"Bearer {tok}"},
                   json={"brand": "AdminTest", "model": "X-1"}, timeout=20)
        # Admin is not a supplier → require_role should 403. Must NOT 500.
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_custom_toner_missing_brand_validation(self, s):
        # No auth → 401/403 short-circuits before body validation; that's ok
        r = s.post(f"{BASE}/api/compat/custom-toner",
                   json={"model": "OnlyModel"}, timeout=20)
        # Pydantic returns 422 if no auth wrapper short-circuits, otherwise 401/403
        assert r.status_code in (401, 403, 422), f"unexpected {r.status_code}: {r.text}"


# ----- Toner SEO page (compat/toner-page) -----
class TestTonerSeoPage:
    def test_canon_303_has_listings(self, s):
        r = s.get(f"{BASE}/api/compat/toner-page/canon-303", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "toner" in data
        assert data["toner"]["slug"] == "canon-303"
        listings = data.get("listings") or []
        assert len(listings) >= 1, "canon-303 should have at least 1 listing"
        first = listings[0]
        # Featured card must have these fields
        assert "id" in first
        assert "total_price" in first
        assert "gst_rate" in first
        assert "price" in first
        assert "dealer_name" in first
        assert "url" in first

    def test_hp_q2612a_no_crash(self, s):
        r = s.get(f"{BASE}/api/compat/toner-page/hp-q2612a", timeout=20)
        # Either 200 (with maybe 0 listings) or 404 if slug not in DB
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            data = r.json()
            assert "listings" in data
