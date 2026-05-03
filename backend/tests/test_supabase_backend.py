"""TonersCart Supabase backend — end-to-end backend test suite.

Covers: health, customer/supplier/admin signup & auth, admin approval/reject flow,
supplier listings, public listing search/facets/grouped, orders flow,
admin stats, chat LLM, and auth enforcement.

Auth: we obtain Supabase JWTs directly via the Supabase Auth REST API
(/auth/v1/token?grant_type=password) because the backend verifies
Supabase-issued tokens (there's no /api/auth/login).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://toners-marketplace.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"

# Pre-existing test accounts (per review_request)
EXISTING_BUYER = ("buyer1@test.com", "Test@123")
EXISTING_SUPPLIER = ("supplier1@test.com", "Test@123")  # already APPROVED

# Unique emails for fresh signups this run
RUN = uuid.uuid4().hex[:8]
NEW_CUSTOMER = (f"test.cust.{RUN}@tonerscarttest.com", "Test@12345")
NEW_SUPPLIER_APPROVE = (f"test.supa.{RUN}@tonerscarttest.com", "Test@12345")
NEW_SUPPLIER_REJECT = (f"test.supr.{RUN}@tonerscarttest.com", "Test@12345")


# -------- helpers --------
def sb_login(email: str, password: str) -> str | None:
    """Login via Supabase Auth, return access_token or None."""
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


def H(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# Shared across tests
state: dict = {}


# ===== Health =====
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("service") == "TonersCart API (Supabase)"
        assert data.get("ok") is True


# ===== Signup & Auth =====
class TestSignup:
    def test_signup_customer(self):
        r = requests.post(f"{API}/auth/signup-customer", json={
            "email": NEW_CUSTOMER[0], "password": NEW_CUSTOMER[1],
            "name": "TEST Customer", "phone": "9000000001", "city": "Mumbai",
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data.get("user_id"), str)
        state["customer_user_id"] = data["user_id"]

    def test_signup_supplier_will_be_approved(self):
        r = requests.post(f"{API}/auth/signup-supplier", json={
            "email": NEW_SUPPLIER_APPROVE[0], "password": NEW_SUPPLIER_APPROVE[1],
            "business_name": "TEST BizA", "contact_person": "A Person",
            "phone": "9000000002", "city": "Mumbai",
            "gst_number": "22ABCDE1234F1Z5", "annual_turnover": "10-50L",
            "business_address": "123 Test St, Mumbai",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True and d.get("status") == "pending"
        state["sup_approve_user_id"] = d["user_id"]

    def test_signup_supplier_will_be_rejected(self):
        r = requests.post(f"{API}/auth/signup-supplier", json={
            "email": NEW_SUPPLIER_REJECT[0], "password": NEW_SUPPLIER_REJECT[1],
            "business_name": "TEST BizR", "contact_person": "R Person",
            "phone": "9000000003", "city": "Delhi",
            "gst_number": "07XYZAB1234C1Z0", "annual_turnover": "1-10L",
            "business_address": "456 Reject Rd, Delhi",
        }, timeout=30)
        assert r.status_code == 200, r.text
        state["sup_reject_user_id"] = r.json()["user_id"]

    def test_signup_duplicate_email(self):
        r = requests.post(f"{API}/auth/signup-customer", json={
            "email": NEW_CUSTOMER[0], "password": "Another@123", "name": "Dup",
        }, timeout=30)
        assert r.status_code == 400


# ===== /auth/me =====
class TestAuthMe:
    def test_admin_me(self):
        tok = sb_login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert tok, "Admin Supabase login failed"
        state["admin_token"] = tok
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("role") == "admin"

    def test_customer_me(self):
        tok = sb_login(NEW_CUSTOMER[0], NEW_CUSTOMER[1])
        assert tok, "New customer login failed"
        state["customer_token"] = tok
        d = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15).json()
        assert d.get("role") == "customer"
        assert d.get("email") == NEW_CUSTOMER[0]

    def test_supplier_pending_me(self):
        tok = sb_login(NEW_SUPPLIER_APPROVE[0], NEW_SUPPLIER_APPROVE[1])
        assert tok
        state["sup_approve_token"] = tok
        d = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15).json()
        assert d.get("role") == "supplier"
        assert d.get("supplier_status") == "pending"

    def test_existing_approved_supplier_me(self):
        tok = sb_login(*EXISTING_SUPPLIER)
        if not tok:
            pytest.skip("supplier1@test.com not available in this env")
        state["approved_sup_token"] = tok
        d = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15).json()
        assert d.get("role") == "supplier"
        assert d.get("supplier_status") == "approved"
        assert d.get("supplier") and d["supplier"].get("business_name")

    def test_no_token_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ===== Admin approval flow =====
class TestAdminApproval:
    def test_admin_pending_list(self):
        tok = state.get("admin_token") or sb_login(ADMIN_EMAIL, ADMIN_PASSWORD)
        state["admin_token"] = tok
        r = requests.get(f"{API}/admin/suppliers/pending", headers=H(tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # Find our two pending rows
        by_user = {row["user_id"]: row for row in rows}
        assert state["sup_approve_user_id"] in by_user
        assert state["sup_reject_user_id"] in by_user
        p = by_user[state["sup_approve_user_id"]]
        for k in ("business_name", "contact_person", "phone", "email", "city",
                  "gst_number", "annual_turnover", "business_address"):
            assert k in p, f"missing {k} in pending row"
        state["pending_id_approve"] = p["id"]
        state["pending_id_reject"] = by_user[state["sup_reject_user_id"]]["id"]

    def test_non_admin_forbidden_on_admin(self):
        tok = state["customer_token"]
        r = requests.get(f"{API}/admin/suppliers/pending", headers=H(tok), timeout=15)
        assert r.status_code == 403

    def test_approve_supplier(self):
        tok = state["admin_token"]
        pid = state["pending_id_approve"]
        r = requests.post(f"{API}/admin/suppliers/{pid}/approve", headers=H(tok), timeout=20)
        assert r.status_code == 200, r.text
        # Verify /auth/me now returns approved
        me = requests.get(f"{API}/auth/me", headers=H(state["sup_approve_token"]), timeout=15).json()
        assert me.get("supplier_status") == "approved"
        assert me.get("supplier") and me["supplier"].get("id")
        state["approved_supplier_row_id"] = me["supplier"]["id"]

    def test_reject_supplier(self):
        tok = state["admin_token"]
        pid = state["pending_id_reject"]
        r = requests.post(f"{API}/admin/suppliers/{pid}/reject",
                          headers=H(tok), json={"reason": "Incomplete docs"}, timeout=20)
        assert r.status_code == 200, r.text
        tok2 = sb_login(NEW_SUPPLIER_REJECT[0], NEW_SUPPLIER_REJECT[1])
        me = requests.get(f"{API}/auth/me", headers=H(tok2), timeout=15).json()
        assert me.get("supplier_status") == "rejected"
        assert "Incomplete" in (me.get("application") or {}).get("rejection_reason", "")


# ===== Supplier listings =====
class TestSupplierListings:
    def test_unapproved_supplier_cannot_list(self):
        # Create a fresh pending supplier just for this check
        email = f"test.supp.{RUN}@tonerscarttest.com"
        requests.post(f"{API}/auth/signup-supplier", json={
            "email": email, "password": "Test@12345",
            "business_name": "TEST BizP", "contact_person": "P",
            "phone": "9000000009", "city": "Pune", "gst_number": "",
            "annual_turnover": "", "business_address": "addr",
        }, timeout=30)
        tok = sb_login(email, "Test@12345")
        assert tok
        # need a toner_id
        tm = requests.get(f"{API}/toner-master?limit=1", timeout=15).json()
        assert tm, "toner_master empty"
        r = requests.post(f"{API}/supplier/listings", headers=H(tok),
                          json={"toner_id": tm[0]["id"], "price": 1000, "stock": 5,
                                "toner_type": "Original"}, timeout=20)
        assert r.status_code == 403
        assert "not approved" in r.text.lower()

    def test_approved_supplier_can_list_original(self):
        tok = state["sup_approve_token"]
        tm = requests.get(f"{API}/toner-master?q=88A", timeout=15).json()
        assert tm, "No 88A toner found"
        state["toner_id"] = tm[0]["id"]
        r = requests.post(f"{API}/supplier/listings", headers=H(tok),
                          json={"toner_id": state["toner_id"], "price": 2499.0,
                                "stock": 10, "toner_type": "Original"}, timeout=20)
        assert r.status_code == 200, r.text
        lst = r.json()
        assert lst.get("id")
        assert lst.get("toner_type") == "Original"
        assert lst.get("price") == 2499.0
        state["listing_id"] = lst["id"]
        state["listing_stock"] = lst["stock"]

    def test_refilled_rejected(self):
        tok = state["sup_approve_token"]
        r = requests.post(f"{API}/supplier/listings", headers=H(tok),
                          json={"toner_id": state["toner_id"], "price": 999,
                                "stock": 1, "toner_type": "Refilled"}, timeout=20)
        assert r.status_code == 400

    def test_supplier_role_forbidden_for_customer(self):
        tok = state["customer_token"]
        r = requests.get(f"{API}/supplier/listings", headers=H(tok), timeout=15)
        assert r.status_code == 403


# ===== Public listings =====
class TestPublicListings:
    def test_search_hp_88a(self):
        r = requests.get(f"{API}/listings/search", params={"q": "HP 88A"}, timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        row = rows[0]
        for k in ("supplier_name", "supplier_city", "toner_type"):
            assert k in row, f"{k} missing"

    def test_grouped(self):
        r = requests.get(f"{API}/listings/grouped", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            g = rows[0]
            assert "supplier_count" in g and "min_price" in g and "model_number" in g

    def test_facets(self):
        r = requests.get(f"{API}/listings/facets", timeout=20)
        assert r.status_code == 200
        f = r.json()
        assert f.get("toner_types") == ["Original", "Compatible"]
        assert isinstance(f.get("brands"), list)
        assert isinstance(f.get("cities"), list)

    def test_toner_master_search(self):
        r = requests.get(f"{API}/toner-master", params={"q": "88A"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_toner_master_brands(self):
        r = requests.get(f"{API}/toner-master/brands", timeout=15)
        assert r.status_code == 200
        brands = r.json()
        assert isinstance(brands, list)
        assert len(brands) >= 8, f"expected >=8 brands, got {len(brands)}: {brands}"


# ===== Orders =====
class TestOrders:
    def test_create_order_and_decrements_stock(self):
        tok = state["customer_token"]
        payload = {
            "listing_id": state["listing_id"], "qty": 2,
            "customer_name": "TEST Buyer", "customer_phone": "9999999999",
            "delivery_address": "Some address, Mumbai",
        }
        r = requests.post(f"{API}/orders", headers=H(tok), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o.get("status") == "requested"
        assert o.get("qty") == 2
        assert float(o.get("total")) == 2 * 2499.0
        state["order_id"] = o["id"]

        # Verify stock decremented via search (includes stock?) — use supplier listings
        sup_tok = state["sup_approve_token"]
        lst = requests.get(f"{API}/supplier/listings", headers=H(sup_tok), timeout=15).json()
        match = [x for x in lst if x["id"] == state["listing_id"]]
        assert match and match[0]["stock"] == state["listing_stock"] - 2

    def test_orders_mine_customer(self):
        tok = state["customer_token"]
        rows = requests.get(f"{API}/orders/mine", headers=H(tok), timeout=15).json()
        assert isinstance(rows, list) and any(o["id"] == state["order_id"] for o in rows)
        o = next(o for o in rows if o["id"] == state["order_id"])
        # Joined listing + supplier fields
        assert o.get("listings") and o["listings"].get("model_number")
        assert o.get("suppliers") and o["suppliers"].get("business_name")

    def test_supplier_accepts_with_tracking(self):
        tok = state["sup_approve_token"]
        r = requests.put(f"{API}/orders/{state['order_id']}/status",
                         headers=H(tok),
                         json={"status": "accepted", "tracking_number": "TRK12345"},
                         timeout=15)
        assert r.status_code == 200, r.text

    def test_supplier_ships(self):
        tok = state["sup_approve_token"]
        r = requests.put(f"{API}/orders/{state['order_id']}/status",
                         headers=H(tok), json={"status": "shipped"}, timeout=15)
        assert r.status_code == 200

    def test_customer_cannot_change_to_delivered(self):
        tok = state["customer_token"]
        r = requests.put(f"{API}/orders/{state['order_id']}/status",
                         headers=H(tok), json={"status": "delivered"}, timeout=15)
        assert r.status_code == 403

    def test_supplier_delivers(self):
        tok = state["sup_approve_token"]
        r = requests.put(f"{API}/orders/{state['order_id']}/status",
                         headers=H(tok), json={"status": "delivered"}, timeout=15)
        assert r.status_code == 200

    def test_customer_cancel_own_order(self):
        # Place a small new order to cancel
        tok = state["customer_token"]
        p = {"listing_id": state["listing_id"], "qty": 1,
             "customer_name": "TEST Cancel", "customer_phone": "9999999998",
             "delivery_address": "addr"}
        r = requests.post(f"{API}/orders", headers=H(tok), json=p, timeout=20)
        assert r.status_code == 200
        oid = r.json()["id"]
        r2 = requests.put(f"{API}/orders/{oid}/status", headers=H(tok),
                          json={"status": "cancelled"}, timeout=15)
        assert r2.status_code == 200

    def test_supplier_orders_mine(self):
        tok = state["sup_approve_token"]
        rows = requests.get(f"{API}/orders/mine", headers=H(tok), timeout=15).json()
        assert any(o["id"] == state["order_id"] for o in rows)


# ===== Admin stats =====
class TestAdminStats:
    def test_stats(self):
        tok = state["admin_token"]
        r = requests.get(f"{API}/admin/stats", headers=H(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("toner_master", "suppliers_pending", "suppliers_approved",
                  "listings", "orders"):
            assert k in d and isinstance(d[k], int)
        assert d["toner_master"] >= 152 - 5  # ~152 seeded


# ===== Chat =====
class TestChat:
    def test_chat_llm(self):
        r = requests.post(f"{API}/chat", json={
            "messages": [{"role": "user",
                           "content": "Suggest a toner for HP LaserJet P1007"}]
        }, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("reply"), str) and len(d["reply"]) > 5
        assert d.get("session_id")

    def test_chat_empty_messages(self):
        r = requests.post(f"{API}/chat", json={"messages": []}, timeout=15)
        assert r.status_code == 400


# ===== Auth enforcement =====
class TestAuthEnforcement:
    def test_admin_requires_admin(self):
        # no token
        assert requests.get(f"{API}/admin/stats", timeout=15).status_code == 401
        # customer token
        r = requests.get(f"{API}/admin/stats", headers=H(state["customer_token"]), timeout=15)
        assert r.status_code == 403
        # supplier token
        r = requests.get(f"{API}/admin/stats",
                         headers=H(state["sup_approve_token"]), timeout=15)
        assert r.status_code == 403

    def test_supplier_requires_supplier(self):
        assert requests.get(f"{API}/supplier/listings", timeout=15).status_code == 401
        r = requests.get(f"{API}/supplier/listings",
                         headers=H(state["customer_token"]), timeout=15)
        assert r.status_code == 403
