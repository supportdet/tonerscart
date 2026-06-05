"""Wave 19 backend tests:
- Consumables CRUD (supplier)
- Consumables bulk upload
- Public consumable listing/detail/subcategories
- Universal search (5 keys + counts)
- Buyer segmentation (user_type)
- Direct consumable order flow + insufficient stock
- /api/admin/user-segments
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

API = f"{BASE_URL}/api"
SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

SUPPLIER_EMAIL = "TEST.w16.sup.1780576350@tonerscarttest.com"
SUPPLIER_PWD = "Test@12345"
ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PWD = "Admin@123"


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


def sb_signup(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code in (200, 201):
        return r.json().get("access_token")
    return None


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _bootstrap_supplier():
    tok = sb_login(SUPPLIER_EMAIL, SUPPLIER_PWD)
    if tok:
        r = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=15)
        if r.status_code == 200 and r.json().get("role") == "supplier":
            return tok
    # else create a fresh supplier
    admin_tok = sb_login(ADMIN_EMAIL, ADMIN_PWD)
    if not admin_tok:
        return None
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST.w19.sup.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    sup_payload = {
        "email": email, "password": pwd,
        "business_name": f"TEST_W19_Sup_{suffix}",
        "contact_person": "Test W19 Sup",
        "phone": "9000000099", "city": "Bangalore", "state": "Karnataka", "pincode": "560001",
        "cities_served": ["Bangalore"], "gst_number": "29AAAAA0000A1Z5", "pan_number": "AAAAA0000A",
        "annual_turnover": "1-5cr", "years_in_business": 3, "business_address": "TEST W19",
        "seller_types": ["toner", "printer", "paper"], "compatible_brands": ["HP", "Brother"],
        "testing_before_delivery": True,
    }
    r = requests.post(f"{API}/auth/signup-supplier", json=sup_payload, timeout=40)
    if r.status_code != 200:
        return None
    uid = r.json().get("user_id")
    pend = requests.get(f"{API}/admin/suppliers/pending", headers=_auth(admin_tok), timeout=30)
    pid = None
    if pend.status_code == 200:
        for row in pend.json() or []:
            if row.get("user_id") == uid:
                pid = row.get("id"); break
    if not pid:
        return None
    ap = requests.post(f"{API}/admin/suppliers/{pid}/approve", headers=_auth(admin_tok), timeout=30)
    if ap.status_code not in (200, 201):
        return None
    return sb_login(email, pwd)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def supplier_token():
    tok = _bootstrap_supplier()
    if not tok:
        pytest.skip("could not obtain approved-supplier token")
    return tok


@pytest.fixture(scope="module")
def sup_headers(supplier_token):
    return _auth(supplier_token)


@pytest.fixture(scope="module")
def admin_headers():
    tok = sb_login(ADMIN_EMAIL, ADMIN_PWD)
    if not tok:
        pytest.skip("admin login failed")
    return _auth(tok)


@pytest.fixture(scope="module")
def buyer_token():
    """Brand-new buyer account via /api/auth/signup-customer."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test.w19.buyer.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    r = requests.post(f"{API}/auth/signup-customer", json={
        "email": email, "password": pwd, "name": "TEST W19 Buyer",
        "phone": "9000099999", "city": "Bangalore",
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"customer signup failed: {r.status_code} {r.text[:200]}")
    tok = sb_login(email, pwd)
    if not tok:
        pytest.skip("could not login as new buyer")
    # touch /auth/me so backend ensures row in users table
    me = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=15)
    assert me.status_code == 200, me.text
    return tok


@pytest.fixture(scope="module")
def buyer_headers(buyer_token):
    return _auth(buyer_token)


# Module-scoped: created once, reused across tests, cleaned at end
@pytest.fixture(scope="module")
def seeded_consumable(sup_headers):
    payload = {
        "subcategory": "Drums",
        "brand": "Brother",
        "model_number": f"DR-2305-TEST-{uuid.uuid4().hex[:6]}",
        "condition": "New",
        "price": 3499.0,
        "stock": 10,
        "city": "Bangalore",
        "gst_rate": 18,
        "description": "TEST W19 drum",
    }
    r = requests.post(f"{API}/supplier/consumables", json=payload, headers=sup_headers, timeout=30)
    assert r.status_code == 200, f"create consumable failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    yield data
    # cleanup
    try:
        requests.delete(f"{API}/supplier/consumables/{data['id']}", headers=sup_headers, timeout=15)
    except Exception:
        pass


# =========================================================================
# Consumables CRUD
# =========================================================================
class TestConsumablesCRUD:
    def test_create_consumable(self, seeded_consumable):
        d = seeded_consumable
        assert d["brand"] == "Brother"
        assert d["subcategory"] == "Drums"
        assert d["stock"] == 10
        assert float(d["price"]) == 3499.0

    def test_list_mine_includes_created(self, sup_headers, seeded_consumable):
        r = requests.get(f"{API}/supplier/consumables/mine", headers=sup_headers, timeout=15)
        assert r.status_code == 200, r.text
        ids = [x["id"] for x in r.json()]
        assert seeded_consumable["id"] in ids

    def test_update_consumable(self, sup_headers, seeded_consumable):
        cid = seeded_consumable["id"]
        r = requests.put(
            f"{API}/supplier/consumables/{cid}",
            headers=sup_headers,
            json={"price": 3299.0, "stock": 8},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify via GET public
        g = requests.get(f"{API}/consumables/{cid}/public", timeout=15)
        assert g.status_code == 200, g.text
        gd = g.json()
        assert float(gd["price"]) == 3299.0
        assert gd["stock"] == 8

    def test_public_list(self, seeded_consumable):
        r = requests.get(f"{API}/consumables", timeout=15)
        assert r.status_code == 200, r.text
        ids = [x["id"] for x in r.json()]
        assert seeded_consumable["id"] in ids

    def test_public_filter_subcategory(self, seeded_consumable):
        r = requests.get(f"{API}/consumables?subcategory=Drums", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(x["id"] == seeded_consumable["id"] for x in rows)
        for x in rows:
            assert x.get("subcategory") == "Drums"

    def test_public_filter_brand(self, seeded_consumable):
        r = requests.get(f"{API}/consumables?brand=Brother", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(x["id"] == seeded_consumable["id"] for x in rows)

    def test_subcategories_counts(self, seeded_consumable):
        r = requests.get(f"{API}/consumables/subcategories", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Server returns: {"counts": {"Drums": N, ...}, "total": N}
        if isinstance(data, dict) and "counts" in data:
            assert int(data["counts"].get("Drums", 0)) >= 1, data
            assert int(data.get("total", 0)) >= 1
        elif isinstance(data, dict):
            assert int(data.get("Drums", 0)) >= 1
        else:
            found = any(row.get("subcategory") == "Drums" and int(row.get("count", 0)) >= 1
                        for row in data)
            assert found, f"Drums missing in subcategories: {data}"


# =========================================================================
# Bulk upload
# =========================================================================
class TestConsumablesBulk:
    def test_bulk_mixed(self, sup_headers):
        suffix = uuid.uuid4().hex[:5]
        valid = {
            "subcategory": "Ink Cartridges",
            "brand": "HP",
            "model_number": f"TEST_W19_INK_{suffix}_OK",
            "price": 999.0,
            "stock": 3,
            "city": "Bangalore",
        }
        invalid = {
            "subcategory": "Ink Cartridges",
            "brand": "HP",
            # missing model_number, missing price, missing stock
        }
        payload = [valid, invalid]
        r = requests.post(f"{API}/supplier/consumables/bulk", json=payload, headers=sup_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("created", "errors", "total", "succeeded", "failed"):
            assert k in data, f"missing key {k}: {data}"
        assert data["total"] == 2
        assert data["succeeded"] == 1, data
        assert data["failed"] == 1, data
        assert data["errors"][0].get("row") == 1
        # cleanup the created row
        for c in data.get("created") or []:
            try:
                requests.delete(f"{API}/supplier/consumables/{c['id']}", headers=sup_headers, timeout=10)
            except Exception:
                pass


# =========================================================================
# Universal search
# =========================================================================
class TestUniversalSearch:
    def test_keys_present(self):
        r = requests.get(f"{API}/search/universal?q=test", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("toners", "printers", "papers", "consumables", "oem"):
            assert k in data, f"missing key {k}"
        assert "counts" in data
        for k in ("toners", "printers", "papers", "consumables", "oem"):
            assert k in data["counts"], f"missing counts.{k}"

    def test_finds_consumable_by_brand(self, seeded_consumable):
        # allow indexer/replication settle
        time.sleep(0.5)
        r = requests.get(f"{API}/search/universal?q=Brother", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        ids = [x.get("id") for x in data.get("consumables") or []]
        assert seeded_consumable["id"] in ids, f"consumable not in search: {data.get('consumables')}"

    def test_finds_consumable_by_model(self, seeded_consumable):
        mn = seeded_consumable["model_number"]
        r = requests.get(f"{API}/search/universal?q={mn}", timeout=20)
        assert r.status_code == 200, r.text
        ids = [x.get("id") for x in r.json().get("consumables") or []]
        assert seeded_consumable["id"] in ids


# =========================================================================
# Buyer segmentation
# =========================================================================
class TestBuyerSegmentation:
    def test_set_user_type_personal(self, buyer_headers):
        r = requests.post(f"{API}/auth/user-type", json={"user_type": "personal"}, headers=buyer_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("user_type") == "personal"
        # verify /auth/me
        me = requests.get(f"{API}/auth/me", headers=buyer_headers, timeout=15)
        assert me.status_code == 200, me.text
        assert me.json().get("user_type") == "personal"

    def test_set_user_type_invalid(self, buyer_headers):
        r = requests.post(f"{API}/auth/user-type", json={"user_type": "bogus"}, headers=buyer_headers, timeout=15)
        assert r.status_code == 400

    def test_set_user_type_corporate_idempotent(self, buyer_headers):
        r = requests.post(f"{API}/auth/user-type", json={"user_type": "corporate"}, headers=buyer_headers, timeout=15)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=buyer_headers, timeout=15).json()
        assert me.get("user_type") == "corporate"

    def test_admin_user_segments(self, admin_headers):
        r = requests.get(f"{API}/admin/user-segments", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept either a dict of counts or a list breakdown
        assert isinstance(data, (dict, list)), data


# =========================================================================
# Direct consumable order flow
# =========================================================================
class TestConsumableOrderFlow:
    def test_place_consumable_order(self, buyer_headers, seeded_consumable, sup_headers):
        cid = seeded_consumable["id"]
        # ensure stock is set to a known starting value first
        requests.put(
            f"{API}/supplier/consumables/{cid}",
            headers=sup_headers, json={"stock": 8}, timeout=15,
        )
        # Make buyer 'personal' so user_type is set (if required for downstream)
        try:
            requests.post(f"{API}/auth/user-type", json={"user_type": "personal"}, headers=buyer_headers, timeout=15)
        except Exception:
            pass
        order_payload = {
            "listing_id": cid,
            "listing_kind": "consumable",
            "qty": 2,
            "customer_name": "TEST W19 Buyer",
            "customer_phone": "9000099999",
            "delivery_address": "TEST_W19 Lane, Bangalore",
            "street_address": "TEST_W19 Lane",
            "area": "MG Road",
            "order_city": "Bangalore",
            "order_state": "Karnataka",
            "pincode": "560001",
        }
        r = requests.post(f"{API}/orders", json=order_payload, headers=buyer_headers, timeout=30)
        assert r.status_code == 200, f"order failed: {r.status_code} {r.text}"
        order = r.json()
        assert order.get("id"), order
        # Verify consumable stock decremented
        g = requests.get(f"{API}/consumables/{cid}/public", timeout=15)
        assert g.status_code == 200
        assert g.json().get("stock") == 6, g.json()
        # GET /api/orders/mine should include this order with brand/model synthesised
        m = requests.get(f"{API}/orders/mine", headers=buyer_headers, timeout=20)
        assert m.status_code == 200, m.text
        rows = m.json()
        match = next((x for x in rows if x.get("id") == order["id"]), None)
        assert match is not None, "order missing from /orders/mine"
        # listings synthesised: expect product_brand/product_model OR listings dict
        brand = (match.get("product_brand") or
                 (match.get("listings") or {}).get("brand"))
        model = (match.get("product_model") or
                 (match.get("listings") or {}).get("model_number"))
        assert brand == "Brother", f"brand missing/wrong: {match}"
        assert model and seeded_consumable["model_number"] in model, f"model: {match}"

    def test_insufficient_stock(self, buyer_headers, seeded_consumable, sup_headers):
        cid = seeded_consumable["id"]
        # set stock to 1
        requests.put(f"{API}/supplier/consumables/{cid}",
                     headers=sup_headers, json={"stock": 1}, timeout=15)
        order_payload = {
            "listing_id": cid, "listing_kind": "consumable", "qty": 5,
            "customer_name": "TEST W19", "customer_phone": "9000099999",
            "delivery_address": "TEST_W19", "street_address": "TEST_W19",
            "area": "MG", "order_city": "Bangalore",
            "order_state": "Karnataka", "pincode": "560001",
        }
        r = requests.post(f"{API}/orders", json=order_payload, headers=buyer_headers, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


# =========================================================================
# Auth guards
# =========================================================================
class TestAuthGuards:
    def test_create_consumable_anonymous_blocked(self):
        r = requests.post(f"{API}/supplier/consumables", json={
            "subcategory": "Drums", "brand": "X", "model_number": "Y",
            "price": 1.0, "stock": 1,
        }, timeout=15)
        assert r.status_code in (401, 403)

    def test_create_consumable_buyer_blocked(self, buyer_headers):
        r = requests.post(f"{API}/supplier/consumables", json={
            "subcategory": "Drums", "brand": "X", "model_number": "Y",
            "price": 1.0, "stock": 1,
        }, headers=buyer_headers, timeout=15)
        assert r.status_code in (401, 403)
