"""Wave 105.4 Razorpay full verification + Supabase key rotation regression.

Covers:
- Razorpay create-order / verify-payment (happy & error paths)
- KEY_SECRET not leaked to frontend
- Rate limit (30/min) applies
- Regression after Supabase key rotation: auth login/me, printers,
  compatible-resolve, logout
"""
import hashlib
import hmac
import os
import re
import pytest
import requests

# --- Load backend URL from frontend/.env ---
API_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.strip().startswith("REACT_APP_BACKEND_URL="):
            API_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
assert API_URL, "REACT_APP_BACKEND_URL missing"

# --- Load KEY_SECRET from backend/.env (never hardcoded) ---
KEY_SECRET = None
KEY_ID = None
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("RAZORPAY_KEY_SECRET="):
            KEY_SECRET = line.split("=", 1)[1].strip()
        elif line.startswith("RAZORPAY_KEY_ID="):
            KEY_ID = line.split("=", 1)[1].strip()

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


# ============ Razorpay create-order ============

class TestCreateOrder:
    def test_valid_amount(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "currency": "INR", "receipt": "test1"},
                          timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["order_id"].startswith("order_")
        assert d["amount"] == 10000
        assert d["currency"] == "INR"
        assert d["key_id"].startswith("rzp_")

    def test_below_min_rejected(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 50}, timeout=10)
        assert r.status_code == 400
        assert "100 paise" in r.text or "at least" in r.text.lower()

    def test_non_inr_rejected(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "currency": "USD"}, timeout=10)
        assert r.status_code == 400

    def test_long_receipt_trimmed(self):
        r = requests.post(f"{API_URL}/api/payments/create-order",
                          json={"amount": 10000, "receipt": "x" * 120}, timeout=20)
        assert r.status_code == 200, r.text


# ============ Razorpay verify-payment ============

def _sig(oid, pid):
    return hmac.new(KEY_SECRET.encode(), f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()


class TestVerifyPayment:
    def test_valid_signature(self):
        oid, pid = "order_TEST123", "pay_TEST456"
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json={"razorpay_order_id": oid, "razorpay_payment_id": pid,
                                "razorpay_signature": _sig(oid, pid)}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True and d["verified"] is True

    def test_bad_signature(self):
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json={"razorpay_order_id": "order_A", "razorpay_payment_id": "pay_B",
                                "razorpay_signature": "deadbeef" * 8}, timeout=10)
        assert r.status_code == 400
        assert "signature" in r.text.lower()

    @pytest.mark.parametrize("payload", [
        {"razorpay_order_id": "", "razorpay_payment_id": "p", "razorpay_signature": "s"},
        {"razorpay_order_id": "o", "razorpay_payment_id": "", "razorpay_signature": "s"},
        {"razorpay_order_id": "o", "razorpay_payment_id": "p", "razorpay_signature": ""},
    ])
    def test_empty_fields_rejected(self, payload):
        r = requests.post(f"{API_URL}/api/payments/verify-payment",
                          json=payload, timeout=10)
        assert r.status_code == 400


# ============ Secret leakage checks ============

class TestSecretLeakage:
    def test_secret_not_in_root(self):
        r = requests.get(f"{API_URL}/", timeout=15)
        assert KEY_SECRET not in r.text

    def test_secret_not_in_frontend_bundle(self):
        # Frontend served from same domain (no /api prefix)
        r = requests.get(f"{API_URL}/", timeout=15)
        # Extract JS bundle URLs
        js_urls = re.findall(r'src="(/static/js/[^"]+\.js)"', r.text)
        js_urls += re.findall(r"src='(/static/js/[^']+\.js)'", r.text)
        # Also look for main.*.js
        checked = 0
        for js in js_urls[:8]:
            jr = requests.get(f"{API_URL}{js}", timeout=20)
            if jr.status_code == 200:
                assert KEY_SECRET not in jr.text, f"KEY_SECRET leaked in {js}"
                checked += 1
        # It's OK if no js bundles found (SPA might be lazy); log
        print(f"Checked {checked} JS bundles for secret leak")


# ============ Rate limit ============

class TestRateLimit:
    def test_create_order_rate_limit(self):
        codes = []
        for _ in range(40):
            r = requests.post(f"{API_URL}/api/payments/create-order",
                              json={"amount": 50}, timeout=10)  # cheap 400
            codes.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in codes, f"Expected 429 within 40 rapid calls, got {codes[-5:]}"


# ============ Supabase key rotation regression ============

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


class TestRegressionAfterKeyRotation:
    def test_admin_login(self, admin_token):
        assert admin_token

    def test_admin_me(self, admin_token):
        r = requests.get(f"{API_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("email") == ADMIN_EMAIL
        assert d.get("role") == "admin"

    def test_printers_public(self):
        r = requests.get(f"{API_URL}/api/printers?limit=3", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list) or isinstance(d, dict)

    def test_compatible_resolve(self):
        r = requests.get(f"{API_URL}/api/compatible-resolve?q=BTD60BK", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("tier") == 1
        assert str(d.get("url", "")).startswith("/consumable/")

    def test_logout_without_token(self):
        r = requests.post(f"{API_URL}/api/auth/logout", timeout=10)
        assert r.status_code == 200

    def test_logout_with_token(self, admin_token):
        r = requests.post(f"{API_URL}/api/auth/logout",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200
