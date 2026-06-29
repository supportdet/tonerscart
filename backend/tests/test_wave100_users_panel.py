"""Wave 100 — All-Users admin panel + bulk-dealer reclassification + supplier signup
relaxation. Hits the live preview URL. Always cleans up any QA buyers/dealers it
creates so the 8 named approved dealers stay untouched.
"""
import os
import secrets
import time
from typing import Optional

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://printer-supply-hub.preview.emergentagent.com"
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"
RUN_TAG = secrets.token_hex(4)


def _rand_email(prefix: str) -> str:
    return f"qa-{prefix}-{RUN_TAG}-{secrets.token_hex(2)}@example.com"


@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code}): {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------------------- /admin/users -------------------------------- #
class TestAdminUsersListing:
    def test_admin_users_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/users", timeout=20)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_admin_users_lists_with_required_fields(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "users" in body and "count" in body
        assert isinstance(body["users"], list)
        assert body["count"] == len(body["users"])
        assert body["count"] >= 1
        sample = body["users"][0]
        for field in ("id", "email", "role", "user_type", "created_at", "supplier_status", "is_protected"):
            assert field in sample, f"missing field {field} in {list(sample.keys())}"
        # At least one approved supplier should be flagged is_protected
        protected = [u for u in body["users"] if u.get("is_protected")]
        assert len(protected) >= 1, "expected at least one approved-dealer protected user"
        assert all(u.get("supplier_status") == "approved" for u in protected)


# ---- Delete approved dealer is blocked (8 named dealers untouched) ------- #
class TestAdminUsersDeleteProtection:
    def test_delete_approved_dealer_is_blocked(self, admin_headers):
        # Pick any approved dealer's user_id via /admin/users
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30).json()
        approved = [u for u in r["users"] if u.get("is_protected")]
        assert approved, "no approved dealer found to test protection"
        target = approved[0]
        uid = target["id"]
        # DELETE must be refused
        d = requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=admin_headers, timeout=30)
        assert d.status_code == 403, f"expected 403, got {d.status_code}: {d.text[:300]}"
        body = d.json()
        detail = (body.get("detail") or body.get("message") or "").lower()
        assert "cannot be deleted" in detail or "approved dealer" in detail
        # Their /admin/users row must still be present
        r2 = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30).json()
        assert any(u["id"] == uid for u in r2["users"]), "approved dealer row was deleted!"
        # Their suppliers row must still exist (sanity via /admin/suppliers)
        sups = requests.get(f"{BASE_URL}/api/admin/suppliers", headers=admin_headers, timeout=30).json()
        assert any(s.get("user_id") == uid for s in sups), "suppliers row missing for approved dealer after blocked delete!"


# ----- Delete fresh buyer → email becomes free to re-register -------------- #
class TestAdminUsersDeleteRoundtrip:
    def test_signup_delete_resignup(self, admin_headers):
        email = _rand_email("delete")
        password = "Demo123!"
        # 1. Register fresh QA buyer
        signup_payload = {
            "email": email,
            "password": password,
            "name": "QA Wave100 Delete",
            "phone": f"9{secrets.randbelow(900000000) + 100000000}",
            "user_type": "personal",
        }
        s1 = requests.post(f"{BASE_URL}/api/auth/signup-customer", json=signup_payload, timeout=30)
        assert s1.status_code == 200, f"signup-customer 1 failed: {s1.status_code} {s1.text[:300]}"
        # 2. Find uid via /admin/users
        ulist = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30).json()["users"]
        match = [u for u in ulist if (u.get("email") or "").lower() == email.lower()]
        assert match, f"new user {email} not visible in /admin/users"
        uid = match[0]["id"]
        # 3. Delete
        d = requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=admin_headers, timeout=30)
        assert d.status_code == 200, f"delete failed: {d.status_code} {d.text[:300]}"
        # Give Supabase Auth a moment to propagate the delete
        time.sleep(1.5)
        # 4. Re-register same email → must succeed (email free again)
        s2 = requests.post(f"{BASE_URL}/api/auth/signup-customer", json=signup_payload, timeout=30)
        assert s2.status_code == 200, f"re-signup failed: {s2.status_code} {s2.text[:300]}"
        # Cleanup: delete the second account too
        ulist2 = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30).json()["users"]
        m2 = [u for u in ulist2 if (u.get("email") or "").lower() == email.lower()]
        if m2:
            try:
                requests.delete(f"{BASE_URL}/api/admin/users/{m2[0]['id']}", headers=admin_headers, timeout=20)
            except Exception:
                pass


# --- Bulk-create reclassification: existing email = skipped_existing ------ #
class TestBulkDealerSkippedExisting:
    def test_existing_admin_email_classified_as_skipped(self, admin_headers):
        rows = [{
            "business_name": "QA Wave100 Dup",
            "email": ADMIN_EMAIL,  # already exists (admin)
            "phone": "9000000000",
            "city": "BLR",
            "gstin": "",
        }]
        r = requests.post(
            f"{BASE_URL}/api/admin/dealers/bulk-create",
            json={"rows": rows},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("created") == 0, f"created should be 0, got {body.get('created')}"
        assert body.get("skipped_existing") == 1, f"skipped_existing should be 1, got {body.get('skipped_existing')} | {body}"
        # 'failed' should be 0 (was 1 pre-Wave-100)
        assert (body.get("failed") or 0) == 0, f"failed should be 0 (Wave 100 reclassification), got {body.get('failed')}"
        # Reason string must mention 'already'
        skipped = body.get("skipped_existing_rows") or body.get("skipped_rows") or []
        if skipped:
            reason = (skipped[0].get("reason") or "").lower()
            assert "already" in reason, f"expected 'already' in reason, got: {reason}"


# --- signup-supplier without business_address (Wave 100: now Optional) ---- #
class TestSupplierSignupOptionalAddress:
    def test_signup_supplier_without_business_address(self, admin_headers):
        email = _rand_email("dealer")
        payload = {
            "email": email,
            "password": "Demo123!",
            "contact_person": "QA Test",
            "phone": f"+91 9{secrets.randbelow(900000000) + 100000000}",
            "business_name": f"QA Wave100 {RUN_TAG}",
            "city": "Bangalore",
            # NO business_address — Wave 100 made it Optional
        }
        r = requests.post(f"{BASE_URL}/api/auth/signup-supplier", json=payload, timeout=45)
        assert r.status_code != 422, f"422 means business_address still required! body={r.text[:400]}"
        assert r.status_code == 200, f"signup-supplier failed: {r.status_code} {r.text[:400]}"
        # cleanup
        try:
            ulist = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30).json()["users"]
            m = [u for u in ulist if (u.get("email") or "").lower() == email.lower()]
            if m:
                requests.delete(f"{BASE_URL}/api/admin/users/{m[0]['id']}", headers=admin_headers, timeout=20)
        except Exception:
            pass
