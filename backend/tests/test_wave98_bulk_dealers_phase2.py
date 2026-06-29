"""Wave 98 — Backend tests.

Covers:
  - POST /api/admin/dealers/bulk-create — empty/valid/existing/duplicate-in-file
  - POST /api/auth/supplier-phase2 — 401 when unauth (code-review for success)
  - POST /api/auth/apply-seller — Phase 1 fields only (no business_address)
"""

import os
import uuid
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token") or (data.get("session") or {}).get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def existing_dealer_email(admin_headers):
    """Pick an existing supplier email to use for skipped_existing test."""
    r = requests.get(f"{BASE_URL}/api/admin/suppliers", headers=admin_headers, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch suppliers: {r.status_code}")
    items = r.json()
    if isinstance(items, dict):
        items = items.get("suppliers") or items.get("items") or []
    for s in items:
        em = (s.get("email") or "").lower()
        # avoid the admin email itself; pick any approved/non-admin supplier
        if em and em != ADMIN_EMAIL.lower():
            return em
    # Fallback to admin's own email — it should still trigger skipped_existing.
    return ADMIN_EMAIL.lower()


def _cleanup_dealer(admin_headers, email):
    """Best-effort: find user by email and delete."""
    try:
        r = requests.get(f"{BASE_URL}/api/admin/suppliers", headers=admin_headers, timeout=30)
        items = r.json() if r.status_code == 200 else []
        if isinstance(items, dict):
            items = items.get("suppliers") or items.get("items") or []
        for s in items:
            if (s.get("email") or "").lower() == email.lower():
                sid = s.get("id") or s.get("user_id")
                if sid:
                    # Try a few candidate delete endpoints — best-effort.
                    for url in [
                        f"{BASE_URL}/api/admin/dealers/{sid}/delete",
                        f"{BASE_URL}/api/admin/suppliers/{sid}/delete",
                        f"{BASE_URL}/api/admin/users/{sid}/delete",
                    ]:
                        try:
                            requests.post(url, headers=admin_headers, timeout=15)
                        except Exception:
                            pass
                    return
    except Exception:
        pass


# ---------- Tests: /api/admin/dealers/bulk-create ----------

class TestBulkCreateDealers:
    def test_unauth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create",
                          json={"rows": []}, timeout=20)
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"

    def test_empty_rows_returns_zero_counts(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create",
                          headers=admin_headers, json={"rows": []}, timeout=30)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("created") == 0
        assert d.get("skipped_existing") == 0
        assert d.get("failed") == 0
        assert d.get("emails_sent") == 0

    def test_single_valid_row_creates_dealer(self, admin_headers):
        rand = uuid.uuid4().hex[:8]
        email = f"qa-bulk-wave98-{rand}@example.com"
        try:
            r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create",
                              headers=admin_headers,
                              json={"rows": [{
                                  "business_name": "QA Test Bulk Dealer",
                                  "email": email,
                                  "phone": "9876543210",
                                  "city": "Bangalore",
                                  "gstin": "29ABCDE1234F1Z5",
                              }]},
                              timeout=60)
            assert r.status_code == 200, f"Got {r.status_code}: {r.text[:400]}"
            d = r.json()
            assert d.get("created") == 1, f"Expected created=1, got {d}"
            assert d.get("skipped_existing") == 0
            assert d.get("failed") == 0
            # emails_sent may be 0 if RESEND_API_KEY missing — that's fine.
            assert d.get("emails_sent", 0) >= 0

            # Verify response carries created_rows with user_id (Phase-1 row).
            crows = d.get("created_rows") or []
            assert len(crows) == 1, f"created_rows missing/wrong size: {d}"
            assert crows[0].get("email", "").lower() == email
            assert crows[0].get("user_id"), f"No user_id in created_rows: {crows}"
        finally:
            _cleanup_dealer(admin_headers, email)

    def test_existing_email_skipped(self, admin_headers, existing_dealer_email):
        rand = uuid.uuid4().hex[:8]
        new_email = f"qa-bulk-wave98-{rand}@example.com"
        try:
            r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create",
                              headers=admin_headers,
                              json={"rows": [
                                  {"business_name": "QA Test Bulk 1", "email": new_email,
                                   "phone": "9876543210", "city": "Bangalore",
                                   "gstin": "29ABCDE1234F1Z5"},
                                  {"business_name": "Existing Should Be Skipped",
                                   "email": existing_dealer_email,
                                   "phone": "9876543210", "city": "Bangalore",
                                   "gstin": "29ABCDE1234F1Z5"},
                              ]},
                              timeout=60)
            assert r.status_code == 200, f"Got {r.status_code}: {r.text[:400]}"
            d = r.json()
            assert d.get("skipped_existing") == 1, f"Expected skipped_existing=1, got {d}"
            # The new row should still be created
            assert d.get("created") == 1, f"Expected created=1 for new row, got {d}"
        finally:
            _cleanup_dealer(admin_headers, new_email)

    def test_duplicate_in_file_dedup(self, admin_headers):
        rand = uuid.uuid4().hex[:8]
        email = f"qa-bulk-wave98-dup-{rand}@example.com"
        try:
            r = requests.post(f"{BASE_URL}/api/admin/dealers/bulk-create",
                              headers=admin_headers,
                              json={"rows": [
                                  {"business_name": "QA Dup 1", "email": email,
                                   "phone": "9876543210", "city": "Bangalore"},
                                  {"business_name": "QA Dup 2", "email": email,
                                   "phone": "9876543210", "city": "Bangalore"},
                              ]},
                              timeout=60)
            assert r.status_code == 200, f"Got {r.status_code}: {r.text[:400]}"
            d = r.json()
            assert d.get("skipped_duplicate_in_file") == 1, f"Expected skipped_duplicate_in_file=1, got {d}"
        finally:
            _cleanup_dealer(admin_headers, email)


# ---------- Tests: /api/auth/supplier-phase2 ----------

class TestSupplierPhase2:
    def test_unauth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/auth/supplier-phase2",
                          json={"account_holder_name": "QA"}, timeout=20)
        assert r.status_code == 401, f"Expected 401 got {r.status_code}: {r.text[:200]}"


# ---------- Tests: /api/auth/apply-seller Phase-1 fields only ----------

@pytest.fixture(scope="module")
def customer_token():
    """Register a fresh customer for apply-seller test."""
    rand = uuid.uuid4().hex[:8]
    email = f"qa-cust-wave98-{rand}@example.com"
    password = "Test@1234"
    r = requests.post(f"{BASE_URL}/api/auth/signup-customer",
                      json={"email": email, "password": password, "name": "QA Wave98"},
                      timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"signup-customer failed: {r.status_code} {r.text[:200]}")
    # Login to obtain token (signup endpoints may not return tokens directly).
    lr = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": password}, timeout=30)
    if lr.status_code != 200:
        pytest.skip(f"customer login failed: {lr.status_code}")
    data = lr.json()
    tok = data.get("access_token") or data.get("token") or (data.get("session") or {}).get("access_token")
    if not tok:
        pytest.skip("no token in customer login response")
    return tok, email


class TestApplySellerPhase1Only:
    def test_phase1_only_accepted(self, customer_token):
        tok, email = customer_token
        headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        # Use a unique phone (last 10 digits of uuid → safe random number)
        import random
        phone = "9" + str(random.randint(100000000, 999999999))
        payload = {
            "business_name": "QA Wave98 Business",
            "contact_person": "QA Tester",
            "phone": phone,
            "city": "Bangalore",
            "state": "Karnataka",
            "pincode": "560001",
            "cities_served": ["Bangalore"],
            "gst_number": "29ABCDE1234F1Z5",
            "pan_number": "ABCDE1234F",
            "seller_types": ["Toners"],
            "agreed_to_terms": True,
            # NO business_address, no bank, no docs (Phase 1 only)
        }
        r = requests.post(f"{BASE_URL}/api/auth/apply-seller",
                          headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, f"Expected 200 (Wave98 Phase-1 only), got {r.status_code}: {r.text[:400]}"
