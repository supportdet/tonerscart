"""Wave 45 — Admin listing edit + CRG303 variant price sync + regression."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"
CRG303_LISTING_ID = "02f296c4-ffdc-471f-a7a8-981d55a7c0f5"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token, "no access_token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- BUG #2: CRG 303 pricing consistency ---
def test_crg303_listing_variant_price_match():
    r = requests.get(f"{BASE_URL}/api/listings/{CRG303_LISTING_ID}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["price"] == 5100.0
    vs = data.get("variants") or []
    assert len(vs) >= 1
    assert vs[0]["price"] == 5100.0, f"variant price drift: {vs[0]['price']}"


# --- BUG #2 regression: admin PUT toner price syncs variant ---
def test_admin_toner_price_sync_to_variant(admin_session):
    # GET CRG303 current price
    r = requests.get(f"{BASE_URL}/api/listings/{CRG303_LISTING_ID}")
    orig = r.json()["price"]
    new_price = orig + 100
    try:
        # Update via admin endpoint
        r = admin_session.put(
            f"{BASE_URL}/api/admin/listings/toner/{CRG303_LISTING_ID}",
            json={"price": new_price})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "price" in body.get("updated", [])

        # Re-fetch & verify both match
        r2 = requests.get(f"{BASE_URL}/api/listings/{CRG303_LISTING_ID}")
        d = r2.json()
        assert d["price"] == new_price
        vs = d.get("variants") or []
        assert vs and vs[0]["price"] == new_price, \
            f"variant not synced: listing={d['price']} variant={vs[0]['price'] if vs else None}"
    finally:
        # restore
        admin_session.put(
            f"{BASE_URL}/api/admin/listings/toner/{CRG303_LISTING_ID}",
            json={"price": orig})


# --- BUG #3: AdminListingUpdate accepts expanded fields (smoke) ---
def test_admin_update_accepts_full_field_set_toner(admin_session):
    """Send many fields at once; should not 500 even though some may not exist."""
    r = requests.get(f"{BASE_URL}/api/listings/{CRG303_LISTING_ID}")
    orig = r.json()
    payload = {
        "brand": orig.get("brand"),
        "model_number": orig.get("model_number"),
        "page_yield": (orig.get("page_yield") or 2000),
        "color": orig.get("color") or "Black",
        "toner_type": orig.get("toner_type") or "Compatible",
        "warranty": orig.get("warranty") or "6 months",
        "gst_rate": orig.get("gst_rate") or 18,
    }
    r = admin_session.put(
        f"{BASE_URL}/api/admin/listings/toner/{CRG303_LISTING_ID}",
        json=payload)
    assert r.status_code == 200, r.text


def test_admin_update_invalid_kind(admin_session):
    r = admin_session.put(
        f"{BASE_URL}/api/admin/listings/widget/{CRG303_LISTING_ID}",
        json={"price": 100})
    assert r.status_code == 400


# --- REGRESSION: 3 protected dealers Active ---
def test_protected_dealers_active(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/suppliers")
    assert r.status_code == 200
    suppliers = r.json()
    by_email = {s.get("email"): s for s in suppliers}
    for email in ("support@digitaledgeindia.com",
                  "sairam@digitaledgeindia.com",
                  "sales@bigctech.com"):
        assert email in by_email, f"protected dealer missing: {email}"
        s = by_email[email]
        assert not s.get("is_suspended"), f"{email} is suspended!"
        assert s.get("approved_at"), f"{email} not approved"


# --- REGRESSION: public listing pages return 200 ---
@pytest.mark.parametrize("path", [
    "/api/listings/search?kind=toner&limit=5",
    "/api/printers?limit=5",
    "/api/papers?limit=5",
    "/api/consumables?limit=5",
    "/api/scanners?limit=5",
])
def test_public_listing_endpoints(path):
    r = requests.get(f"{BASE_URL}{path}")
    assert r.status_code == 200, f"{path}: {r.status_code}"
    data = r.json()
    assert isinstance(data, list) or isinstance(data, dict)
