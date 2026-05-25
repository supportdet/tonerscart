"""TonersCart admin v2 backend tests (iteration 7).

Covers the new endpoints introduced in this batch:
  * GET  /api/config/{key}                — public, graceful default fallback
  * GET  /api/stats/public                — public, no 500 even when is_suspended missing
  * GET  /api/admin/analytics             — admin only, live stats + 5 chart datasets
  * GET  /api/admin/orders                — admin only, rows+total+page+limit
  * GET  /api/admin/orders/export         — admin only, text/csv with UTF-8 BOM
  * POST /api/admin/suppliers/{id}/suspend, /unsuspend — 200 OR 503 if column missing
  * DELETE /api/admin/listings/{id}       — idempotent
  * POST /api/admin/config/{key}          — admin only, 200 OR 503 if table missing
  * PUT  /api/orders/{id}/status          — buyer-side delivered on shipped
                                           seller-side shipped+tracking
  * /api/listings/search                  — must not return suspended suppliers
                                           (when column exists; otherwise no 500)

Admin auth uses Supabase Auth REST (no /api/auth/login on backend).
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"

BUYER_EMAIL = "buyer1@test.com"
BUYER_PASSWORD = "Test@123"


def sb_login(email: str, password: str):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


@pytest.fixture(scope="module")
def admin_token():
    tok = sb_login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip(f"admin login failed for {ADMIN_EMAIL}")
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def buyer_token():
    tok = sb_login(BUYER_EMAIL, BUYER_PASSWORD)
    if not tok:
        email = f"adminv2.buyer.{uuid.uuid4().hex[:8]}@tonerscarttest.com"
        password = "Test@12345"
        r = requests.post(f"{API}/auth/signup-customer", json={
            "email": email, "password": password, "name": "TEST AdminV2 Buyer",
            "phone": "9000000099", "city": "Mumbai",
        }, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"buyer signup failed: {r.status_code} {r.text}")
        tok = sb_login(email, password)
    if not tok:
        pytest.skip("buyer login failed")
    return tok


# ===== Smoke =====
class TestSmoke:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ===== Public site_config defaults =====
class TestPublicConfig:
    def test_popular_chips_default(self):
        r = requests.get(f"{API}/config/popular_chips", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("key") == "popular_chips"
        val = d.get("value")
        assert isinstance(val, list) and len(val) >= 4
        for item in val:
            assert "label" in item and "query" in item

    def test_marquee_brands_default(self):
        r = requests.get(f"{API}/config/marquee_brands", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("key") == "marquee_brands"
        val = d.get("value")
        assert isinstance(val, list) and len(val) >= 8
        for item in val:
            assert "name" in item

    def test_unknown_key_returns_empty_list(self):
        r = requests.get(f"{API}/config/some_random_unknown_key", timeout=15)
        # Spec: graceful default — empty list, not 404 or 500
        assert r.status_code == 200, r.text
        assert r.json().get("value") == []


# ===== Public stats =====
class TestPublicStats:
    def test_stats_public_shape(self):
        r = requests.get(f"{API}/stats/public", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(["suppliers", "cities", "brands"]).issubset(d.keys())
        for k in ("suppliers", "cities", "brands"):
            assert isinstance(d[k], int) and d[k] >= 0


# ===== Admin analytics =====
class TestAdminAnalytics:
    def test_unauthed_blocked(self):
        r = requests.get(f"{API}/admin/analytics", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_admin_analytics_payload(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Top-level keys
        for k in ("stats", "orders_per_day", "commission_per_day",
                  "top_models", "top_dealers", "orders_by_city"):
            assert k in d, f"missing key {k}: {list(d.keys())}"
        stats = d["stats"]
        for k in ("total_gmv", "total_commission", "total_orders",
                  "orders_week", "orders_month",
                  "total_dealers", "new_dealers_week",
                  "total_buyers", "new_buyers_week", "active_listings"):
            assert k in stats, f"missing stats.{k}"
        # 30 buckets seeded for both daily series
        assert len(d["orders_per_day"]) >= 30, f"orders_per_day len={len(d['orders_per_day'])}"
        assert len(d["commission_per_day"]) >= 30, f"commission_per_day len={len(d['commission_per_day'])}"
        # Each entry shape
        for e in d["orders_per_day"][:3]:
            assert "date" in e and "count" in e
        for e in d["commission_per_day"][:3]:
            assert "date" in e and "amount" in e


# ===== Admin orders list =====
class TestAdminOrders:
    def test_unauthed_blocked(self):
        r = requests.get(f"{API}/admin/orders?limit=5", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_admin_orders_pagination_shape(self, admin_headers):
        r = requests.get(f"{API}/admin/orders?limit=10", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("rows", "total", "page", "limit"):
            assert k in d
        assert isinstance(d["rows"], list)
        assert d["limit"] == 10
        # If any rows present, verify commission/payout enrichment + brand/model join
        for row in d["rows"][:5]:
            assert "commission" in row
            assert "payout" in row
            assert "commission_rate" in row
            assert "supplier_name" in row
            # brand/model may be None if listing was deleted, but key must exist
            assert "brand" in row
            assert "model_number" in row

    def test_admin_orders_status_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/orders?status=delivered&limit=5",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for row in d["rows"]:
            assert row.get("status") == "delivered"


# ===== Admin CSV export =====
class TestAdminOrdersExport:
    def test_unauthed_blocked(self):
        r = requests.get(f"{API}/admin/orders/export", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_csv_headers_and_content(self, admin_headers):
        r = requests.get(f"{API}/admin/orders/export", headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        ct = r.headers.get("Content-Type", "")
        assert "text/csv" in ct, f"unexpected content-type {ct}"
        # UTF-8 BOM at start
        assert r.content.startswith(b"\xef\xbb\xbf"), "missing UTF-8 BOM"
        text = r.content.decode("utf-8-sig", errors="replace")
        first_line = text.splitlines()[0] if text else ""
        # Header includes all required columns
        for col in ("Order ID", "Created", "Status", "Tracking",
                    "Buyer Name", "Brand", "Model", "Commission", "Payout"):
            assert col in first_line, f"missing column '{col}' in: {first_line}"
        # Content-Disposition attachment header
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower()
        assert ".csv" in cd.lower()


# ===== Admin suspend / unsuspend =====
class TestSupplierSuspend:
    def _any_supplier_id(self, admin_headers):
        # Use suppliers list via /admin endpoint or fall back to listings
        r = requests.get(f"{API}/admin/suppliers", headers=admin_headers, timeout=20)
        if r.status_code == 200 and isinstance(r.json(), list) and r.json():
            for s in r.json():
                if s.get("id"):
                    return s["id"]
        # fallback — from public listings join
        r = requests.get(f"{API}/listings/search?limit=5", timeout=20)
        if r.status_code == 200:
            for L in r.json():
                if L.get("supplier_id"):
                    return L["supplier_id"]
        return None

    def test_suspend_unsuspend_round_trip(self, admin_headers):
        sid = self._any_supplier_id(admin_headers)
        if not sid:
            pytest.skip("no supplier available to test suspend round-trip")
        r1 = requests.post(f"{API}/admin/suppliers/{sid}/suspend",
                           headers=admin_headers, timeout=20)
        # 200 once migrated, 503 if column missing — NEVER 500
        assert r1.status_code in (200, 503), f"suspend {r1.status_code}: {r1.text}"
        r2 = requests.post(f"{API}/admin/suppliers/{sid}/unsuspend",
                           headers=admin_headers, timeout=20)
        assert r2.status_code in (200, 503), f"unsuspend {r2.status_code}: {r2.text}"
        # If first call succeeded, second should also succeed
        if r1.status_code == 200:
            assert r2.status_code == 200, f"asymmetric: suspend OK but unsuspend {r2.status_code}"

    def test_supplier_detail_endpoint(self, admin_headers):
        sid = self._any_supplier_id(admin_headers)
        if not sid:
            pytest.skip("no supplier available")
        r = requests.get(f"{API}/admin/suppliers/{sid}/detail",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("supplier", "toner_listings", "printer_listings", "orders", "stats"):
            assert k in d, f"missing {k}"
        for k in ("listing_count", "order_count", "gmv"):
            assert k in d["stats"]


# ===== Admin delete listings — idempotent =====
class TestAdminDelete:
    def test_delete_nonexistent_listing_ok(self, admin_headers):
        fake = "00000000-0000-0000-0000-000000000000"
        r = requests.delete(f"{API}/admin/listings/{fake}",
                            headers=admin_headers, timeout=20)
        assert r.status_code in (200, 204), f"unexpected {r.status_code}: {r.text}"

    def test_delete_nonexistent_printer_ok(self, admin_headers):
        fake = "00000000-0000-0000-0000-000000000000"
        r = requests.delete(f"{API}/admin/printers/{fake}",
                            headers=admin_headers, timeout=20)
        assert r.status_code in (200, 204), f"unexpected {r.status_code}: {r.text}"


# ===== Admin config write =====
class TestAdminConfigWrite:
    def test_unauthed_blocked(self):
        r = requests.post(f"{API}/admin/config/popular_chips",
                          json={"value": [{"label": "X", "query": "X"}]},
                          timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_admin_can_write_or_graceful_503(self, admin_headers):
        payload = {"value": [
            {"label": "HP 88A", "query": "HP 88A"},
            {"label": "Canon 337", "query": "Canon 337"},
            {"label": "Brother TN-2365", "query": "TN-2365"},
            {"label": "Xerox 3020", "query": "Xerox 3020"},
        ]}
        r = requests.post(f"{API}/admin/config/popular_chips",
                          headers=admin_headers, json=payload, timeout=20)
        # 200 once migrated, 503 if site_config table missing — NEVER 500
        assert r.status_code in (200, 503), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 200:
            # Read-back via public GET should reflect the write
            r2 = requests.get(f"{API}/config/popular_chips", timeout=15)
            assert r2.status_code == 200
            vals = r2.json().get("value")
            assert isinstance(vals, list)


# ===== Suspended dealer filter on public listings =====
class TestPublicListingsSuspendedFilter:
    def test_listings_search_does_not_500(self):
        r = requests.get(f"{API}/listings/search?limit=20", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)

    def test_printers_does_not_500(self):
        r = requests.get(f"{API}/printers?limit=20", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)


# ===== Order status flow (buyer Confirm Delivery, seller tracking) =====
class TestOrderStatusTransitions:
    def _find_buyer_shipped_order(self, buyer_token):
        """Find a shipped order belonging to this buyer. May return None."""
        h = {"Authorization": f"Bearer {buyer_token}"}
        r = requests.get(f"{API}/orders/mine", headers=h, timeout=20)
        if r.status_code != 200:
            return None
        for o in r.json():
            if o.get("status") == "shipped":
                return o
        return None

    def test_buyer_can_confirm_delivery_or_skip(self, buyer_token):
        o = self._find_buyer_shipped_order(buyer_token)
        if not o:
            pytest.skip("no shipped order for buyer1 — cannot exercise buyer delivered path")
        h = {"Authorization": f"Bearer {buyer_token}"}
        r = requests.put(f"{API}/orders/{o['id']}/status",
                         headers=h, json={"status": "delivered"}, timeout=30)
        # 200 happy, 403 if some RLS edge — never 500
        assert r.status_code == 200, f"{r.status_code}: {r.text}"

    def test_buyer_cannot_force_random_transition(self, buyer_token):
        h = {"Authorization": f"Bearer {buyer_token}"}
        # Buyer requesting 'shipped' on any of their orders must be 403
        r = requests.get(f"{API}/orders/mine", headers=h, timeout=20)
        if r.status_code != 200 or not r.json():
            pytest.skip("buyer has no orders")
        oid = r.json()[0]["id"]
        r2 = requests.put(f"{API}/orders/{oid}/status",
                          headers=h, json={"status": "shipped",
                                            "tracking_number": "TEST123"}, timeout=20)
        assert r2.status_code in (403, 400), f"{r2.status_code}: {r2.text}"

    def test_status_invalid_value(self, buyer_token):
        h = {"Authorization": f"Bearer {buyer_token}"}
        # Use any order id format; we want the 400 validator path
        r = requests.put(f"{API}/orders/00000000-0000-0000-0000-000000000000/status",
                         headers=h, json={"status": "garbage"}, timeout=15)
        assert r.status_code == 400, f"{r.status_code}: {r.text}"
