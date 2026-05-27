"""Wave 14 backend regression — quotation email branding + tech specs section."""
import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

import pytest

# Allow importing backend modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import email_service  # noqa: E402


# ---------- email_service.email_quotation: spec section + branding ----------

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def _capture_quotation_html(item: dict):
    """Invoke email_quotation with _send mocked; return the captured HTML body."""
    captured = {}

    async def fake_send(to, subject, body_html, reply_to=None):
        captured.setdefault("calls", []).append({
            "to": to, "subject": subject, "body": body_html, "reply_to": reply_to,
        })
        return True

    with patch.object(email_service, "_send", new=fake_send):
        asyncio.run(email_service.email_quotation(
            quote_number="QTN-TEST-001",
            buyer={"name": "Test Buyer", "email": "buyer@example.com",
                   "phone": "9999999999", "gst": "29ABCDE1234F1Z5"},
            item=item,
            supplier_label="Verified Supplier on TonersCart",
        ))
    assert captured.get("calls"), "email_quotation did not invoke _send"
    return captured["calls"][0]["body"]


def test_quotation_email_toner_specs_section_present():
    body = _capture_quotation_html({
        "brand": "HP", "model_number": "CF217A", "color": "Black",
        "type": "Original", "listing_type": "toner",
        "unit_price": 2400, "qty": 2, "total": 4800,
        "page_yield": 1600,
        "compatible_models": ["LaserJet Pro M102", "MFP M130"],
        "oem_part_number": "CF217A",
        "cartridge_weight": 520,
        "print_technology": "Laser",
        "warranty": "6 months",
    })
    # New specs header must be present
    assert "Technical Specifications" in body
    # Page yield row must be present
    assert "Page yield" in body
    assert "1600 pages" in body
    # Other toner-specific labels appear
    assert "Compatible models" in body
    assert "OEM part number" in body
    assert "Cartridge weight" in body
    assert "Print technology" in body


def test_quotation_email_branding_toners_black_cart_cyan():
    body = _capture_quotation_html({
        "brand": "HP", "model_number": "CF217A", "color": "Black",
        "type": "Original", "listing_type": "toner",
        "unit_price": 2400, "qty": 1, "total": 2400,
        "page_yield": 1600,
    })
    # Yellow gold #F5C400 may still appear elsewhere (validity banner),
    # but the LOGO must use Toners black + Cart cyan side-by-side.
    assert '<span style="color:#0A0A0B;">Toners</span><span style="color:#00B7C7;">Cart</span>' in body, \
        "Quotation email branding must show Toners (#0A0A0B) + Cart (#00B7C7)"


def test_quotation_email_no_yellow_in_brand_logo():
    body = _capture_quotation_html({
        "brand": "Canon", "model_number": "045H", "color": "Black",
        "type": "Compatible", "listing_type": "toner",
        "unit_price": 1800, "qty": 1, "total": 1800,
    })
    # Ensure the brand text is NOT colored with the legacy yellow #F5C400
    assert ">Toners</span><span style=\"color:#F5C400;\">Cart<" not in body
    assert ">Toners</span><span style=\"color:#FFD400;\">Cart<" not in body


def test_quotation_email_printer_specs_section():
    body = _capture_quotation_html({
        "brand": "HP", "model_number": "M404dn", "color": "—",
        "type": "Laser Printer", "listing_type": "printer",
        "unit_price": 32000, "qty": 1, "total": 32000,
        "print_speed_ppm": 38,
        "duty_cycle": "80000 pages/month",
        "connectivity": ["USB", "Ethernet", "Wi-Fi"],
        "max_resolution": "1200x1200 dpi",
        "paper_sizes": ["A4", "Letter", "Legal"],
        "mobile_printing": ["AirPrint", "Google Cloud Print"],
        "printer_warranty": "1 year",
    })
    assert "Technical Specifications" in body
    assert "Print speed" in body
    assert "38 ppm" in body
    assert "Duty cycle" in body
    assert "Connectivity" in body
    assert "USB, Ethernet, Wi-Fi" in body
    assert "Mobile printing" in body
    assert "Paper sizes" in body


def test_envelope_shell_branding_white_bg_and_cyan_cart():
    html = email_service._envelope("Hello", "<p>Body</p>")
    # White bg in header
    assert "background:#FFFFFF" in html
    # Toners black + Cart cyan side-by-side
    assert '<span style="color:#0A0A0B;">Toners</span><span style="color:#00B7C7;">Cart</span>' in html


# ---------- public smoke: backend still reachable ----------

import requests  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    fe = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if fe.exists():
        for line in fe.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")
def test_public_listings_grouped_reachable():
    r = requests.get(f"{BASE_URL}/api/listings/grouped", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")
def test_public_d2d_listings_shape():
    r = requests.get(f"{BASE_URL}/api/d2d/listings", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    for k in ("printers", "papers", "toners", "counts"):
        assert k in data
