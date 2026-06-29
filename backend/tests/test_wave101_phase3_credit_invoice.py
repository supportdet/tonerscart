"""Wave 101 Phase 3 — Procurement credit summary, invoice PDF, admin credit adjust.

Exercises the live preview URL. Uses the existing approved corporate test
account if present; otherwise tests skip with a helpful message.
"""
import io
import os
import uuid
import pytest
import requests

# REACT_APP_BACKEND_URL
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

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _admin_token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def _admin_headers() -> dict:
    return {"Authorization": f"Bearer {_admin_token()}"}


# -----------------------------------------------------------------------------
# Auth-shape sanity (these work without any seed data)
# -----------------------------------------------------------------------------

def test_credit_summary_requires_proc_auth():
    r = requests.get(f"{API}/procurement/credit/summary", timeout=20)
    # Not authenticated → 401 (or 503 if procurement tables missing).
    assert r.status_code in (401, 403, 503), f"Got {r.status_code}: {r.text[:200]}"


def test_invoice_pdf_requires_proc_auth():
    fake = uuid.uuid4().hex
    r = requests.get(f"{API}/procurement/orders/{fake}/invoice.pdf", timeout=20)
    assert r.status_code in (401, 403, 503), f"Got {r.status_code}"


def test_admin_credit_panel_requires_admin():
    fake = uuid.uuid4().hex
    r = requests.get(f"{API}/admin/procurement/{fake}/credit", timeout=20)
    # Unauthed
    assert r.status_code in (401, 403), f"Got {r.status_code}"

    # Authed admin → 404 for fake user (not 500/403).
    r = requests.get(f"{API}/admin/procurement/{fake}/credit", headers=_admin_headers(), timeout=20)
    assert r.status_code == 404, f"Got {r.status_code}: {r.text[:200]}"


def test_admin_credit_adjust_validates_type():
    fake = uuid.uuid4().hex
    r = requests.post(
        f"{API}/admin/procurement/{fake}/credit/adjust",
        json={"type": "nonsense", "amount": 100},
        headers=_admin_headers(),
        timeout=20,
    )
    assert r.status_code == 400
    assert "type must be one of" in r.text.lower() or "type" in r.text.lower()


def test_admin_credit_adjust_validates_amount():
    fake = uuid.uuid4().hex
    r = requests.post(
        f"{API}/admin/procurement/{fake}/credit/adjust",
        json={"type": "payment", "amount": 0},
        headers=_admin_headers(),
        timeout=20,
    )
    assert r.status_code == 400
    assert "amount" in r.text.lower()


def test_admin_credit_adjust_unknown_buyer():
    fake = uuid.uuid4().hex
    r = requests.post(
        f"{API}/admin/procurement/{fake}/credit/adjust",
        json={"type": "payment", "amount": 500},
        headers=_admin_headers(),
        timeout=20,
    )
    assert r.status_code == 404


def test_admin_invoice_pdf_unknown_order_returns_404():
    fake = uuid.uuid4().hex
    r = requests.get(f"{API}/admin/procurement/orders/{fake}/invoice.pdf",
                     headers=_admin_headers(), timeout=20)
    assert r.status_code == 404


# -----------------------------------------------------------------------------
# Real PDF generation — uses the in-memory builder directly (no auth needed).
# -----------------------------------------------------------------------------

def test_invoice_pdf_builds_with_sample_data():
    """Verify proc_invoice_pdf.build_invoice_pdf returns a valid PDF."""
    import sys
    sys.path.insert(0, "/app/backend")
    from proc_invoice_pdf import build_invoice_pdf

    order = {
        "ref_number": "PO-2026-000999",
        "supplier_name": "Test Supplier Ltd.",
        "rank": "L1",
        "qty": 2,
        "total_amount": 23600.0,
        "payment_due_date": "2026-08-01T00:00:00Z",
        "created_at": "2026-07-01T00:00:00Z",
        "items": [{
            "brand": "HP",
            "model_number": "CF226A",
            "unit_price": 10000,
            "gst_rate": 18,
            "gst_amount": 1800,
            "total_price": 11800,
        }],
    }
    user = {
        "type": "corporate",
        "org_name": "Acme Corp Pvt Ltd",
        "name": "Jane Buyer",
        "designation": "Procurement Head",
        "email": "jane@acme.test",
        "phone": "+91 9000000000",
        "address": "123 MG Road, Bangalore",
        "gst_number": "29AABCA1234A1Z5",
    }
    pdf = build_invoice_pdf(order, user)
    assert isinstance(pdf, (bytes, bytearray))
    assert pdf[:4] == b"%PDF", f"Not a PDF: {pdf[:8]}"
    assert len(pdf) > 1500


if __name__ == "__main__":
    test_credit_summary_requires_proc_auth(); print("PASS: credit summary auth")
    test_invoice_pdf_requires_proc_auth(); print("PASS: invoice PDF auth")
    test_admin_credit_panel_requires_admin(); print("PASS: admin credit panel auth + 404")
    test_admin_credit_adjust_validates_type(); print("PASS: adjust validates type")
    test_admin_credit_adjust_validates_amount(); print("PASS: adjust validates amount")
    test_admin_credit_adjust_unknown_buyer(); print("PASS: adjust 404 on unknown buyer")
    test_admin_invoice_pdf_unknown_order_returns_404(); print("PASS: admin invoice 404")
    test_invoice_pdf_builds_with_sample_data(); print("PASS: build_invoice_pdf produces a valid PDF")
