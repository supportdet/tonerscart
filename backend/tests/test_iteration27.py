"""Iteration 27 tests — new admin tabs (Customers, Disputes, Messages, Activity),
Finance enhancements (pending_payout + procurement-dues), dealer profile detail.

READ endpoints must return 200. WRITE endpoints that need the unmigrated
columns (flag/dispute/message-read/dealer-notes) may return 503 — that is
expected graceful behavior per the review request, NOT a bug.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": "admin@tonerscart.in", "password": "Admin@123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"admin auth failed {r.status_code}: {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- READ endpoints: must return 200 ----------
class TestAdminReadEndpoints:
    def test_customers_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/customers", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # accept either {customers:[...]} or list
        assert isinstance(data, (list, dict))

    def test_customers_list_shape_has_expected_fields(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/customers", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        rows = body.get("customers", body) if isinstance(body, dict) else body
        if rows:
            row = rows[0]
            # at least some of these fields should be present
            keys = set(row.keys())
            assert keys & {"email", "name", "id", "phone", "city", "orders_count", "spend", "total_spend"}

    def test_customer_detail_when_any_customer(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/customers", headers=admin_headers, timeout=30)
        if r.status_code != 200:
            pytest.skip("customers list not available")
        body = r.json()
        rows = body.get("customers", body) if isinstance(body, dict) else body
        if not rows:
            pytest.skip("no customers to fetch detail for")
        cid = rows[0].get("id") or rows[0].get("user_id")
        if not cid:
            pytest.skip("no id field on customer row")
        rr = requests.get(f"{BASE_URL}/api/admin/customers/{cid}", headers=admin_headers, timeout=30)
        assert rr.status_code == 200, rr.text[:300]

    def test_finance_dealers_includes_pending_payout(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/finance/dealers", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        rows = body.get("dealers", body) if isinstance(body, dict) else body
        if rows:
            assert "pending_payout" in rows[0], f"missing pending_payout in {list(rows[0].keys())}"

    def test_finance_procurement_dues(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/finance/procurement-dues", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_messages_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/messages", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_disputes_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/disputes", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_activity_log(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/activity-log", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_supplier_detail(self, admin_headers):
        # pick first supplier from dealers list
        r = requests.get(f"{BASE_URL}/api/admin/finance/dealers", headers=admin_headers, timeout=30)
        if r.status_code != 200:
            pytest.skip("dealers list failed")
        body = r.json()
        rows = body.get("dealers", body) if isinstance(body, dict) else body
        if not rows:
            pytest.skip("no dealers available")
        sid = rows[0].get("supplier_id") or rows[0].get("id")
        if not sid:
            pytest.skip("no supplier id available")
        rr = requests.get(f"{BASE_URL}/api/admin/suppliers/{sid}/detail", headers=admin_headers, timeout=30)
        assert rr.status_code == 200, rr.text[:300]
        d = rr.json()
        # expected sections in response
        assert isinstance(d, dict)


# ---------- WRITE endpoints: graceful 503 EXPECTED ----------
class TestAdminWriteGraceful503:
    def test_flag_order_returns_503_or_2xx(self, admin_headers):
        # pick first order id
        r = requests.get(f"{BASE_URL}/api/admin/orders", headers=admin_headers, timeout=30)
        if r.status_code != 200:
            pytest.skip("orders list failed")
        body = r.json()
        rows = body.get("orders") if isinstance(body, dict) and "orders" in body else (body.get("rows") if isinstance(body, dict) and "rows" in body else body)
        if isinstance(rows, dict):
            rows = list(rows.values())
        if not rows or not isinstance(rows, list):
            pytest.skip("no orders to flag")
        first = rows[0]
        if not isinstance(first, dict):
            pytest.skip(f"unexpected row shape: {type(first)}")
        oid = first.get("id") or first.get("order_id")
        if not oid:
            pytest.skip("no order id field")
        rr = requests.post(
            f"{BASE_URL}/api/admin/orders/{oid}/flag",
            headers=admin_headers,
            json={"reason": "TEST_flag iteration27"},
            timeout=30,
        )
        # acceptable: 503 (not migrated) OR success
        assert rr.status_code in (200, 201, 503), f"unexpected status {rr.status_code}: {rr.text[:200]}"
        if rr.status_code == 503:
            assert "migrat" in rr.text.lower() or "column" in rr.text.lower(), f"503 without migration message: {rr.text[:200]}"

    def test_message_read_toggle_returns_503_or_2xx(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/messages", headers=admin_headers, timeout=30)
        if r.status_code != 200:
            pytest.skip("messages list failed")
        body = r.json()
        rows = body.get("messages") if isinstance(body, dict) and "messages" in body else (body.get("rows") if isinstance(body, dict) and "rows" in body else body)
        if isinstance(rows, dict):
            rows = list(rows.values())
        if not rows or not isinstance(rows, list):
            pytest.skip("no messages")
        first = rows[0]
        if not isinstance(first, dict):
            pytest.skip(f"unexpected shape: {type(first)}")
        mid = first.get("id")
        if not mid:
            pytest.skip("no message id")
        rr = requests.put(
            f"{BASE_URL}/api/admin/messages/{mid}/read",
            headers=admin_headers,
            json={"is_read": True},
            timeout=30,
        )
        assert rr.status_code in (200, 503), f"unexpected status {rr.status_code}: {rr.text[:200]}"

    def test_dealer_notes_returns_503_or_2xx(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/finance/dealers", headers=admin_headers, timeout=30)
        if r.status_code != 200:
            pytest.skip("dealers failed")
        body = r.json()
        rows = body.get("dealers", body) if isinstance(body, dict) else body
        if not rows:
            pytest.skip("no dealers")
        sid = rows[0].get("supplier_id") or rows[0].get("id")
        rr = requests.put(
            f"{BASE_URL}/api/admin/suppliers/{sid}/notes",
            headers=admin_headers,
            json={"admin_notes": "TEST iteration27"},
            timeout=30,
        )
        assert rr.status_code in (200, 503), f"unexpected {rr.status_code}: {rr.text[:200]}"


# ---------- Auth required ----------
class TestAuthRequired:
    def test_customers_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/customers", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_activity_log_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/activity-log", timeout=20)
        assert r.status_code in (401, 403)
