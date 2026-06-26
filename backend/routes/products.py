"""Product listings (toners, printers, papers, consumables) routes (extracted from server.py)."""
# ruff: noqa: F403, F405  (names provided by the shared-kernel star import from server)
from typing import List, Optional, Dict, Any
import os
import json
import uuid
import asyncio

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Query
from pydantic import BaseModel, EmailStr, Field

from server import *  # noqa: F401,F403  shared kernel: clients, models, helpers, deps
from server import _td, _re, _time, _dd  # noqa: F401  import-alias kernel helpers
from server import (_approved_supplier, _consumable_supplier, _scanner_supplier, _fmt_validation_error, _sort_by_near_city, _supplier_id_for)  # underscore kernel helpers

router = APIRouter(prefix="/api")


# Wave 76 — single source of truth for usage-type normalisation. Dealers
# routinely type "office", "Corporate / Office", "commercial industrial",
# "print shop" etc.; map all of these to the canonical backend tokens
# (home, corporate, commercial, print_shop) so the upload doesn't reject
# perfectly-good rows on a casing/slash technicality.
_USAGE_ALIASES = {
    "home": "home",
    "personal": "home",
    "household": "home",
    "soho": "home",
    "office": "corporate",
    "corporate": "corporate",
    "corporateoffice": "corporate",
    "officecorporate": "corporate",
    "office corporate": "corporate",
    "sme": "corporate",
    "business": "corporate",
    "enterprise": "corporate",
    "commercial": "commercial",
    "industrial": "commercial",
    "commercialindustrial": "commercial",
    "industrialcommercial": "commercial",
    "heavyduty": "commercial",
    "printshop": "print_shop",
    "copycenter": "print_shop",
    "copycentre": "print_shop",
    "printshopcopycenter": "print_shop",
    "printshopcopycentre": "print_shop",
    "shop": "print_shop",
}


def _normalise_usage(value: str) -> Optional[str]:
    """Return the canonical PRINTER_USAGES token for any dealer-typed variant,
    or None if it doesn't resolve."""
    if not value or not isinstance(value, str):
        return None
    # collapse to alphanumerics for forgiving matching
    canon = "".join(c.lower() for c in value if c.isalnum())
    if not canon:
        return None
    if canon in _USAGE_ALIASES:
        return _USAGE_ALIASES[canon]
    # Already canonical?
    if canon in PRINTER_USAGES:
        return canon
    # underscore form: "print_shop"
    if value.lower().strip().replace("-", "_") in PRINTER_USAGES:
        return value.lower().strip().replace("-", "_")
    return None


@router.get("/supplier/listings")
def supplier_listings(user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    rows = sb_admin.table("listings").select("*").eq("supplier_id", s["id"]).order(
        "created_at", desc=True
    ).execute().data or []
    return rows


@router.post("/supplier/listings")
def create_listing(payload: ListingCreate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    if payload.toner_type not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    if not payload.page_yield or int(payload.page_yield) <= 0:
        raise HTTPException(400, "Page yield (sheets) is required")
    # Wave 73 — warranty + cartridge_weight no longer block creation. The bulk
    # table does not expose these fields; fill in sensible defaults so the
    # backend never rejects an otherwise-valid dealer upload.
    warranty_value = (payload.warranty or "").strip() or "1 Year"
    cartridge_weight_value = payload.cartridge_weight if (payload.cartridge_weight and int(payload.cartridge_weight) > 0) else None

    # Resolve toner_master row: use toner_id if given, else find/create by (brand, model)
    t = None
    if payload.toner_id:
        tm = sb_admin.table("toner_master").select("*").eq("id", payload.toner_id).maybe_single().execute()
        t = tm.data if tm and tm.data else None
    if not t:
        if not (payload.brand and payload.model_number):
            raise HTTPException(400, "Provide toner_id or brand+model_number")
        brand = payload.brand.strip()
        model = payload.model_number.strip()
        # Find existing
        existing = sb_admin.table("toner_master").select("*").eq("brand", brand).eq("model_number", model).maybe_single().execute()
        if existing and existing.data:
            t = existing.data
        else:
            insert = {
                "brand": brand,
                "model_number": model,
                "model_normalized": model.lower(),
                "search_norm": re.sub(r"[^a-z0-9]", "", f"{brand}{model}".lower()),
                "color": payload.color or "Black",
                "page_yield": payload.page_yield,
            }
            res = sb_admin.table("toner_master").insert(insert).execute()
            t = res.data[0] if res.data else insert

    row = {
        "supplier_id": s["id"],
        "toner_id": t["id"],
        "brand": sanitize(t["brand"], 80),
        "model_number": sanitize(t["model_number"], 50),
        "search_norm": t.get("search_norm") or re.sub(r"[^a-z0-9]", "", f"{t['brand']}{t['model_number']}".lower()),
        "color": payload.color or t.get("color") or "Black",
        "toner_type": payload.toner_type,
        "price": payload.price,
        "stock": payload.stock,
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
        "city": s["city"],
        "spec_pdf_url": payload.spec_pdf_url or None,
    }
    # Structured specs + image_urls — gracefully degrade per-column when migration not run
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "compatible_models": payload.compatible_models,
        "oem_part_number": payload.oem_part_number,
        "cartridge_weight": cartridge_weight_value,
        "pack_size": payload.pack_size,
        "warranty": warranty_value,
        "print_technology": payload.print_technology,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    listing_row = None
    while True:
        try:
            res = sb_admin.table("listings").insert(row).execute()
            listing_row = res.data[0] if res.data else row
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("spec_pdf_url", "image_urls", "compatible_models", "oem_part_number", "cartridge_weight", "pack_size", "warranty", "print_technology", "intercity_delivery_charge", "gst_rate", "d2d_enabled", "d2d_price"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    # Variants — write each as its own row in listing_variants (best effort)
    saved_variants = []
    if payload.variants and listing_row and listing_row.get("id"):
        try:
            vrows = [
                {"listing_id": listing_row["id"], "color": sanitize(v.color, 40), "price": float(v.price), "stock": int(v.stock)}
                for v in payload.variants[:15]
            ]
            if vrows:
                vres = sb_admin.table("listing_variants").insert(vrows).execute()
                saved_variants = vres.data or vrows
                # Sync top-level listing.price + stock with the cheapest variant for backward compatibility
                cheapest = min(vrows, key=lambda x: x["price"])
                total_stock = sum(int(v["stock"] or 0) for v in vrows)
                try:
                    sb_admin.table("listings").update({"price": cheapest["price"], "stock": total_stock}).eq("id", listing_row["id"]).execute()
                    listing_row["price"] = cheapest["price"]
                    listing_row["stock"] = total_stock
                except Exception:
                    pass
        except Exception as e:
            if "listing_variants" in str(e):
                logger.warning("listing_variants table not migrated — variants ignored")
            else:
                logger.warning("variant insert failed: %s", e)
    listing_row = dict(listing_row or {})
    listing_row["variants"] = saved_variants
    from routes.compat import schedule_notify
    schedule_notify(listing_row, "toner")
    return listing_row


@router.delete("/supplier/listings/{listing_id}")
def delete_listing(listing_id: str, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    sb_admin.table("listings").delete().eq("id", listing_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


@router.post("/supplier/listings/bulk")
def create_listings_bulk(payload: List[dict], user: dict = Depends(require_role("supplier"))):
    """Create many listings at once. Validates EACH row independently (Pydantic
    + business rules) so one bad row never fails the whole batch. Returns
    `{created, errors:[{row, message}], total, succeeded, failed}` so the dealer
    can fix only the bad rows without losing the rest.
    """
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")

    created: List[dict] = []
    errors: List[dict] = []
    for idx, raw in enumerate(payload):
        try:
            listing = create_listing(ListingCreate(**raw), user=user)
            created.append(listing)
        except ValidationError as ve:
            errors.append({"row": idx, "message": _fmt_validation_error(ve)})
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


@router.post("/supplier/printer-image")
async def upload_printer_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Upload a printer image via the backend (service role) — bypasses storage RLS."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload printer images")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = "jpg"
    path = f"{user['id']}/{uuid.uuid4().hex}.{ext}"
    # Wave 84 — preserve the un-watermarked source before compression+watermark
    save_original_to_supabase(path, content, source_bucket="printer-images", content_type=file.content_type or "image/jpeg")
    # Compress / resize so storage stays cheap and pages load fast
    content = compress_image(content, max_side=1200, quality=85)
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": "image/jpeg", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("printer image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    public_url = sb_admin.storage.from_("printer-images").get_public_url(path)
    return {"url": public_url, "path": path}


@router.post("/supplier/listing-image")
async def upload_listing_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Upload a toner / paper listing image via the backend (service role).
    Stored in the `printer-images` bucket (re-used for all product imagery — has public read)."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload listing images")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    path = f"{user['id']}/{uuid.uuid4().hex}.jpg"
    # Wave 84 — preserve the un-watermarked source before compression+watermark
    save_original_to_supabase(path, content, source_bucket="printer-images", content_type=file.content_type or "image/jpeg")
    content = compress_image(content, max_side=1200, quality=85)
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": "image/jpeg", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("listing image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"url": sb_admin.storage.from_("printer-images").get_public_url(path), "path": path}


@router.post("/supplier/printers")
def create_printer(payload: PrinterListingCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list printers")
    if payload.condition not in PRINTER_CONDITIONS:
        raise HTTPException(400, "Invalid condition")
    # Wave 9 — usage_type is now optional/backward-compat; usage_types[] is canonical.
    # Accept either, derive the other.
    # Wave 76 — accept all reasonable dealer-typed variants (case-insensitive,
    # slash/space variants) and map them to the canonical backend tokens.
    usage_types = list(payload.usage_types or [])
    if not usage_types and payload.usage_type:
        usage_types = [payload.usage_type]
    if not usage_types:
        raise HTTPException(400, "At least one usage type is required")
    usage_types = [u for u in (_normalise_usage(u) for u in usage_types) if u]
    if not usage_types:
        raise HTTPException(400, "Invalid usage_types")
    # Deduplicate while preserving order
    seen = set()
    usage_types = [u for u in usage_types if not (u in seen or seen.add(u))]
    primary_usage = usage_types[0]
    if payload.category not in PRINTER_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    # Wave 78 — secondary_category is optional; same allow-list as primary.
    secondary_cat = payload.secondary_category
    if secondary_cat and secondary_cat not in PRINTER_CATEGORIES:
        secondary_cat = None  # silently drop invalid extras rather than reject the row
    if secondary_cat == payload.category:
        secondary_cat = None  # dedupe
    if payload.color not in PRINTER_COLORS:
        raise HTTPException(400, "Invalid color")
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(400, "price and stock must be non-negative")
    # Wave 73 — warranty defaults to "1 Year" if not supplied. The bulk
    # upload table now exposes a Warranty column, but legacy single-form
    # rows that omit it still create successfully.
    printer_warranty_value = (payload.printer_warranty or "").strip() or "1 Year"
    # Wave 12 — printer image upload is now optional (animated fallback in UI)
    sid = _supplier_id_for(user)
    row = {
        "supplier_id": sid,
        "brand": payload.brand.strip(),
        "model_number": payload.model_number.strip(),
        "description": payload.description or "",
        "image_url": payload.image_url or "",
        "condition": payload.condition,
        "usage_type": primary_usage,
        "category": payload.category,
        "color": payload.color,
        "paper_sizes": payload.paper_sizes or [],
        "functions": payload.functions or [],
        "connectivity": payload.connectivity or [],
        "features": payload.features or [],
        "monthly_volume_min": int(payload.monthly_volume_min or 0),
        "monthly_volume_max": int(payload.monthly_volume_max or 0),
        "price": float(payload.price),
        "stock": int(payload.stock),
        "spec_pdf_url": payload.spec_pdf_url or None,
    }
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "print_speed_ppm": payload.print_speed_ppm,
        "duty_cycle": payload.duty_cycle,
        "display_type": payload.display_type,
        "dimensions": payload.dimensions,
        "weight_kg": payload.weight_kg,
        "printer_warranty": printer_warranty_value,
        "max_resolution": payload.max_resolution,
        "mobile_printing": payload.mobile_printing or None,
        "monthly_volume_recommended": payload.monthly_volume_recommended,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "usage_types": usage_types,
        "special_features": payload.special_features or None,
        "compatible_models": payload.compatible_models or None,
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
        "secondary_category": secondary_cat,
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("printer_listings").insert(row).execute()
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("spec_pdf_url", "image_urls", "print_speed_ppm", "duty_cycle", "display_type", "dimensions", "weight_kg", "printer_warranty", "max_resolution", "mobile_printing", "monthly_volume_recommended", "intercity_delivery_charge", "gst_rate", "usage_types", "special_features", "compatible_models", "d2d_enabled", "d2d_price", "secondary_category"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    if not res.data:
        raise HTTPException(500, "Failed to insert printer")
    return {"id": res.data[0]["id"]}


@router.delete("/supplier/printers/{printer_id}")
def delete_printer(printer_id: str, user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    sb_admin.table("printer_listings").delete().eq("id", printer_id).eq("supplier_id", sid).execute()
    return {"ok": True}


@router.post("/supplier/printers/bulk")
async def create_printers_bulk(payload: List[dict], user: dict = Depends(require_role("supplier"))):
    """Create many printer listings at once. Validates EACH row independently
    (Pydantic + business rules) so one bad row never fails the whole batch.
    Returns per-row failures so the dealer can fix only the bad rows."""
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")
    created: List[dict] = []
    errors: List[dict] = []
    for idx, raw in enumerate(payload):
        try:
            row = PrinterListingCreate(**raw)
            created.append(create_printer(row, user=user))
        except ValidationError as ve:
            errors.append({"row": idx, "message": _fmt_validation_error(ve)})
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    # Wave 68 — notify dealer once per bulk batch about any listings that
    # ended up without an image (listings WITH images get significantly more
    # buyer attention so this is high-value friction worth surfacing).
    try:
        missing = [c for c in created if not (c.get("image_url") or "").strip()]
        if missing:
            from email_service import email_printer_images_missing
            await email_printer_images_missing(user, missing)
    except Exception as e:
        logger.warning("printer-images-missing notification failed: %s", e)
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


@router.get("/supplier/printers/mine")
def my_printers(user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    res = sb_admin.table("printer_listings").select("*").eq("supplier_id", sid).order("created_at", desc=True).execute()
    return res.data or []


@router.get("/printers")
def list_printers(
    usage_type: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    paper_size: Optional[str] = None,
    function_: Optional[str] = None,
    connectivity: Optional[str] = None,
    feature: Optional[str] = None,
    special_feature: Optional[str] = None,
    min_volume: Optional[int] = None,
    max_volume: Optional[int] = None,
    city: Optional[str] = None,
    brand: Optional[str] = None,
    supplier_id: Optional[str] = None,
    near_city: Optional[str] = None,
    q: Optional[str] = None,
):
    """Public browse endpoint with optional filters from the MPS flow.
    Wave 9 — supports cascading filter fallback: if strict filters return < 3 rows,
    relax the most-restrictive ones one at a time and re-run, tagging the relaxed
    rows with is_relaxed_match=true."""
    sel = (
        "id,brand,model_number,description,image_url,condition,usage_type,category,"
        "color,paper_sizes,functions,connectivity,features,monthly_volume_min,monthly_volume_max,"
        "price,stock,spec_pdf_url,supplier:suppliers(business_name,city,is_suspended)"
    )
    sel_no_suspend = sel.replace(",is_suspended", "")
    sel_no_brochure = sel_no_suspend.replace(",spec_pdf_url", "")
    # Mutable filter dict so we can progressively pop entries during cascading fallback
    filters = {
        "special_feature": special_feature,
        "feature": feature,
        "connectivity": connectivity,
        "paper_size": paper_size,
        "function_": function_,
        "usage_type": usage_type,
        "category": category,
        "condition": condition,
        "color": color,
        "min_volume": min_volume,
        "max_volume": max_volume,
        "brand": brand,
        "supplier_id": supplier_id,
        "q": q,
    }
    # Cascade order — drop in this order until we have ≥3 results.
    CASCADE_ORDER = ["special_feature", "feature", "connectivity", "paper_size", "function_", "usage_type"]

    def _build_query(select_str, f):
        qry = sb_admin.table("printer_listings").select(select_str).gt("stock", 0)
        if f.get("usage_type") and f["usage_type"] in PRINTER_USAGES:
            # Match either canonical usage_types[] array OR legacy usage_type column
            qry = qry.or_(
                f"usage_type.eq.{f['usage_type']},"
                f"usage_types.cs.{{{f['usage_type']}}}"
            )
        if f.get("category") and f["category"] in PRINTER_CATEGORIES:
            qry = qry.eq("category", f["category"])
        if f.get("condition") and f["condition"] in PRINTER_CONDITIONS:
            qry = qry.eq("condition", f["condition"])
        if f.get("color") and f["color"] in PRINTER_COLORS:
            if f["color"] == "color":
                qry = qry.in_("color", ["color", "both"])
            elif f["color"] == "bw":
                qry = qry.in_("color", ["bw", "both"])
            else:
                qry = qry.eq("color", "both")
        if f.get("paper_size"):
            qry = qry.contains("paper_sizes", [f["paper_size"]])
        if f.get("function_"):
            qry = qry.contains("functions", [f["function_"]])
        if f.get("connectivity"):
            qry = qry.contains("connectivity", [f["connectivity"]])
        if f.get("feature"):
            qry = qry.contains("features", [f["feature"]])
        if f.get("special_feature"):
            qry = qry.contains("special_features", [f["special_feature"]])
        if f.get("min_volume") is not None:
            qry = qry.gte("monthly_volume_max", f["min_volume"])
        if f.get("max_volume") is not None:
            qry = qry.lte("monthly_volume_min", f["max_volume"])
        if f.get("brand"):
            qry = qry.ilike("brand", f"%{f['brand']}%")
        if f.get("supplier_id"):
            qry = qry.eq("supplier_id", f["supplier_id"])
        if f.get("q"):
            qry = qry.or_(f"brand.ilike.%{f['q']}%,model_number.ilike.%{f['q']}%,description.ilike.%{f['q']}%")
        return qry.order("created_at", desc=True).limit(200)

    def _run(select_str, f):
        try:
            return _build_query(select_str, f).execute()
        except Exception as e:
            msg = str(e)
            # Fallback when columns missing from migrations
            for column in ("special_features", "usage_types", "is_suspended", "spec_pdf_url"):
                if column in msg:
                    # Re-run with that filter dropped or with a lighter select string
                    if column == "special_features":
                        f = {**f, "special_feature": None}
                        return _run(select_str, f)
                    if column == "usage_types":
                        # Fall back to plain usage_type equality
                        ut = f.get("usage_type")
                        f = {**f, "usage_type": None}
                        try:
                            qry = _build_query(select_str, f)
                            if ut:
                                qry = qry.eq("usage_type", ut)
                            return qry.execute()
                        except Exception:
                            return _run(select_str, f)
                    if column == "is_suspended":
                        return _run(sel_no_suspend, f)
                    if column == "spec_pdf_url":
                        return _run(sel_no_brochure, f)
            raise

    # Initial strict run
    strict_filters = dict(filters)
    res = _run(sel, strict_filters)
    rows = res.data or []
    relaxed = False
    dropped_filters: List[str] = []
    # Cascade until we have ≥3 results or no more relaxable filters
    f_state = dict(strict_filters)
    for key in CASCADE_ORDER:
        if len(rows) >= 3:
            break
        if not f_state.get(key):
            continue
        dropped_filters.append(key)
        f_state[key] = None
        relaxed = True
        res = _run(sel, f_state)
        rows = res.data or []
    out = []
    # Treat common India city aliases as equivalent for filtering
    _CITY_ALIASES = {
        "bangalore": {"bangalore", "bengaluru"},
        "bengaluru": {"bangalore", "bengaluru"},
        "bombay": {"bombay", "mumbai"},
        "mumbai": {"bombay", "mumbai"},
        "calcutta": {"calcutta", "kolkata"},
        "kolkata": {"calcutta", "kolkata"},
        "madras": {"madras", "chennai"},
        "chennai": {"madras", "chennai"},
    }
    want = (city or "").lower()
    accepted = _CITY_ALIASES.get(want, {want}) if want else None
    for r in rows:
        sup = r.pop("supplier", None) or {}
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name", "")
        r["city"] = sup.get("city", "")
        if accepted is not None and r["city"].lower() not in accepted:
            continue
        if relaxed:
            r["is_relaxed_match"] = True
        out.append(r)
    if near_city and not (city and city.strip()):
        out = _sort_by_near_city(out, near_city)
    return out


@router.post("/supplier/spec-pdf")
async def upload_spec_pdf(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """Approved supplier uploads a product brochure (PDF, max 10 MB).
    Stored in the private `supplier-documents` bucket. Returns the storage path."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload brochures")
    if not file.content_type or file.content_type != "application/pdf":
        raise HTTPException(400, "Brochure must be a PDF")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Brochure must be under 10 MB")
    path = f"{user['id']}/brochure-{uuid.uuid4().hex}.pdf"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": "application/pdf", "upsert": "false"}
        )
    except Exception as e:
        logger.exception("brochure upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"path": path}


@router.get("/listings/{listing_id}/brochure")
def listing_brochure_url(listing_id: str, listing_type: str = "toner",
                         user: dict = Depends(require_user)):
    """Returns a short-lived signed URL for the brochure PDF, if any.
    Authenticated buyers / sellers only."""
    if listing_type not in ("toner", "printer"):
        raise HTTPException(400, "listing_type must be 'toner' or 'printer'")
    table = "printer_listings" if listing_type == "printer" else "listings"
    try:
        row = sb_admin.table(table).select("spec_pdf_url").eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        logger.warning("spec_pdf_url column missing (migration pending): %s", e)
        raise HTTPException(404, "No brochure available") from e
    if not row or not row.data:
        raise HTTPException(404, "Listing not found")
    path = (row.data or {}).get("spec_pdf_url")
    if not path:
        raise HTTPException(404, "No brochure available")
    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 5)
        return {"url": signed.get("signedURL") or signed.get("signed_url")}
    except Exception as e:
        logger.warning("brochure sign failed: %s", e)
        raise HTTPException(500, "Could not generate download URL") from e


@router.post("/supplier/listing-spec-pdf")
def attach_spec_pdf(payload: SpecPdfPath, user: dict = Depends(require_user)):
    """Approved supplier attaches an uploaded brochure path to one of their listings."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can update listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    table = "printer_listings" if payload.listing_type == "printer" else "listings"
    try:
        sb_admin.table(table).update({"spec_pdf_url": payload.spec_pdf_url}).eq(
            "id", payload.listing_id
        ).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        logger.warning("attach_spec_pdf failed (column missing?): %s", e)
        raise HTTPException(500, "spec_pdf column not yet migrated — run supabase_schema_quotation_featured.sql") from e
    return {"ok": True}


@router.post("/supplier/papers")
def create_paper(payload: PaperCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list papers")
    s = sb_admin.table("suppliers").select("id,city").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    # Wave 49 — paper warranty (reams batch QC coverage) is now mandatory.
    if not payload.warranty or not str(payload.warranty).strip():
        raise HTTPException(400, "Warranty is required")
    row = {
        "supplier_id": s.data["id"],
        "brand": sanitize(payload.brand, 80),
        "size": payload.size,
        "gsm": int(payload.gsm),
        "reams_per_box": int(payload.reams_per_box),
        "price_per_ream": float(payload.price_per_ream),
        "stock": int(payload.stock),
        "city": payload.city or s.data.get("city"),
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
    }
    optional_cols = {
        "image_urls": payload.image_urls or None,
        "brightness": payload.brightness,
        "thickness_microns": payload.thickness_microns,
        "acid_free": payload.acid_free,
        "suitable_for": payload.suitable_for or None,
        "description": (payload.description or "").strip() or None,
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "warranty": payload.warranty,
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("paper_listings").insert(row).execute()
            return res.data[0] if res.data else row
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("image_urls", "brightness", "thickness_microns", "acid_free", "suitable_for", "description", "intercity_delivery_charge", "gst_rate", "warranty", "d2d_enabled", "d2d_price"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if dropped:
                continue
            logger.warning("create_paper failed: %s", e)
            raise HTTPException(503, "paper_listings table not yet migrated — run supabase_schema_papers.sql") from e


@router.post("/supplier/papers/bulk")
def create_papers_bulk(payload: List[dict], user: dict = Depends(require_role("supplier"))):
    """Create many paper listings at once. Validates EACH row independently
    (Pydantic + business rules) so one bad row never fails the whole batch.
    Returns per-row failures so the dealer can fix only the bad rows."""
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")
    created: List[dict] = []
    errors: List[dict] = []
    for idx, raw in enumerate(payload):
        try:
            row = PaperCreate(**raw)
            created.append(create_paper(row, user=user))
        except ValidationError as ve:
            errors.append({"row": idx, "message": _fmt_validation_error(ve)})
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


@router.get("/supplier/papers/mine")
def my_papers(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        return []
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        return []
    try:
        rows = sb_admin.table("paper_listings").select("*").eq("supplier_id", s.data["id"]).order(
            "created_at", desc=True
        ).execute().data or []
        return rows
    except Exception:
        return []


@router.delete("/supplier/papers/{paper_id}")
def delete_paper(paper_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can delete papers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    sb_admin.table("paper_listings").delete().eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True}


@router.get("/papers")
def list_papers(brand: Optional[str] = None, size: Optional[str] = None,
                 gsm: Optional[int] = None, city: Optional[str] = None,
                 near_city: Optional[str] = None,
                 limit: int = 200):
    try:
        qry = sb_admin.table("paper_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).gt("stock", 0).order("created_at", desc=True).limit(limit)
        if brand:
            qry = qry.ilike("brand", f"%{brand}%")
        if size:
            qry = qry.eq("size", size)
        if gsm:
            qry = qry.eq("gsm", int(gsm))
        if city:
            qry = qry.eq("city", city)
        rows = qry.execute().data or []
    except Exception as e:
        msg = str(e)
        if "is_suspended" in msg or "paper_listings" in msg:
            try:
                qry = sb_admin.table("paper_listings").select(
                    "*,suppliers(business_name,city)"
                ).gt("stock", 0).order("created_at", desc=True).limit(limit)
                if brand:
                    qry = qry.ilike("brand", f"%{brand}%")
                if size:
                    qry = qry.eq("size", size)
                if gsm:
                    qry = qry.eq("gsm", int(gsm))
                if city:
                    qry = qry.eq("city", city)
                rows = qry.execute().data or []
            except Exception:
                return []
        else:
            raise
    out = []
    for r in rows:
        sup = r.pop("suppliers", None) or {}
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name")
        r["supplier_city"] = sup.get("city")
        out.append(r)
    if near_city and not (city and city.strip()):
        out = _sort_by_near_city(out, near_city)
    return out


@router.post("/supplier/consumables")
def create_consumable(payload: ConsumableCreate, user: dict = Depends(require_user)):
    s = _consumable_supplier(user)
    sub = payload.subcategory if payload.subcategory in CONSUMABLE_SUBCATEGORIES else "Other"
    brand = sanitize(payload.brand, 80)
    model = sanitize(payload.model_number, 80)
    # Wave 73 — relax mandatory warranty / page-yield / cartridge-weight on
    # consumables. The bulk-upload table doesn't expose any of these fields;
    # the backend now applies sensible defaults instead of rejecting the row.
    consumable_warranty = (payload.warranty or "").strip() or "1 Year"
    cartridge_weight_value = payload.cartridge_weight if (payload.cartridge_weight and int(payload.cartridge_weight) > 0) else None
    page_yield_value = payload.page_yield if (payload.page_yield and int(payload.page_yield) > 0) else None
    row = {
        "supplier_id": s["id"],
        "subcategory": sub,
        "brand": brand,
        "model_number": model,
        "condition": payload.condition or "New",
        "price": float(payload.price),
        "stock": int(payload.stock),
        "city": payload.city or s.get("city"),
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
        "search_norm": re.sub(r"[^a-z0-9]", "", f"{brand}{model}".lower()),
    }
    optional_cols = {
        "subcategory_other": (payload.subcategory_other or "").strip() or None,
        "compatible_models": (payload.compatible_models or "").strip() or None,
        "description": (payload.description or "").strip() or None,
        "image_urls": payload.image_urls or None,
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "warranty": consumable_warranty,
        "page_yield": page_yield_value,
        "cartridge_weight": cartridge_weight_value,
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("consumable_listings").insert(row).execute()
            created = res.data[0] if res.data else row
            from routes.compat import schedule_notify
            schedule_notify(created, "consumable")
            return created
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("subcategory_other", "compatible_models", "description", "image_urls",
                      "gst_rate", "intercity_delivery_charge", "warranty", "page_yield",
                      "cartridge_weight", "d2d_enabled", "d2d_price", "search_norm"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if dropped:
                continue
            logger.warning("create_consumable failed: %s", e)
            raise HTTPException(503, "consumable_listings table not yet migrated — run supabase_schema_consumables.sql") from e


@router.post("/supplier/consumables/bulk")
def create_consumables_bulk(payload: List[dict], user: dict = Depends(require_role("supplier"))):
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")
    created: List[dict] = []
    errors: List[dict] = []
    for idx, raw in enumerate(payload):
        try:
            created.append(create_consumable(ConsumableCreate(**raw), user=user))
        except ValidationError as ve:
            errors.append({"row": idx, "message": _fmt_validation_error(ve)})
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


@router.get("/supplier/consumables/mine")
def my_consumables(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        return []
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        return []
    try:
        return sb_admin.table("consumable_listings").select("*").eq("supplier_id", s.data["id"]).order(
            "created_at", desc=True
        ).execute().data or []
    except Exception:
        return []


@router.put("/supplier/consumables/{consumable_id}")
def update_consumable(consumable_id: str, payload: ConsumablePatch, user: dict = Depends(require_user)):
    s = _consumable_supplier(user)
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not upd:
        return {"ok": True}
    while True:
        try:
            sb_admin.table("consumable_listings").update(upd).eq("id", consumable_id).eq("supplier_id", s["id"]).execute()
            return {"ok": True}
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in list(upd.keys()):
                if k in msg:
                    upd.pop(k, None)
                    dropped = True
                    break
            if not dropped or not upd:
                raise HTTPException(503, "consumable_listings update failed — run supabase_schema_consumables.sql") from e


@router.delete("/supplier/consumables/{consumable_id}")
def delete_consumable(consumable_id: str, user: dict = Depends(require_user)):
    s = _consumable_supplier(user)
    sb_admin.table("consumable_listings").delete().eq("id", consumable_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


@router.get("/consumables")
def list_consumables(subcategory: Optional[str] = None, brand: Optional[str] = None,
                     q: Optional[str] = None, city: Optional[str] = None,
                     near_city: Optional[str] = None, limit: int = 200):
    def _run(select_cols):
        qry = sb_admin.table("consumable_listings").select(select_cols).gt("stock", 0).order(
            "created_at", desc=True
        ).limit(limit)
        if subcategory and subcategory != "all":
            qry = qry.eq("subcategory", subcategory)
        if brand:
            qry = qry.ilike("brand", f"%{brand}%")
        if city:
            qry = qry.eq("city", city)
        if q:
            qry = qry.ilike("search_norm", f"%{normalize(q)}%")
        return qry.execute().data or []
    try:
        rows = _run("*,suppliers(business_name,city,is_suspended)")
    except Exception as e:
        msg = str(e)
        if "consumable_listings" in msg and "does not exist" in msg:
            return []
        if "is_suspended" in msg:
            try:
                rows = _run("*,suppliers(business_name,city)")
            except Exception:
                return []
        elif "search_norm" in msg:
            # search_norm column missing — drop q filter
            try:
                qry = sb_admin.table("consumable_listings").select("*,suppliers(business_name,city)").gt("stock", 0).order("created_at", desc=True).limit(limit)
                if subcategory and subcategory != "all":
                    qry = qry.eq("subcategory", subcategory)
                if brand:
                    qry = qry.ilike("brand", f"%{brand}%")
                if city:
                    qry = qry.eq("city", city)
                rows = qry.execute().data or []
            except Exception:
                return []
        else:
            return []
    out = []
    for r in rows:
        sup = r.pop("suppliers", None) or {}
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name")
        r["supplier_city"] = sup.get("city")
        out.append(r)
    if near_city and not (city and city.strip()):
        out = _sort_by_near_city(out, near_city)
    return out


@router.get("/consumables/subcategories")
def consumable_subcategories():
    """Returns subcategories with live counts (for tab badges)."""
    try:
        rows = sb_admin.table("consumable_listings").select("subcategory").gt("stock", 0).execute().data or []
    except Exception:
        rows = []
    counts: dict = {}
    for r in rows:
        sub = r.get("subcategory") or "Other"
        counts[sub] = counts.get(sub, 0) + 1
    return {"counts": counts, "total": sum(counts.values())}


@router.get("/consumables/{consumable_id}/public")
def get_consumable_public(consumable_id: str):
    try:
        r = sb_admin.table("consumable_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", consumable_id).maybe_single().execute()
    except Exception:
        r = sb_admin.table("consumable_listings").select("*").eq("id", consumable_id).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(404, "Consumable not found")
    data = dict(r.data)
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    return data


# =============================================================================
# Scanners — supplier CRUD + buyer feed (Wave 21)
# =============================================================================

SCANNER_OPTIONAL_DROP = (
    "scan_resolution", "connectivity", "scan_speed_ppm", "color_mode", "warranty",
    "description", "image_urls", "gst_rate", "intercity_delivery_charge",
    "d2d_enabled", "d2d_price", "search_norm",
)


@router.post("/supplier/scanners")
def create_scanner(payload: ScannerCreate, user: dict = Depends(require_user)):
    s = _scanner_supplier(user)
    brand = sanitize(payload.brand, 80)
    model = sanitize(payload.model_number, 80)
    stype = payload.scanner_type if payload.scanner_type in SCANNER_TYPES else "Flatbed"
    conn = [c for c in (payload.connectivity or []) if c in SCANNER_CONNECTIVITY]
    row = {
        "supplier_id": s["id"],
        "brand": brand,
        "model_number": model,
        "scanner_type": stype,
        "condition": payload.condition if payload.condition in SCANNER_CONDITIONS else "New",
        "price": float(payload.price),
        "stock": int(payload.stock),
        "city": payload.city or s.get("city"),
        "image_url": payload.image_url or (payload.image_urls[0] if payload.image_urls else None),
        "search_norm": re.sub(r"[^a-z0-9]", "", f"{brand}{model}".lower()),
    }
    optional_cols = {
        "scan_resolution": payload.scan_resolution if payload.scan_resolution in SCANNER_RESOLUTIONS else None,
        "connectivity": conn or None,
        "scan_speed_ppm": (float(payload.scan_speed_ppm) if payload.scan_speed_ppm is not None else None),
        "color_mode": payload.color_mode if payload.color_mode in SCANNER_COLOR_MODES else None,
        "warranty": payload.warranty if payload.warranty in SCANNER_WARRANTIES else None,
        "description": (payload.description or "").strip() or None,
        "image_urls": payload.image_urls or None,
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "intercity_delivery_charge": (float(payload.intercity_delivery_charge) if payload.intercity_delivery_charge is not None else None),
        "d2d_enabled": bool(payload.d2d_enabled) if payload.d2d_enabled is not None else None,
        "d2d_price": (float(payload.d2d_price) if payload.d2d_price else None),
    }
    for k, v in optional_cols.items():
        if v is not None:
            row[k] = v
    while True:
        try:
            res = sb_admin.table("scanner_listings").insert(row).execute()
            return res.data[0] if res.data else row
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in SCANNER_OPTIONAL_DROP:
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if dropped:
                continue
            logger.warning("create_scanner failed: %s", e)
            raise HTTPException(503, "scanner_listings table not yet migrated — run supabase_schema_scanners.sql") from e


@router.post("/supplier/scanners/bulk")
def create_scanners_bulk(payload: List[dict], user: dict = Depends(require_role("supplier"))):
    if not payload:
        raise HTTPException(400, "No rows provided")
    if len(payload) > 200:
        raise HTTPException(400, "Bulk upload is limited to 200 rows per request")
    created: List[dict] = []
    errors: List[dict] = []
    for idx, raw in enumerate(payload):
        try:
            created.append(create_scanner(ScannerCreate(**raw), user=user))
        except ValidationError as ve:
            errors.append({"row": idx, "message": _fmt_validation_error(ve)})
        except HTTPException as he:
            errors.append({"row": idx, "message": he.detail if isinstance(he.detail, str) else str(he.detail)})
        except Exception as e:
            errors.append({"row": idx, "message": str(e)[:240]})
    return {"created": created, "errors": errors, "total": len(payload), "succeeded": len(created), "failed": len(errors)}


@router.get("/supplier/scanners/mine")
def my_scanners(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        return []
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        return []
    try:
        return sb_admin.table("scanner_listings").select("*").eq("supplier_id", s.data["id"]).order(
            "created_at", desc=True
        ).execute().data or []
    except Exception:
        return []


@router.put("/supplier/scanners/{scanner_id}")
def update_scanner(scanner_id: str, payload: ScannerPatch, user: dict = Depends(require_user)):
    s = _scanner_supplier(user)
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not upd:
        return {"ok": True}
    while True:
        try:
            sb_admin.table("scanner_listings").update(upd).eq("id", scanner_id).eq("supplier_id", s["id"]).execute()
            return {"ok": True}
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in list(upd.keys()):
                if k in msg:
                    upd.pop(k, None)
                    dropped = True
                    break
            if not dropped or not upd:
                raise HTTPException(503, "scanner_listings update failed — run supabase_schema_scanners.sql") from e


@router.delete("/supplier/scanners/{scanner_id}")
def delete_scanner(scanner_id: str, user: dict = Depends(require_user)):
    s = _scanner_supplier(user)
    sb_admin.table("scanner_listings").delete().eq("id", scanner_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


@router.get("/scanners")
def list_scanners(scanner_type: Optional[str] = None, brand: Optional[str] = None,
                  condition: Optional[str] = None, q: Optional[str] = None,
                  city: Optional[str] = None, near_city: Optional[str] = None, limit: int = 200):
    def _run(select_cols):
        qry = sb_admin.table("scanner_listings").select(select_cols).gt("stock", 0).order(
            "created_at", desc=True
        ).limit(limit)
        if scanner_type and scanner_type != "all":
            qry = qry.eq("scanner_type", scanner_type)
        if brand:
            qry = qry.ilike("brand", f"%{brand}%")
        if condition:
            qry = qry.eq("condition", condition)
        if city:
            qry = qry.eq("city", city)
        if q:
            qry = qry.ilike("search_norm", f"%{normalize(q)}%")
        return qry.execute().data or []
    try:
        rows = _run("*,suppliers(business_name,city,is_suspended)")
    except Exception as e:
        msg = str(e)
        if "scanner_listings" in msg and "does not exist" in msg:
            return []
        if "is_suspended" in msg:
            try:
                rows = _run("*,suppliers(business_name,city)")
            except Exception:
                return []
        elif "search_norm" in msg:
            try:
                qry = sb_admin.table("scanner_listings").select("*,suppliers(business_name,city)").gt("stock", 0).order("created_at", desc=True).limit(limit)
                if scanner_type and scanner_type != "all":
                    qry = qry.eq("scanner_type", scanner_type)
                if brand:
                    qry = qry.ilike("brand", f"%{brand}%")
                if city:
                    qry = qry.eq("city", city)
                rows = qry.execute().data or []
            except Exception:
                return []
        else:
            return []
    out = []
    for r in rows:
        sup = r.pop("suppliers", None) or {}
        if sup.get("is_suspended"):
            continue
        r["supplier_name"] = sup.get("business_name")
        r["supplier_city"] = sup.get("city")
        out.append(r)
    if near_city and not (city and city.strip()):
        out = _sort_by_near_city(out, near_city)
    return out


@router.get("/scanners/{scanner_id}/public")
def get_scanner_public(scanner_id: str):
    try:
        r = sb_admin.table("scanner_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", scanner_id).maybe_single().execute()
    except Exception:
        r = sb_admin.table("scanner_listings").select("*").eq("id", scanner_id).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(404, "Scanner not found")
    data = dict(r.data)
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    return data



@router.post("/listings/{listing_id}/view")
def record_listing_view(listing_id: str, payload: ListingViewPing, request: Request):
    """Anonymous, best-effort product-view ping. Records the viewer's selected
    city so dealers get basic 'who viewed me, from where' analytics.
    Degrades silently (no error) when the listing_views table is not migrated."""
    viewer_id = None
    tok = get_token(request)
    if tok:
        try:
            u = get_user_from_token(tok)
            if u:
                viewer_id = u.id
        except Exception:
            viewer_id = None
    kind = (payload.kind or "toner").strip().lower()
    if kind not in ("toner", "printer", "paper"):
        kind = "toner"
    row = {
        "listing_id": listing_id,
        "listing_kind": kind,
        "viewer_city": (payload.city or "").strip() or None,
        "viewer_id": viewer_id,
    }
    try:
        sb_admin.table("listing_views").insert(row).execute()
    except Exception as e:
        # Migration pending or any insert issue — never block the page.
        if "listing_views" not in str(e):
            logger.warning("listing view ping failed: %s", e)
    return {"ok": True}


@router.get("/supplier/analytics/views")
def supplier_view_analytics(user: dict = Depends(require_user)):
    """Aggregated view analytics for the calling supplier's listings.
    Returns total_views + a per-city breakdown (sorted desc)."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can view analytics")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    supplier_id = s.data["id"]

    # Collect this supplier's listing ids across all three product tables.
    listing_ids: list = []
    for table in ("listings", "printer_listings", "paper_listings"):
        try:
            rows = sb_admin.table(table).select("id").eq("supplier_id", supplier_id).execute().data or []
            listing_ids.extend([r["id"] for r in rows if r.get("id")])
        except Exception:
            continue
    if not listing_ids:
        return {"total_views": 0, "by_city": []}

    try:
        views = sb_admin.table("listing_views").select("viewer_city").in_("listing_id", listing_ids).execute().data or []
    except Exception:
        # listing_views table not migrated yet — graceful empty.
        return {"total_views": 0, "by_city": []}

    by_city: dict = {}
    for v in views:
        c = (v.get("viewer_city") or "Unknown").strip() or "Unknown"
        by_city[c] = by_city.get(c, 0) + 1
    breakdown = sorted(
        [{"city": k, "count": val} for k, val in by_city.items()],
        key=lambda x: x["count"], reverse=True,
    )
    return {"total_views": len(views), "by_city": breakdown}


@router.put("/supplier/listings/{listing_id}")
def supplier_patch_listing(listing_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    # Numeric guards
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price is not None and payload.price > 0:
        upd["price"] = float(payload.price)
    if payload.page_yield is not None:
        upd["page_yield"] = int(payload.page_yield)
    if payload.cartridge_weight is not None:
        upd["cartridge_weight"] = int(payload.cartridge_weight)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    # Text / list pass-through fields
    for k in ("brand", "model_number", "color", "toner_type", "image_url", "image_urls",
              "compatible_models", "oem_part_number", "warranty", "print_technology"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    if not upd:
        return {"ok": True, "updated": []}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Best-effort: drop columns that may not exist (degrade gracefully)
    try:
        sb_admin.table("listings").update(upd).eq("id", listing_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        # Surface a clear error when the request is *only* about D2D fields
        # and the corresponding columns are missing — silent success here
        # would mislead the dealer into thinking D2D is on.
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = {k for k in upd.keys() if k != "updated_at"}
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("listings").update(retry).eq("id", listing_id).eq("supplier_id", s.data["id"]).execute()
    # Keep listing_variants.price in sync — bulk-edit and single-edit forms
    # only expose ONE price input. If a card uses listings.price and the
    # detail page uses variant.price, divergence here causes the buyer to
    # see two different numbers for the same SKU (CRG 303 incident).
    if "price" in upd:
        try:
            sb_admin.table("listing_variants").update({"price": upd["price"]}).eq("listing_id", listing_id).execute()
        except Exception as e:
            logger.warning("variant price sync failed for listing %s: %s", listing_id, e)
    return {"ok": True, "updated": list(upd.keys())}


@router.put("/supplier/printers/{printer_id}")
def supplier_patch_printer(printer_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit printers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price is not None and payload.price > 0:
        upd["price"] = float(payload.price)
    if payload.print_speed_ppm is not None:
        upd["print_speed_ppm"] = int(payload.print_speed_ppm)
    if payload.duty_cycle is not None:
        upd["duty_cycle"] = int(payload.duty_cycle)
    if payload.monthly_volume_min is not None:
        upd["monthly_volume_min"] = int(payload.monthly_volume_min)
    if payload.monthly_volume_max is not None:
        upd["monthly_volume_max"] = int(payload.monthly_volume_max)
    if payload.monthly_volume_recommended is not None:
        upd["monthly_volume_recommended"] = int(payload.monthly_volume_recommended)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.usage_types is not None:
        # Wave 76 — same alias normalisation applies on update so dealer edits
        # via the bulk-edit / supplier UI never reject lowercase "office" etc.
        normalised = [u for u in (_normalise_usage(u) for u in payload.usage_types) if u]
        seen = set()
        normalised = [u for u in normalised if not (u in seen or seen.add(u))]
        upd["usage_types"] = normalised
        if normalised:
            upd["usage_type"] = normalised[0]
    if payload.special_features is not None:
        upd["special_features"] = payload.special_features
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    for k in ("brand", "model_number", "description", "image_url", "image_urls",
              "usage_type", "category", "color", "functions", "connectivity",
              "paper_sizes", "mobile_printing", "max_resolution", "condition",
              "compatible_models"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if not upd:
        return {"ok": True, "updated": []}
    try:
        sb_admin.table("printer_listings").update(upd).eq("id", printer_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = set(upd.keys())
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("printer_listings").update(retry).eq("id", printer_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True, "updated": list(upd.keys())}


@router.post("/supplier/listings/{listing_id}/duplicate")
def duplicate_listing(listing_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can duplicate listings")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    src = sb_admin.table("listings").select("*").eq("id", listing_id).eq("supplier_id", s.data["id"]).maybe_single().execute()
    if not src or not src.data:
        raise HTTPException(404, "Listing not found")
    row = {k: v for k, v in src.data.items() if k not in {"id", "created_at", "updated_at"}}
    row["stock"] = 1
    res = sb_admin.table("listings").insert(row).execute()
    return res.data[0] if res.data else row


@router.post("/supplier/printers/{printer_id}/duplicate")
def duplicate_printer(printer_id: str, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can duplicate printers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    src = sb_admin.table("printer_listings").select("*").eq("id", printer_id).eq("supplier_id", s.data["id"]).maybe_single().execute()
    if not src or not src.data:
        raise HTTPException(404, "Printer not found")
    row = {k: v for k, v in src.data.items() if k not in {"id", "created_at", "updated_at"}}
    row["stock"] = 1
    res = sb_admin.table("printer_listings").insert(row).execute()
    return res.data[0] if res.data else row


@router.put("/supplier/papers/{paper_id}")
def patch_paper(paper_id: str, payload: ListingPatch, user: dict = Depends(require_user)):
    """Edit paper listings — price, stock, size, gsm, specs, intercity delivery."""
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can edit papers")
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    upd: dict = {}
    if payload.stock is not None and payload.stock >= 0:
        upd["stock"] = int(payload.stock)
    if payload.price_per_ream is not None and payload.price_per_ream > 0:
        upd["price_per_ream"] = float(payload.price_per_ream)
    elif payload.price is not None and payload.price > 0:
        upd["price_per_ream"] = float(payload.price)
    if payload.gsm is not None:
        upd["gsm"] = int(payload.gsm)
    if payload.brightness is not None:
        upd["brightness"] = int(payload.brightness)
    if payload.thickness_microns is not None:
        upd["thickness_microns"] = int(round(float(payload.thickness_microns)))
    if payload.acid_free is not None:
        upd["acid_free"] = bool(payload.acid_free)
    if payload.reams_per_box is not None:
        upd["reams_per_box"] = int(payload.reams_per_box)
    if payload.intercity_delivery_charge is not None:
        upd["intercity_delivery_charge"] = float(payload.intercity_delivery_charge)
    if payload.gst_rate is not None:
        upd["gst_rate"] = int(payload.gst_rate)
    if payload.d2d_enabled is not None:
        upd["d2d_enabled"] = bool(payload.d2d_enabled)
    if payload.d2d_price is not None:
        upd["d2d_price"] = float(payload.d2d_price) if payload.d2d_price else None
    for k in ("brand", "size", "image_url", "image_urls", "suitable_for"):
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if not upd:
        return {"ok": True, "updated": []}
    try:
        sb_admin.table("paper_listings").update(upd).eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    except Exception as e:
        msg = str(e)
        if "paper_listings" in msg and "does not exist" in msg:
            raise HTTPException(503, "paper_listings table not yet migrated") from e
        d2d_keys = {"d2d_enabled", "d2d_price"}
        non_meta = set(upd.keys())
        if non_meta and non_meta.issubset(d2d_keys) and ("d2d_enabled" in msg or "d2d_price" in msg):
            raise HTTPException(503, "D2D columns not migrated yet. Apply supabase_schema_d2d.sql to enable Dealer-to-Dealer pricing.")
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("paper_listings").update(retry).eq("id", paper_id).eq("supplier_id", s.data["id"]).execute()
    return {"ok": True, "updated": list(upd.keys())}


@router.get("/listings/{listing_id}")
def get_listing(listing_id: str):
    """Single listing lookup for buyer one-click reorder. Falls back gracefully when
    the optional `suppliers.is_suspended` column has not been migrated yet."""
    try:
        r = sb_admin.table("listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        msg = str(e)
        if "is_suspended" in msg:
            try:
                r = sb_admin.table("listings").select(
                    "*,suppliers(business_name,city)"
                ).eq("id", listing_id).maybe_single().execute()
            except Exception:
                r = None
        else:
            logger.warning("get_listing select failed: %s", e)
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Listing not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    if sup.get("is_suspended"):
        raise HTTPException(410, "This product is no longer available from this supplier")
    if (data.get("stock") or 0) <= 0:
        raise HTTPException(410, "Out of stock")
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    # Attach variants (best effort)
    try:
        v = sb_admin.table("listing_variants").select("*").eq("listing_id", data["id"]).order("price").execute()
        data["variants"] = v.data or []
    except Exception:
        data["variants"] = []
    return data


@router.get("/listings/{listing_id}/public")
def get_listing_public(listing_id: str):
    """Viewable-without-login product page. Same shape as /listings/{id} but does NOT 410 on out-of-stock —
    just attaches stock=0 so the UI can disable the Add to Cart / Buy Now buttons."""
    try:
        r = sb_admin.table("listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("listings").select("*,suppliers(business_name,city)").eq("id", listing_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Listing not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    try:
        v = sb_admin.table("listing_variants").select("*").eq("listing_id", data["id"]).order("price").execute()
        data["variants"] = v.data or []
    except Exception:
        data["variants"] = []
    return data


@router.get("/printers/{printer_id}/public")
def get_printer_public(printer_id: str):
    try:
        r = sb_admin.table("printer_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", printer_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("printer_listings").select("*,suppliers(business_name,city)").eq("id", printer_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Printer not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    return data


@router.get("/papers/{paper_id}/public")
def get_paper_public(paper_id: str):
    try:
        r = sb_admin.table("paper_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).eq("id", paper_id).maybe_single().execute()
    except Exception as e:
        if "is_suspended" in str(e):
            r = sb_admin.table("paper_listings").select("*,suppliers(business_name,city)").eq("id", paper_id).maybe_single().execute()
        else:
            r = None
    if not r or not r.data:
        raise HTTPException(404, "Paper not found")
    data = r.data
    sup = data.pop("suppliers", None) or {}
    data["supplier_name"] = sup.get("business_name")
    data["supplier_city"] = sup.get("city")
    data["supplier_suspended"] = bool(sup.get("is_suspended"))
    return data


# ---------- Related products ("You may also need" on product detail pages) ----------

_RELATED_TABLES = {
    "toner": "listings",
    "printer": "printer_listings",
    "consumable": "consumable_listings",
    "scanner": "scanner_listings",
    "paper": "paper_listings",
}


def _related_card(L: dict, kind: str) -> dict:
    if kind == "paper":
        title = f"{L.get('brand') or ''} {L.get('size') or 'A4'} · {L.get('gsm') or ''} GSM".strip()
        price = L.get("price_per_ream")
    else:
        title = (L.get("model_number") or "").strip() or (L.get("brand") or "")
        price = L.get("price")
    return {
        "id": L["id"],
        "kind": kind,
        "brand": L.get("brand"),
        "title": title,
        "price": float(price or 0),
        "image_url": L.get("image_url"),
        "color": L.get("color"),
        "city": L.get("city"),
        "url": f"/{kind}/{L['id']}",
    }


@router.get("/related/{kind}/{listing_id}")
def related_products(kind: str, listing_id: str):
    """Up to 6 in-stock related dealer products for a detail page:
    same-brand items of the same kind first, compatible toners for printers,
    then cheap paper as a universal cross-sell."""
    table = _RELATED_TABLES.get(kind)
    if not table:
        raise HTTPException(400, "Unknown product kind")
    try:
        base_res = sb_admin.table(table).select("*").eq("id", listing_id).maybe_single().execute()
        base = base_res.data if base_res else None
    except Exception:
        base = None
    if not base:
        return {"items": []}

    items, seen = [], {(kind, listing_id)}

    def add(rows, k, limit=6):
        for L in rows or []:
            if len(items) >= 6:
                return
            key = (k, L.get("id"))
            if not L.get("id") or key in seen:
                continue
            if int(L.get("stock") or 0) <= 0:
                continue
            seen.add(key)
            items.append(_related_card(L, k))

    brand = (base.get("brand") or "").strip()
    model = (base.get("model_number") or "").strip()
    try:
        if kind == "printer" and model:
            # Toners compatible with this printer model
            rows = sb_admin.table("listings").select("*").ilike(
                "compatible_models", f"%{model}%").limit(8).execute().data
            add(rows, "toner")
        if brand:
            if kind in ("toner", "printer", "consumable"):
                rows = sb_admin.table("listings").select("*").eq(
                    "brand", brand).neq("id", listing_id).order("price").limit(8).execute().data
                add(rows, "toner")
            if kind == "consumable":
                rows = sb_admin.table("consumable_listings").select("*").eq(
                    "brand", brand).neq("id", listing_id).order("price").limit(4).execute().data
                add(rows, "consumable")
            if kind == "scanner":
                rows = sb_admin.table("scanner_listings").select("*").eq(
                    "brand", brand).neq("id", listing_id).order("price").limit(4).execute().data
                add(rows, "scanner")
        # Universal cross-sell — cheapest in-stock papers
        if len(items) < 6:
            rows = sb_admin.table("paper_listings").select("*").gt(
                "stock", 0).order("price_per_ream").limit(2).execute().data
            add(rows, "paper")
    except Exception as e:
        logger.warning("related products lookup failed (%s/%s): %s", kind, listing_id, e)

    return {"items": items[:6]}
