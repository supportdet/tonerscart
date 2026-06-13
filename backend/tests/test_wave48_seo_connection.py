"""Regression: dealer toner uploads connect to the correct SEO model page.

The TonerModelSearchSelect dropdown writes the exact catalogue model_number
into listings.model_number (Wave 44). The SEO toner page at /toner/{slug}
calls /api/compat/toner-page/{slug} which uses _toner_aliases + _alias_hit
to find matching listings.

This test pins the alias-matching logic so a future refactor can't silently
break the connection. It does NOT touch the database — the live end-to-end
verification was performed manually in Wave 48 with 3 disposable listings
(HP Q2612A, Canon 328, Brother TN-2280) which are now cleaned up.
"""
import sys
import os

# routes/compat.py is loaded relative to backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from routes.compat import _toner_aliases, _alias_hit  # noqa: E402


def test_aliases_basic():
    assert _toner_aliases("Q2612A") == ["Q2612A"]
    assert _toner_aliases("328") == ["328"]


def test_aliases_hyphen_squash_and_space_variants():
    a = _toner_aliases("TN-2280")
    assert "TN-2280" in a and "TN2280" in a and "TN 2280" in a


def test_dropdown_exact_codes_hit_themselves():
    for model in ("Q2612A", "328", "TN-2280", "CB388A"):
        aliases = _toner_aliases(model)
        assert _alias_hit(model, aliases), f"{model} must match itself"


def test_branded_dealer_input_hits():
    assert _alias_hit("HP Q2612A", _toner_aliases("Q2612A"))
    assert _alias_hit("Canon 328", _toner_aliases("328"))
    assert _alias_hit("Brother TN-2280", _toner_aliases("TN-2280"))


def test_descriptive_dealer_input_hits():
    assert _alias_hit("CARTRIDGE HP Q2612A", _toner_aliases("Q2612A"))
    assert _alias_hit("CRG-328", _toner_aliases("328"))


def test_hyphen_space_variants_hit_both_ways():
    aliases = _toner_aliases("TN-2280")
    assert _alias_hit("TN2280", aliases)          # no separator
    assert _alias_hit("TN 2280", aliases)          # space separator
    assert _alias_hit("Brother TN2280", aliases)   # brand-prefixed, no separator


def test_unrelated_models_do_not_hit():
    aliases = _toner_aliases("Q2612A")
    assert not _alias_hit("Q2613A", aliases)
    assert not _alias_hit("TN-2280", aliases)
    aliases_328 = _toner_aliases("328")
    assert not _alias_hit("728", aliases_328)
    assert not _alias_hit("929", aliases_328)
