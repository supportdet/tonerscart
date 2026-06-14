"""Printer ↔ toner compatibility API, programmatic-SEO data + Notify-me capture.

Reads the single-source-of-truth `compatibility_db.py`. Cross-references dealer
listings (toners + consumables) so a printer SEO page can show real, in-stock
products, and exposes search endpoints for the dealer upload dropdowns.
"""
import logging
import asyncio
import re
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from supabase_client import sb_admin
import compatibility_db as cdb
from server import require_user, require_role

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


@router.get("/brands")
def compat_brands():
    """All printer brands in the compatibility DB (for the printer upload dropdown)."""
    return cdb.all_brands()


@router.get("/printers")
def compat_search_printers(q: str = "", limit: int = 20, brand: str = "", brand_only: bool = False):
    """Searchable printer catalogue. `brand` prioritises that brand first (or, with
    brand_only=true, filters to it) for the dealer upload dropdowns.
    Merges dealer-submitted custom models (status='pending'|'approved')
    flagged as `is_custom: true` so the UI can render an 'Added by dealer' badge."""
    base = cdb.search_printers(q, min(max(limit, 1), 50), brand=brand or None, brand_only=brand_only)
    custom = _search_custom_printers(q, brand or None, brand_only, limit=12)
    if not custom:
        return base
    seen = {(r.get("brand", "").lower(), r.get("model", "").lower()) for r in base}
    extras = [c for c in custom if (c["brand"].lower(), c["model"].lower()) not in seen]
    return base + extras


@router.get("/toners")
def compat_search_toners(q: str = "", limit: int = 20, brand: str = ""):
    """Searchable toner/cartridge catalogue; `brand` floats that brand to the top.
    Merges dealer-submitted custom toner models (flagged `is_custom: true`)."""
    base = cdb.search_toners(q, min(max(limit, 1), 50), brand=brand or None)
    custom = _search_custom_toners(q, brand or None, limit=12)
    if not custom:
        return base
    seen = {(r.get("brand", "").lower(), r.get("model", "").lower()) for r in base}
    extras = [c for c in custom if (c["brand"].lower(), c["model"].lower()) not in seen]
    return base + extras


def _search_custom_printers(q: str, brand: str | None, brand_only: bool, limit: int = 12) -> list:
    try:
        qb = sb_admin.table("custom_printer_models").select(
            "id,brand,model,type,full_name"
        ).in_("status", ["pending", "approved"]).limit(limit)
        if q:
            qb = qb.ilike("model", f"%{q}%")
        if brand and brand_only:
            qb = qb.ilike("brand", brand)
        rows = qb.execute().data or []
    except Exception as e:
        logger.debug("custom_printer_models search skipped: %s", e)
        return []
    out = []
    for r in rows:
        full = r.get("full_name") or f"{r.get('brand', '')} {r.get('model', '')}".strip()
        out.append({
            "brand": r.get("brand", ""),
            "model": r.get("model", ""),
            "type": r.get("type") or "",
            "full_name": full,
            "slug": cdb.slugify("", full),
            "toners_count": 0,
            "is_custom": True,
        })
    # If a specific brand is requested without brand_only, still float matching brand first
    if brand and not brand_only:
        out.sort(key=lambda x: 0 if (x["brand"] or "").lower() == brand.lower() else 1)
    return out


def _search_custom_toners(q: str, brand: str | None, limit: int = 12) -> list:
    try:
        qb = sb_admin.table("custom_toner_models").select(
            "id,brand,model,type"
        ).in_("status", ["pending", "approved"]).limit(limit)
        if q:
            qb = qb.ilike("model", f"%{q}%")
        rows = qb.execute().data or []
    except Exception as e:
        logger.debug("custom_toner_models search skipped: %s", e)
        return []
    out = []
    for r in rows:
        out.append({
            "brand": r.get("brand", ""),
            "model": r.get("model", ""),
            "type": r.get("type") or "toner",
            "slug": cdb.toner_slugify(r.get("brand", ""), r.get("model", "")),
            "printers_count": 0,
            "is_custom": True,
        })
    if brand:
        out.sort(key=lambda x: 0 if (x["brand"] or "").lower() == brand.lower() else 1)
    return out


class CustomPrinterPayload(BaseModel):
    brand: str
    model: str
    type: str = ""


class CustomTonerPayload(BaseModel):
    brand: str
    model: str
    type: str = "toner"


def _record_message(msg_type: str, name: str, email: str, description: str, selections: dict | None = None):
    """Best-effort: drop a row into mps_inquiries so admins see the request in
    the Messages tab. Never raises — DB is optional."""
    try:
        sb_admin.table("mps_inquiries").insert({
            "name": name or "Dealer",
            "email": email or "",
            "msg_type": msg_type,
            "description": description,
            "selections": selections or {},
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.debug("mps_inquiries insert skipped (custom-model): %s", e)


@router.post("/custom-printer")
def add_custom_printer(payload: CustomPrinterPayload, user: dict = Depends(require_role("supplier"))):
    """Dealer submits a printer model that isn't in the central compatibility DB.
    Saved as 'pending' for admin review; immediately surfaces as a suggestion."""
    brand = (payload.brand or "").strip()
    model = (payload.model or "").strip()
    if not brand or not model:
        raise HTTPException(400, "Brand and model are required")
    full_name = f"{brand} {model}".strip()
    row = {
        "brand": brand,
        "model": model,
        "type": (payload.type or "").strip(),
        "full_name": full_name,
        "created_by": user.get("id"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = sb_admin.table("custom_printer_models").insert(row).execute()
        inserted = (res.data or [{}])[0]
    except Exception as e:
        # Duplicate (already submitted by another dealer) — treat as success.
        if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
            try:
                existing = sb_admin.table("custom_printer_models").select("*").ilike(
                    "brand", brand
                ).ilike("model", model).limit(1).execute().data or []
                inserted = existing[0] if existing else row
            except Exception:
                inserted = row
        elif "custom_printer_models" in str(e):
            raise HTTPException(503, "Custom models table not migrated yet. Run supabase_schema_custom_models.sql.")
        else:
            raise HTTPException(500, f"Could not save custom printer model: {e}")
    _record_message(
        "custom_printer_model",
        user.get("name") or user.get("email") or "Dealer",
        user.get("email") or "",
        f"Dealer requested a new printer model:\n  {full_name}\n  Type: {payload.type or '—'}",
        {"brand": brand, "model": model, "type": payload.type or "", "kind": "printer"},
    )
    return {
        "ok": True,
        "id": inserted.get("id"),
        "brand": brand,
        "model": model,
        "full_name": full_name,
        "type": payload.type or "",
        "slug": cdb.slugify("", full_name),
        "is_custom": True,
    }


@router.post("/custom-toner")
def add_custom_toner(payload: CustomTonerPayload, user: dict = Depends(require_role("supplier"))):
    """Dealer submits a toner cartridge model that isn't catalogued. Saved
    pending and surfaces in subsequent dropdown searches as 'Added by dealer'."""
    brand = (payload.brand or "").strip()
    model = (payload.model or "").strip()
    if not brand or not model:
        raise HTTPException(400, "Brand and model are required")
    row = {
        "brand": brand,
        "model": model,
        "type": (payload.type or "toner").strip(),
        "created_by": user.get("id"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = sb_admin.table("custom_toner_models").insert(row).execute()
        inserted = (res.data or [{}])[0]
    except Exception as e:
        if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
            try:
                existing = sb_admin.table("custom_toner_models").select("*").ilike(
                    "brand", brand
                ).ilike("model", model).limit(1).execute().data or []
                inserted = existing[0] if existing else row
            except Exception:
                inserted = row
        elif "custom_toner_models" in str(e):
            raise HTTPException(503, "Custom toner models table not migrated yet. Run supabase_schema_custom_models.sql.")
        else:
            raise HTTPException(500, f"Could not save custom toner model: {e}")
    _record_message(
        "custom_toner_model",
        user.get("name") or user.get("email") or "Dealer",
        user.get("email") or "",
        f"Dealer requested a new toner model:\n  {brand} {model}\n  Type: {payload.type or 'toner'}",
        {"brand": brand, "model": model, "type": payload.type or "toner", "kind": "toner"},
    )
    return {
        "ok": True,
        "id": inserted.get("id"),
        "brand": brand,
        "model": model,
        "type": payload.type or "toner",
        "slug": cdb.toner_slugify(brand, model),
        "is_custom": True,
    }


def _is_toner_type(ttype: str) -> bool:
    """Only laser-powder toner cartridges live at /toner/:slug. Inks, drums,
    ribbons, fusers, maintenance kits → /consumable/:slug."""
    return (ttype or "").lower().strip() == "toner"


def _cartridge_url(ttype: str, slug: str) -> str:
    return f"/toner/{slug}" if _is_toner_type(ttype) else f"/consumable/{slug}"


def _public_listing(L: dict, kind: str) -> dict:
    price = float(L.get("price") or 0)
    gst = int(L.get("gst_rate") if L.get("gst_rate") is not None else 18)
    return {
        "id": L["id"],
        "kind": kind,
        "brand": L.get("brand"),
        "model_number": L.get("model_number"),
        "title": f"{L.get('brand', '') or ''} {L.get('model_number', '') or ''}".strip(),
        "price": price,
        "gst_rate": gst,
        "total_price": round(price * (1 + gst / 100.0)),
        "intercity_delivery_charge": float(L.get("intercity_delivery_charge") or 0),
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


def _printer_card(p: dict) -> dict:
    return {"full_name": p["full_name"], "brand": p["brand"], "model": p["model"],
            "type": p["type"], "slug": p["slug"], "url": f"/compatible/{p['slug']}",
            "toners_count": len(p.get("toners") or [])}


def _toner_card(t: dict) -> dict:
    url = _cartridge_url(t.get("type"), t["slug"])
    return {"model": t["model"], "brand": t["brand"], "type": t["type"],
            "slug": t["slug"], "url": url,
            "printers_count": len(t.get("printers") or [])}


def _printer_related(p: dict) -> dict:
    printers = cdb.all_printers()
    same_brand = [_printer_card(x) for x in printers
                  if x["brand"] == p["brand"] and x["slug"] != p["slug"]][:6]
    cart, seen = [], set()
    for code in p.get("toners") or []:
        t = cdb.get_toner(code)
        if t and t["slug"] not in seen:
            seen.add(t["slug"])
            cart.append(_toner_card(t))
    return {"same_brand_printers": same_brand, "compatible_toner_models": cart[:6]}


def _toner_related(t: dict) -> dict:
    toners = cdb.all_toners()
    mine = set(t.get("printers") or [])
    same_printers = []
    if mine:
        scored = []
        for x in toners:
            if x["slug"] == t["slug"]:
                continue
            overlap = len(mine & set(x.get("printers") or []))
            if overlap:
                scored.append((overlap, x))
        scored.sort(key=lambda z: (-z[0], z[1]["brand"], z[1]["model"]))
        same_printers = [_toner_card(x) for _, x in scored[:6]]
    same_brand = [_toner_card(x) for x in toners
                  if x["brand"] == t["brand"] and x["type"] == t["type"] and x["slug"] != t["slug"]][:6]
    return {"same_printers_toners": same_printers, "same_brand_toners": same_brand}


def _toner_aliases(model: str) -> list:
    """Meaningful model tokens to match dealer listings.

    Includes hyphen/space/no-separator variants so a catalogue model like
    'TN-2280' also matches dealer-typed 'TN2280' or 'TN 2280' — these are
    common variations dealers actually type instead of the exact dropdown code.
    Example: 'CB388A (88A)' → ['CB388A','88A']
    Example: 'TN-2280' → ['TN-2280','TN2280']
    """
    out: list = []
    seen = set()
    for tok in re.findall(r"[A-Za-z0-9\-]+", model or ""):
        if len(tok) < 2:
            continue
        for variant in (tok, tok.replace("-", ""), tok.replace("-", " ")):
            v = variant.strip()
            if len(v) >= 2 and v.lower() not in seen:
                seen.add(v.lower())
                out.append(v)
    return out


def _alias_hit(model_number: str, aliases: list) -> bool:
    mn = (model_number or "").lower()
    # Also try the listing's model_number with separators normalised so
    # 'TN2280' matches the 'TN-2280' alias and vice versa.
    mn_squashed = re.sub(r"[\s\-]+", "", mn)
    for a in aliases:
        al = a.lower()
        if re.search(r"(?<![a-z0-9])" + re.escape(al) + r"(?![a-z0-9])", mn):
            return True
        al_sq = re.sub(r"[\s\-]+", "", al)
        if al_sq and len(al_sq) >= 3 and re.search(r"(?<![a-z0-9])" + re.escape(al_sq) + r"(?![a-z0-9])", mn_squashed):
            return True
    return False


def _toner_listings(toner: dict) -> list:
    """In-stock dealer toner/consumable listings FOR this exact cartridge model."""
    aliases = _toner_aliases(toner["model"])
    found: dict = {}
    for table, kind in (("listings", "toner"), ("consumable_listings", "consumable")):
        for a in aliases:
            try:
                rows = sb_admin.table(table).select("*").ilike(
                    "model_number", f"%{a}%"
                ).limit(40).execute().data or []
            except Exception as e:
                logger.debug("toner listings %s/%s skipped: %s", table, a, e)
                continue
            for L in rows:
                if int(L.get("stock") or 0) <= 0:
                    continue
                if not _alias_hit(L.get("model_number"), aliases):
                    continue
                found[(table, L["id"])] = _public_listing(L, kind)
    items = sorted(found.values(), key=lambda x: (x.get("total_price") or x.get("price") or 1e12))
    # Enrich with dealer business name + city for the price-comparison table.
    sup_ids = list({i["supplier_id"] for i in items if i.get("supplier_id")})
    sup_map = {}
    if sup_ids:
        try:
            rows = sb_admin.table("suppliers").select("id,business_name,city").in_(
                "id", sup_ids).execute().data or []
            sup_map = {r["id"]: r for r in rows}
        except Exception as e:
            logger.debug("toner listings supplier enrich skipped: %s", e)
    for i in items:
        s = sup_map.get(i.get("supplier_id")) or {}
        i["dealer_name"] = s.get("business_name") or "Verified dealer"
        i["dealer_city"] = s.get("city")
    return items


@router.get("/printer/{slug}")
def compat_printer(slug: str):
    p = cdb.get_printer(slug)
    if not p:
        raise HTTPException(404, "Printer not found")
    compatible_toners = []
    for code in p.get("toners") or []:
        t = cdb.get_toner(code)
        compatible_toners.append(t or {"model": code, "brand": p["brand"], "type": "toner", "printers": [], "slug": cdb.toner_slugify(p["brand"], code)})
    listings = _matching_listings(p)
    return {
        "printer": {
            "brand": p["brand"], "model": p["model"], "full_name": p["full_name"],
            "type": p["type"], "slug": p["slug"],
        },
        "compatible_toners": compatible_toners,
        "listings": listings,
        "listings_count": len(listings),
        "related": _printer_related(p),
    }


@router.get("/toner-page/{slug}")
def compat_toner_page(slug: str):
    t = cdb.get_toner_by_slug(slug)
    if not t:
        raise HTTPException(404, "Toner not found")
    compatible_printers = []
    for fn in t.get("printers") or []:
        pr = cdb.get_printer(cdb.slugify("", fn))
        if pr:
            compatible_printers.append(_printer_card(pr))
        else:
            s = cdb.slugify("", fn)
            compatible_printers.append({"full_name": fn, "brand": t["brand"], "model": fn,
                                        "type": "", "slug": s, "url": f"/compatible/{s}"})
    listings = _toner_listings(t)
    return {
        "toner": {"model": t["model"], "brand": t["brand"], "type": t["type"], "slug": t["slug"]},
        "compatible_printers": compatible_printers,
        "listings": listings,
        "listings_count": len(listings),
        "related": _toner_related(t),
        # `kind` tells the frontend whether this cartridge belongs at
        # /toner/:slug (laser toner) or /consumable/:slug (ink, drum, ribbon,
        # fuser, maintenance). Used for the 301-style client redirect.
        "kind": "toner" if _is_toner_type(t.get("type")) else "consumable",
        "canonical_url": _cartridge_url(t.get("type"), t["slug"]),
    }


@router.get("/consumable-page/{slug}")
def compat_consumable_page(slug: str):
    """SEO model page for ink cartridges, drums, ribbons, fusers, maintenance
    kits — anything that isn't a laser-powder toner. Same data shape as
    `/toner-page/:slug` so the frontend can render the identical UI."""
    return compat_toner_page(slug)


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
