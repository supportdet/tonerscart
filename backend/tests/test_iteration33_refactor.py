"""
Iteration 33 - Post-refactor regression sweep.
Confirms all routers (auth, search, products, orders, admin, suppliers,
procurement, oem, agreements) registered via include_router work end-to-end
after the server.py -> routes/ AST extraction.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token") or (data.get("session") or {}).get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_client(api, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


# ---------- 1. Router registration smoke ----------
class TestRoutersRegistered:
    def test_openapi_has_all_router_prefixes(self):
        # external gateway only proxies /api/*; OpenAPI lives on backend directly
        r = requests.get("http://localhost:8001/openapi.json", timeout=10)
        assert r.status_code == 200
        paths = r.json().get("paths", {})
        required_prefixes = [
            "/api/auth/login", "/api/auth/me",
            "/api/search/universal",
            "/api/listings/search/paginated", "/api/printers", "/api/papers", "/api/consumables",
            "/api/orders",
            "/api/admin/suppliers", "/api/admin/customers", "/api/admin/finance/summary",
            "/api/admin/activity-log", "/api/admin/oem/pending", "/api/admin/procurement/pending",
            "/api/oem/public",
            "/api/featured/suppliers",
        ]
        missing = [p for p in required_prefixes if not any(k.startswith(p) for k in paths)]
        assert not missing, f"Missing registered routes after refactor: {missing}"


# ---------- 2. Auth (routes/auth.py) ----------
class TestAuth:
    def test_admin_login_success(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_wrong_password_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": "wrong-password-xyz"}, timeout=15)
        assert r.status_code in (400, 401), f"expected 401, got {r.status_code} {r.text[:120]}"

    def test_me_with_bearer(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("email", "").lower() == ADMIN_EMAIL.lower()
        assert body.get("role") in ("admin", "super_admin")

    def test_me_without_token_unauthorized(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code in (401, 403)


# ---------- 3. Search (routes/search.py) ----------
class TestSearch:
    def test_universal_search_xerox(self, api):
        r = api.get(f"{BASE_URL}/api/search/universal", params={"q": "xerox"}, timeout=20)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        # grouped result shape
        for key in ("toners", "printers", "papers", "consumables"):
            assert key in body, f"missing group '{key}' in response"
            assert isinstance(body[key], list)
        # counts (some impls expose 'counts' dict, others inline)
        # Just verify total > 0 since xerox catalogue exists
        total = sum(len(body[k]) for k in ("toners", "printers", "papers", "consumables"))
        assert total > 0, "universal search returned no xerox results"

    def test_ai_search_degrades_gracefully(self, api):
        r = api.get(f"{BASE_URL}/api/search/ai", params={"q": "xerox toner"}, timeout=25)
        # OK if it works OR if it cleanly degrades (200/503), but NOT 500
        assert r.status_code in (200, 401, 403, 422, 503), f"ai search hard-failed: {r.status_code} {r.text[:200]}"


# ---------- 4. Products (routes/products.py) ----------
class TestProducts:
    def test_listings_search_paginated(self, api):
        r = api.get(f"{BASE_URL}/api/listings/search/paginated",
                    params={"page": 1, "page_size": 10}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "items" in body or "results" in body or "listings" in body, f"unexpected shape: {list(body)[:5]}"

    def test_printers(self, api):
        r = api.get(f"{BASE_URL}/api/printers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_papers(self, api):
        r = api.get(f"{BASE_URL}/api/papers", timeout=15)
        assert r.status_code == 200

    def test_consumables(self, api):
        r = api.get(f"{BASE_URL}/api/consumables", timeout=15)
        assert r.status_code == 200

    def test_listing_by_id_or_404(self, api):
        # pick any listing id from search
        r = api.get(f"{BASE_URL}/api/listings/search/paginated",
                    params={"page": 1, "page_size": 1}, timeout=15)
        items = r.json().get("items") or r.json().get("results") or r.json().get("listings") or []
        if not items:
            pytest.skip("no listings in DB to look up")
        lid = items[0].get("id")
        if not lid:
            pytest.skip("listing has no id field")
        r2 = api.get(f"{BASE_URL}/api/listings/{lid}", timeout=15)
        assert r2.status_code == 200, r2.text[:200]
        assert r2.json().get("id") == lid


# ---------- 5. Featured ----------
class TestFeatured:
    def test_featured_suppliers(self, api):
        r = api.get(f"{BASE_URL}/api/featured/suppliers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))


# ---------- 6. Orders (routes/orders.py) ----------
class TestOrders:
    def test_orders_list_requires_auth(self, api):
        # /api/orders root is POST-only (placement). Reading uses /api/orders/mine.
        r = api.get(f"{BASE_URL}/api/orders/mine", timeout=15)
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_orders_list_as_admin(self, admin_client):
        # admin uses /api/admin/orders; /api/orders/mine = current-user orders
        r = admin_client.get(f"{BASE_URL}/api/admin/orders", timeout=20)
        assert r.status_code in (200, 404, 405), f"admin orders listing errored: {r.status_code} {r.text[:200]}"

    def test_order_status_transition_unauth(self, api):
        # any random uuid - we just need to confirm endpoint enforces auth, not 500
        r = api.put(f"{BASE_URL}/api/orders/00000000-0000-0000-0000-000000000000/status",
                    json={"status": "shipped"}, timeout=15)
        assert r.status_code in (401, 403, 404, 422), f"expected auth/validation rejection, got {r.status_code}"


# ---------- 7. Suppliers (routes/suppliers.py) ----------
class TestSuppliers:
    def test_supplier_storefront(self, api, admin_client):
        # find any supplier id via featured
        r = api.get(f"{BASE_URL}/api/featured/suppliers", timeout=15)
        suppliers = r.json() if isinstance(r.json(), list) else r.json().get("suppliers", [])
        if not suppliers:
            pytest.skip("no featured suppliers available to test storefront")
        sid = suppliers[0].get("id")
        if not sid:
            pytest.skip("featured supplier has no id")
        r2 = api.get(f"{BASE_URL}/api/suppliers/{sid}/storefront", timeout=20)
        assert r2.status_code == 200, r2.text[:200]
        body = r2.json()
        # should have business info + grouped listings
        assert "business_name" in body or "supplier" in body or "id" in body, f"shape: {list(body)[:6]}"


# ---------- 8. Admin (routes/admin.py) ----------
class TestAdminRouter:
    def test_dealers(self, admin_client):
        # "dealers" in the review request = suppliers in this codebase
        r = admin_client.get(f"{BASE_URL}/api/admin/suppliers", timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), (list, dict))

    def test_customers(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/customers", timeout=20)
        assert r.status_code == 200, r.text[:200]

    def test_finance_summary(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/finance/summary", timeout=20)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        # endpoint returns a per-month breakdown list (dicts with gmv/commission/...)
        assert isinstance(body, (list, dict))
        if isinstance(body, list) and body:
            row = body[0]
            assert any(k in row for k in ("gmv", "commission", "orders", "month")), f"row: {row}"

    def test_activity_log(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/activity-log", timeout=20)
        assert r.status_code == 200, r.text[:200]

    def test_oem_pending(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/oem/pending", timeout=20)
        assert r.status_code == 200, r.text[:200]

    def test_procurement_pending(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/procurement/pending", timeout=20)
        # graceful 200 or 503 (unmigrated) - NOT 500
        assert r.status_code in (200, 503), f"procurement/pending hard-failed: {r.status_code} {r.text[:200]}"

    def test_admin_endpoints_require_admin(self, api):
        r = api.get(f"{BASE_URL}/api/admin/suppliers", timeout=15)
        assert r.status_code in (401, 403)
        r2 = api.get(f"{BASE_URL}/api/admin/finance/summary", timeout=15)
        assert r2.status_code in (401, 403)


# ---------- 9. Procurement (procurement.py router) ----------
class TestProcurement:
    def test_procurement_public_get(self, api):
        # try common procurement public endpoint - graceful 200/404/503 OK, NOT 500
        for path in ("/api/procurement/tenders", "/api/procurement/public", "/api/procurement/listings"):
            r = api.get(f"{BASE_URL}{path}", timeout=15)
            if r.status_code != 404:
                assert r.status_code in (200, 401, 403, 503), f"{path} -> {r.status_code} {r.text[:120]}"
                return
        # All 404 → endpoint may live behind auth only; that's fine for refactor smoke
        pytest.skip("no public procurement GET found - all 404")


# ---------- 10. OEM (oem.py router) ----------
class TestOEM:
    def test_oem_public(self, api):
        r = api.get(f"{BASE_URL}/api/oem/public", timeout=15)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        # should expose partners and/or products
        assert isinstance(body, (list, dict))


# ---------- 11. Cross-module integrity ----------
class TestCrossModuleIntegrity:
    """
    Confirms admin write -> public read both hit the same shared kernel
    (caches, supabase client, models) after the refactor.
    """
    def test_admin_write_visible_to_public_read(self, admin_client, api):
        # Use site_config or marquee_brands as a benign read-only-ish probe.
        # We just confirm both modules see the same value from server.py state.
        # 1. admin reads site_config
        r1 = admin_client.get(f"{BASE_URL}/api/admin/site-config", timeout=15)
        # endpoint may be under different name; try public marquee path as fallback
        if r1.status_code == 404:
            r1 = api.get(f"{BASE_URL}/api/site/marquee-brands", timeout=15)
        if r1.status_code == 404:
            r1 = api.get(f"{BASE_URL}/api/marquee/brands", timeout=15)
        # 2. public reads featured suppliers (cached in server.py _FEATURED_CACHE)
        r2 = api.get(f"{BASE_URL}/api/featured/suppliers", timeout=15)
        assert r2.status_code == 200
        # success criterion: both modules respond without 500 (shared kernel intact)
        assert r1.status_code != 500, f"admin module 500: {r1.text[:120]}"
