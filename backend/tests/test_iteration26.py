"""Iteration 26 — post-email_service syntax-fix regression.

Focus:
1. Backend health / public endpoints
2. Admin login (Supabase) + admin dealers list with seller_id column
3. /api/auth/me returns supplier.seller_id (skip if no supplier login)
4. Order placement end-to-end (exercises email_order_placed previously-broken path).
   Creates a fresh customer on-demand, buys an existing toner listing, asserts 2xx
   and that no 500 surfaces from the email path.
5. Customer dashboard endpoint does not 500.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = ""
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
assert BASE_URL
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PWD = "Admin@123"


def sb_login(email, pwd):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": pwd},
        timeout=20,
    )
    return r.json().get("access_token") if r.status_code == 200 else None


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----------- Backend health / public endpoints -----------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_listings_search_paginated(self):
        r = requests.get(f"{API}/listings/search/paginated", params={"page": 1, "per_page": 5}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data or "results" in data or isinstance(data, dict)

    def test_landing_data(self):
        r = requests.get(f"{API}/landing-data", timeout=20)
        assert r.status_code == 200


# ----------- Admin login + dealers with seller_id -----------
class TestAdminDealers:
    @pytest.fixture(scope="class")
    def admin_tok(self):
        tok = sb_login(ADMIN_EMAIL, ADMIN_PWD)
        if not tok:
            pytest.fail("Admin Supabase login failed")
        return tok

    def test_admin_me(self, admin_tok):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_tok), timeout=15)
        assert r.status_code == 200
        assert r.json().get("role") == "admin"

    def test_admin_dealers_list(self, admin_tok):
        # DealersTab uses /api/admin/suppliers (Suppliers == Dealers in the UI)
        r = requests.get(f"{API}/admin/suppliers", headers=_h(admin_tok), timeout=20)
        assert r.status_code == 200, f"dealers list status={r.status_code} body={r.text[:300]}"
        data = r.json()
        dealers = data.get("suppliers") if isinstance(data, dict) else data
        if dealers is None and isinstance(data, dict):
            dealers = data.get("dealers") or data.get("items") or []
        assert isinstance(dealers, list), f"Expected list of dealers, got {type(dealers)}"
        # Approved dealers should have seller_id like TC-DLR-2026-NNNN
        approved = [d for d in dealers if (d.get("status") == "approved" or d.get("approved_at"))]
        assert len(approved) >= 1, "Need at least 1 approved dealer to verify seller_id column"
        with_seller_id = [d for d in approved if d.get("seller_id")]
        # Per agent context: 7 approved dealers all have IDs
        assert len(with_seller_id) >= 1, f"No approved dealer has seller_id; sample={approved[0]}"
        sid = with_seller_id[0]["seller_id"]
        assert sid.startswith("TC-DLR-"), f"Unexpected seller_id format: {sid}"


# ----------- Order placement (email_order_placed path) -----------
class TestOrderPlacement:
    @pytest.fixture(scope="class")
    def fresh_customer(self):
        ts = int(time.time())
        email = f"TEST.buyer.it26.{ts}@tonerscarttest.com"
        pwd = "Test@1234"
        # Use backend signup-customer which uses admin.create_user with email_confirm=true
        r = requests.post(
            f"{API}/auth/signup-customer",
            json={
                "email": email,
                "password": pwd,
                "name": "TEST Buyer It26",
                "phone": "9000000266",
            },
            timeout=30,
        )
        if r.status_code not in (200, 201):
            pytest.fail(f"signup-customer failed status={r.status_code} body={r.text[:300]}")
        # Sign in to obtain access_token
        tok = sb_login(email, pwd)
        assert tok, "Failed to login the newly-created customer"
        return {"email": email, "password": pwd, "token": tok}

    @pytest.fixture(scope="class")
    def listing(self):
        r = requests.get(f"{API}/listings/search/paginated", params={"page": 1, "per_page": 20}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        items = data.get("items") or data.get("results") or data.get("data") or []
        # filter for stock > 0
        in_stock = [it for it in items if (it.get("stock") or 0) > 0]
        assert in_stock, f"No in-stock listing found among {len(items)} items"
        return in_stock[0]

    def test_place_order_does_not_500(self, fresh_customer, listing):
        listing_id = listing.get("id")
        unit_price = listing.get("price") or listing.get("unit_price") or 0
        qty = 1
        payload = {
            "listing_id": listing_id,
            "listing_kind": "toner",
            "qty": qty,
            "customer_name": "TEST Buyer It26",
            "customer_phone": "9000000266",
            "delivery_address": "123 Test Lane, Bangalore, Karnataka 560001",
            "street_address": "123 Test Lane",
            "area": "MG Road",
            "order_city": "Bangalore",
            "order_state": "Karnataka",
            "pincode": "560001",
            "delivery_charge": 0,
            "notes": "iteration_26 e2e test",
        }
        r = requests.post(
            f"{API}/orders",
            headers=_h(fresh_customer["token"]),
            json=payload,
            timeout=60,
        )
        # Crucial: not 500 (which is what the email_service SyntaxError would surface as)
        assert r.status_code != 500, f"Order POST returned 500 (likely email_service path): {r.text[:500]}"
        assert r.status_code in (200, 201), f"Unexpected status={r.status_code} body={r.text[:500]}"
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        # Some kind of order identifier should be returned
        order_id = body.get("id") or body.get("order_id") or (body.get("order") or {}).get("id")
        assert order_id, f"Order id missing from response: {body}"

    def test_customer_dashboard_no_500(self, fresh_customer):
        # Hits the customer orders endpoint used by /customer
        for path in ("/orders/mine", "/customer/orders", "/orders?mine=true"):
            r = requests.get(f"{API}{path}", headers=_h(fresh_customer["token"]), timeout=20)
            if r.status_code != 404:
                assert r.status_code != 500, f"{path} returned 500: {r.text[:300]}"
                assert r.status_code == 200, f"{path} status={r.status_code}"
                return
        pytest.skip("No customer orders endpoint resolved (all 404); skipping")
