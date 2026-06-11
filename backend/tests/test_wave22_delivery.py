"""Wave 22 — system-defined flat-rate intercity delivery + printer direct orders.

Covers:
- Backend delivery resolver: same-city free, intercity flat per category.
- Printer orders now route through the direct-order path (previously 404'd).
- Server is authoritative: client-sent delivery amount is ignored.
"""
import os
import time
import requests

API = os.environ.get("TEST_API") or "http://localhost:8001"
BASE = f"{API}/api"


def _signup_login():
    email = f"qa.wave22.{int(time.time()*1000)}@example.com"
    requests.post(f"{BASE}/auth/signup-customer", json={
        "email": email, "password": "Test@1234", "name": "QA W22",
        "phone": "9876543210", "city": "Mumbai",
    }, timeout=30)
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "Test@1234"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"], email


def _first_printer():
    r = requests.get(f"{BASE}/printers?limit=1", timeout=30)
    r.raise_for_status()
    data = r.json()
    return data[0] if data else None


def test_resolver_unit():
    """Direct unit test of the delivery resolver in server.py."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from server import _resolve_delivery_charge
    # Same city => free even if charge_delivery True
    assert _resolve_delivery_charge("printer", "Bangalore", "Bengaluru", True) == 0.0
    # Intercity printer => 350
    assert _resolve_delivery_charge("printer", "Bangalore", "Mumbai", True) == 350.0
    # Intercity toner => 100
    assert _resolve_delivery_charge("toner", "Bangalore", "Mumbai", True) == 100.0
    # Intercity scanner => 250
    assert _resolve_delivery_charge("scanner", "Bangalore", "Mumbai", True) == 250.0
    # Intercity paper => 150
    assert _resolve_delivery_charge("paper", "Bangalore", "Mumbai", True) == 150.0
    # charge_delivery False => 0 (non-bearing line for the dealer)
    assert _resolve_delivery_charge("printer", "Bangalore", "Mumbai", False) == 0.0


def test_printer_order_intercity():
    token, _ = _signup_login()
    p = _first_printer()
    if not p:
        return  # no printer listings to exercise
    r = requests.post(f"{BASE}/orders", headers={"Authorization": f"Bearer {token}"}, json={
        "listing_id": p["id"], "listing_kind": "printer", "qty": 1,
        "customer_name": "QA", "customer_phone": "+91 9876543210",
        "delivery_address": "addr", "order_city": "Mumbai",
        "charge_delivery": True, "delivery_charge": 350,
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    dealer_city = (p.get("city") or "").strip().lower()
    if dealer_city and dealer_city not in ("mumbai", "bombay"):
        assert float(body.get("delivery_charge") or 0) == 350.0, body
    assert body.get("product_brand") == p["brand"]


def test_printer_order_same_city_free():
    token, _ = _signup_login()
    p = _first_printer()
    if not p or not p.get("city"):
        return
    r = requests.post(f"{BASE}/orders", headers={"Authorization": f"Bearer {token}"}, json={
        "listing_id": p["id"], "listing_kind": "printer", "qty": 1,
        "customer_name": "QA", "customer_phone": "+91 9876543210",
        "delivery_address": "addr", "order_city": p["city"],
        "charge_delivery": True, "delivery_charge": 350,  # client lies; server must ignore
    }, timeout=30)
    assert r.status_code == 200, r.text
    assert float(r.json().get("delivery_charge") or 0) == 0.0, r.text
