"""Wave 15 backend tests — location-based listings, view ping, supplier analytics."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend .env if env var not exported
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------------------------------------------------------------------------
# Paginated listings search with near_city
# ---------------------------------------------------------------------------
class TestSearchPaginatedNearCity:
    def test_paginated_no_near_city_baseline(self, s):
        r = s.get(f"{API}/listings/search/paginated", params={"limit": 50})
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("results", "total", "page", "pages", "limit"):
            assert k in data
        assert isinstance(data["results"], list)
        # Price-sorted (ascending) when no near_city; allow nulls/zeros.
        prices = [row.get("price") for row in data["results"] if isinstance(row.get("price"), (int, float))]
        if len(prices) > 1:
            assert prices == sorted(prices), "results should be price-sorted ASC"

    @pytest.mark.parametrize("city", ["Bangalore", "Mumbai", "Delhi"])
    def test_paginated_near_city_local_first(self, s, city):
        r = s.get(f"{API}/listings/search/paginated", params={"near_city": city, "limit": 100})
        assert r.status_code == 200, r.text
        data = r.json()
        results = data["results"]
        # Once we hit a non-matching city, no later row should match (partition order).
        def _city_of(row):
            return ((row.get("city") or row.get("supplier_city") or "").strip().lower())
        target = city.strip().lower()
        # Bengaluru alias for Bangalore
        alias = {"bangalore": "bengaluru", "bengaluru": "bangalore",
                 "mumbai": "bombay", "bombay": "mumbai"}
        targets = {target, alias.get(target, target)}
        seen_other = False
        for row in results:
            rc = _city_of(row)
            is_local = rc in targets
            if seen_other and is_local:
                pytest.fail(f"Local city '{rc}' appears AFTER a non-local row in near_city={city} ordering")
            if not is_local:
                seen_other = True

    def test_paginated_hard_city_ignores_near_city(self, s):
        # When city is set, near_city ordering should not break: results all match city.
        r = s.get(f"{API}/listings/search/paginated",
                  params={"city": "Bangalore", "near_city": "Mumbai", "limit": 50})
        assert r.status_code == 200, r.text
        data = r.json()
        for row in data["results"]:
            c = (row.get("city") or "").strip().lower()
            # Only listings of city=Bangalore should be present (case sensitive per backend .eq)
            assert c in ("bangalore", "") or c == "bangalore", f"unexpected city {c}"


# ---------------------------------------------------------------------------
# Printers & papers near_city
# ---------------------------------------------------------------------------
class TestPrintersPapersNearCity:
    @pytest.mark.parametrize("path,city", [
        ("/printers", "Bangalore"),
        ("/printers", "Mumbai"),
        ("/papers", "Bangalore"),
        ("/papers", "Delhi"),
    ])
    def test_near_city_200(self, s, path, city):
        r = s.get(f"{API}{path}", params={"near_city": city})
        assert r.status_code == 200, f"{path}?near_city={city} -> {r.status_code} {r.text[:200]}"
        data = r.json()
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# Listing view ping (guest, graceful when listing_views table missing)
# ---------------------------------------------------------------------------
class TestListingViewPing:
    def test_view_ping_guest_ok(self, s):
        r = s.post(f"{API}/listings/any-fake-id/view",
                   json={"kind": "toner", "city": "Mumbai"})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    @pytest.mark.parametrize("kind", ["toner", "printer", "paper"])
    def test_view_ping_kinds(self, s, kind):
        r = s.post(f"{API}/listings/fake-{kind}/view",
                   json={"kind": kind, "city": "Bangalore"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_view_ping_no_city(self, s):
        r = s.post(f"{API}/listings/fake-id/view", json={"kind": "toner"})
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------------------------------------------------------------------------
# Supplier analytics — auth guards (403 for guest)
# ---------------------------------------------------------------------------
class TestSupplierAnalyticsAuth:
    def test_guest_blocked(self, s):
        r = s.get(f"{API}/supplier/analytics/views")
        # Guest -> 401 (no token) OR 403 (not supplier). Both acceptable; must NOT be 500.
        assert r.status_code in (401, 403), f"unexpected {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# Regression — public endpoints
# ---------------------------------------------------------------------------
class TestRegression:
    def test_search_no_near_city_ok(self, s):
        r = s.get(f"{API}/listings/search/paginated")
        assert r.status_code == 200

    def test_listings_public_detail(self, s):
        # pull one listing then hit /public
        r = s.get(f"{API}/listings/search/paginated", params={"limit": 1})
        assert r.status_code == 200
        results = r.json().get("results", [])
        if not results:
            pytest.skip("no listings to test detail")
        lid = results[0].get("id")
        assert lid
        d = s.get(f"{API}/listings/{lid}/public")
        assert d.status_code == 200, d.text
        assert d.json().get("id") == lid
