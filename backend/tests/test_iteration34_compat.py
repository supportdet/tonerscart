"""Iteration 34 — Compatibility DB + programmatic-SEO API smoke tests.

Run: cd /app/backend && python3 -m pytest tests/test_iteration34_compat.py -q
"""
import os
import httpx
import pytest

API = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")
import compatibility_db as cdb


def test_db_has_min_500_each():
    s = cdb.stats()
    assert s["printers"] >= 500, s
    assert s["toners"] >= 500, s


def test_db_covers_all_required_brands():
    brands = {p["brand"] for p in cdb.all_printers()}
    for b in ["HP", "Canon", "Epson", "Brother", "Ricoh", "Xerox", "Kyocera",
              "Samsung", "Konica Minolta", "Pantum", "Riso", "Sharp"]:
        assert b in brands, f"missing brand {b}"


def test_bidirectional_cross_reference():
    # selecting a printer shows compatible toners; that toner lists the printer back
    p = cdb.get_printer("hp-laserjet-m1005")
    assert p and p["toners"]
    code = p["toners"][0]
    t = cdb.get_toner(code)
    assert t and p["full_name"] in t["printers"]


def test_api_stats():
    r = httpx.get(f"{API}/api/compat/stats", timeout=30)
    assert r.status_code == 200
    assert r.json()["printers"] >= 500


def test_api_search_printers():
    r = httpx.get(f"{API}/api/compat/printers", params={"q": "M1005"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert any("M1005" in d["full_name"] for d in data)
    assert all({"brand", "model", "full_name", "slug"} <= set(d) for d in data)


def test_api_search_toners():
    r = httpx.get(f"{API}/api/compat/toners", params={"q": "88A"}, timeout=30)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_api_printer_detail():
    r = httpx.get(f"{API}/api/compat/printer/hp-laserjet-m1005", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["printer"]["slug"] == "hp-laserjet-m1005"
    assert "compatible_toners" in body and "listings" in body


def test_api_printer_404():
    r = httpx.get(f"{API}/api/compat/printer/this-does-not-exist", timeout=30)
    assert r.status_code == 404


@pytest.mark.parametrize("slug,expect", [
    ("hp-laserjet-m1005", "HP LaserJet M1005 MFP"),
    ("canon-lbp2900", "Canon imageCLASS LBP2900"),
    ("xerox-b305", "Xerox B305"),
    ("brother-hl-2321d", "Brother HL-L2321D"),
    ("epson-l3150", "Epson EcoTank L3150"),
])
def test_tolerant_slug_resolution(slug, expect):
    assert cdb.get_printer(slug) is not None, slug
    assert cdb.get_printer(slug)["full_name"] == expect
    r = httpx.get(f"{API}/api/compat/printer/{slug}", timeout=30)
    assert r.status_code == 200, (slug, r.status_code)
    assert r.json()["printer"]["full_name"] == expect


def test_all_printer_pages_resolve():
    """Every one of the 543+ printer pages must resolve from both its canonical
    slug and the raw full-name slug — no /compatible page may 404."""
    import re
    raw = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    printers = cdb.all_printers()
    assert len(printers) >= 543
    canon_fail = [p["slug"] for p in printers if cdb.get_printer(p["slug"]) is None]
    full_fail = [p["full_name"] for p in printers if cdb.get_printer(raw(p["full_name"])) is None]
    assert canon_fail == [], canon_fail
    assert full_fail == [], full_fail
    # slugs are unique
    slugs = [p["slug"] for p in printers]
    assert len(slugs) == len(set(slugs))


# ----------------------------- Toner model pages -----------------------------

def test_brands_endpoint():
    r = httpx.get(f"{API}/api/compat/brands", timeout=30)
    assert r.status_code == 200
    brands = r.json()
    for b in ["HP", "Canon", "Epson", "Brother", "Ricoh", "Xerox", "Kyocera",
              "Samsung", "Konica Minolta", "Pantum", "Riso", "Sharp"]:
        assert b in brands, f"missing brand {b}"


@pytest.mark.parametrize("slug", ["hp-q2612a", "hp-88a", "brother-tn-2280", "ricoh-sp-320"])
def test_toner_page_resolves(slug):
    assert cdb.get_toner_by_slug(slug) is not None, slug
    r = httpx.get(f"{API}/api/compat/toner-page/{slug}", timeout=30)
    assert r.status_code == 200, (slug, r.status_code)
    body = r.json()
    assert body["toner"]["slug"]  # resolves to a canonical toner (may differ from input)
    assert "compatible_printers" in body and "listings" in body and "related" in body
    assert {"same_printers_toners", "same_brand_toners"} <= set(body["related"])


def test_toner_page_404():
    r = httpx.get(f"{API}/api/compat/toner-page/this-is-not-a-toner", timeout=30)
    assert r.status_code == 404


def test_all_toner_pages_resolve():
    toners = cdb.all_toners()
    assert len(toners) >= 500
    fail = [t["slug"] for t in toners if cdb.get_toner_by_slug(t["slug"]) is None]
    assert fail == [], fail[:10]
    slugs = [t["slug"] for t in toners]
    assert len(slugs) == len(set(slugs))


def test_printer_page_has_related():
    r = httpx.get(f"{API}/api/compat/printer/hp-laserjet-m1005", timeout=30)
    assert r.status_code == 200
    rel = r.json().get("related", {})
    assert {"same_brand_printers", "compatible_toner_models"} <= set(rel)
    assert len(rel["same_brand_printers"]) >= 1


def test_sitemap_contains_toner_model_pages():
    r = httpx.get(f"{API}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200
    assert "/toner/hp-q2612a" in r.text


def test_api_notify_graceful():
    r = httpx.post(f"{API}/api/compat/notify",
                   json={"printer_slug": "hp-laserjet-m1005", "email": "qa@example.com"}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_api_sitemap_contains_compatible_and_listings():
    r = httpx.get(f"{API}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200
    assert "/compatible/hp-laserjet-m1005" in r.text
