"""Wave 10 backend regression tests:
- /api/mps/inquiry accepts bulk_enquiry / oem_application / *_interest with optional phone/estimated_printers
- /api/listings/search?d2d_only=true gracefully returns [] when migration pending
- PUT /api/supplier/listings/{id} d2d-only patch returns 503 (or no-op) when columns missing
- POST /api/supplier/listings succeeds without image_url/image_urls (image optional)
- email_mps_inquiry subjects for each kind
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://b2b-checkout-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SUPABASE_URL = os.environ.get("REACT_APP_SUPABASE_URL", "https://mlvtaozdosufrhzhvgdg.supabase.co")
SUPABASE_ANON = os.environ.get("REACT_APP_SUPABASE_ANON_KEY", "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s")

SUPPLIER_EMAIL = "TEST.w7.sup.cf61d246@tonerscarttest.com"
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


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _bootstrap_supplier():
    """Try existing supplier; if invalid (user/profile gone), create + approve a fresh one."""
    tok = sb_login(SUPPLIER_EMAIL, SUPPLIER_PWD)
    if tok:
        # confirm profile exists in public.users (require_user check)
        r = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=15)
        if r.status_code == 200 and r.json().get("role") == "supplier":
            return tok
    # else, bootstrap a brand new approved supplier
    admin_tok = sb_login(ADMIN_EMAIL, ADMIN_PWD)
    if not admin_tok:
        return None
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST.w10.sup.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    sup_payload = {
        "email": email, "password": pwd,
        "business_name": f"TEST_W10_Sup_{suffix}",
        "contact_person": "Test W10 Sup",
        "phone": "9000000077", "city": "Bangalore", "state": "Karnataka", "pincode": "560001",
        "cities_served": ["Bangalore"], "gst_number": "29AAAAA0000A1Z5", "pan_number": "AAAAA0000A",
        "annual_turnover": "1-5cr", "years_in_business": 3, "business_address": "TEST W10 address",
        "seller_types": ["toner"], "compatible_brands": ["HP"], "testing_before_delivery": True,
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
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def supplier_token():
    tok = _bootstrap_supplier()
    if not tok:
        pytest.skip("could not obtain approved-supplier token")
    return tok


@pytest.fixture(scope="module")
def supplier_headers(supplier_token):
    return {"Authorization": f"Bearer {supplier_token}", "Content-Type": "application/json"}


# ---------- /api/mps/inquiry payload variants ----------
class TestMPSInquiry:
    def _post(self, session, payload):
        return session.post(f"{API}/mps/inquiry", json=payload, timeout=20)

    def test_bulk_enquiry_minimal(self, session):
        r = self._post(session, {
            "email": f"TEST_bulk_{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "phone": "",
            "selections": {"type": "bulk_enquiry", "product_type": "HP 12A", "quantity": "200", "city": "Mumbai"},
        })
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_oem_application(self, session):
        r = self._post(session, {
            "name": "Acme OEM",
            "email": f"TEST_oem_{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "phone": "",
            "selections": {"type": "oem_application", "company": "Acme OEM Ltd", "brand": "Acme"},
        })
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_consumables_interest(self, session):
        r = self._post(session, {
            "email": f"TEST_cons_{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "selections": {"type": "consumables_interest", "category": "Consumables"},
        })
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_scanners_interest(self, session):
        r = self._post(session, {
            "email": f"TEST_scan_{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "selections": {"type": "scanners_interest", "category": "Scanners"},
        })
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_invalid_email_rejected(self, session):
        r = self._post(session, {"email": "not-an-email", "selections": {"type": "bulk_enquiry"}})
        assert r.status_code in (400, 422), r.text


# ---------- /api/listings/search?d2d_only=true graceful degradation ----------
class TestD2DSearch:
    def test_d2d_only_returns_list_no_500(self, session):
        r = session.get(f"{API}/listings/search", params={"d2d_only": "true"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should be a list (empty when columns missing).
        assert isinstance(data, list)

    def test_search_baseline_still_works(self, session):
        r = session.get(f"{API}/listings/search", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- supplier listing tests ----------
class TestSupplierListings:
    def test_create_listing_without_image(self, session, supplier_headers):
        """POST /api/supplier/listings without image_url / image_urls should succeed."""
        payload = {
            "brand": "TEST_W10_Brand",
            "model_number": f"W10-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "toner_type": "Compatible",
            "price": 1299.0,
            "stock": 5,
            "variants": [{"color": "Black", "price": 1299.0, "stock": 5}],
        }
        r = session.post(f"{API}/supplier/listings", json=payload, headers=supplier_headers, timeout=25)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        # Either the row or {ok: true, ...}; sanity-check it isn't an error object
        assert "error" not in (body if isinstance(body, dict) else {}) and "detail" not in (body if isinstance(body, dict) else {})
        # Save listing id for d2d patch test
        lid = (body.get("id") if isinstance(body, dict) else None) or (body.get("listing", {}) or {}).get("id")
        TestSupplierListings.created_listing_id = lid

    def test_create_listing_with_d2d_fields_does_not_500(self, session, supplier_headers):
        payload = {
            "brand": "TEST_W10_D2D",
            "model_number": f"W10D-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "toner_type": "Compatible",
            "price": 1599.0,
            "stock": 3,
            "d2d_enabled": True,
            "d2d_price": 1450.0,
            "variants": [{"color": "Black", "price": 1599.0, "stock": 3}],
        }
        r = session.post(f"{API}/supplier/listings", json=payload, headers=supplier_headers, timeout=25)
        assert r.status_code in (200, 201), r.text

    def test_put_d2d_only_columns_missing(self, session, supplier_headers):
        """PUT /api/supplier/listings/{id} with only d2d fields when columns missing should be
        either 503 with a clear message, OR a graceful 200 no-op. Must NOT be 500."""
        # Pick any listing for this supplier
        # Use a known UUID-shape; if none exists create one quickly.
        lid = getattr(TestSupplierListings, "created_listing_id", None)
        if not lid:
            # fetch one of the supplier's own listings
            r = session.get(f"{API}/supplier/listings", headers=supplier_headers, timeout=20)
            if r.status_code == 200 and isinstance(r.json(), list) and r.json():
                lid = r.json()[0].get("id")
        if not lid:
            pytest.skip("no listing id available to patch")
        r = session.put(f"{API}/supplier/listings/{lid}", json={"d2d_enabled": True, "d2d_price": 1500}, headers=supplier_headers, timeout=20)
        assert r.status_code != 500, f"PUT must not 500: {r.status_code} {r.text}"
        assert r.status_code in (200, 503), r.text
        if r.status_code == 503:
            assert "migrat" in r.text.lower() or "d2d" in r.text.lower()

    def test_put_d2d_requires_supplier_auth(self, session):
        r = session.put(f"{API}/supplier/listings/{uuid.uuid4()}", json={"d2d_enabled": True}, timeout=15)
        assert r.status_code in (401, 403), r.text


# ---------- email_mps_inquiry subject lines (unit-level, no SMTP) ----------
class TestEmailSubjects:
    """Import and inspect subject-string branches by calling helper with a stub _send."""

    def test_subjects(self, monkeypatch=None):
        # Run as a plain function so we don't depend on monkeypatch fixture across pytest plugins
        import asyncio
        from backend import email_service as es

        captured = []

        async def fake_send(to, subject, html, reply_to=None):
            captured.append({"to": to, "subject": subject})

        original = es._send
        es._send = fake_send  # type: ignore
        try:
            cases = [
                ({"name": "A", "email": "a@x.com", "phone": "", "selections": {"type": "bulk_enquiry", "product_type": "HP 12A", "quantity": "100"}}, "[TonersCart Bulk]"),
                ({"name": "A", "email": "b@x.com", "phone": "", "selections": {"type": "oem_application", "company": "ZetaOEM"}}, "[TonersCart OEM] Application"),
                ({"name": "A", "email": "c@x.com", "phone": "", "selections": {"type": "consumables_interest", "category": "Consumables"}}, "[TonersCart Notify]"),
                ({"name": "A", "email": "d@x.com", "phone": "", "selections": {"type": "scanners_interest", "category": "Scanners"}}, "[TonersCart Notify]"),
            ]
            for payload, expected_prefix in cases:
                asyncio.get_event_loop().run_until_complete(es.email_mps_inquiry(payload))
                assert captured[-1]["to"] == es.SUPPORT_INBOX
                assert captured[-1]["subject"].startswith(expected_prefix), captured[-1]
        finally:
            es._send = original  # type: ignore
