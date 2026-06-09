"""Printer ↔ toner compatibility API, programmatic-SEO data + Notify-me capture.

Reads the single-source-of-truth `compatibility_db.py`. Cross-references dealer
listings (toners + consumables) so a printer SEO page can show real, in-stock
products, and exposes search endpoints for the dealer upload dropdowns.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from supabase_client import sb_admin
import compatibility_db as cdb

logger = logging.getLogger("tonerscart")
router = APIRouter(prefix="/api/compat")


@router.get("/stats")
def compat_stats():
    return cdb.stats()


@router.get("/printers")
def compat_search_printers(q: str = "", limit: int = 20):
    """Searchable printer catalogue for the toner/consumable upload dropdowns."""
    return cdb.search_printers(q, min(max(limit, 1), 50))


@router.get("/toners")
def compat_search_toners(q: str = "", limit: int = 20):
    """Searchable toner/cartridge catalogue for the printer upload dropdown."""
    return cdb.search_toners(q, min(max(limit, 1), 50))


def _public_listing(L: dict, kind: str) -> dict:
    return {
        "id": L["id"],
        "kind": kind,
        "brand": L.get("brand"),
        "model_number": L.get("model_number"),
        "title": f"{L.get('brand', '') or ''} {L.get('model_number', '') or ''}".strip(),
        "price": L.get("price"),
        "stock": L.get("stock"),
        "image_url": L.get("image_url"),
        "compatible_models": L.get("compatible_models"),
        "condition": L.get("condition") or L.get("toner_type"),
        "supplier_id": L.get("supplier_id"),
        "url": f"/{kind}/{L['id']}",
    }


def _matching_listings(printer: dict) -> list:
    """Find in-stock dealer toner/consumable listings compatible with this printer:
    (a) listing.compatible_models mentions the printer model/full name, or
    (b) listing.model_number is one of the printer's known cartridge codes."""
    codes = printer.get("toners") or []
    model = printer.get("model") or ""
    found: dict = {}
    for table, kind in (("listings", "toner"), ("consumable_listings", "consumable")):
        rows = []
        if model:
            try:
                rows += sb_admin.table(table).select("*").ilike(
                    "compatible_models", f"%{model}%"
                ).limit(60).execute().data or []
            except Exception as e:
                logger.debug("compat ilike on %s failed: %s", table, e)
        if codes:
            try:
                rows += sb_admin.table(table).select("*").in_(
                    "model_number", codes
                ).limit(60).execute().data or []
            except Exception as e:
                logger.debug("compat in_ on %s failed: %s", table, e)
        for L in rows:
            if int(L.get("stock") or 0) <= 0:
                continue
            found[(table, L["id"])] = _public_listing(L, kind)
    # Cheapest first
    return sorted(found.values(), key=lambda x: (x.get("price") or 1e12))


@router.get("/printer/{slug}")
def compat_printer(slug: str):
    p = cdb.get_printer(slug)
    if not p:
        raise HTTPException(404, "Printer not found")
    compatible_toners = []
    for code in p.get("toners") or []:
        t = cdb.get_toner(code)
        compatible_toners.append(t or {"model": code, "brand": p["brand"], "type": "toner", "printers": []})
    listings = _matching_listings(p)
    return {
        "printer": {
            "brand": p["brand"], "model": p["model"], "full_name": p["full_name"],
            "type": p["type"], "slug": p["slug"],
        },
        "compatible_toners": compatible_toners,
        "listings": listings,
        "listings_count": len(listings),
    }


@router.get("/toner/{model}")
def compat_toner(model: str):
    t = cdb.get_toner(model)
    if not t:
        raise HTTPException(404, "Toner not found")
    return t


class NotifyRequest(BaseModel):
    printer_slug: str
    printer_name: str = ""
    email: EmailStr


@router.post("/notify")
def notify_when_available(payload: NotifyRequest):
    """Email capture on a compatible page that currently has no dealer stock.
    Degrades gracefully to 200 if the notify_requests table isn't migrated yet."""
    name = payload.printer_name
    if not name:
        p = cdb.get_printer(payload.printer_slug)
        name = p["full_name"] if p else payload.printer_slug
    try:
        sb_admin.table("notify_requests").insert({
            "printer_slug": payload.printer_slug,
            "printer_name": name,
            "email": payload.email,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        if "notify_requests" not in str(e):
            logger.warning("notify_requests insert failed: %s", e)
        # Always succeed for the user — run supabase_schema_notify_requests.sql to persist.
    return {"ok": True}
