"""Printer ↔ toner compatibility API, programmatic-SEO data + Notify-me capture.

Reads the single-source-of-truth `compatibility_db.py`. Cross-references dealer
listings (toners + consumables) so a printer SEO page can show real, in-stock
products, and exposes search endpoints for the dealer upload dropdowns.
"""
import logging
import asyncio
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from supabase_client import sb_admin
import compatibility_db as cdb

logger = logging.getLogger("tonerscart")
router = APIRouter(prefix="/api/compat")


def compatible_printer_slugs(brand: str, model_number: str, compatible_models: str) -> set:
    """All printer slugs in the compatibility DB that this listing is compatible with:
    (a) printer models the dealer selected in compatible_models, and
    (b) printers that use this cartridge code (model_number) as a known toner."""
    slugs: set = set()
    for tok in (compatible_models or "").split(","):
        tok = tok.strip()
        if not tok:
            continue
        s = cdb.slugify("", tok)
        if cdb.get_printer(s):
            slugs.add(s)
    if model_number:
        t = cdb.get_toner(model_number.strip())
        if t:
            for full_name in t.get("printers", []):
                s = cdb.slugify("", full_name)
                if cdb.get_printer(s):
                    slugs.add(s)
    return slugs


async def notify_waiting_buyers(listing: dict, kind: str):
    """When a dealer lists a new toner/consumable, email every buyer who asked to
    be notified for a compatible printer page, then clear those requests so they
    aren't emailed again. Best-effort — never raises."""
    try:
        if not listing or not listing.get("id"):
            return
        slugs = compatible_printer_slugs(
            listing.get("brand"), listing.get("model_number"), listing.get("compatible_models")
        )
        if not slugs:
            return
        try:
            rows = sb_admin.table("notify_requests").select("*").in_(
                "printer_slug", list(slugs)
            ).execute().data or []
        except Exception as e:
            logger.debug("notify_requests query skipped (not migrated?): %s", e)
            return
        if not rows:
            return
        from email_service import email_notify_available
        base = "https://www.tonerscart.com"
        product_name = f"{listing.get('brand', '') or ''} {listing.get('model_number', '') or ''}".strip() or "A compatible product"
        product_url = f"{base}/{kind}/{listing['id']}"
        notified_ids = []
        for r in rows:
            printer_name = r.get("printer_name")
            if not printer_name:
                p = cdb.get_printer(r.get("printer_slug") or "")
                printer_name = p["full_name"] if p else "your printer"
            ok = await email_notify_available(
                to=r.get("email"), printer_name=printer_name,
                product_name=product_name, product_url=product_url,
            )
            if ok and r.get("id"):
                notified_ids.append(r["id"])
        if notified_ids:
            try:
                sb_admin.table("notify_requests").delete().in_("id", notified_ids).execute()
            except Exception as e:
                logger.warning("notify_requests cleanup failed: %s", e)
        logger.info("notified %d waiting buyer(s) for new %s %s", len(notified_ids), kind, listing.get("id"))
    except Exception:
        logger.exception("notify_waiting_buyers failed (non-fatal)")


def schedule_notify(listing: dict, kind: str):
    """Fire-and-forget the notify job from a sync route (runs in a daemon thread
    so it never blocks the dealer's listing-create response)."""
    try:
        threading.Thread(
            target=lambda: asyncio.run(notify_waiting_buyers(listing, kind)),
            daemon=True,
        ).start()
    except Exception:
        logger.exception("schedule_notify failed (non-fatal)")



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
