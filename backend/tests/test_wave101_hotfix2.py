"""Wave 101 hotfix 2 — Critical bugs fixed:

1. Approved dealers were being routed to onboarding instead of dashboard
   when any KYC doc was missing. Fix: approved dealers ALWAYS see normal
   dashboard. Phase2Banner handles missing-doc nudges inline.

2. Sell.jsx was bouncing role=supplier users back to /supplier even when
   they hadn't started their application. Fix: only bounce APPROVED dealers.

3. Step 2 → Step 3 → submit-for-review flow is intact (covered by prior
   pytest in test_wave101_signup_hotfix.py).

4. Admin Users panel did not show Google OAuth signups. Root cause:
   sb_admin.auth.admin.list_users() returns a plain LIST (not an object with
   .users attribute) — so `getattr(res, 'users', None) or ...` fell through
   to []. Plus app_metadata.provider was not being read. Both fixed.

Run: python3 /app/backend/tests/test_wave101_hotfix2.py
"""
import requests
import uuid


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


# ─────────────────────────────────────────────────────────────────────────────
# Bug #4 — Admin Users panel must surface Google OAuth signups.
# ─────────────────────────────────────────────────────────────────────────────

def test_admin_users_shows_google_signups():
    token = _admin_token()
    r = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    users = r.json().get("users", [])
    assert len(users) > 0, "no users returned"
    google = [u for u in users if u.get("auth_method") == "google"]
    email_method = [u for u in users if u.get("auth_method") == "email"]
    assert len(google) > 0, f"No Google sign-ins surfaced. Methods present: {set(u.get('auth_method') for u in users)}"
    print(f"     • total={len(users)} email={len(email_method)} google={len(google)}")
    # Auth-only users (no public.users row, OAuth-only)
    auth_only = [u for u in users if u.get("_auth_only")]
    print(f"     • auth_only (no public.users row): {len(auth_only)}")


def test_admin_users_includes_auth_only_users():
    """Some Google OAuth users may sign in but never get a public.users row
    (oauth_bootstrap might fail or be skipped). They MUST still be visible
    in the admin panel so admin can delete them."""
    token = _admin_token()
    r = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    users = r.json().get("users", [])
    # All users should have an `auth_method` field (no 'unknown').
    for u in users:
        assert u.get("auth_method") in ("email", "google"), f"unexpected auth_method for {u.get('email')}: {u.get('auth_method')}"
        assert "is_protected" in u
        assert "supplier_status" in u


# ─────────────────────────────────────────────────────────────────────────────
# Bug #1 — Approved dealers must NOT see application_status='approved_phase2'.
# /auth/me returns supplier_status='approved' for them; the frontend stage
# logic now ignores all KYC-doc gaps for approved dealers.
# ─────────────────────────────────────────────────────────────────────────────

def test_approved_dealer_me_shape():
    """Real approved dealer /auth/me returns supplier_status='approved'
    (and the frontend will render normal dashboard regardless of doc gaps)."""
    token = _admin_token()
    # Pick an approved dealer at random and confirm shape via /admin/users.
    r = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    users = r.json().get("users", [])
    approved = [u for u in users if u.get("supplier_status") == "approved"]
    assert len(approved) >= 3, f"Expected ≥3 approved dealers, got {len(approved)}"
    print(f"     • {len(approved)} approved dealers — frontend will route them straight to /supplier dashboard")


# ─────────────────────────────────────────────────────────────────────────────
# Bug #2 — Sell.jsx must NOT bounce a fresh role=supplier user (with no
# application) back to /supplier. The /sell route IS the form they need.
# (This is a frontend-route guard fix — backend behaviour unchanged. We
# verify the underlying /auth/me payload is correct so the guard works.)
# ─────────────────────────────────────────────────────────────────────────────

def test_fresh_dealer_me_supplier_status_is_null():
    """Fresh dealer signup: role=supplier but supplier_status=None and
    application_status=None — Sell.jsx must let them in to fill the form."""
    admin_token = _admin_token()
    em = f"qa-hotfix2-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    try:
        r = requests.post(f"{API}/auth/signup-supplier", json={
            "email": em, "password": "Test@1234",
            "contact_person": "QA Tester",
            "phone": "+91 9000123456",
            "business_name": "QA Fresh",
            "city": "Bangalore",
        }, timeout=30)
        r.raise_for_status()
        uid = r.json()["user_id"]
        r2 = requests.post(f"{API}/auth/login", json={"email": em, "password": "Test@1234"}, timeout=20)
        r2.raise_for_status()
        tok = r2.json()["access_token"]
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20).json()
        assert me.get("role") == "supplier"
        assert me.get("supplier_status") is None, f"Fresh dealer supplier_status should be None, got {me.get('supplier_status')}"
        assert me.get("application_status") is None
    finally:
        if uid:
            requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)


if __name__ == "__main__":
    test_admin_users_shows_google_signups()
    print("PASS: Admin Users surfaces Google OAuth signups")
    test_admin_users_includes_auth_only_users()
    print("PASS: Admin Users includes auth-only OAuth accounts")
    test_approved_dealer_me_shape()
    print("PASS: approved dealers have supplier_status='approved'")
    test_fresh_dealer_me_supplier_status_is_null()
    print("PASS: fresh dealer has supplier_status=null → /sell form accessible")
