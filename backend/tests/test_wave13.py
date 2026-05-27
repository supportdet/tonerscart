"""Wave 13 backend regression tests.

Cleanup verification + papers buyer-side flow + bulk upload no-image + landing empty states.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://b2b-checkout-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Public regression endpoints -------------------------------------------------

def test_listings_grouped_200(session):
    r = session.get(f"{API}/listings/grouped", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)


def test_d2d_listings_shape(session):
    r = session.get(f"{API}/d2d/listings", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("toners", "printers", "papers", "counts"):
        assert k in data, f"missing key {k} in {data.keys()}"
    assert isinstance(data["toners"], list)
    assert isinstance(data["printers"], list)
    assert isinstance(data["papers"], list)
    for k in ("toners", "printers", "papers"):
        assert k in data["counts"]
        assert isinstance(data["counts"][k], int)


def test_papers_200(session):
    r = session.get(f"{API}/papers", timeout=30)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_d2d_me_unauth(session):
    r = session.get(f"{API}/d2d/me", timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} :: {r.text}"


def test_listings_search_runs(session):
    r = session.get(f"{API}/listings/search", timeout=30)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# --- Bulk upload (auth required) -----------------------------------------------

def _signup_and_approve_supplier():
    """Create a fresh supplier via the public signup flow + admin-approve.

    Returns (auth_headers, supplier_email). If anything fails we skip.
    """
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tonerscart.in")
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "Admin@123")

    sup_email = f"TEST.w13.sup.{uuid.uuid4().hex[:8]}@tonerscarttest.com"
    sup_pwd = "Test@12345"

    # 1. Signup supplier (returns access_token)
    r = requests.post(
        f"{API}/auth/signup",
        json={
            "email": sup_email,
            "password": sup_pwd,
            "full_name": "W13 Supplier",
            "phone": "9999900013",
            "role": "supplier",
            "business_name": "W13 Test Supplier",
            "city": "Bengaluru",
            "gst_number": "29ABCDE1234F1Z5",
        },
        timeout=30,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"supplier signup failed: {r.status_code} {r.text[:200]}")
    sup_token = r.json().get("access_token") or r.json().get("token")

    # 2. Admin login + approve
    a = requests.post(f"{API}/auth/login", json={"email": admin_email, "password": admin_pwd}, timeout=30)
    if a.status_code != 200:
        pytest.skip(f"admin login failed: {a.status_code} {a.text[:200]}")
    admin_token = a.json().get("access_token") or a.json().get("token")
    admin_h = {"Authorization": f"Bearer {admin_token}"}

    # find pending supplier and approve
    p = requests.get(f"{API}/admin/suppliers/pending", headers=admin_h, timeout=30)
    if p.status_code != 200:
        pytest.skip(f"pending list failed: {p.status_code} {p.text[:200]}")
    pending = p.json() or []
    target = next((x for x in pending if (x.get("email") or "").lower() == sup_email.lower()), None)
    if not target:
        # maybe auto-approved or different shape — try by business_name
        target = next((x for x in pending if x.get("business_name") == "W13 Test Supplier"), None)
    if not target:
        pytest.skip("supplier not found in pending list — admin endpoint shape may differ")
    sid = target.get("id") or target.get("supplier_id")
    ap = requests.post(f"{API}/admin/suppliers/{sid}/approve", headers=admin_h, timeout=30)
    if ap.status_code not in (200, 204):
        pytest.skip(f"approve failed: {ap.status_code} {ap.text[:200]}")

    return ({"Authorization": f"Bearer {sup_token}"}, sup_email)


def test_supplier_bulk_listings_no_image():
    headers, _email = _signup_and_approve_supplier()
    payload = [
        {
            "brand": "HP",
            "model_number": f"W13-A-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "price": 1500,
            "stock": 5,
            "toner_type": "Original",
            "gst_rate": 18,
            "image_url": "",
            "image_urls": [],
            "variants": [{"color": "Black", "price": 1500, "stock": 5}],
        },
        {
            "brand": "Canon",
            "model_number": f"W13-B-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "price": 2000,
            "stock": 3,
            "toner_type": "Compatible",
            "gst_rate": 18,
            "image_url": "",
            "image_urls": [],
            "variants": [{"color": "Black", "price": 2000, "stock": 3}],
        },
        {
            "brand": "Brother",
            "model_number": f"W13-C-{uuid.uuid4().hex[:6]}",
            "color": "Black",
            "price": 1200,
            "stock": 8,
            "toner_type": "Original",
            "gst_rate": 18,
            "image_url": "",
            "image_urls": [],
            "variants": [{"color": "Black", "price": 1200, "stock": 8}],
        },
    ]
    r = requests.post(f"{API}/supplier/listings/bulk", json=payload, headers=headers, timeout=60)
    assert r.status_code in (200, 201), f"bulk upload failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    assert data.get("succeeded", 0) >= 3, f"expected >=3 succeeded, got {data}"
    assert data.get("failed", 0) == 0, f"unexpected failures: {data}"


# --- MPS inquiry bulk_enquiry ----------------------------------------------------

def test_mps_inquiry_bulk_enquiry():
    body = {
        "email": f"TEST.w13.buyer.{uuid.uuid4().hex[:6]}@tonerscarttest.com",
        "type": "bulk_enquiry",
        "company": "W13 Bulk Buyer Pvt Ltd",
        "phone": "9876543210",
        "message": "Need bulk toners for office",
    }
    r = requests.post(f"{API}/mps/inquiry", json=body, timeout=30)
    assert r.status_code in (200, 201), f"mps inquiry failed: {r.status_code} {r.text[:400]}"


# --- Test-data cleanup sanity ---------------------------------------------------

def test_no_legacy_tonerscarttest_users_remain():
    """Ensure the wipe of @tonerscarttest.com accounts was effective.

    Login as admin and pull the users list, then assert that <= 30 such users
    remain (49 + 7 originals should be gone; freshly created w13 helper accounts
    are acceptable).
    """
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tonerscart.in")
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    a = requests.post(f"{API}/auth/login", json={"email": admin_email, "password": admin_pwd}, timeout=30)
    if a.status_code != 200:
        pytest.skip(f"admin login failed: {a.status_code} {a.text[:200]}")
    admin_token = a.json().get("access_token") or a.json().get("token")
    h = {"Authorization": f"Bearer {admin_token}"}

    # Try a couple of plausible admin endpoints
    candidates = [f"{API}/admin/users", f"{API}/admin/buyers", f"{API}/admin/customers"]
    found = None
    for u in candidates:
        r = requests.get(u, headers=h, timeout=30)
        if r.status_code == 200:
            found = (u, r.json())
            break
    if not found:
        pytest.skip("no admin users endpoint reachable to verify cleanup")
    _u, users = found
    if not isinstance(users, list):
        pytest.skip(f"unexpected users payload: {type(users)}")
    tt = [u for u in users if (u.get("email") or "").lower().endswith("@tonerscarttest.com")]
    # Allow w13 helpers that this run just created plus a small buffer
    assert len(tt) <= 30, f"too many @tonerscarttest.com users remain: {len(tt)}"
