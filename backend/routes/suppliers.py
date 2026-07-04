"""Suppliers, featured, public config & misc routes (extracted from server.py)."""
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
from server import (_CONFIG_DEFAULTS, _FEATURED_CACHE, _FEATURED_TTL_SECS, _LANDING_CACHE, _LANDING_TTL_SECS)  # underscore kernel helpers

router = APIRouter(prefix="/api")


@router.post("/featured/apply")
async def featured_apply(payload: FeaturedAppCreate):
    """Public — accepts a Get Featured application from a dealer/OEM/distributor.
    Best-effort DB insert (table may not be migrated yet); always emails support + applicant."""
    row = {
        "company": payload.company.strip(),
        "contact_person": payload.contact_person.strip(),
        "phone": payload.phone.strip(),
        "email": str(payload.email).strip(),
        "city": (payload.city or "").strip() or None,
        "pincode": (payload.pincode or "").strip() or None,
        "business_type": (payload.business_type or "dealer").strip() or "dealer",
        "description": (payload.description or "").strip() or None,
        "image_path": (payload.image_path or "").strip() or None,
        "status": "new",
    }
    try:
        sb_admin.table("featured_applications").insert(row).execute()
    except Exception as e:
        if "image_path" in str(e):
            row.pop("image_path", None)
            try:
                sb_admin.table("featured_applications").insert(row).execute()
            except Exception as e2:
                logger.warning("featured_applications insert skipped (migration pending?): %s", e2)
        else:
            logger.warning("featured_applications insert skipped (migration pending?): %s", e)

    # Notify support inbox (reuse the MPS inquiry helper for consistency)
    try:
        await email_mps_inquiry({
            "name": row["contact_person"],
            "email": row["email"],
            "phone": row["phone"],
            "description": row.get("description") or "",
            "estimated_printers": "—",
            "selections": {
                "type": "featured_application",
                "company": row["company"],
                "city": row.get("city"),
                "pincode": row.get("pincode"),
                "business_type": row.get("business_type"),
            },
        })
    except Exception as e:
        logger.warning("featured admin notify failed: %s", e)

    # Auto-reply to applicant with pricing tiers
    try:
        await email_featured_applicant_reply(row)
    except Exception as e:
        logger.warning("featured applicant auto-reply failed: %s", e)

    return {"ok": True}


@router.post("/featured/apply-image")
async def featured_apply_image(file: UploadFile = File(...)):
    """Public — applicant uploads a banner image while filling the Get Featured form.
    Stored in supplier-documents/featured-applications/. Returns storage path that
    the client posts back in the application payload."""
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 5 MB)")
    # Wave 105-B — verify real image type via magic bytes (content-type is spoofable)
    real_kind = require_file_type(raw, allowed=("jpg", "png", "webp"))
    ext = "jpg" if real_kind == "jpg" else real_kind
    safe = secrets.token_hex(8)
    path = f"featured-applications/{int(datetime.now(timezone.utc).timestamp())}-{safe}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, raw, {"content-type": file.content_type or f"image/{ext}", "upsert": "true"}
        )
    except Exception as e:
        logger.exception("featured apply image upload failed")
        raise HTTPException(503, f"Image upload failed: {e}") from e
    try:
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
        preview = signed.get("signedURL") or signed.get("signed_url")
    except Exception:
        preview = None
    return {"path": path, "preview_url": preview}


@router.get("/featured/suppliers")
def featured_suppliers_public(limit: int = 6):
    """Public — return suppliers where is_featured = true, with signed logo + banner URLs.
    Returns [] gracefully if the migration has not been run yet.
    Cached for a short TTL so the homepage doesn't regenerate Supabase signed URLs
    (a sequential network call per supplier) on every visit."""
    now = _time.time()
    cached = _FEATURED_CACHE.get(limit)
    if cached and (now - cached["ts"]) < _FEATURED_TTL_SECS:
        return cached["data"]
    try:
        rows = sb_admin.table("suppliers").select(
            "id,business_name,city,state,business_logo,is_featured,seller_types,featured_image_url,tagline"
        ).eq("is_featured", True).limit(limit).execute().data or []
    except Exception as e:
        # Retry without new columns if featured_image_url/tagline not migrated yet
        if "featured_image_url" in str(e) or "tagline" in str(e):
            try:
                rows = sb_admin.table("suppliers").select(
                    "id,business_name,city,state,business_logo,is_featured,seller_types"
                ).eq("is_featured", True).limit(limit).execute().data or []
            except Exception as e2:
                logger.warning("featured_suppliers (column likely missing): %s", e2)
                return []
        else:
            logger.warning("featured_suppliers (column likely missing): %s", e)
            return []
    out = []
    for s in rows:
        item = {
            "id": s["id"],
            "business_name": s.get("business_name"),
            "city": s.get("city"),
            "state": s.get("state"),
            "seller_types": s.get("seller_types") or [],
            "tagline": s.get("tagline") or None,
            "logo_url": None,
            "featured_image_url": None,
        }
        # Surface logo (legacy field)
        if s.get("business_logo"):
            try:
                signed = sb_admin.storage.from_("supplier-documents").create_signed_url(
                    s["business_logo"], 60 * 60
                )
                item["logo_url"] = signed.get("signedURL") or signed.get("signed_url")
            except Exception:
                item["logo_url"] = None
        # Surface featured banner image
        fp = s.get("featured_image_url")
        if fp:
            if fp.startswith("http://") or fp.startswith("https://"):
                item["featured_image_url"] = fp
            else:
                try:
                    signed = sb_admin.storage.from_("supplier-documents").create_signed_url(fp, 60 * 60)
                    item["featured_image_url"] = signed.get("signedURL") or signed.get("signed_url")
                except Exception:
                    item["featured_image_url"] = None
        out.append(item)
    _FEATURED_CACHE[limit] = {"data": out, "ts": now}
    return out


@router.get("/suppliers/{supplier_id}/storefront")
def supplier_storefront(supplier_id: str, limit: int = 60):
    """Public dealer storefront — business info + that dealer's in-stock listings
    across all categories (toners, printers, papers, consumables)."""
    try:
        s = sb_admin.table("suppliers").select(
            "id,business_name,city,state,business_logo,featured_image_url,tagline,is_suspended"
        ).eq("id", supplier_id).single().execute().data
    except Exception:
        try:
            s = sb_admin.table("suppliers").select(
                "id,business_name,city,state,business_logo,is_suspended"
            ).eq("id", supplier_id).single().execute().data
        except Exception:
            s = None
    if not s or s.get("is_suspended"):
        raise HTTPException(status_code=404, detail="Dealer not found")

    logo_url = None
    if s.get("business_logo"):
        try:
            signed = sb_admin.storage.from_("supplier-documents").create_signed_url(s["business_logo"], 60 * 60)
            logo_url = signed.get("signedURL") or signed.get("signed_url")
        except Exception:
            logo_url = None

    def _q(table, sel):
        try:
            return sb_admin.table(table).select(sel).eq("supplier_id", supplier_id).gt("stock", 0).limit(limit).execute().data or []
        except Exception as e:
            logger.warning("storefront %s failed: %s", table, e)
            return []

    toners = _q("listings", "id,brand,model_number,toner_type,color,price,stock,image_url,image_urls")
    printers = _q("printer_listings", "id,brand,model_number,description,price,stock,image_url,image_urls,condition,category")
    papers = _q("paper_listings", "id,brand,size,gsm,reams_per_box,price_per_ream,stock,image_url,image_urls")
    consumables = _q("consumable_listings", "id,brand,model_number,subcategory,condition,price,stock,image_url,image_urls")

    biz = s.get("business_name") or "Dealer"
    city = s.get("city") or ""
    for arr in (toners, printers, papers, consumables):
        for r in arr:
            r["supplier_name"] = biz
            r["supplier_id"] = supplier_id
            r["city"] = city

    return {
        "supplier": {
            "id": supplier_id,
            "business_name": biz,
            "city": city,
            "state": s.get("state") or "",
            "tagline": s.get("tagline") or None,
            "logo_url": logo_url,
        },
        "toners": toners,
        "printers": printers,
        "papers": papers,
        "consumables": consumables,
        "counts": {
            "toners": len(toners), "printers": len(printers),
            "papers": len(papers), "consumables": len(consumables),
        },
    }


@router.post("/chat")
async def chat(payload: ChatRequest):
    if not payload.messages:
        raise HTTPException(400, "messages required")
    session_id = payload.session_id or str(uuid.uuid4())
    latest = payload.messages[-1]
    if latest.role != "user":
        raise HTTPException(400, "last message must be from user")

    google_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if google_key:
        # Preferred path: direct Google GenAI SDK
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=google_key)
            # Build content history (Gemini uses 'user'/'model' roles)
            contents = []
            for m in payload.messages:
                role = "user" if m.role == "user" else "model"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m.content)]))
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=CHAT_SYSTEM),
            )
            reply = (resp.text or "").strip()
            if not reply:
                raise RuntimeError("empty Gemini response")
            return {"reply": reply, "session_id": session_id}
        except Exception:
            logger.exception("Gemini chat failed")
            raise HTTPException(502, "Chat unavailable — try again shortly")

    raise HTTPException(
        500,
        "LLM key not configured (set GOOGLE_API_KEY in backend/.env to enable the chatbot)",
    )


@router.get("/config/{key}")
def get_site_config(key: str):
    """Public — site_config value with a sensible default fallback."""
    if key not in _CONFIG_DEFAULTS and key not in {"popular_chips", "marquee_brands"}:
        # Allow any key but require it exists; otherwise just 404
        pass
    try:
        row = sb_admin.table("site_config").select("value").eq("key", key).maybe_single().execute()
    except Exception as e:
        logger.warning("site_config select failed: %s", e)
        row = None
    if row and row.data and row.data.get("value") is not None:
        val = row.data["value"]
        if isinstance(val, list) and len(val) > 0:
            return {"key": key, "value": val}
        if isinstance(val, dict) and val:
            return {"key": key, "value": val}
    return {"key": key, "value": _CONFIG_DEFAULTS.get(key, [])}


@router.get("/stats/public")
def public_stats():
    """Lightweight public counters for the landing-page stats strip."""
    sup_rows = None
    try:
        sup_rows = sb_admin.table("suppliers").select(
            "id,city", count="exact"
        ).eq("is_suspended", False).execute()
    except Exception as e:
        if "is_suspended" in str(e):
            try:
                sup_rows = sb_admin.table("suppliers").select(
                    "id,city", count="exact"
                ).execute()
            except Exception:
                sup_rows = None
        else:
            logger.warning("public_stats suppliers failed: %s", e)
    sup_count = (sup_rows.count if sup_rows else 0) or 0
    cities = {(r.get("city") or "").strip() for r in ((sup_rows.data if sup_rows else []) or []) if r.get("city")}

    try:
        brands_rows = sb_admin.table("listings").select("brand").limit(2000).execute().data or []
        brands = {(r.get("brand") or "").strip() for r in brands_rows if r.get("brand")}
    except Exception:
        brands = set()
    try:
        prn_brands = sb_admin.table("printer_listings").select("brand").limit(2000).execute().data or []
        brands.update({(r.get("brand") or "").strip() for r in prn_brands if r.get("brand")})
    except Exception:
        pass

    return {
        "suppliers": sup_count,
        "cities": len(cities),
        "brands": len(brands),
    }


@router.get("/")
def root():
    return {"service": "TonersCart API (Supabase)", "ok": True}


@router.get("/landing-data")
def landing_data():
    now = _time.time()
    if _LANDING_CACHE["data"] is not None and (now - _LANDING_CACHE["ts"]) < _LANDING_TTL_SECS:
        return _LANDING_CACHE["data"]
    # Stats
    try:
        suppliers_n = len(sb_admin.table("suppliers").select("id").execute().data or [])
    except Exception:
        suppliers_n = 0
    try:
        listings_n = len(sb_admin.table("listings").select("id").gt("stock", 0).execute().data or [])
    except Exception:
        listings_n = 0
    try:
        cities = list({(r.get("city") or "").strip() for r in (sb_admin.table("suppliers").select("city").execute().data or []) if r.get("city")})
        cities_n = len([c for c in cities if c])
    except Exception:
        cities_n = 0
    # Featured suppliers — fall back to empty when column missing
    featured = []
    try:
        rows = sb_admin.table("suppliers").select(
            "id,business_name,city,business_logo"
        ).eq("is_featured", True).limit(8).execute().data or []
        for r in rows:
            logo_url = None
            if r.get("business_logo"):
                try:
                    s = sb_admin.storage.from_("supplier-documents").create_signed_url(r["business_logo"], 3600)
                    logo_url = s.get("signedURL") or s.get("signed_url")
                except Exception:
                    logo_url = None
            featured.append({"id": r["id"], "business_name": r.get("business_name"), "city": r.get("city"), "logo_url": logo_url})
    except Exception:
        featured = []
    # Site config: chips + marquee
    chips = []
    marquee = []
    try:
        cfg = sb_admin.table("site_config").select("key,value").in_("key", ["popular_chips", "marquee_brands"]).execute().data or []
        for row in cfg:
            if row.get("key") == "popular_chips":
                chips = row.get("value") or []
            elif row.get("key") == "marquee_brands":
                marquee = row.get("value") or []
    except Exception:
        pass
    payload = {
        "stats": {"suppliers": suppliers_n, "listings": listings_n, "cities": cities_n},
        "featured": featured,
        "popular_chips": chips,
        "marquee_brands": marquee,
    }
    _LANDING_CACHE["data"] = payload
    _LANDING_CACHE["ts"] = now
    return payload



# ============================================================================
# Approved-dealer "Raise a Query" — Wave 102
# ============================================================================

class _SupplierQueryPayload(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=5000)


@router.post("/supplier/raise-query")
async def supplier_raise_query(payload: _SupplierQueryPayload, user: dict = Depends(require_user)):
    """Approved dealer fires a support query from the dealer dashboard profile
    dropdown. Email goes to the TonersCart support inbox with reply_to set to
    the dealer's email so admins can reply directly."""
    # Require an approved supplier row — only sellers should be using this.
    sup_row = sb_admin.table("suppliers").select(
        "business_name,seller_id,email,phone,city,user_id"
    ).eq("user_id", user["id"]).maybe_single().execute()
    sup = (sup_row.data if sup_row and sup_row.data else None)
    if not sup:
        raise HTTPException(status_code=403, detail="Only approved dealers can raise a query from the dashboard.")
    if not sup.get("email"):
        sup["email"] = user.get("email")
    sent = await email_dealer_raise_query(sup, payload.subject.strip(), payload.message.strip())
    return {"ok": True, "sent": bool(sent)}
