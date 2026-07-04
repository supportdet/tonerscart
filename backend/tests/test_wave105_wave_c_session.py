"""Wave 105-C — Session security: server-side logout invalidation.

Requires live preview URL + admin credentials from test_credentials.md.
"""
import os
import sys
import requests
import pytest

# Read the preview URL from frontend/.env (single source of truth).
_FE_ENV = "/app/frontend/.env"
API_URL = None
with open(_FE_ENV) as f:
    for line in f:
        if line.strip().startswith("REACT_APP_BACKEND_URL="):
            API_URL = line.split("=", 1)[1].strip()
            break
if not API_URL:
    pytest.skip("REACT_APP_BACKEND_URL not found in frontend/.env", allow_module_level=True)

# Admin creds from /app/memory/test_credentials.md
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


def _login():
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login unavailable (HTTP {r.status_code}) — skipping")
    return r.json()["access_token"]


class TestLogout:
    def test_unauth_logout_ok(self):
        """Logout without a token still returns 200 (idempotent)."""
        r = requests.post(f"{API_URL}/api/auth/logout", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_bad_token_logout_ok(self):
        """Logout with garbage token returns 200 (best-effort revoke)."""
        r = requests.post(f"{API_URL}/api/auth/logout",
                          headers={"Authorization": "Bearer garbage_token"},
                          timeout=10)
        assert r.status_code == 200

    def test_logout_invalidates_session(self):
        """Real admin session: login → /auth/me ok → logout → /auth/me 401."""
        tok = _login()
        h = {"Authorization": f"Bearer {tok}"}
        r1 = requests.get(f"{API_URL}/api/auth/me", headers=h, timeout=10)
        assert r1.status_code == 200, f"pre-logout /me should be 200, got {r1.status_code}"

        r_out = requests.post(f"{API_URL}/api/auth/logout", headers=h, timeout=10)
        assert r_out.status_code == 200

        r2 = requests.get(f"{API_URL}/api/auth/me", headers=h, timeout=10)
        assert r2.status_code == 401, f"post-logout /me should be 401, got {r2.status_code}"
