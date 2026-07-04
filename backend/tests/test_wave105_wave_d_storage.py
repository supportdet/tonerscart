"""Wave 105-D — Supabase storage audit + dealer isolation on document paths.

Verifies:
  - `supplier-documents` bucket is private (sensitive KYC).
  - `product-images` / `printer-images` are public (marketplace photos).
  - No accidental long-lived signed URL TTL in code (>1h).
  - Dealer cannot inject a foreign-user path via /auth/supplier-documents
    or /auth/supplier-phase2 — must always live under `{user.id}/...`.
  - No server-only secrets leaked into frontend/.env or bundled source.
"""
import os
import re
import sys
import pathlib
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
    pytest.skip("REACT_APP_BACKEND_URL not found", allow_module_level=True)

ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"

# Make backend/ importable.
_THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_THIS, "..")))


def _admin_token():
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login unavailable (HTTP {r.status_code})")
    return r.json()["access_token"]


class TestBucketPrivacy:
    def test_supplier_documents_is_private(self):
        from supabase_client import sb_admin
        buckets = sb_admin.storage.list_buckets()
        found = {}
        for b in buckets:
            name = getattr(b, "name", None) or (b.get("name") if isinstance(b, dict) else None)
            public = getattr(b, "public", None)
            if public is None and isinstance(b, dict):
                public = b.get("public")
            if name:
                found[name] = public
        # KYC docs MUST be private
        assert found.get("supplier-documents") is False, \
            f"supplier-documents must be private, got public={found.get('supplier-documents')}"
        # product buckets are intentionally public (marketplace photos)
        for pub_name in ("product-images", "printer-images"):
            if pub_name in found:
                assert found[pub_name] is True, f"{pub_name} should be public"


class TestSignedUrlTTL:
    """Grep the source for any signed-URL TTL longer than 60 min (3600s).
    Anything larger is a security smell — signed URLs get cached, forwarded,
    logged. TTL should be short enough that stolen links auto-expire."""

    def test_no_long_lived_signed_urls(self):
        backend_dir = pathlib.Path("/app/backend")
        # Match `create_signed_url(<path>, <TTL>)` — extract the numeric TTL.
        rx = re.compile(r"create_signed_url\([^,]+,\s*([0-9\*\s]+)")
        offenders = []
        for py in backend_dir.rglob("*.py"):
            if "__pycache__" in str(py) or "/tests/" in str(py):
                continue
            for i, line in enumerate(py.read_text().splitlines(), start=1):
                m = rx.search(line)
                if not m:
                    continue
                # Evaluate the arithmetic expression (safe — only digits + * + spaces)
                try:
                    ttl = eval(m.group(1), {"__builtins__": {}}, {})
                except Exception:
                    continue
                if ttl > 3600:
                    offenders.append(f"{py.relative_to(backend_dir)}:{i} — TTL={ttl}s ({ttl//60}min)")
        assert not offenders, "Found signed URLs with TTL > 60 min:\n" + "\n".join(offenders)


class TestDealerIsolation:
    def test_supplier_documents_rejects_foreign_path(self):
        """POST /auth/supplier-documents with doc_gst pointing to another
        dealer's path → 400 'Invalid document path'."""
        tok = _admin_token()
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = requests.post(f"{API_URL}/api/auth/supplier-documents",
                          json={"doc_gst": "some-other-uuid/leak.pdf"},
                          headers=h, timeout=10)
        assert r.status_code == 400
        assert "Invalid document path" in r.text

    def test_supplier_documents_accepts_own_path(self):
        """A doc_gst with the caller's own {user.id}/... prefix is accepted
        (payload passes validation — the DB update may hit an unrelated
        constraint since admin has no supplier row, but the 400 path guard
        no longer fires)."""
        tok = _admin_token()
        # Fetch caller uid via /auth/me
        me = requests.get(f"{API_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {tok}"},
                          timeout=10).json()
        uid = me["id"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = requests.post(f"{API_URL}/api/auth/supplier-documents",
                          json={"doc_gst": f"{uid}/valid-doc.pdf"},
                          headers=h, timeout=10)
        # 200 (accepted) or 500 (admin has no suppliers_pending row) — but NOT 400
        assert r.status_code != 400 or "Invalid document path" not in r.text


class TestEnvLeakAudit:
    def test_frontend_env_only_public_keys(self):
        """frontend/.env must contain ONLY REACT_APP_* keys or well-known
        build-tool flags — never server-side secrets."""
        allowed_prefixes = ("REACT_APP_",)
        allowed_names = {"WDS_SOCKET_PORT", "ENABLE_HEALTH_CHECK"}
        forbidden = ("SERVICE_ROLE", "SERVICE_KEY", "TWILIO_AUTH",
                     "STRIPE_SECRET", "RESEND_API_KEY", "SMTP_PASS",
                     "MONGO_URL", "EMERGENT_LLM_KEY", "JWT_SECRET")

        with open("/app/frontend/.env") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                key = s.split("=", 1)[0].strip()
                # No forbidden keys anywhere in the line
                for bad in forbidden:
                    assert bad not in s, f"frontend/.env leaks {bad}: {s}"
                # Every key must be public-safe
                if not (key.startswith(allowed_prefixes) or key in allowed_names):
                    pytest.fail(f"Unrecognised key in frontend/.env: {key}")

    def test_frontend_src_no_server_secrets(self):
        """grep frontend/src for accidental server-only secret references."""
        forbidden = ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
                     "RESEND_API_KEY", "STRIPE_SECRET_KEY",
                     "TWILIO_AUTH_TOKEN", "EMERGENT_LLM_KEY", "JWT_SECRET")
        src = pathlib.Path("/app/frontend/src")
        offenders = []
        for f in src.rglob("*.js*"):
            txt = f.read_text(errors="ignore")
            for bad in forbidden:
                if bad in txt:
                    offenders.append(f"{f.relative_to(src)} contains {bad}")
        assert not offenders, "Server-only secrets leaked into frontend src:\n" + "\n".join(offenders)
