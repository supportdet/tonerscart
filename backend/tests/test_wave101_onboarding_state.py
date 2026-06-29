"""Wave 101 — Dealer onboarding state machine end-to-end test.

Flow: signup-supplier (creates pending row with status=pending — legacy
single-step path) vs apply-seller with submit_for_review=False (status=draft)
→ submit-for-review (draft → pending) → admin-approve (pending → approved).

This file uses the LIVE preview URL via REACT_APP_BACKEND_URL.
"""
import os
import time
import uuid
import requests

# Read REACT_APP_BACKEND_URL from frontend/.env
def _load_backend_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not found in frontend/.env")

BASE = _load_backend_url().rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"

RUN_TAG = uuid.uuid4().hex[:8]


def _signup_customer(email: str, password: str, name: str = "QA Test", phone: str = "+91 9999999999"):
    r = requests.post(f"{API}/auth/signup-customer", json={
        "email": email, "password": password, "name": name, "phone": phone,
    }, timeout=30)
    r.raise_for_status()
    return r.json()


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _me(token: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def _apply_seller(token: str, submit_for_review: bool = False):
    payload = {
        "business_name": f"QA Dealer {RUN_TAG}",
        "contact_person": "QA Tester",
        "phone": f"+91 9000{int(time.time() * 1000) % 1000000:06d}",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "cities_served": ["Bangalore"],
        "gst_number": "29ABCDE1234F1Z5",
        "pan_number": "ABCDE1234F",
        "annual_turnover": None,
        "years_in_business": None,
        "business_address": "Test address, Bangalore",
        "seller_types": ["Compatible"],
        "compatible_brands": ["HP"],
        "testing_before_delivery": True,
        "agreed_to_terms": True,
        "submit_for_review": submit_for_review,
    }
    r = requests.post(f"{API}/auth/apply-seller", json=payload,
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def _submit_for_review(token: str):
    r = requests.post(f"{API}/auth/submit-for-review",
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
    return r


def _delete_user(admin_token: str, uid: str):
    requests.delete(f"{API}/admin/users/{uid}",
                    headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)


def test_onboarding_state_machine_draft_to_pending():
    """apply-seller(submit_for_review=False) → status=draft.
    submit-for-review → status=pending."""
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    email = f"qa-onb-draft-{RUN_TAG}-{uuid.uuid4().hex[:6]}@example.com"
    password = "Test@1234"
    uid = None
    try:
        signup = _signup_customer(email, password)
        uid = signup["user_id"]

        token = _login(email, password)
        me = _me(token)
        assert me["application_status"] is None, f"Expected null app status, got {me.get('application_status')}"

        # 1. apply-seller with submit_for_review=False → status=draft
        result = _apply_seller(token, submit_for_review=False)
        assert result["status"] == "draft", f"Expected status=draft, got {result.get('status')}"

        me = _me(token)
        assert me["application_status"] == "draft", f"After apply-seller(submit=False): expected draft, got {me.get('application_status')}"

        # 2. submit-for-review → status=pending
        r = _submit_for_review(token)
        assert r.status_code == 200, f"submit-for-review failed: {r.status_code} {r.text}"
        assert r.json()["status"] == "pending"

        me = _me(token)
        assert me["application_status"] == "pending", f"After submit-for-review: expected pending, got {me.get('application_status')}"

        # 3. submit-for-review is idempotent — re-call returns pending without error
        r2 = _submit_for_review(token)
        assert r2.status_code == 200
        assert r2.json()["status"] == "pending"
    finally:
        if uid:
            _delete_user(admin_token, uid)


def test_submit_without_draft_returns_404():
    """submit-for-review with NO draft row → 404."""
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    email = f"qa-onb-nodraft-{RUN_TAG}-{uuid.uuid4().hex[:6]}@example.com"
    password = "Test@1234"
    uid = None
    try:
        signup = _signup_customer(email, password)
        uid = signup["user_id"]
        token = _login(email, password)
        r = _submit_for_review(token)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
    finally:
        if uid:
            _delete_user(admin_token, uid)


def test_me_returns_bank_and_doc_fields_in_draft():
    """When user is in draft state, /auth/me must return bank + doc fields so
    the Phase2Banner can correctly compute completeness."""
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    email = f"qa-onb-medraft-{RUN_TAG}-{uuid.uuid4().hex[:6]}@example.com"
    password = "Test@1234"
    uid = None
    try:
        signup = _signup_customer(email, password)
        uid = signup["user_id"]
        token = _login(email, password)
        _apply_seller(token, submit_for_review=False)
        me = _me(token)
        assert me["application_status"] == "draft"
        app = me.get("application") or {}
        # These fields must exist (even if null) so Phase2Banner can read them.
        for key in (
            "account_holder_name", "account_number", "ifsc_code", "bank_name", "bank_branch",
            "doc_gst", "doc_pan", "doc_id_proof", "doc_address_proof", "doc_bank_proof",
            "doc_brand_authorization", "seller_types",
        ):
            assert key in app, f"/auth/me application missing field: {key}. Got keys: {list(app.keys())}"
        # Bank should be empty, no docs uploaded yet.
        assert not app.get("account_number")
        assert not app.get("doc_gst")
        # seller_types was set on apply-seller
        assert app.get("seller_types") == ["Compatible"]
    finally:
        if uid:
            _delete_user(admin_token, uid)


def test_apply_seller_submit_true_goes_straight_to_pending():
    """Backwards compat: apply-seller with submit_for_review=True should
    short-circuit straight to pending (no draft step)."""
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    email = f"qa-onb-direct-{RUN_TAG}-{uuid.uuid4().hex[:6]}@example.com"
    password = "Test@1234"
    uid = None
    try:
        signup = _signup_customer(email, password)
        uid = signup["user_id"]
        token = _login(email, password)
        result = _apply_seller(token, submit_for_review=True)
        assert result["status"] == "pending", f"Expected pending, got {result.get('status')}"
        me = _me(token)
        assert me["application_status"] == "pending"
    finally:
        if uid:
            _delete_user(admin_token, uid)


def test_admin_pending_queue_excludes_drafts():
    """Drafts must NOT appear in the /admin/suppliers/pending queue."""
    admin_token = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    email = f"qa-onb-queue-{RUN_TAG}-{uuid.uuid4().hex[:6]}@example.com"
    password = "Test@1234"
    uid = None
    try:
        signup = _signup_customer(email, password)
        uid = signup["user_id"]
        token = _login(email, password)
        _apply_seller(token, submit_for_review=False)  # → draft

        # Admin pending queue must NOT contain this user.
        r = requests.get(f"{API}/admin/suppliers/pending",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        r.raise_for_status()
        rows = r.json()
        assert all(row.get("user_id") != uid for row in rows), \
            f"Draft user {email} ({uid}) appeared in /admin/suppliers/pending queue!"

        # After submit-for-review, the user MUST appear in the queue.
        _submit_for_review(token)
        r = requests.get(f"{API}/admin/suppliers/pending",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        r.raise_for_status()
        rows = r.json()
        assert any(row.get("user_id") == uid for row in rows), \
            f"After submit-for-review, user {email} ({uid}) NOT in /admin/suppliers/pending!"
    finally:
        if uid:
            _delete_user(admin_token, uid)


if __name__ == "__main__":
    print(f"BASE={BASE}")
    test_onboarding_state_machine_draft_to_pending()
    print("PASS: state machine draft → pending")
    test_submit_without_draft_returns_404()
    print("PASS: submit without draft → 404")
    test_me_returns_bank_and_doc_fields_in_draft()
    print("PASS: /auth/me returns bank + doc fields in draft")
    test_apply_seller_submit_true_goes_straight_to_pending()
    print("PASS: submit_for_review=True bypasses draft")
    test_admin_pending_queue_excludes_drafts()
    print("PASS: admin pending queue excludes drafts; includes after submit")
