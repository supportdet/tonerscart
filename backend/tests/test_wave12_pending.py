"""Wave 12 — additional retest: /api/d2d/me 'not_approved' branch for pending suppliers."""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://b2b-checkout-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL", "https://mlvtaozdosufrhzhvgdg.supabase.co")
SUPABASE_ANON = os.environ.get("REACT_APP_SUPABASE_ANON_KEY", "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s")


def sb_login(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    return r.json().get("access_token") if r.status_code == 200 else None


def test_pending_supplier_returns_no_supplier_record_or_not_approved():
    """A signed-up but not-yet-approved supplier should NOT 500 on /d2d/me.
    The endpoint should return verified=false with a reason (no_supplier_record OR not_approved).
    """
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST.w12r.pend.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    payload = {
        "email": email, "password": pwd,
        "business_name": f"TEST_W12R_Pend_{suffix}",
        "contact_person": "Test W12R Pend",
        "phone": "9000000088", "city": "Bangalore", "state": "Karnataka",
        "pincode": "560001", "cities_served": ["Bangalore"],
        "gst_number": "29AAAAA0000A1Z5", "pan_number": "AAAAA0000A",
        "annual_turnover": "1-5cr", "years_in_business": 3,
        "business_address": "TEST W12R address",
        "seller_types": ["toner"],
        "compatible_brands": ["HP"], "testing_before_delivery": True,
    }
    r = requests.post(f"{API}/auth/signup-supplier", json=payload, timeout=40)
    assert r.status_code == 200, r.text
    tok = sb_login(email, pwd)
    assert tok, "could not log into pending supplier"
    # /auth/me may or may not say supplier — but /d2d/me must not 500 either way
    me = requests.get(f"{API}/d2d/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert me.status_code == 200, me.text
    data = me.json()
    assert data.get("verified") is False
    assert data.get("reason") in ("not_supplier", "no_supplier_record", "not_approved"), data
