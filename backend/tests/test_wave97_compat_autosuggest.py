"""
Wave 97 backend tests — Compatibility lookup endpoints + auto-suggest data coverage.

Endpoints under test:
- GET /api/compat/lookup-by-toner?model=<toner_code>
- GET /api/compat/lookup-by-printer?model=<printer_model>
- GET /api/compat/stats
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://printer-supply-hub.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Stats ----------
class TestCompatStats:
    def test_stats_returns_700_plus_printers(self, api):
        r = api.get(f"{BASE_URL}/api/compat/stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "printers" in data and "toners" in data
        assert data["printers"] >= 700, f"Expected >=700 printers, got {data['printers']}"
        assert data["toners"] >= 1, "toners count should be > 0"


# ---------- Lookup-by-toner: HP, Canon, Brother, Epson, Samsung ----------
TONER_CASES = [
    ("CF226A", "HP"),
    ("CF244A", "HP"),
    ("CF258A", "HP"),
    ("CC388A", "HP"),
    ("925",    "Canon"),
    ("071",    "Canon"),
    ("054",    "Canon"),
    ("056",    "Canon"),
    ("TN-2280", "Brother"),
    ("TN-2360", "Brother"),
    ("TN-2380", "Brother"),
    ("TN-660",  "Brother"),
    ("TN-730",  "Brother"),
    ("TN-760",  "Brother"),
    ("001",    "Epson"),
    ("532",    "Epson"),
    ("MLT-D116S", "Samsung"),
]


class TestLookupByToner:
    @pytest.mark.parametrize("model,expected_brand", TONER_CASES)
    def test_lookup_by_toner(self, api, model, expected_brand):
        r = api.get(f"{BASE_URL}/api/compat/lookup-by-toner", params={"model": model}, timeout=15)
        assert r.status_code == 200, f"{model} -> HTTP {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("brand") == expected_brand, f"{model} brand mismatch: got {data.get('brand')}"
        # type should be either toner or ink (Epson 001/664/etc can be ink)
        assert data.get("type") in ("toner", "ink"), f"{model} unexpected type {data.get('type')}"
        printers = data.get("printers", [])
        assert isinstance(printers, list), f"{model} printers not a list"
        assert len(printers) > 0, f"{model} returned EMPTY printers (expected at least 1)"

    def test_lookup_slug_tolerant_lowercase_with_space(self, api):
        """tn 2280 (lowercase + space) should still resolve to TN-2280."""
        r = api.get(f"{BASE_URL}/api/compat/lookup-by-toner", params={"model": "tn 2280"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("brand") == "Brother", f"slug-tolerant failed: {data}"
        assert len(data.get("printers", [])) > 0, f"slug-tolerant empty printers: {data}"

    def test_lookup_nonexistent_returns_empty_list(self, api):
        r = api.get(f"{BASE_URL}/api/compat/lookup-by-toner", params={"model": "NONEXISTENT_XYZ_999"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("printers", None) == [], f"Expected empty printers list, got {data}"


# ---------- Lookup-by-printer ----------
PRINTER_CASES = [
    ("HP LaserJet P1108", "CE285A"),
    ("HP LaserJet Pro M226dw", "CF226A"),
    ("Brother HL-2240D", "TN-2280"),
    ("Canon imageCLASS LBP6018", "925"),
]


class TestLookupByPrinter:
    @pytest.mark.parametrize("printer,expected_toner", PRINTER_CASES)
    def test_lookup_by_printer(self, api, printer, expected_toner):
        r = api.get(f"{BASE_URL}/api/compat/lookup-by-printer", params={"model": printer}, timeout=15)
        assert r.status_code == 200, f"{printer} -> HTTP {r.status_code}: {r.text}"
        data = r.json()
        toners = data.get("toners", [])
        assert isinstance(toners, list)
        assert len(toners) > 0, f"{printer} returned empty toners list"
        assert expected_toner in toners, f"{printer} missing expected toner '{expected_toner}', got {toners}"
