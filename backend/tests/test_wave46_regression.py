"""Wave 46 regression: CRG 303 base price still ₹5,100 (price+variant in sync)
and the universal-search endpoint that UniversalSearch debounce hits is healthy.
"""
import os, requests, pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
CRG303 = "02f296c4-ffdc-471f-a7a8-981d55a7c0f5"

@pytest.fixture
def session():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s

def test_crg303_price_listing_and_variant_in_sync(session):
    r = session.get(f"{BASE}/api/listings/{CRG303}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["price"] == 5100.0
    assert d["gst_rate"] == 18
    variants = d.get("variants") or []
    assert variants, "expected at least one variant"
    assert variants[0]["price"] == 5100.0, "variant price must mirror listing.price (Wave 45 fix)"

def test_universal_search_endpoint_responds(session):
    r = session.get(f"{BASE}/api/search/universal", params={"q": "hp", "limit_per_type": 6}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    # response must include the buckets the UniversalSearch dropdown reads
    for k in ("toners", "printers", "papers", "consumables"):
        assert k in d, f"missing bucket: {k}"

def test_universal_search_short_query_safe(session):
    # The frontend gates calls at length>=2; server should still respond cleanly for 'h'
    r = session.get(f"{BASE}/api/search/universal", params={"q": "h", "limit_per_type": 6}, timeout=15)
    assert r.status_code in (200, 400, 422)

def test_d2d_me_unauthenticated_returns_clean_status(session):
    r = session.get(f"{BASE}/api/d2d/me", timeout=15)
    # Should not 500 — either 401 (auth required) or 200 with verified:false
    assert r.status_code in (200, 401, 403)
    if r.status_code == 200:
        assert "verified" in r.json()
