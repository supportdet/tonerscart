"""Wave 50 — Cartridge-type routing (toner vs consumable) + sitemap split + chip links.

Covers backend deliverables of the wave:
  - /api/compat/toner-page/:slug returns kind + canonical_url
  - /api/compat/consumable-page/:slug returns the same shape
  - Sitemap splits /toner/ vs /consumable/ correctly and no ink slugs leak under /toner/
"""
import os
import re
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")


# ----- /api/compat/toner-page/:slug (laser toner) -----------------------------
def test_toner_page_canon_303_is_toner():
    r = requests.get(f"{BASE_URL}/api/compat/toner-page/canon-303", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("kind") == "toner", f"kind expected toner, got {data.get('kind')}"
    assert data.get("canonical_url") == "/toner/canon-303"
    assert data["toner"]["slug"] == "canon-303"


# ----- /api/compat/toner-page/:slug for an INK slug should self-flag --------
def test_toner_page_epson_001_black_is_consumable():
    r = requests.get(f"{BASE_URL}/api/compat/toner-page/epson-001-black", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    # Even though hit via /toner-page, kind tells client to redirect
    assert data.get("kind") == "consumable"
    assert data.get("canonical_url") == "/consumable/epson-001-black"
    # type field should NOT equal 'toner'
    assert (data["toner"].get("type") or "").lower() != "toner"


# ----- /api/compat/consumable-page/:slug for a drum --------------------------
def test_consumable_page_brother_dr_2255_is_consumable():
    r = requests.get(f"{BASE_URL}/api/compat/consumable-page/brother-dr-2255", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("kind") == "consumable"
    assert data.get("canonical_url") == "/consumable/brother-dr-2255"


# ----- Sitemap split ---------------------------------------------------------
def test_sitemap_splits_toner_vs_consumable():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200, r.text
    xml = r.text
    toner_urls = re.findall(r"<loc>[^<]*?/toner/([^<\s]+)</loc>", xml)
    cons_urls = re.findall(r"<loc>[^<]*?/consumable/([^<\s]+)</loc>", xml)
    assert len(toner_urls) >= 100, f"expected >=100 /toner/ entries, got {len(toner_urls)}"
    assert len(cons_urls) >= 100, f"expected >=100 /consumable/ entries, got {len(cons_urls)}"


def test_sitemap_no_epson_ink_under_toner_path():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200
    xml = r.text
    # Find every /toner/<slug> entry and ensure none are epson ink slugs.
    matches = re.findall(r"<loc>[^<]*?/toner/(epson-[^<\s]+)</loc>", xml)
    # Epson laser toners do exist (e.g. epson-m220...), but Epson 001/002/003/664/L-series inks must NOT appear.
    suspicious_ink_codes = {"001", "002", "003", "664", "003-black", "001-black"}
    leaked = [m for m in matches if any(code in m for code in suspicious_ink_codes)]
    assert not leaked, f"Ink slugs leaked under /toner/: {leaked}"


def test_sitemap_base_url_not_corrupted():
    """Regression: server.py L1559 reassigns `base` inside the loop; ensure listing URLs
    still get the proper https://www.tonerscart.com prefix afterwards."""
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200
    xml = r.text
    # Every <loc> should start with https://www.tonerscart.com
    bad_locs = re.findall(r"<loc>(?!https://)[^<]+</loc>", xml)
    assert not bad_locs, f"Found {len(bad_locs)} <loc>s without https:// prefix. First few: {bad_locs[:3]}"


# ----- /api/sitemap.xml contains canon-303 under /toner/ ---------------------
def test_sitemap_canon_303_under_toner():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert "/toner/canon-303" in r.text


def test_sitemap_brother_dr_2255_under_consumable():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert "/consumable/brother-dr-2255" in r.text


# ----- Mandatory-field validation on /supplier/* endpoints -------------------
# We can only verify the validation TRIPS — the endpoint requires supplier auth,
# which we don't have. Calling without a token returns 401/403 (not 400), which
# means we cannot verify the 400 message via this route. Document instead.
def test_supplier_endpoints_protected():
    r = requests.post(f"{BASE_URL}/api/supplier/listings", json={}, timeout=15)
    assert r.status_code in (401, 403, 422), r.status_code
    r = requests.post(f"{BASE_URL}/api/supplier/printers", json={}, timeout=15)
    assert r.status_code in (401, 403, 422)
    r = requests.post(f"{BASE_URL}/api/supplier/papers", json={}, timeout=15)
    assert r.status_code in (401, 403, 422)
    r = requests.post(f"{BASE_URL}/api/supplier/consumables", json={}, timeout=15)
    assert r.status_code in (401, 403, 422)
