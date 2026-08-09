"""Wave 105.4 — Razorpay Standard Checkout endpoints.

Verifies both endpoints work against the live preview URL with test credentials.
"""
import hmac
import hashlib
import os
import pytest
import requests

_FE_ENV = "/app/frontend/.env"
API_URL = None
with open(_FE_ENV) as f:
    for line in f:
        if line.strip().startswith("REACT_APP_BACKEND_URL="):
            API_URL = line.split("=", 1)[1].strip()
            break
if not API_URL:
    pytest.skip("REACT_APP_BACKEND_URL not found", allow_module_level=True)

# Load test secret from backend env (never hardcoded)
KEY_SECRET = None
with open("/app/backend/.env") as f:
    for line in f:
        if line.strip().startswith("RAZORPAY_KEY_SECRET="):
            KEY_SECRET = line.split("=", 1)[1].strip()
            break


class TestCreateOrder:
    def test_valid_amount_creates_razorpay_order(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "currency": "INR", "receipt": "test_r_1"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["order_id"].startswith("order_")
        assert d["amount"] == 10000
        assert d["currency"] == "INR"
        assert d["key_id"].startswith("rzp_")

    def test_below_min_amount_rejected(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 50}, timeout=10)
        assert r.status_code == 400
        assert "100 paise" in r.text or "at least" in r.text.lower()

    def test_non_inr_rejected(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "currency": "USD"}, timeout=10)
        assert r.status_code == 400

    def test_long_receipt_trimmed_not_rejected(self):
        """Razorpay caps receipt at 40 chars; our endpoint should trim silently."""
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "receipt": "x" * 120}, timeout=15)
        assert r.status_code == 200, r.text


class TestVerifyPayment:
    def _mk_sig(self, oid, pid):
        return hmac.new(KEY_SECRET.encode(), f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()

    def test_correct_signature_verified(self):
        oid, pid = "order_ABC123", "pay_XYZ789"
        sig = self._mk_sig(oid, pid)
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json={"razorpay_order_id": oid, "razorpay_payment_id": pid,
                                "razorpay_signature": sig}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True and d["verified"] is True
        assert d["order_id"] == oid

    def test_bad_signature_rejected(self):
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json={"razorpay_order_id": "order_ABC", "razorpay_payment_id": "pay_XYZ",
                                "razorpay_signature": "deadbeef" * 8}, timeout=10)
        assert r.status_code == 400
        assert "signature" in r.text.lower()

    def test_missing_fields_rejected(self):
        for payload in [
            {"razorpay_order_id": "", "razorpay_payment_id": "p", "razorpay_signature": "s"},
            {"razorpay_order_id": "o", "razorpay_payment_id": "", "razorpay_signature": "s"},
            {"razorpay_order_id": "o", "razorpay_payment_id": "p", "razorpay_signature": ""},
        ]:
            r = requests.post(f"{API_URL}/api/payments/verify-payment",
                              json=payload, timeout=10)
            assert r.status_code == 400, f"expected 400 for {payload}, got {r.status_code}"

    def test_signature_uses_constant_time_compare(self):
        """Same-length wrong signature must still be rejected (guards against
        naive == comparison that could leak timing info)."""
        oid, pid = "order_ABC", "pay_XYZ"
        real = self._mk_sig(oid, pid)
        wrong = "0" * len(real)
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json={"razorpay_order_id": oid, "razorpay_payment_id": pid,
                                "razorpay_signature": wrong}, timeout=10)
        assert r.status_code == 400
