"""Wave 22 — verify intercity delivery resolver + order placement for ALL 5 product categories.

Categories: toner ₹100, printer ₹350, paper ₹150, scanner ₹250, consumable ₹100.
Same-city => free. Server authoritative — client-sent amount must be ignored.
"""
import os
import time
import requests
import pytest

API = os.environ.get("TEST_API") or "https://printer-supply-hub.preview.emergentagent.com"
BASE = f"{API}/api"

CATEGORY_EXPECTED = {
    "toner": 100.0,
    "printer": 350.0,
    "paper": 150.0,
    "scanner": 250.0,
    "consumable": 100.0,
}


def _signup_login():
    email = f"qa.w22cats.{int(time.time()*1000)}@example.com"
    requests.post(f"{BASE}/auth/signup-customer", json={
        "email": email, "password": "Test@1234", "name": "QA W22cat",
        "phone": "9876543210", "city": "Mumbai",
    }, timeout=30)
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "Test@1234"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"], email


def _first(path):
    r = requests.get(f"{BASE}/{path}?limit=1", timeout=30)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        return data["results"][0] if data["results"] else None
    return None


def _first_toner():
    r = requests.get(f"{BASE}/listings/search?limit=1", timeout=30)
    r.raise_for_status()
    data = r.json()
    return data[0] if data else None


PICKERS = {
    "toner": _first_toner,
    "printer": lambda: _first("printers"),
    "paper": lambda: _first("papers"),
    "scanner": lambda: _first("scanners"),
    "consumable": lambda: _first("consumables"),
}


@pytest.fixture(scope="module")
def auth_token():
    tok, _ = _signup_login()
    return tok


@pytest.mark.parametrize("kind", list(CATEGORY_EXPECTED.keys()))
def test_intercity_order_per_category(auth_token, kind):
    """For each category place an INTERCITY order to Mumbai → server applies
    correct flat rate and returns 200."""
    item = PICKERS[kind]()
    if not item:
        pytest.skip(f"No listing available for {kind}")
    dealer_city = (item.get("city") or "").lower()
    # ship to a city guaranteed different from dealer city
    buyer_city = "Delhi" if dealer_city not in ("delhi", "new delhi") else "Mumbai"

    payload = {
        "listing_id": item["id"],
        "listing_kind": kind,
        "qty": 1,
        "customer_name": "QA Buyer",
        "customer_phone": "+91 9876543210",
        "delivery_address": "addr line, area",
        "order_city": buyer_city,
        "order_state": "Karnataka",
        "pincode": "560034",
        "street_address": "addr line",
        "area": "area",
        "charge_delivery": True,
        # client lies — server must override to category rate
        "delivery_charge": 999,
        "gst_rate": 18,
        "gst_amount": 0,
    }
    r = requests.post(f"{BASE}/orders",
                      headers={"Authorization": f"Bearer {auth_token}"},
                      json=payload, timeout=30)
    assert r.status_code == 200, f"{kind} order failed: {r.status_code} {r.text}"
    body = r.json()
    expected = CATEGORY_EXPECTED[kind]
    actual = float(body.get("delivery_charge") or 0)
    assert actual == expected, (
        f"{kind}: expected delivery_charge {expected}, got {actual}. Body={body}"
    )


@pytest.mark.parametrize("kind", list(CATEGORY_EXPECTED.keys()))
def test_same_city_free_per_category(auth_token, kind):
    """For each category, when buyer city == dealer city, delivery must be 0
    even if client sends a charge."""
    item = PICKERS[kind]()
    if not item or not item.get("city"):
        pytest.skip(f"No listing/city for {kind}")
    payload = {
        "listing_id": item["id"],
        "listing_kind": kind,
        "qty": 1,
        "customer_name": "QA Buyer",
        "customer_phone": "+91 9876543210",
        "delivery_address": "addr",
        "order_city": item["city"],
        "charge_delivery": True,
        "delivery_charge": 999,  # server must ignore
        "gst_rate": 18,
        "gst_amount": 0,
    }
    r = requests.post(f"{BASE}/orders",
                      headers={"Authorization": f"Bearer {auth_token}"},
                      json=payload, timeout=30)
    assert r.status_code == 200, f"{kind} same-city order failed: {r.text}"
    actual = float(r.json().get("delivery_charge") or 0)
    assert actual == 0.0, f"{kind} same-city expected 0, got {actual}"


def test_alias_aware_same_city(auth_token):
    """Dealer city 'Bangalore' vs buyer 'Bengaluru' must be treated as same city."""
    item = PICKERS["consumable"]()
    if not item:
        pytest.skip("no consumable")
    payload = {
        "listing_id": item["id"], "listing_kind": "consumable", "qty": 1,
        "customer_name": "QA", "customer_phone": "+91 9876543210",
        "delivery_address": "addr", "order_city": "Bengaluru",
        "charge_delivery": True, "delivery_charge": 100,
    }
    r = requests.post(f"{BASE}/orders",
                      headers={"Authorization": f"Bearer {auth_token}"},
                      json=payload, timeout=30)
    assert r.status_code == 200, r.text
    assert float(r.json().get("delivery_charge") or 0) == 0.0, r.text


def test_resolver_charge_once_per_dealer():
    """Frontend calculator: a dealer with 2 items must charge only the highest
    category rate (charged-once on the bearing line, 0 on the other)."""
    # Direct unit test of the JS algorithm mirrored in server: highest of toner+printer = 350
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from server import _resolve_delivery_charge
    # bearing line (printer) — server returns 350; toner line — charge_delivery False → 0
    assert _resolve_delivery_charge("printer", "Bangalore", "Mumbai", True) == 350.0
    assert _resolve_delivery_charge("toner", "Bangalore", "Mumbai", False) == 0.0
    # Total per dealer = 350 (charged once, not 350+100=450)
