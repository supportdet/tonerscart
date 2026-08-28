"""Wave 105.8-105.10 backend tests.

Covers:
  - Admin login (support@tonerscart.com) sanity
  - POST /api/supplier/listings/bulk — color column persistence (Black/Cyan/
    Magenta/Yellow + unknown pass-through)  [BUG FIX 2]
  - GET /api/supplier/listings + /api/supplier/printers — the two feeds the new
    /supplier/bulk-images page consumes  [FEATURE 4]
  - PUT /api/supplier/listings/{id} — image_urls patch used after upload
  - POST /api/supplier/listing-image — auth guard (no real upload of junk)
  - POST /api/razorpay/create-order — regression (no payment placed)

Creates a temporary approved supplier via the Supabase admin SDK and deletes
it (listings + suppliers + users + auth user) at the end.
"""
import sys
import uuid

import pytest
import requests
from dotenv import dotenv_values

sys.path.insert(0, "/app/backend")
from server import sb_admin  # noqa: E402

BASE = (dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"
API = f"{BASE}/api"
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"
SUP_PASSWORD = "Test@1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=40)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def supplier(admin_token):
    """Temp APPROVED supplier: auth user + users row + suppliers row."""
    email = f"qa.w10510.{uuid.uuid4().hex[:8]}@example.com"
    created = sb_admin.auth.admin.create_user({
        "email": email, "password": SUP_PASSWORD, "email_confirm": True,
        "user_metadata": {"name": "QA W105.10", "role": "supplier"},
    })
    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid, "email": email, "name": "QA W105.10", "role": "supplier",
        "phone": "9000111222", "company": "QA W10510 Co", "city": "Bangalore",
    }, on_conflict="id").execute()
    sup = sb_admin.table("suppliers").upsert({
        "user_id": uid, "business_name": "QA W10510 Co", "contact_person": "QA W105.10",
        "phone": "9000111222", "email": email, "city": "Bangalore",
        "business_address": "1 QA Street, Bangalore",
    }, on_conflict="user_id").execute().data[0]

    r = requests.post(f"{API}/auth/login", json={"email": email, "password": SUP_PASSWORD}, timeout=40)
    if r.status_code != 200:
        pytest.fail(f"Supplier login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token")
    ctx = {"id": sup["id"], "user_id": uid, "email": email,
           "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}
    yield ctx
    # ---- cleanup ----
    try:
        sb_admin.table("listings").delete().eq("supplier_id", sup["id"]).execute()
    except Exception:
        pass
    for tbl, col in (("suppliers", "user_id"), ("users", "id")):
        try:
            sb_admin.table(tbl).delete().eq(col, uid).execute()
        except Exception:
            pass
    try:
        sb_admin.auth.admin.delete_user(uid)
    except Exception:
        pass


# ---------- BUG FIX 2 — bulk upload color persistence ----------

class TestBulkColor:
    def test_bulk_unauth_rejected(self):
        r = requests.post(f"{API}/supplier/listings/bulk", json=[], timeout=30)
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_bulk_empty_payload_400(self, supplier):
        r = requests.post(f"{API}/supplier/listings/bulk", headers=supplier["headers"], json=[], timeout=30)
        assert r.status_code == 400, f"got {r.status_code}: {r.text[:200]}"

    @pytest.mark.parametrize("color", ["Black", "Cyan", "Magenta", "Yellow", "Tri-Color", "Neon"])
    def test_bulk_row_persists_color(self, supplier, color):
        model = f"TEST-W10510-{color.replace(' ', '')}-{uuid.uuid4().hex[:5]}"
        payload = [{
            "brand": "HP", "model_number": model, "color": color,
            "price": 2500, "stock": 4, "toner_type": "Compatible",
            "page_yield": 1500, "gst_rate": 18,
        }]
        r = requests.post(f"{API}/supplier/listings/bulk", headers=supplier["headers"], json=payload, timeout=60)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:400]}"
        d = r.json()
        assert d["succeeded"] == 1, f"errors={d.get('errors')}"
        row = d["created"][0]
        assert row.get("color") == color, f"color dropped/changed: {row.get('color')!r}"
        # GET verifies DB persistence
        g = requests.get(f"{API}/supplier/listings", headers=supplier["headers"], timeout=40)
        assert g.status_code == 200
        found = [x for x in g.json() if x.get("model_number") == model]
        assert found, f"listing {model} not returned by GET /supplier/listings"
        assert found[0].get("color") == color, f"persisted color = {found[0].get('color')!r}"
        assert "_id" not in found[0]

    def test_bulk_mixed_valid_and_invalid_rows(self, supplier):
        good = f"TEST-W10510-MIX-{uuid.uuid4().hex[:5]}"
        payload = [
            {"brand": "Canon", "model_number": good, "color": "Cyan", "price": 1200,
             "stock": 2, "toner_type": "Original", "page_yield": 1200},
            {"brand": "Canon", "model_number": "TEST-W10510-BAD", "color": "Black",
             "price": 900, "stock": 1, "toner_type": "NotAType", "page_yield": 1200},
        ]
        r = requests.post(f"{API}/supplier/listings/bulk", headers=supplier["headers"], json=payload, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["succeeded"] == 1 and d["failed"] == 1, d
        assert d["errors"][0]["row"] == 1
        assert d["created"][0]["color"] == "Cyan"


# ---------- FEATURE 4 — bulk image upload page feeds ----------

class TestBulkImageFeeds:
    def test_supplier_listings_feed(self, supplier):
        r = requests.get(f"{API}/supplier/listings", headers=supplier["headers"], timeout=40)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)
        for row in r.json():
            assert "id" in row and "brand" in row
            assert "image_url" in row or "image_urls" in row, "no image field to filter on"

    def test_supplier_printers_feed_path_used_by_page(self, supplier):
        """BulkImageUpload.jsx calls GET /supplier/printers — verify it exists.
        Backend only exposes GET /supplier/printers/mine, so the page silently
        swallows a 405 and NEVER lists printers without photos."""
        bad = requests.get(f"{API}/supplier/printers", headers=supplier["headers"], timeout=40)
        good = requests.get(f"{API}/supplier/printers/mine", headers=supplier["headers"], timeout=40)
        assert good.status_code == 200, f"mine: {good.status_code}: {good.text[:200]}"
        assert isinstance(good.json(), list)
        assert bad.status_code == 200, (
            f"BUG: GET /supplier/printers -> {bad.status_code}; page must use /supplier/printers/mine")

    def test_put_listing_image_urls_persists(self, supplier):
        model = f"TEST-W10510-IMG-{uuid.uuid4().hex[:5]}"
        c = requests.post(f"{API}/supplier/listings", headers=supplier["headers"], json={
            "brand": "Epson", "model_number": model, "color": "Black",
            "price": 1000, "stock": 1, "toner_type": "Compatible", "page_yield": 1200,
        }, timeout=60)
        assert c.status_code == 200, f"{c.status_code}: {c.text[:300]}"
        lid = c.json()["id"]
        url = "https://example.com/qa-w10510.jpg"
        p = requests.put(f"{API}/supplier/listings/{lid}", headers=supplier["headers"],
                         json={"image_urls": [url], "image_url": url}, timeout=40)
        assert p.status_code == 200, f"PUT failed {p.status_code}: {p.text[:300]}"
        g = requests.get(f"{API}/supplier/listings", headers=supplier["headers"], timeout=40)
        row = [x for x in g.json() if x["id"] == lid][0]
        assert row.get("image_url") == url, f"image_url not persisted: {row.get('image_url')!r}"
        assert row.get("image_urls") == [url], f"image_urls not persisted: {row.get('image_urls')!r}"

    def test_listing_image_upload_requires_auth(self):
        r = requests.post(f"{API}/supplier/listing-image", files={"file": ("a.jpg", b"x", "image/jpeg")}, timeout=30)
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_listing_image_rejects_non_image(self, supplier):
        h = {"Authorization": supplier["headers"]["Authorization"]}
        r = requests.post(f"{API}/supplier/listing-image", headers=h,
                          files={"file": ("a.txt", b"hello", "text/plain")}, timeout=40)
        assert r.status_code == 400, f"got {r.status_code}: {r.text[:200]}"


# ---------- REGRESSION ----------

class TestRegression:
    def test_razorpay_config_check(self):
        r = requests.get(f"{API}/payments/config-check", timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["key_id_present"] and d["key_secret_present"] and d["client_initialised"]

    def test_razorpay_create_order(self):
        """No payment is placed — only order creation. Currently FAILS with
        'Razorpay rejected the order: Authentication failed' => the preview
        RAZORPAY_KEY_ID/SECRET pair is invalid/mismatched."""
        r = requests.post(f"{API}/payments/create-order", json={"amount": 10000}, timeout=40)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        assert r.json().get("order_id")

    def test_admin_me_role(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=40)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("role") == "admin"

    def test_supplier_me_role(self, supplier):
        r = requests.get(f"{API}/auth/me", headers=supplier["headers"], timeout=40)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("role") == "supplier"
