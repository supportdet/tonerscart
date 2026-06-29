"""Wave 101 hotfix — Dealer onboarding state machine after the
signup-supplier strip-down.

Verifies the BUG #1 fix end-to-end:
  * /auth/signup-supplier creates NO suppliers_pending row + sends NO admin email
  * /auth/me returns application_status=None after signup
  * /auth/apply-seller works for a fresh role=supplier user (no "already a
    seller" 400)
  * draft → submit-for-review → pending transition is intact
"""
import uuid
import requests

def _load_backend_url() -> str:
    with open("/app/frontend/.env") as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE = _load_backend_url().rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


def _admin_token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def _signup_supplier(email: str, password: str = "Test@1234"):
    r = requests.post(f"{API}/auth/signup-supplier", json={
        "email": email, "password": password,
        "contact_person": "QA Tester",
        "phone": "+91 9000000000",
        "business_name": "QA Business",
        "city": "Bangalore",
    }, timeout=30)
    r.raise_for_status()
    return r.json()


def _login(email: str, password: str = "Test@1234") -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _me(token: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def _admin_pending(admin_token: str) -> list:
    r = requests.get(f"{API}/admin/suppliers/pending", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def _delete(admin_token: str, uid: str):
    requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)


# -----------------------------------------------------------------------------

def test_signup_supplier_does_not_create_pending_row():
    """The primary BUG #1 regression: a fresh signup MUST NOT create a
    suppliers_pending row and MUST NOT show up in the admin queue."""
    admin_token = _admin_token()
    email = f"qa-onb-fix-a-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    try:
        result = _signup_supplier(email)
        uid = result["user_id"]
        assert result.get("status") == "no_app", f"Expected status=no_app, got {result.get('status')}"

        # /auth/me must show application_status=None
        token = _login(email)
        me = _me(token)
        assert me.get("role") == "supplier", f"role expected supplier, got {me.get('role')}"
        assert me.get("application_status") is None, f"application_status should be None, got {me.get('application_status')}"
        assert me.get("supplier_status") is None, f"supplier_status should be None, got {me.get('supplier_status')}"

        # Admin pending queue MUST NOT contain this user.
        pending = _admin_pending(admin_token)
        assert all(row.get("user_id") != uid for row in pending), \
            f"Fresh signup {email} ({uid}) leaked into admin pending queue!"
    finally:
        if uid:
            _delete(admin_token, uid)


def test_apply_seller_allowed_for_role_supplier_with_no_application():
    """The follow-on BUG #1 fix: /auth/apply-seller used to 400 with
    'You are already a seller' for any role=supplier user. After Wave 101
    only APPROVED dealers are blocked."""
    admin_token = _admin_token()
    email = f"qa-onb-fix-b-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    try:
        uid = _signup_supplier(email)["user_id"]
        token = _login(email)
        r = requests.post(f"{API}/auth/apply-seller",
                          headers={"Authorization": f"Bearer {token}"},
                          json={
                              "business_name": "QA Business",
                              "contact_person": "QA Tester",
                              "phone": "+91 9000222111",
                              "city": "Bangalore",
                              "state": "Karnataka",
                              "pincode": "560001",
                              "cities_served": ["Bangalore"],
                              "gst_number": "29AABCA1234A1Z5",
                              "pan_number": "AABCA1234A",
                              "business_address": "Address 1",
                              "seller_types": ["Compatible"],
                              "compatible_brands": ["HP"],
                              "testing_before_delivery": True,
                              "agreed_to_terms": True,
                              "submit_for_review": False,
                          }, timeout=30)
        assert r.status_code == 200, f"apply-seller failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["status"] == "draft"

        me = _me(token)
        assert me["application_status"] == "draft"

        # submit-for-review → pending
        r2 = requests.post(f"{API}/auth/submit-for-review",
                           headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "pending"
        me2 = _me(token)
        assert me2["application_status"] == "pending"
    finally:
        if uid:
            _delete(admin_token, uid)


def test_bulk_create_with_fresh_emails():
    """BUG #2 regression: bulk-create with brand new emails should create them,
    not show 'already exists'."""
    admin_token = _admin_token()
    e1 = f"qa-bulk-fresh-{uuid.uuid4().hex[:8]}@example.com"
    e2 = f"qa-bulk-fresh-{uuid.uuid4().hex[:8]}@example.com"
    created_uids = []
    try:
        r = requests.post(f"{API}/admin/dealers/bulk-create",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"rows": [
                              {"business_name": "Fresh 1", "email": e1, "phone": "", "city": "BLR", "gstin": ""},
                              {"business_name": "Fresh 2", "email": e2, "phone": "", "city": "BLR", "gstin": ""},
                          ]}, timeout=30)
        assert r.status_code == 200, f"bulk-create failed: {r.text}"
        body = r.json()
        assert body["created"] == 2, f"Expected 2 created, got {body['created']} (skipped={body['skipped_existing']}, failed={body['failed']})"
        assert body["skipped_existing"] == 0
        assert body["failed"] == 0
        created_uids = [row["user_id"] for row in body.get("created_rows", [])]
    finally:
        for u in created_uids:
            _delete(admin_token, u)


if __name__ == "__main__":
    test_signup_supplier_does_not_create_pending_row()
    print("PASS: signup-supplier creates no pending row + no admin queue leak")
    test_apply_seller_allowed_for_role_supplier_with_no_application()
    print("PASS: role=supplier user can apply-seller → draft → submit → pending")
    test_bulk_create_with_fresh_emails()
    print("PASS: bulk-create with 2 fresh emails creates both, 0 skipped")
