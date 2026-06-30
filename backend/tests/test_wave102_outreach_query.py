"""Wave 102 backend tests:
- /api/admin/dealers/outreach-funnel basic structure
- /api/admin/dealers/bulk-create audit_log fix (no crash, dealer appears in funnel)
- /api/supplier/raise-query auth + payload contract
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend env to mirror what user sees
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- Outreach funnel ---
def test_outreach_funnel_returns_six_stages(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/dealers/outreach-funnel", headers=admin_headers, timeout=60)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "stages" in data and "dealers" in data
    keys = [s["key"] for s in data["stages"]]
    expected = ["invited", "signed_in", "business_details", "docs_uploaded", "submitted_for_review", "approved"]
    assert keys == expected, f"unexpected stage keys: {keys}"
    for s in data["stages"]:
        assert "count" in s and isinstance(s["count"], int)


def test_outreach_funnel_requires_admin():
    r = requests.get(f"{BASE_URL}/api/admin/dealers/outreach-funnel", timeout=20)
    assert r.status_code in (401, 403)


# --- Bulk-create + audit_log fix ---
def test_bulk_create_inserts_audit_log_and_shows_in_funnel(admin_headers):
    test_email = f"test_wave102_{uuid.uuid4().hex[:8]}@tonerscart-qa.com"
    payload = {"rows": [{"email": test_email, "business_name": "TEST_W102_Dealer", "phone": "9000000000", "city": "Bangalore"}]}
    r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create", headers=admin_headers, json=payload, timeout=60)
    assert r.status_code == 200, f"bulk-create failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    assert body.get("created", 0) >= 1 or body.get("skipped_existing", 0) >= 1, body
    # Allow a moment for audit_log row visibility
    time.sleep(1.0)

    created_uid = None
    for row in body.get("created_rows", []):
        if (row.get("email") or "").lower() == test_email.lower():
            created_uid = row.get("user_id")
            break

    funnel = requests.get(f"{BASE_URL}/api/admin/dealers/outreach-funnel", headers=admin_headers, timeout=60).json()
    dealers = funnel.get("dealers", []) or []
    emails = {(d.get("email") or "").lower() for d in dealers}
    assert test_email.lower() in emails, (
        f"newly created dealer {test_email} not in funnel dealers (audit_log insert may have failed). "
        f"Sample emails: {list(emails)[:5]}"
    )
    invited_count = next((s["count"] for s in funnel["stages"] if s["key"] == "invited"), 0)
    assert invited_count >= 1

    # CLEANUP: delete the test user so we don't pollute prod
    if created_uid:
        try:
            requests.delete(f"{BASE_URL}/api/admin/users/{created_uid}", headers=admin_headers, timeout=30)
        except Exception:
            pass


# --- Raise a query ---
def test_raise_query_requires_auth():
    r = requests.post(f"{BASE_URL}/api/supplier/raise-query", json={"subject": "x", "message": "y"}, timeout=20)
    assert r.status_code in (401, 403)


def test_raise_query_validates_empty_payload(admin_headers):
    # Admin is not a supplier, but the body validation runs first (422 on empty strings).
    r = requests.post(f"{BASE_URL}/api/supplier/raise-query", headers=admin_headers, json={"subject": "", "message": ""}, timeout=20)
    assert r.status_code in (400, 422), r.text[:200]


def test_raise_query_rejects_admin_non_supplier(admin_headers):
    """Wave 102 added role gating: only approved suppliers can raise a query. Admin must get 403."""
    r = requests.post(
        f"{BASE_URL}/api/supplier/raise-query",
        headers=admin_headers,
        json={"subject": "TEST_W102 ping", "message": "Automated wave102 regression test - please ignore."},
        timeout=60,
    )
    assert r.status_code == 403, r.text[:300]
    body = r.json()
    assert "approved dealers" in (body.get("detail") or "").lower()
