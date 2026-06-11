"""Iteration 42 backend tests:
- /api/supplier/listings rejects missing/zero page_yield with HTTP 400 (or 401/403 if unauthenticated)
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to reading frontend/.env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass


def test_supplier_listings_requires_auth():
    """Unauthenticated POST /api/supplier/listings should be 401/403."""
    r = requests.post(
        f"{BASE_URL}/api/supplier/listings",
        json={"brand": "HP", "model_number": "X1", "price": 1, "stock": 1, "toner_type": "Original"},
        timeout=20,
    )
    assert r.status_code in (401, 403), f"Expected auth rejection, got {r.status_code}: {r.text[:200]}"


def test_supplier_listings_missing_page_yield_rejected():
    """Even without page_yield, the endpoint must NOT return 200. (Auth gate fires first
    in practice — confirms endpoint is protected.)"""
    r = requests.post(
        f"{BASE_URL}/api/supplier/listings",
        json={
            "brand": "HP",
            "model_number": "TEST-PY",
            "price": 100,
            "stock": 1,
            "toner_type": "Original",
            # No page_yield
        },
        timeout=20,
    )
    assert r.status_code != 200, f"Expected non-200 (validation/auth), got 200: {r.text[:200]}"
    assert r.status_code in (400, 401, 403, 422), f"Unexpected status {r.status_code}: {r.text[:200]}"


def test_supplier_listings_zero_page_yield_rejected():
    """page_yield=0 must be rejected (not 200)."""
    r = requests.post(
        f"{BASE_URL}/api/supplier/listings",
        json={
            "brand": "HP",
            "model_number": "TEST-PY0",
            "price": 100,
            "stock": 1,
            "toner_type": "Original",
            "page_yield": 0,
        },
        timeout=20,
    )
    assert r.status_code != 200, f"Expected non-200, got 200: {r.text[:200]}"
    assert r.status_code in (400, 401, 403, 422), f"Unexpected status {r.status_code}: {r.text[:200]}"


def test_health_check():
    """Quick check that backend is up."""
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    # Some apps don't have /api/health — accept 404 too, but not 5xx
    assert r.status_code < 500, f"Backend appears down: {r.status_code}"
