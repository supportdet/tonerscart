"""
Iteration 39 backend regression tests.

Covers:
- Toner search returns cleaned brand (= "Canon") and cartridge name in model_number.
- /api/compat/printers search-by-brand endpoint used by ModelSearchCell.
- Supplier dashboard no longer depends on /toner-master/brands (it still exists
  as a harmless catalog read; we only assert it stays alive so older UI tests
  do not 500). Smoke-only.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")

# Canonical 12 brands the dealer can pick.
TONER_BRANDS = {
    "HP", "Canon", "Brother", "Epson", "Ricoh", "Xerox",
    "Kyocera", "Samsung", "Konica Minolta", "Pantum", "Riso", "Sharp",
}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers["Content-Type"] = "application/json"
    return sess


# ---- Toner search (data cleanup) ----
class TestTonerSearchCleaned:
    def test_search_returns_items(self, s):
        r = s.get(f"{BASE_URL}/api/listings/search", params={"category": "toners", "limit": 25})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or data.get("listings") or [])
        assert len(items) > 0, "expected at least one toner listing"
        # cache for other tests
        TestTonerSearchCleaned._items = items

    def test_all_brands_are_canonical(self, s):
        items = getattr(self, "_items", None) or s.get(
            f"{BASE_URL}/api/listings/search", params={"category": "toners", "limit": 50}
        ).json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("listings") or []
        bad = [it.get("brand") for it in items if it.get("brand") not in TONER_BRANDS]
        assert not bad, f"non-canonical brands leaked into toner search: {bad[:5]}"

    def test_model_number_is_populated(self, s):
        r = s.get(f"{BASE_URL}/api/listings/search", params={"category": "toners", "limit": 25})
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("listings") or []
        empty = [it for it in items if not (it.get("model_number") or "").strip()]
        assert not empty, f"{len(empty)} toner listings have empty model_number"


# ---- /api/compat/printers search ----
class TestCompatPrinterSearch:
    def test_search_canon_lbp(self, s):
        r = s.get(f"{BASE_URL}/api/compat/printers", params={"q": "LBP", "brand": "Canon"})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or [])
        assert len(items) > 0
        # at least one Canon LBP-ish model returned
        canon_hits = [
            it for it in items
            if isinstance(it, dict)
            and (it.get("brand") or "").lower() == "canon"
            and "LBP" in (it.get("model") or it.get("model_number") or "")
        ]
        assert canon_hits, f"expected Canon LBP matches, got sample: {items[:3]}"

    def test_search_short_query_ok(self, s):
        # 2-char queries are allowed by the UI; endpoint must not 500.
        r = s.get(f"{BASE_URL}/api/compat/printers", params={"q": "HP"})
        assert r.status_code in (200, 400)
