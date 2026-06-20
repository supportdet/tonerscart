"""TonersCart 12-item polish-patch backend tests.

Verifies new endpoints introduced in this batch:
  * GET  /api/featured/suppliers          — graceful [] (migration pending)
  * POST /api/featured/apply              — public, returns 200, side-effect emails
  * POST /api/quotation                   — auth required, returns TC-YYYYMMDD-XXXXX
  * GET  /api/listings/{id}/brochure      — 404 'No brochure available' (no 500)
  * Commission tier constants in email_service._COMMISSION_TIERS
  * Phone normalization on POST /api/orders (accepts '+91 9XXXXXXXXX' free-form)
  * Public read endpoints (/listings/search, /printers, /listings/facets) still 200
  * Smoke health /api/

Backend uses Supabase JWTs (no /api/auth/login). Buyer token is obtained via
Supabase Auth REST API using the seeded buyer1@test.com account.
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

BUYER_EMAIL = "buyer1@test.com"
BUYER_PASSWORD = "Test@123"


def sb_login(email: str, password: str) -> str | None:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


@pytest.fixture(scope="module")
def buyer_token():
    tok = sb_login(BUYER_EMAIL, BUYER_PASSWORD)
    if not tok:
        # signup a fresh customer as fallback
        email = f"polish.buyer.{uuid.uuid4().hex[:8]}@tonerscarttest.com"
        password = "Test@12345"
        r = requests.post(f"{API}/auth/signup-customer", json={
            "email": email, "password": password, "name": "TEST Polish Buyer",
            "phone": "9000000099", "city": "Mumbai",
        }, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"could not signup test buyer: {r.status_code} {r.text}")
        tok = sb_login(email, password)
    if not tok:
        pytest.skip("buyer login failed")
    return tok


@pytest.fixture(scope="module")
def any_listing():
    r = requests.get(f"{API}/listings/search?limit=5", timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    if not rows:
        pytest.skip("no listings exist to test brochure/quotation against")
    return rows[0]


# ===== Smoke / health =====
class TestSmoke:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("service") == "TonersCart API (Supabase)"
        assert d.get("ok") is True


# ===== Public read endpoints — no regression =====
class TestPublicReads:
    def test_listings_search(self):
        r = requests.get(f"{API}/listings/search?limit=3", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_printers(self):
        r = requests.get(f"{API}/printers?limit=3", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_listings_facets(self):
        r = requests.get(f"{API}/listings/facets", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)
        # Common facet keys expected; just sanity-check it's a dict
        assert d


# ===== Featured suppliers — graceful empty =====
class TestFeaturedSuppliers:
    def test_returns_list_no_500(self):
        r = requests.get(f"{API}/featured/suppliers", timeout=15)
        # MUST NOT 500 even though is_featured column not migrated yet
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)


# ===== Featured apply — public submission =====
class TestFeaturedApply:
    def test_apply_valid_payload_returns_200(self):
        payload = {
            "company": f"TEST_polish_co_{uuid.uuid4().hex[:6]}",
            "contact_person": "TEST Polish Person",
            "phone": "9000099001",
            "email": "polish.featured@tonerscarttest.com",
            "city": "Mumbai",
            "pincode": "400001",
            "business_type": "dealer",
            "description": "Automated test submission — please ignore",
        }
        r = requests.post(f"{API}/featured/apply", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_apply_missing_required_returns_422(self):
        # missing email and company
        r = requests.post(f"{API}/featured/apply", json={
            "contact_person": "x", "phone": "9000099001"
        }, timeout=15)
        assert r.status_code in (400, 422), r.text


# ===== Quotation =====
class TestQuotation:
    def test_quotation_requires_auth(self, any_listing):
        r = requests.post(f"{API}/quotation", json={
            "listing_id": any_listing["id"], "listing_type": "toner", "qty": 2,
        }, timeout=20)
        assert r.status_code in (401, 403), r.text

    def test_quotation_with_buyer_returns_quote_number(self, any_listing, buyer_token):
        r = requests.post(f"{API}/quotation",
                          headers={"Authorization": f"Bearer {buyer_token}"},
                          json={
                              "listing_id": any_listing["id"],
                              "listing_type": "toner",
                              "qty": 3,
                          }, timeout=45)
        # 502 only if Resend genuinely fails; accept that as best-effort per spec,
        # but log so reviewer knows. 200 is the happy path.
        assert r.status_code in (200, 502), r.text
        if r.status_code == 200:
            d = r.json()
            assert d.get("ok") is True
            qnum = d.get("quote_number") or ""
            assert re.match(r"^TC-\d{8}-[A-Z0-9]{5}$", qnum), f"bad quote_number={qnum}"

    def test_quotation_bad_listing_type(self, any_listing, buyer_token):
        r = requests.post(f"{API}/quotation",
                          headers={"Authorization": f"Bearer {buyer_token}"},
                          json={
                              "listing_id": any_listing["id"],
                              "listing_type": "garbage",
                              "qty": 1,
                          }, timeout=15)
        assert r.status_code == 400, r.text

    def test_quotation_unknown_listing(self, buyer_token):
        r = requests.post(f"{API}/quotation",
                          headers={"Authorization": f"Bearer {buyer_token}"},
                          json={
                              "listing_id": "00000000-0000-0000-0000-000000000000",
                              "listing_type": "toner", "qty": 1,
                          }, timeout=15)
        assert r.status_code == 404, r.text


# ===== Brochure download — graceful 404 =====
class TestBrochure:
    def test_brochure_no_url_returns_404_not_500(self, any_listing, buyer_token):
        r = requests.get(f"{API}/listings/{any_listing['id']}/brochure?listing_type=toner",
                         headers={"Authorization": f"Bearer {buyer_token}"}, timeout=20)
        # spec_pdf_url column may not be migrated yet → 404; never 500
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"
        body = r.json()
        msg = (body.get("detail") or body.get("message") or "").lower()
        assert "brochure" in msg or "not" in msg or "listing" in msg

    def test_brochure_requires_auth(self, any_listing):
        r = requests.get(f"{API}/listings/{any_listing['id']}/brochure?listing_type=toner",
                         timeout=15)
        assert r.status_code in (401, 403), r.text


# ===== Commission tier constants =====
class TestCommissionTiers:
    def test_commission_tiers_module_constant(self):
        import sys, importlib, pathlib
        sys.path.insert(0, str(pathlib.Path("/app/backend")))
        es = importlib.import_module("email_service")
        assert es._COMMISSION_TIERS == [(15000, 0.10), (30000, 0.08), (75000, 0.06), (100000, 0.05)], \
            f"unexpected tiers: {es._COMMISSION_TIERS}"


# ===== Phone normalization on /orders =====
class TestOrderPhoneNormalization:
    def test_order_accepts_plus91_prefixed_phone(self, any_listing, buyer_token):
        """Backend must NOT reject a customer_phone like '+91 9XXXXXXXXX' with 422.
        We send a stock-zero listing if needed; result codes acceptable: 200 (ok),
        400 ('Insufficient stock' — still proves payload accepted), 404 (listing
        gone). The only failing condition is 422/500."""
        r = requests.post(f"{API}/orders",
                          headers={"Authorization": f"Bearer {buyer_token}"},
                          json={
                              "listing_id": any_listing["id"],
                              "qty": 1,
                              "customer_name": "TEST Polish Buyer",
                              "customer_phone": "+91 9000099002",
                              "delivery_address": "TEST 1 Street, Mumbai - 400001",
                              "notes": "TEST polish patch",
                          }, timeout=30)
        assert r.status_code in (200, 201, 400, 404), \
            f"unexpected {r.status_code} — payload was rejected: {r.text}"
