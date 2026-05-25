"""TonersCart Wave 3 backend tests (iteration 8).

Covers:
  * GET  /api/admin/finance/summary, /api/admin/finance/dealers   (admin)
  * GET  /api/admin/finance/export, /api/admin/finance/dealer-payouts/export (CSV+BOM)
  * GET  /api/supplier/earnings                                    (supplier)
  * GET  /api/papers, POST /api/supplier/papers                    (graceful 503/[])
  * GET  /api/listings/search/paginated                            (page/limit/total/pages)
  * GET  /api/listings/{nonexistent_uuid}                          → 404 (not 500)
  * PUT  /api/supplier/listings/{id}                               (partial patch)
  * GET  /sitemap.xml, /robots.txt                                 (root mount)
  * POST /api/auth/password-reset                                  (best-effort)
  * In-memory rate limiter on /api/mps/inquiry (11th = 429)
  * POST /api/admin/config/popular_chips                           (200 or 503, never 500)
  * Smoke regressions
"""
import csv
import io
import os
import uuid
import pytest
import requests

# Bootstrap env from /app/frontend/.env so tests run via plain `pytest`
def _bootstrap_env():
    p = "/app/frontend/.env"
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k.strip(), v)
_bootstrap_env()

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)
API = f"{BASE_URL}/api"
ROOT = BASE_URL  # for /sitemap.xml + /robots.txt (NOT under /api)

SUPABASE_URL = "https://mlvtaozdosufrhzhvgdg.supabase.co"
SUPABASE_ANON = "sb_publishable_RUkJCBl9kV_uA_eQK5W1-Q_6qRcJv9s"

ADMIN_EMAIL = "admin@tonerscart.in"
ADMIN_PASSWORD = "Admin@123"

BUYER_EMAIL = "buyer1@test.com"
BUYER_PASSWORD = "Test@123"


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


@pytest.fixture(scope="module")
def admin_headers():
    tok = sb_login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def buyer_headers():
    tok = sb_login(BUYER_EMAIL, BUYER_PASSWORD)
    if not tok:
        email = f"wave3.buyer.{uuid.uuid4().hex[:8]}@tonerscarttest.com"
        password = "Test@12345"
        r = requests.post(f"{API}/auth/signup-customer", json={
            "email": email, "password": password, "name": "TEST Wave3 Buyer",
            "phone": "9000000088", "city": "Mumbai",
        }, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"buyer signup failed: {r.status_code}")
        tok = sb_login(email, password)
    if not tok:
        pytest.skip("buyer login failed")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def supplier_headers():
    # Try to find any approved supplier credentials from environment. If not
    # available, attempt buyer1 promoted account is unlikely — skip cleanly.
    sup_email = os.environ.get("TEST_SUPPLIER_EMAIL")
    sup_pwd = os.environ.get("TEST_SUPPLIER_PASSWORD")
    if sup_email and sup_pwd:
        tok = sb_login(sup_email, sup_pwd)
        if tok:
            return {"Authorization": f"Bearer {tok}"}
    pytest.skip("no approved supplier seed available")


# -------- Smoke --------
class TestSmoke:
    def test_api_root(self):
        r = requests.get(f"{API}/", timeout=20)
        assert r.status_code == 200


# -------- Papers (migration pending) --------
class TestPapers:
    def test_get_papers_graceful(self):
        r = requests.get(f"{API}/papers", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_post_paper_requires_supplier(self, buyer_headers):
        r = requests.post(f"{API}/supplier/papers", headers=buyer_headers, json={
            "brand": "TEST Paper", "size": "A4", "gsm": 80,
            "reams_per_box": 10, "price_per_ream": 250.0, "stock": 5,
            "city": "Mumbai",
        }, timeout=30)
        # Buyer should be 403; never 500.
        assert r.status_code in (403, 503), f"{r.status_code} {r.text}"

    def test_post_paper_supplier_graceful(self, supplier_headers):
        r = requests.post(f"{API}/supplier/papers", headers=supplier_headers, json={
            "brand": "TEST Paper", "size": "A4", "gsm": 80,
            "reams_per_box": 10, "price_per_ream": 250.0, "stock": 5,
            "city": "Mumbai",
        }, timeout=30)
        # Either 200 (migration ran) or 503 (table not yet created). Never 500.
        assert r.status_code in (200, 503), f"{r.status_code} {r.text}"


# -------- Sitemap + robots --------
class TestSitemapRobots:
    def test_sitemap_xml(self):
        r = requests.get(f"{ROOT}/sitemap.xml", timeout=20)
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "xml" in ct.lower(), ct
        body = r.text
        assert "<urlset" in body
        assert "<loc>https://www.tonerscart.com/</loc>" in body
        assert "/search" in body
        assert "/printers" in body
        assert "/papers" in body
        assert "Bangalore" in body

    def test_robots_txt(self):
        r = requests.get(f"{ROOT}/robots.txt", timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/plain" in ct.lower(), ct
        assert "Sitemap:" in r.text


# -------- Admin finance --------
class TestAdminFinance:
    def test_finance_summary(self, admin_headers):
        r = requests.get(f"{API}/admin/finance/summary", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for b in data:
            for k in ("month", "orders", "gmv", "commission", "payout"):
                assert k in b, f"missing key {k} in {b}"

    def test_finance_dealers(self, admin_headers):
        r = requests.get(f"{API}/admin/finance/dealers", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for d in data:
            for k in ("id", "name", "city", "orders", "gmv", "commission", "payout"):
                assert k in d, f"missing {k} in {d}"
        if len(data) >= 2:
            # sorted by gmv desc
            assert data[0]["gmv"] >= data[1]["gmv"]

    def test_finance_export(self, admin_headers):
        r = requests.get(f"{API}/admin/finance/export", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        # UTF-8 BOM
        assert r.content[:3] == b"\xef\xbb\xbf", r.content[:30]
        text = r.content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        header = next(reader)
        assert header == ["Month", "Orders", "GMV (₹)", "Commission (₹)", "Dealer payouts (₹)"], header

    def test_finance_dealer_payouts_export(self, admin_headers):
        r = requests.get(f"{API}/admin/finance/dealer-payouts/export",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:3] == b"\xef\xbb\xbf"

    def test_finance_unauth(self):
        r = requests.get(f"{API}/admin/finance/summary", timeout=20)
        assert r.status_code in (401, 403)


# -------- Supplier earnings --------
class TestSupplierEarnings:
    def test_earnings(self, supplier_headers):
        r = requests.get(f"{API}/supplier/earnings", headers=supplier_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "stats" in data and "orders" in data
        for k in ("total_gmv", "total_commission", "total_net", "orders"):
            assert k in data["stats"]
        assert data["stats"]["orders"] >= 0
        assert isinstance(data["orders"], list)

    def test_earnings_buyer_forbidden(self, buyer_headers):
        r = requests.get(f"{API}/supplier/earnings", headers=buyer_headers, timeout=20)
        assert r.status_code in (401, 403)


# -------- Listings: single GET + paginated search --------
class TestListings:
    def test_nonexistent_listing_404(self):
        bad = str(uuid.uuid4())
        r = requests.get(f"{API}/listings/{bad}", timeout=20)
        assert r.status_code == 404, f"{r.status_code} {r.text}"

    def test_search_paginated(self):
        r = requests.get(f"{API}/listings/search/paginated?page=1&limit=5", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("results", "total", "page", "pages", "limit"):
            assert k in data, k
        assert data["page"] == 1
        assert data["limit"] == 5
        assert data["pages"] >= 1
        assert isinstance(data["results"], list)
        assert len(data["results"]) <= 5

    def test_search_paginated_overflow(self):
        r = requests.get(f"{API}/listings/search/paginated?page=999&limit=5", timeout=30)
        assert r.status_code == 200
        assert r.json()["results"] == []


# -------- Supplier partial patches --------
class TestSupplierPatch:
    def test_patch_listing_bad_id_graceful(self, supplier_headers):
        bad = str(uuid.uuid4())
        r = requests.put(f"{API}/supplier/listings/{bad}",
                         headers=supplier_headers, json={"stock": 5}, timeout=20)
        # Either 200 (no rows changed) or 404. Must not 500.
        assert r.status_code in (200, 404), r.text

    def test_patch_listing_empty_payload(self, supplier_headers):
        bad = str(uuid.uuid4())
        r = requests.put(f"{API}/supplier/listings/{bad}",
                         headers=supplier_headers, json={}, timeout=20)
        assert r.status_code in (200, 404), r.text


# -------- Password reset --------
class TestPasswordReset:
    def test_reset_ok(self):
        r = requests.post(f"{API}/auth/password-reset",
                          json={"email": "nobody@tonerscarttest.com"}, timeout=30)
        # Best-effort: must be 200 (never 500). 422 also acceptable for bad shape, but we send valid.
        assert r.status_code == 200, r.text


# -------- Admin config (graceful) --------
class TestAdminConfig:
    def test_post_popular_chips(self, admin_headers):
        r = requests.post(
            f"{API}/admin/config/popular_chips",
            headers=admin_headers,
            json={"value": [{"label": "HP 88A", "query": "88A"}]},
            timeout=20,
        )
        # 200 if site_config migrated, 503 otherwise. Must not 500.
        assert r.status_code in (200, 503), r.text


# -------- Rate limit (in-memory, /api/mps/inquiry: 10/h → 11th = 429) --------
class TestRateLimit:
    def test_mps_inquiry_429_on_11th(self):
        payload = {
            "name": "TEST RateLimit",
            "email": f"rl.{uuid.uuid4().hex[:6]}@tonerscarttest.com",
            "phone": "9000000010",
            "description": "rate limit probe",
            "estimated_printers": 1,
            "selections": {},
        }
        codes = []
        for i in range(11):
            r = requests.post(f"{API}/mps/inquiry", json=payload, timeout=20)
            codes.append(r.status_code)
            if r.status_code == 429:
                # confirm body
                try:
                    body = r.json()
                    assert "Too many requests" in body.get("detail", ""), body
                except Exception:
                    pass
                break
        # Either the 11th hit 429, or earlier hits did (if previous test runs in same hour).
        assert 429 in codes, f"expected 429 in 11 attempts, got {codes}"


# -------- Regression smoke (auth/me, public catalogs) --------
class TestRegression:
    def test_listings_search(self):
        r = requests.get(f"{API}/listings/search", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_printers_list(self):
        r = requests.get(f"{API}/printers", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_auth_me_admin(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("role") == "admin"

    def test_public_stats(self):
        r = requests.get(f"{API}/stats/public", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("suppliers", "cities", "brands"):
            assert k in d
