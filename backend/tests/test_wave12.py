"""Wave 12 backend tests — D2D extension + image-optional creation + bulk inquiry.

Endpoints under test:
- GET  /api/d2d/listings           — public aggregator, must graceful-degrade
- GET  /api/d2d/me                 — auth required, role-aware response
- POST /api/supplier/listings      — toner create succeeds without image_url
- POST /api/supplier/printers      — printer create succeeds without image_url
- POST /api/supplier/papers        — paper create succeeds without image_url
- PUT  /api/supplier/printers/{id} — d2d body must be 200 or 503 (never 500)
- PUT  /api/supplier/papers/{id}   — d2d body must be 200 or 503 (never 500)
- POST /api/mps/inquiry            — bulk_enquiry with company field
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SUPABASE_URL = os.environ.get(
    "REACT_APP_SUPABASE_URL", "https://mlvtaozdosufrhzhvgdg.supabase.co"
)
SUPABASE_ANON = os.environ.get(
    "REACT_APP_SUPABASE_ANON_KEY",
    "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s",
)

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PWD = "Admin@123"
SUPPLIER_EMAIL_OLD = "TEST.w7.sup.cf61d246@tonerscarttest.com"
SUPPLIER_PWD_OLD = "Test@12345"


# ---------------- helpers ----------------
def sb_login(email, password):
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    return r.json().get("access_token") if r.status_code == 200 else None


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _bootstrap_supplier():
    """Try reusing the long-standing test supplier; otherwise sign up + approve a new one."""
    tok = sb_login(SUPPLIER_EMAIL_OLD, SUPPLIER_PWD_OLD)
    if tok:
        r = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=15)
        if r.status_code == 200 and r.json().get("role") == "supplier":
            return tok
    admin_tok = sb_login(ADMIN_EMAIL, ADMIN_PWD)
    if not admin_tok:
        return None
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST.w12.sup.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    payload = {
        "email": email, "password": pwd,
        "business_name": f"TEST_W12_Sup_{suffix}",
        "contact_person": "Test W12 Sup",
        "phone": "9000000099", "city": "Bangalore", "state": "Karnataka",
        "pincode": "560001", "cities_served": ["Bangalore"],
        "gst_number": "29AAAAA0000A1Z5", "pan_number": "AAAAA0000A",
        "annual_turnover": "1-5cr", "years_in_business": 3,
        "business_address": "TEST W12 address",
        "seller_types": ["toner", "printer", "paper"],
        "compatible_brands": ["HP"], "testing_before_delivery": True,
    }
    r = requests.post(f"{API}/auth/signup-supplier", json=payload, timeout=40)
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


def _bootstrap_buyer():
    """Sign up a fresh customer/buyer to test the not_supplier branch."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST.w12.buyer.{suffix}@tonerscarttest.com"
    pwd = "Test@12345"
    r = requests.post(
        f"{API}/auth/signup-customer",
        json={"email": email, "password": pwd, "name": f"TEST W12 Buyer {suffix}"},
        timeout=30,
    )
    if r.status_code not in (200, 201):
        return None
    return sb_login(email, pwd)


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def supplier_token():
    tok = _bootstrap_supplier()
    if not tok:
        pytest.skip("could not obtain approved-supplier token")
    return tok


@pytest.fixture(scope="module")
def supplier_headers(supplier_token):
    return _auth(supplier_token)


@pytest.fixture(scope="module")
def buyer_token():
    tok = _bootstrap_buyer()
    if not tok:
        pytest.skip("could not bootstrap a buyer account")
    return tok


# ---------------- D2D aggregator ----------------
class TestD2DListings:
    """GET /api/d2d/listings — public, must return well-formed JSON even if columns missing."""

    def test_public_no_auth_returns_shape(self):
        r = requests.get(f"{API}/d2d/listings", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["toners", "printers", "papers", "counts"]).issubset(data.keys())
        assert isinstance(data["toners"], list)
        assert isinstance(data["printers"], list)
        assert isinstance(data["papers"], list)
        assert set(["toners", "printers", "papers"]).issubset(data["counts"].keys())
        # counts must equal list lengths
        assert data["counts"]["toners"] == len(data["toners"])
        assert data["counts"]["printers"] == len(data["printers"])
        assert data["counts"]["papers"] == len(data["papers"])

    def test_with_q_filter_does_not_500(self):
        r = requests.get(f"{API}/d2d/listings", params={"q": "hp"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "counts" in data


# ---------------- D2D me ----------------
class TestD2DMe:
    def test_no_auth_returns_401_or_403(self):
        r = requests.get(f"{API}/d2d/me", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_buyer_returns_not_supplier(self, buyer_token):
        r = requests.get(f"{API}/d2d/me", headers=_auth(buyer_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("verified") is False
        assert data.get("reason") == "not_supplier"

    def test_supplier_returns_verified_true(self, supplier_token):
        r = requests.get(f"{API}/d2d/me", headers=_auth(supplier_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("verified") is True, data
        assert isinstance(data.get("business_name"), str) and data["business_name"]


# ---------------- Creates without image ----------------
class TestCreatesWithoutImage:
    """All three product types must allow creation with no image_url."""

    def test_toner_create_without_image(self, supplier_headers):
        body = {
            "brand": "HP",
            "model_number": f"W12T-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "price": 1234.0,
            "stock": 5,
            "toner_type": "Original",
            "gst_rate": 18,
            "compatible_models": "M1",
            "oem_part_number": "CC388A",
            "page_yield": 1500,
        }
        r = requests.post(f"{API}/supplier/listings", json=body, headers=supplier_headers, timeout=40)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "id" in data or "listing" in data

    def test_paper_create_without_image(self, supplier_headers):
        body = {
            "brand": "JK",
            "size": "A4",
            "gsm": 75,
            "reams_per_box": 10,
            "price_per_ream": 99.0,
            "stock": 10,
            "city": "Bangalore",
        }
        r = requests.post(f"{API}/supplier/papers", json=body, headers=supplier_headers, timeout=40)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert isinstance(data, dict)

    def test_printer_create_without_image(self, supplier_headers):
        body = {
            "brand": "HP",
            "model_number": f"W12P-{uuid.uuid4().hex[:6]}",
            "description": "Wave 12 test printer w/o image",
            "condition": "new",
            "usage_types": ["home"],
            "category": "inkjet",
            "color": "color",
            "paper_sizes": ["A4"],
            "functions": ["Print"],
            "connectivity": ["USB"],
            "features": [],
            "monthly_volume_min": 0,
            "monthly_volume_max": 1000,
            "price": 9999.0,
            "stock": 3,
        }
        r = requests.post(f"{API}/supplier/printers", json=body, headers=supplier_headers, timeout=40)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "id" in data


# ---------------- D2D PUTs (graceful degrade) ----------------
class TestD2DPuts:
    """When d2d_enabled/d2d_price columns are missing, endpoints must 503 — not 500."""

    def _first_printer_id(self, headers):
        r = requests.get(f"{API}/supplier/printers/mine", headers=headers, timeout=20)
        if r.status_code == 200 and r.json():
            rows = r.json()
            if rows:
                return rows[0]["id"]
        return None

    def _first_paper_id(self, headers):
        r = requests.get(f"{API}/supplier/papers/mine", headers=headers, timeout=20)
        if r.status_code == 200 and r.json():
            rows = r.json()
            if rows:
                return rows[0]["id"]
        return None

    def test_put_printer_d2d_no_500(self, supplier_headers):
        pid = self._first_printer_id(supplier_headers)
        if not pid:
            pytest.skip("no printer to update")
        r = requests.put(
            f"{API}/supplier/printers/{pid}",
            json={"d2d_enabled": True, "d2d_price": 1500},
            headers=supplier_headers, timeout=30,
        )
        # Either succeeds OR returns 503 with migration-pending message
        assert r.status_code in (200, 503), r.text
        if r.status_code == 503:
            assert "D2D" in r.text or "d2d" in r.text

    def test_put_paper_d2d_no_500(self, supplier_headers):
        pid = self._first_paper_id(supplier_headers)
        if not pid:
            pytest.skip("no paper to update")
        r = requests.put(
            f"{API}/supplier/papers/{pid}",
            json={"d2d_enabled": True, "d2d_price": 99},
            headers=supplier_headers, timeout=30,
        )
        assert r.status_code in (200, 503), r.text
        if r.status_code == 503:
            assert "D2D" in r.text or "d2d" in r.text


# ---------------- MPS bulk inquiry ----------------
class TestBulkInquiry:
    def test_bulk_inquiry_with_company(self):
        body = {
            "name": "Test Buyer",
            "email": f"TEST.w12.bulk.{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "phone": "9000000077",
            "description": "Need 200 reams A4 / 30-day credit",
            "estimated_printers": "—",
            "selections": {"type": "bulk_enquiry", "company": "Acme Corp"},
        }
        r = requests.post(f"{API}/mps/inquiry", json=body, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
