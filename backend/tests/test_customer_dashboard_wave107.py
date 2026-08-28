"""
Wave 107 — Customer dashboard bug fix + redesign backend regression.

Verifies /orders/mine returns the raw DB shape (total, gst_amount,
delivery_charge separately) so the frontend paidTotal helper can compute
total+gst+delivery. Also seeds a test buyer + mock order to exercise the
endpoint end-to-end, then cleans up.
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://printer-supply-hub.preview.emergentagent.com"
SB_URL = os.environ["SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]

from supabase import create_client
sb = create_client(SB_URL, SB_KEY)


# ---------------- fixtures ---------------------------------------------------
@pytest.fixture(scope="module")
def buyer():
    email = f"TEST_wave107_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass@123"
    r = requests.post(f"{BASE_URL}/api/auth/signup-customer", json={
        "email": email, "password": password, "name": "Wave107 Buyer", "phone": "9999999999", "city": "Bangalore"
    })
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    uid = r.json()["user_id"]
    # login
    lr = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert lr.status_code == 200, f"login failed: {lr.text}"
    token = lr.json()["access_token"]
    yield {"id": uid, "email": email, "token": token}
    # cleanup: delete orders + user
    try:
        sb.table("orders").delete().eq("customer_id", uid).execute()
        sb.table("users").delete().eq("id", uid).execute()
        sb.auth.admin.delete_user(uid)
    except Exception as e:
        print(f"cleanup warn: {e}")


@pytest.fixture(scope="module")
def seed_order(buyer):
    """Insert a mock paid order directly (bypass Razorpay). Mirrors the real bug order."""
    # need a real listing + supplier to reference
    lst = sb.table("listings").select("id,supplier_id").limit(1).execute().data
    assert lst, "no listings in DB — cannot seed"
    listing = lst[0]
    order_id = str(uuid.uuid4())
    row = {
        "id": order_id,
        "customer_id": buyer["id"],
        "supplier_id": listing["supplier_id"],
        "listing_id": listing["id"],
        "qty": 1,
        "unit_price": 296.0,
        "total": 296.0,
        "gst_amount": 53.0,
        "gst_rate": 18,
        "delivery_charge": 0.0,
        "status": "accepted",
        "customer_name": "Wave107 Buyer",
        "customer_phone": "9999999999",
        "delivery_address": "Test Street 42, HSR Layout, Bangalore, 560102, Karnataka",
        "street_address": "Test Street 42",
        "area": "HSR Layout",
        "order_city": "Bangalore",
        "pincode": "560102",
        "order_state": "Karnataka",
        "order_number": f"TC-TEST-{uuid.uuid4().hex[:6].upper()}",
    }
    sb.table("orders").insert(row).execute()
    yield order_id
    try:
        sb.table("orders").delete().eq("id", order_id).execute()
    except Exception:
        pass


# ---------------- tests ------------------------------------------------------
def test_orders_mine_shape_and_values(buyer, seed_order):
    """REGRESSION: /orders/mine returns list with total/gst_amount/delivery_charge fields."""
    r = requests.get(f"{BASE_URL}/api/orders/mine", headers={"Authorization": f"Bearer {buyer['token']}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    row = next((o for o in data if o["id"] == seed_order), None)
    assert row is not None, "seeded order missing from /orders/mine"

    # required fields present
    for k in ("id", "total", "gst_amount", "delivery_charge", "status", "created_at",
              "street_address", "area", "order_city", "pincode", "order_state",
              "courier_name", "tracking_number", "buyer_gst_number", "listings", "suppliers"):
        assert k in row, f"missing field: {k}"

    # values match seed — frontend's paidTotal formula = 296 + 53 + 0 = 349
    assert row["total"] == 296.0
    assert row["gst_amount"] == 53.0
    assert row["delivery_charge"] == 0.0
    computed_paid = round(row["total"] + row["gst_amount"] + row["delivery_charge"], 2)
    assert computed_paid == 349.0, f"paidTotal formula mismatch: {computed_paid}"

    # suppliers nested has business_name + city
    assert isinstance(row["suppliers"], dict)
    assert "business_name" in row["suppliers"]


def test_orders_mine_empty_for_new_buyer():
    """REGRESSION: brand-new buyer sees empty list (200 + [])."""
    email = f"TEST_wave107_empty_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/signup-customer", json={
        "email": email, "password": "TestPass@123", "name": "Empty", "city": "Bangalore"
    })
    assert r.status_code == 200
    uid = r.json()["user_id"]
    try:
        lr = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "TestPass@123"})
        token = lr.json()["access_token"]
        mr = requests.get(f"{BASE_URL}/api/orders/mine", headers={"Authorization": f"Bearer {token}"})
        assert mr.status_code == 200
        assert mr.json() == []
    finally:
        sb.table("users").delete().eq("id", uid).execute()
        sb.auth.admin.delete_user(uid)


def test_orders_status_update_endpoint_exists(buyer, seed_order):
    """REGRESSION: PUT /orders/{id}/status accepts status=completed. Requires delivered first
    per typical flow; we validate endpoint reachability + response shape."""
    # Force to delivered first (admin move), then customer completes
    sb.table("orders").update({"status": "delivered"}).eq("id", seed_order).execute()
    r = requests.put(f"{BASE_URL}/api/orders/{seed_order}/status",
                     headers={"Authorization": f"Bearer {buyer['token']}"},
                     json={"status": "completed"})
    assert r.status_code in (200, 204), f"got {r.status_code}: {r.text}"


def test_real_bug_order_still_has_correct_math():
    """The exact real order the customer complained about."""
    r = sb.table("orders").select("total,gst_amount,delivery_charge").eq(
        "id", "7356ed6a-5819-471c-95ea-a5b08edf5cf6").maybe_single().execute()
    assert r.data
    paid = r.data["total"] + r.data["gst_amount"] + r.data["delivery_charge"]
    assert round(paid, 2) == 349.0, f"real order math wrong: {paid}"
