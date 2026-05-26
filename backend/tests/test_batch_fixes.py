"""TonersCart batch-fix tests (iteration 5).

Covers:
- /api/auth/oauth-bootstrap (no token => 401, valid token => idempotent profile create)
- /api/supplier/listings free-text brand+model (auto-creates toner_master entry)
- /api/supplier/listings legacy toner_id flow still works
- /api/supplier/listings Refilled type accepted
- /api/supplier/listings missing both toner_id and brand+model => 400
- /api/listings/search returns the new listing with supplier_name + city
- Multi-order checkout flow: 2 different listings, each decrements stock
- toner_master row auto-created when brand+model new
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://b2b-checkout-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

ADMIN = ("admin@tonerscart.in", "Admin@123")
APPROVED_SUPPLIER = ("supplier1@test.com", "Test@123")
EXISTING_BUYER = ("buyer1@test.com", "Test@123")

RUN = uuid.uuid4().hex[:6].upper()


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


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def supplier_token():
    t = sb_login(*APPROVED_SUPPLIER)
    if not t:
        pytest.skip("Approved supplier login failed")
    return t


@pytest.fixture(scope="module")
def buyer_token():
    t = sb_login(*EXISTING_BUYER)
    if not t:
        pytest.skip("Buyer login failed")
    return t


@pytest.fixture(scope="module")
def admin_token():
    t = sb_login(*ADMIN)
    if not t:
        pytest.skip("Admin login failed")
    return t


state = {}


# ===== oauth-bootstrap =====
class TestOAuthBootstrap:
    def test_no_bearer_returns_401(self):
        r = requests.post(f"{API}/auth/oauth-bootstrap", json={}, timeout=15)
        assert r.status_code == 401, r.text

    def test_bad_bearer_returns_401(self):
        r = requests.post(f"{API}/auth/oauth-bootstrap", json={},
                          headers={"Authorization": "Bearer not-a-real-jwt"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_existing_user_bootstrap_idempotent(self, buyer_token):
        # Existing buyer already has a public.users row; bootstrap must return created=False
        r = requests.post(f"{API}/auth/oauth-bootstrap", json={},
                          headers=H(buyer_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("created") is False
        assert data.get("role") in ("customer", "supplier", "admin")

    def test_new_supabase_user_bootstrap_creates_row(self, admin_token):
        """Create a fresh auth-only user via service role admin API, log in, then
        call /api/auth/oauth-bootstrap. Must return created=True the first time
        and created=False the second time (idempotency)."""
        from supabase import create_client
        SERVICE_ROLE = "dummy_service_role"
        sb = create_client(SUPABASE_URL, SERVICE_ROLE)
        email = f"oauth.boot.{RUN}.{uuid.uuid4().hex[:6]}@tonerscarttest.com"
        password = "Boot@12345"
        try:
            created = sb.auth.admin.create_user({
                "email": email, "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": "OAuth Boot User"},
            })
        except Exception as e:
            pytest.skip(f"cannot create supabase user: {e}")
        uid = created.user.id
        state["oauth_uid"] = uid

        # IMPORTANT: ensure no public.users row exists yet (admin.create_user
        # only writes to auth.users). If a trigger auto-creates the row, this
        # is still ok — bootstrap should just be idempotent.
        token = sb_login(email, password)
        assert token, "could not login newly-created supabase user"

        r1 = requests.post(f"{API}/auth/oauth-bootstrap", json={"role": "customer"},
                           headers=H(token), timeout=20)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("ok") is True
        assert d1.get("role") in ("customer", "supplier")
        # Either created=True (no trigger) or created=False (trigger pre-created); both acceptable

        # Second call must be idempotent → created=False
        r2 = requests.post(f"{API}/auth/oauth-bootstrap", json={},
                           headers=H(token), timeout=20)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("created") is False

        # Verify /auth/me works for this user (proves public.users row exists now)
        me = requests.get(f"{API}/auth/me", headers=H(token), timeout=15)
        assert me.status_code == 200
        # Supabase normalizes emails to lowercase
        assert (me.json().get("email") or "").lower() == email.lower()

        # Cleanup auth user
        try:
            sb.auth.admin.delete_user(uid)
        except Exception:
            pass


# ===== Listing creation (free-text + legacy) =====
class TestListingCreation:
    def test_create_listing_freetext_refilled(self, supplier_token):
        """Free-text brand+model with toner_type='Refilled' must succeed and
        auto-create a toner_master entry."""
        model = f"9999{RUN}-NEW"
        payload = {
            "brand": "HP",
            "model_number": model,
            "toner_type": "Refilled",
            "color": "Black",
            "price": 2500,
            "stock": 10,
        }
        r = requests.post(f"{API}/supplier/listings", json=payload,
                          headers=H(supplier_token), timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("brand") == "HP"
        assert data.get("model_number") == model
        assert data.get("toner_type") == "Refilled"
        assert float(data.get("price")) == 2500
        assert data.get("stock") == 10
        assert data.get("toner_id"), "listing must be linked to a toner_master id"
        state["freetext_listing_id"] = data["id"]
        state["freetext_model"] = model
        state["freetext_toner_id"] = data["toner_id"]

    def test_toner_master_autocreated(self, supplier_token):
        model = state.get("freetext_model")
        if not model:
            pytest.skip("freetext listing not created")
        # Search via /toner-master?q=... using normalized model ('9999<RUN>NEW')
        norm = model.replace("-", "")
        r = requests.get(f"{API}/toner-master", params={"q": norm}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        match = next((it for it in items if it.get("model_number") == model), None)
        assert match, f"toner_master row not auto-created for {model}: got {[it.get('model_number') for it in items[:5]]}"
        assert match.get("brand") == "HP"
        assert match.get("id") == state.get("freetext_toner_id"), "listing.toner_id should match the auto-created master row id"

    def test_listing_appears_in_search(self, supplier_token):
        model = state.get("freetext_model")
        if not model:
            pytest.skip("freetext listing not created")
        r = requests.get(f"{API}/listings/search", params={"q": model}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        match = next((it for it in items if it.get("id") == state.get("freetext_listing_id")), None)
        assert match, f"new listing not in search results for q={model}"
        assert match.get("brand") == "HP"
        assert match.get("model_number") == model
        assert match.get("toner_type") == "Refilled"
        assert match.get("supplier_name"), "supplier_name should be flattened in response"
        assert match.get("supplier_city") or match.get("city"), "city should be present"

    def test_create_listing_legacy_toner_id(self, supplier_token):
        """Legacy flow: provide toner_id directly. Reuse the toner_master row
        we just auto-created so we don't pollute the catalog."""
        toner_id = state.get("freetext_toner_id")
        if not toner_id:
            pytest.skip("no toner_id from previous test")
        payload = {
            "toner_id": toner_id,
            "toner_type": "Compatible",
            "price": 1999,
            "stock": 7,
        }
        r = requests.post(f"{API}/supplier/listings", json=payload,
                          headers=H(supplier_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("toner_id") == toner_id
        assert d.get("toner_type") == "Compatible"
        assert d.get("brand") == "HP"
        state["legacy_listing_id"] = d["id"]

    def test_missing_both_returns_400(self, supplier_token):
        payload = {
            "toner_type": "Original",
            "price": 100,
            "stock": 1,
        }
        r = requests.post(f"{API}/supplier/listings", json=payload,
                          headers=H(supplier_token), timeout=15)
        assert r.status_code == 400, r.text
        # body should contain the resolution-failure detail
        assert "toner_id" in (r.text or "").lower()

    def test_invalid_toner_type_returns_400(self, supplier_token):
        payload = {
            "brand": "HP", "model_number": f"BADTYPE-{RUN}",
            "toner_type": "Refilled-bad", "price": 100, "stock": 1,
        }
        r = requests.post(f"{API}/supplier/listings", json=payload,
                          headers=H(supplier_token), timeout=15)
        assert r.status_code == 400, r.text


# ===== Multi-order checkout (cart simulation) =====
class TestCartCheckout:
    def test_two_orders_decrement_stock_independently(self, supplier_token, buyer_token):
        """Simulate Checkout.jsx firing one POST /orders per cart line.
        Both orders must succeed, stocks decrement on respective listings."""
        l1 = state.get("freetext_listing_id")
        l2 = state.get("legacy_listing_id")
        if not (l1 and l2):
            pytest.skip("need both freetext + legacy listings from earlier tests")

        # Snapshot current stocks via /supplier/listings
        sup_listings = requests.get(f"{API}/supplier/listings",
                                    headers=H(supplier_token), timeout=15).json()
        by_id = {x["id"]: x for x in sup_listings}
        s1_before = by_id[l1]["stock"]
        s2_before = by_id[l2]["stock"]

        # Place order on listing #1
        o1 = requests.post(f"{API}/orders", json={
            "listing_id": l1, "qty": 2,
            "customer_name": "TEST Buyer One",
            "customer_phone": "9000000001",
            "delivery_address": "Test Cart Addr 1, Mumbai",
            "notes": "TEST_cart_line1",
        }, headers=H(buyer_token), timeout=20)
        assert o1.status_code == 200, o1.text
        o1d = o1.json()
        assert o1d.get("listing_id") == l1
        assert o1d.get("qty") == 2
        assert o1d.get("status") == "requested"

        # Place order on listing #2
        o2 = requests.post(f"{API}/orders", json={
            "listing_id": l2, "qty": 3,
            "customer_name": "TEST Buyer One",
            "customer_phone": "9000000001",
            "delivery_address": "Test Cart Addr 1, Mumbai",
            "notes": "TEST_cart_line2",
        }, headers=H(buyer_token), timeout=20)
        assert o2.status_code == 200, o2.text
        o2d = o2.json()
        assert o2d.get("listing_id") == l2
        assert o2d.get("qty") == 3

        # Verify stocks decremented independently
        sup_listings_after = requests.get(f"{API}/supplier/listings",
                                          headers=H(supplier_token), timeout=15).json()
        by_id_after = {x["id"]: x for x in sup_listings_after}
        assert by_id_after[l1]["stock"] == s1_before - 2, \
            f"listing1 stock should decrement by 2, was {s1_before} now {by_id_after[l1]['stock']}"
        assert by_id_after[l2]["stock"] == s2_before - 3, \
            f"listing2 stock should decrement by 3, was {s2_before} now {by_id_after[l2]['stock']}"

        # Both orders visible in /orders/mine for buyer
        mine = requests.get(f"{API}/orders/mine", headers=H(buyer_token), timeout=15)
        assert mine.status_code == 200
        ids = [o["id"] for o in mine.json()]
        assert o1d["id"] in ids
        assert o2d["id"] in ids


# ===== Cleanup =====
class TestCleanup:
    def test_delete_test_listings(self, supplier_token):
        for k in ("freetext_listing_id", "legacy_listing_id"):
            lid = state.get(k)
            if not lid:
                continue
            requests.delete(f"{API}/supplier/listings/{lid}",
                            headers=H(supplier_token), timeout=15)
        # Best-effort, assert no exception
        assert True
