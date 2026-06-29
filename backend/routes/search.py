"""Search / catalogue browse routes (extracted from server.py)."""
# ruff: noqa: F403, F405  (names provided by the shared-kernel star import from server)
from typing import List, Optional, Dict, Any
import os
import re
import json
import uuid
import asyncio

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Query
from pydantic import BaseModel, EmailStr, Field

from server import *  # noqa: F401,F403  shared kernel: clients, models, helpers, deps
from server import _td, _re, _time, _dd  # noqa: F401  import-alias kernel helpers
from server import (_gemini_parse_query, _row_price, _sort_by_near_city)  # underscore kernel helpers

router = APIRouter(prefix="/api")


@router.get("/toner-master")
def toner_master(q: Optional[str] = None, brand: Optional[str] = None, limit: int = 100):
    qry = sb_admin.table("toner_master").select("*").order("brand").order("model_number").limit(limit)
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    return qry.execute().data or []


@router.get("/toner-master/brands")
def toner_master_brands():
    rows = sb_admin.table("toner_master").select("brand").execute().data or []
    return sorted({r["brand"] for r in rows})


@router.get("/listings/search")
def search_listings(q: Optional[str] = None, brand: Optional[str] = None,
                    brands: Optional[str] = None,
                    colors: Optional[str] = None,
                    city: Optional[str] = None, toner_type: Optional[str] = None,
                    supplier_id: Optional[str] = None,
                    d2d_only: bool = False,
                    limit: int = 200):
    # Multi-brand chip filter — `brands=HP,Canon,Brother` takes precedence over
    # the legacy single `brand` query string when both are provided.
    brand_list = [b.strip() for b in (brands or "").split(",") if b.strip()]
    color_list = [c.strip() for c in (colors or "").split(",") if c.strip()]
    qry = sb_admin.table("listings").select(
        "*,suppliers!inner(business_name,city,is_suspended)"
    ).order("price").limit(limit)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    if brand_list:
        qry = qry.in_("brand", brand_list)
    elif brand and brand != "all":
        qry = qry.eq("brand", brand)
    if city and city != "all":
        qry = qry.eq("city", city)
    if toner_type and toner_type != "all":
        qry = qry.eq("toner_type", toner_type)
    if supplier_id:
        qry = qry.eq("supplier_id", supplier_id)
    if d2d_only:
        # Defensive — if column doesn't exist yet, surface a sensible empty
        # result instead of crashing.
        try:
            qry = qry.eq("d2d_enabled", True)
        except Exception:
            pass
    try:
        rows = qry.execute().data or []
    except Exception as e:
        msg = str(e)
        # If D2D filter referenced a missing column, return [] (migration pending).
        if d2d_only and "d2d_enabled" in msg:
            return []
        # Graceful fallback if is_suspended column is not yet migrated
        if "is_suspended" in msg:
            qry = sb_admin.table("listings").select(
                "*,suppliers!inner(business_name,city)"
            ).order("price").limit(limit)
            if q:
                qry = qry.ilike("search_norm", f"%{normalize(q)}%")
            if brand_list:
                qry = qry.in_("brand", brand_list)
            elif brand and brand != "all":
                qry = qry.eq("brand", brand)
            if city and city != "all":
                qry = qry.eq("city", city)
            if toner_type and toner_type != "all":
                qry = qry.eq("toner_type", toner_type)
            if supplier_id:
                qry = qry.eq("supplier_id", supplier_id)
            rows = qry.execute().data or []
        else:
            raise
    out = []
    for r in rows:
        s = r.pop("suppliers", None) or {}
        if s.get("is_suspended"):
            continue
        r["supplier_name"] = s.get("business_name")
        r["supplier_city"] = s.get("city")
        out.append(r)
    # Bulk attach variants for all returned listings (one round-trip)
    if out:
        try:
            ids = [r["id"] for r in out if r.get("id")]
            vrows = sb_admin.table("listing_variants").select("id,listing_id,color,price,stock").in_(
                "listing_id", ids
            ).execute().data or []
            by_listing = {}
            for v in vrows:
                by_listing.setdefault(v["listing_id"], []).append(v)
            for r in out:
                r["variants"] = by_listing.get(r["id"], [])
        except Exception as e:
            if "listing_variants" not in str(e):
                logger.warning("variant bulk attach failed: %s", e)
            for r in out:
                r["variants"] = []
    # Colour-chip multi-select filter — applied AFTER variants are attached so
    # that a listing whose parent colour is "Black" still surfaces when the
    # buyer ticks "Cyan" but the listing has a Cyan variant. "Tri-color" also
    # matches listings that bundle C+M+Y as variants.
    if color_list:
        wanted = {c.lower() for c in color_list}
        cmy_wanted = "tri-color" in wanted or "tricolor" in wanted
        kept = []
        for r in out:
            parent = (r.get("color") or "").strip().lower()
            variant_cols = {(v.get("color") or "").strip().lower() for v in (r.get("variants") or [])}
            all_cols = variant_cols | ({parent} if parent else set())
            if all_cols & wanted:
                kept.append(r)
                continue
            if cmy_wanted and {"cyan", "magenta", "yellow"} <= all_cols:
                kept.append(r)
        out = kept
    return out


@router.get("/d2d/listings")
def d2d_listings(q: Optional[str] = None, limit_per_type: int = 60):
    """Returns all D2D-enabled listings across the three product tables.
    Each section gracefully returns [] if the d2d_enabled column is missing
    (migration not yet applied)."""
    needle = (q or "").strip().lower()

    def safe(table, select_cols):
        try:
            qry = sb_admin.table(table).select(select_cols).eq("d2d_enabled", True).order("created_at", desc=True).limit(limit_per_type)
            rows = qry.execute().data or []
        except Exception as e:
            if "d2d_enabled" in str(e):
                return []
            logger.warning("d2d_listings %s failed: %s", table, e)
            return []
        if needle:
            def m(r):
                return needle in (r.get("brand", "") + " " + r.get("model_number", "") + " " + (r.get("size") or "")).lower()
            rows = [r for r in rows if m(r)]
        # Flatten supplier join
        for r in rows:
            sup = r.get("suppliers") or {}
            if isinstance(sup, dict):
                r["supplier_name"] = sup.get("business_name")
                r["supplier_city"] = sup.get("city")
        return rows

    toners = safe("listings", "*,suppliers(business_name,city)")
    printers = safe("printer_listings", "*,suppliers(business_name,city)")
    papers = safe("paper_listings", "*,suppliers(business_name,city)")
    return {
        "toners": toners, "printers": printers, "papers": papers,
        "counts": {"toners": len(toners), "printers": len(printers), "papers": len(papers)},
    }


@router.get("/d2d/me")
def d2d_me(user: dict = Depends(require_user)):
    """Returns whether the calling user is a verified (approved) dealer.
    Wave 57: also approves any user who has an approved+un-suspended supplier
    row even if `users.role` somehow drifted from "supplier" — that mismatch
    was locking real dealers out and looked like a sign-in loop on /dealer."""
    s = sb_admin.table("suppliers").select(
        "id,business_name,approved_at,is_suspended"
    ).eq("user_id", user["id"]).maybe_single().execute()
    has_supplier = bool(s and s.data)
    if not has_supplier:
        if user.get("role") != "supplier":
            return {"verified": False, "reason": "not_supplier"}
        return {"verified": False, "reason": "no_supplier_record"}
    if not s.data.get("approved_at"):
        return {"verified": False, "reason": "not_approved", "business_name": s.data.get("business_name")}
    if s.data.get("is_suspended"):
        return {"verified": False, "reason": "suspended", "business_name": s.data.get("business_name")}
    return {"verified": True, "business_name": s.data.get("business_name"), "supplier_id": s.data["id"]}


_D2D_TABLES = {
    "toner": "listings",
    "printer": "printer_listings",
    "paper": "paper_listings",
}


@router.get("/d2d/listing/{kind}/{listing_id}")
def d2d_listing_detail(kind: str, listing_id: str, user: dict = Depends(require_user)):
    """Per-listing detail used by the dedicated /d2d/:kind/:id dealer page.
    Returns the row + wholesale d2d_price + supplier info. Gated to verified
    (approved) suppliers — customers must NEVER see D2D wholesale pricing."""
    if kind not in _D2D_TABLES:
        raise HTTPException(404, "unknown kind")
    # Wave 57: drop strict role check — gate strictly on approved+un-suspended
    # supplier row (mirrors /d2d/me). Locks no real dealer out due to a
    # stale users.role drift.
    s = sb_admin.table("suppliers").select("id,approved_at,is_suspended").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data or not s.data.get("approved_at") or s.data.get("is_suspended"):
        raise HTTPException(403, "Your dealer account is not approved for D2D access yet")
    table = _D2D_TABLES[kind]
    try:
        row = sb_admin.table(table).select("*,suppliers(id,business_name,city,state,phone,email,verified_at:approved_at)").eq("id", listing_id).maybe_single().execute()
    except Exception as e:
        if "d2d_enabled" in str(e):
            raise HTTPException(503, "D2D columns not migrated. Apply supabase_schema_d2d.sql.") from e
        raise
    if not row or not row.data:
        raise HTTPException(404, "Listing not found")
    data = row.data
    if not data.get("d2d_enabled"):
        raise HTTPException(404, "This listing is not enabled for Dealer-to-Dealer purchases")
    # Don't let a dealer "buy" their own D2D listing
    own = (data.get("supplier_id") == s.data["id"])
    sup = data.pop("suppliers", None) or {}
    data["supplier"] = {
        "id": sup.get("id"),
        "business_name": sup.get("business_name"),
        "city": sup.get("city"),
        "state": sup.get("state"),
        "phone": sup.get("phone"),
        "email": sup.get("email"),
    }
    data["is_own_listing"] = own
    return data


@router.get("/search/universal")
def search_universal(q: str, limit_per_type: int = 12):
    """Universal fuzzy search across all 5 product categories + OEM showcase.

    Wave 99 — three-tier matching:
      1) **Normalised** — `search_norm ILIKE %<norm>%` (alphanum-only, lower-cased).
         This makes 'LBP6030W', 'LBP 6030W', 'LBP-6030W', 'lbp_6030w' all match,
         and powers prefix/partial matching like 'M404' → 'M404dn'.
      2) **Multi-field ILIKE** — brand / model / description / compatible_models
         with the original query (preserves human-readable matches when
         search_norm wasn't indexed for that row yet).
      3) **pg_trgm fuzzy** — RPC `tonerscart_fuzzy_search` returns ids with
         a similarity score ≥ 0.2 for typo tolerance ("Lasejet" → "LaserJet",
         "Epsen" → "Epson"). Requires the Wave-99 SQL migration; silently
         skipped on installs that haven't applied it.

    Results are deduped, ranked (exact > prefix > partial > fuzzy), and
    suspended dealers are filtered out."""
    q_norm = (q or "").strip()
    if not q_norm:
        return {
            "q": "", "toners": [], "printers": [], "papers": [],
            "consumables": [], "scanners": [], "oem": [],
            "counts": {"toners": 0, "printers": 0, "papers": 0, "consumables": 0, "scanners": 0, "oem": 0},
        }
    needle = q_norm.lower()
    norm_needle = re.sub(r"[^a-z0-9]", "", needle)
    # pg_trgm requires at least 3 chars to be meaningful; otherwise skip it.
    enable_fuzzy = len(norm_needle) >= 3

    def _rank(rows, brand_key="brand", model_key="model_number"):
        ranked = []
        for r in rows:
            b = (r.get(brand_key) or "").lower()
            m = (r.get(model_key) or "").lower()
            d = (r.get("description") or "").lower()
            sn = (r.get("search_norm") or re.sub(r"[^a-z0-9]", "", (b + m))).lower()
            # 0 exact brand/model; 1 prefix brand; 2 contains brand;
            # 3 contains model; 4 normalised contains; 5 description; 6 fuzzy only
            if b == needle or m == needle:
                score = 0
            elif b.startswith(needle) or m.startswith(needle):
                score = 1
            elif needle in b:
                score = 2
            elif needle in m:
                score = 3
            elif norm_needle and norm_needle in sn:
                score = 4
            elif needle in d:
                score = 5
            else:
                score = 6 - min(r.get("_fuzzy_score", 0), 1.0)  # higher trgm sim = lower score
            ranked.append((score, r))
        ranked.sort(key=lambda x: x[0])
        return [r for _, r in ranked]

    def _try_fuzzy(tbl: str, max_rows: int = 30):
        """Call the Wave-99 RPC. Returns {} when the migration hasn't been
        applied or the RPC is not yet visible to PostgREST. Never raises."""
        if not enable_fuzzy:
            return {}
        try:
            res = sb_admin.rpc("tonerscart_fuzzy_search", {
                "tbl": tbl, "needle": norm_needle, "threshold": 0.22, "max_rows": max_rows,
            }).execute()
            out = {}
            for r in (res.data or []):
                out[r["id"]] = float(r.get("score") or 0)
            return out
        except Exception:
            return {}

    def _hydrate(tbl: str, ids: list, select: str, supplier_join: str = "suppliers!inner"):
        """Fetch full rows by id and attach supplier_name/city (filtering
        suspended dealers). Used for fuzzy-only hits that ILIKE missed."""
        if not ids:
            return []
        try:
            rows = sb_admin.table(tbl).select(f"{select},{supplier_join}(business_name,city,is_suspended)").in_("id", ids).execute().data or []
        except Exception:
            try:
                rows = sb_admin.table(tbl).select(f"{select},{supplier_join}(business_name,city)").in_("id", ids).execute().data or []
            except Exception:
                return []
        out = []
        for r in rows:
            sup_key = supplier_join.split("!")[0]
            sup = r.pop(sup_key, None) or r.pop("supplier", None) or {}
            if isinstance(sup, list):
                sup = sup[0] if sup else {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            out.append(r)
        return out

    # ── Toners ─────────────────────────────────────────────────────────────
    toners: list = []
    try:
        sel_t = ("id,brand,model_number,toner_type,color,price,stock,image_url,image_urls,"
                 "compatible_models,search_norm,gst_rate,intercity_delivery_charge,supplier_id,"
                 "suppliers!inner(business_name,city,is_suspended)")
        def _run_toners(sel):
            return sb_admin.table("listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,compatible_models.ilike.%{q_norm}%,search_norm.ilike.%{norm_needle}%"
            ).gt("stock", 0).limit(200).execute().data or []
        t_rows = []
        for _ in range(6):
            try:
                t_rows = _run_toners(sel_t)
                break
            except Exception as e:
                msg = str(e)
                dropped = False
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended", "search_norm"):
                    if k in msg and k in sel_t:
                        sel_t = sel_t.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped and "search_norm" in msg:
                    # fallback OR clause without search_norm
                    try:
                        t_rows = sb_admin.table("listings").select(sel_t).or_(
                            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,compatible_models.ilike.%{q_norm}%"
                        ).gt("stock", 0).limit(200).execute().data or []
                        break
                    except Exception:
                        t_rows = []
                        break
                elif not dropped and "compatible_models" in msg:
                    try:
                        t_rows = sb_admin.table("listings").select(sel_t).or_(
                            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%"
                        ).gt("stock", 0).limit(200).execute().data or []
                        break
                    except Exception:
                        t_rows = []
                        break
                elif not dropped:
                    raise
        seen_t = set()
        for r in t_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            seen_t.add(r["id"])
            toners.append(r)
        # Fuzzy fallback — pull IDs we haven't seen yet.
        fz = _try_fuzzy("listings", max_rows=30)
        missing_ids = [i for i in fz if i not in seen_t]
        if missing_ids:
            sel_fb = sel_t.split(",suppliers")[0]
            extra = _hydrate("listings", missing_ids, sel_fb)
            for r in extra:
                r["_fuzzy_score"] = fz.get(r["id"], 0)
            toners.extend(extra)
        toners = _rank(toners)[:limit_per_type]
    except Exception as e:
        logger.warning("universal search toners failed: %s", e)

    # ── Printers ───────────────────────────────────────────────────────────
    printers: list = []
    try:
        sel_p = ("id,brand,model_number,description,price,stock,image_url,image_urls,"
                 "condition,usage_type,category,color,search_norm,gst_rate,intercity_delivery_charge,supplier_id,"
                 "supplier:suppliers!inner(business_name,city,is_suspended)")
        def _run_printers(sel):
            return sb_admin.table("printer_listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,description.ilike.%{q_norm}%,search_norm.ilike.%{norm_needle}%"
            ).gt("stock", 0).limit(200).execute().data or []
        p_rows = []
        for _ in range(6):
            try:
                p_rows = _run_printers(sel_p)
                break
            except Exception as e:
                msg = str(e)
                dropped = False
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended", "search_norm"):
                    if k in msg and k in sel_p:
                        sel_p = sel_p.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped and "search_norm" in msg:
                    try:
                        p_rows = sb_admin.table("printer_listings").select(sel_p).or_(
                            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,description.ilike.%{q_norm}%"
                        ).gt("stock", 0).limit(200).execute().data or []
                        break
                    except Exception:
                        p_rows = []
                        break
                elif not dropped:
                    raise
        seen_p = set()
        for r in p_rows:
            sup = r.pop("supplier", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            seen_p.add(r["id"])
            printers.append(r)
        fz = _try_fuzzy("printer_listings", max_rows=30)
        missing_ids = [i for i in fz if i not in seen_p]
        if missing_ids:
            sel_fb = sel_p.split(",supplier:")[0]
            extra = _hydrate("printer_listings", missing_ids, sel_fb, supplier_join="supplier:suppliers!inner")
            for r in extra:
                r["_fuzzy_score"] = fz.get(r["id"], 0)
            printers.extend(extra)
        printers = _rank(printers)[:limit_per_type]
    except Exception as e:
        logger.warning("universal search printers failed: %s", e)

    # ── Papers ─────────────────────────────────────────────────────────────
    papers: list = []
    try:
        sel_pp = ("id,brand,size,gsm,reams_per_box,price_per_ream,stock,image_url,image_urls,"
                  "search_norm,gst_rate,intercity_delivery_charge,supplier_id,"
                  "suppliers!inner(business_name,city,is_suspended)")
        def _run_papers(sel):
            return sb_admin.table("paper_listings").select(sel).or_(
                f"brand.ilike.%{q_norm}%,size.ilike.%{q_norm}%,search_norm.ilike.%{norm_needle}%"
            ).gt("stock", 0).limit(200).execute().data or []
        pp_rows = []
        for _ in range(6):
            try:
                pp_rows = _run_papers(sel_pp)
                break
            except Exception as e:
                msg = str(e)
                if "paper_listings" in msg and "does not exist" in msg:
                    pp_rows = []
                    break
                dropped = False
                for k in ("gst_rate", "intercity_delivery_charge", "image_urls", "is_suspended", "search_norm"):
                    if k in msg and k in sel_pp:
                        sel_pp = sel_pp.replace(f",{k}", "").replace(f"{k},", "")
                        dropped = True
                        break
                if not dropped and "search_norm" in msg:
                    try:
                        pp_rows = sb_admin.table("paper_listings").select(sel_pp).or_(
                            f"brand.ilike.%{q_norm}%,size.ilike.%{q_norm}%"
                        ).gt("stock", 0).limit(200).execute().data or []
                        break
                    except Exception:
                        pp_rows = []
                        break
                elif not dropped:
                    raise
        seen_pp = set()
        for r in pp_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            seen_pp.add(r["id"])
            papers.append(r)
        fz = _try_fuzzy("paper_listings", max_rows=30)
        missing_ids = [i for i in fz if i not in seen_pp]
        if missing_ids:
            sel_fb = sel_pp.split(",suppliers")[0]
            extra = _hydrate("paper_listings", missing_ids, sel_fb)
            for r in extra:
                r["_fuzzy_score"] = fz.get(r["id"], 0)
            papers.extend(extra)
        papers = _rank(papers, brand_key="brand", model_key="size")[:limit_per_type]
    except Exception as e:
        logger.warning("universal search papers failed: %s", e)

    # ── Consumables ────────────────────────────────────────────────────────
    consumables: list = []
    try:
        c_rows = sb_admin.table("consumable_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).or_(
            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,compatible_models.ilike.%{q_norm}%,search_norm.ilike.%{norm_needle}%"
        ).gt("stock", 0).limit(200).execute().data or []
        seen_c = set()
        for r in c_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            seen_c.add(r["id"])
            consumables.append(r)
        fz = _try_fuzzy("consumable_listings", max_rows=30)
        missing_ids = [i for i in fz if i not in seen_c]
        if missing_ids:
            extra = _hydrate("consumable_listings", missing_ids, "*", supplier_join="suppliers")
            for r in extra:
                r["_fuzzy_score"] = fz.get(r["id"], 0)
            consumables.extend(extra)
        consumables = _rank(consumables)[:limit_per_type]
    except Exception as e:
        if "consumable_listings" not in str(e):
            logger.warning("universal search consumables failed: %s", e)

    # ── Scanners ───────────────────────────────────────────────────────────
    scanners: list = []
    try:
        s_rows = sb_admin.table("scanner_listings").select(
            "*,suppliers(business_name,city,is_suspended)"
        ).or_(
            f"brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%,search_norm.ilike.%{norm_needle}%"
        ).gt("stock", 0).limit(200).execute().data or []
        seen_s = set()
        for r in s_rows:
            sup = r.pop("suppliers", None) or {}
            if sup.get("is_suspended"):
                continue
            r["supplier_name"] = sup.get("business_name") or ""
            r["city"] = sup.get("city") or ""
            seen_s.add(r["id"])
            scanners.append(r)
        fz = _try_fuzzy("scanner_listings", max_rows=30)
        missing_ids = [i for i in fz if i not in seen_s]
        if missing_ids:
            extra = _hydrate("scanner_listings", missing_ids, "*", supplier_join="suppliers")
            for r in extra:
                r["_fuzzy_score"] = fz.get(r["id"], 0)
            scanners.extend(extra)
        scanners = _rank(scanners)[:limit_per_type]
    except Exception as e:
        if "scanner_listings" not in str(e):
            logger.warning("universal search scanners failed: %s", e)

    # --- OEM products (enquiry-only showcase, approved partners) ---
    oem: list = []
    try:
        partners = sb_admin.table("oem_partners").select("id,brand,company").eq("status", "approved").execute().data or []
        approved_ids = {p["id"] for p in partners}
        if approved_ids:
            o_rows = sb_admin.table("oem_products").select("*").or_(
                f"name.ilike.%{q_norm}%,brand.ilike.%{q_norm}%,model_number.ilike.%{q_norm}%"
            ).limit(200).execute().data or []
            for r in o_rows:
                if r.get("oem_id") in approved_ids:
                    oem.append(r)
            oem = _rank(oem, brand_key="brand", model_key="name")[:limit_per_type]
    except Exception as e:
        if "oem_p" not in str(e):
            logger.warning("universal search oem failed: %s", e)

    return {
        "q": q_norm,
        "toners": toners,
        "printers": printers,
        "papers": papers,
        "consumables": consumables,
        "scanners": scanners,
        "oem": oem,
        "counts": {
            "toners": len(toners),
            "printers": len(printers),
            "papers": len(papers),
            "consumables": len(consumables),
            "scanners": len(scanners),
            "oem": len(oem),
        },
    }


@router.get("/search/ai")
async def search_ai(q: str, limit_per_type: int = 12):
    q_norm = (q or "").strip()
    if not q_norm:
        return {"q": "", "ai": False, "params": None, "answer": None}

    params = await asyncio.to_thread(_gemini_parse_query, q_norm)
    if not params:
        # No AI available / parse failed — caller falls back to keyword search.
        return {"q": q_norm, "ai": False, "params": None, "answer": None}

    brand = (params.get("brand") or "").strip()
    model = (params.get("model") or "").strip()
    keywords = (params.get("keywords") or "").strip()
    # Broad-ish term so the DB ilike search still returns candidates to filter.
    search_term = brand or keywords or model or q_norm
    base = await asyncio.to_thread(search_universal, search_term, max(limit_per_type * 3, 36))

    min_p = params.get("min_price")
    max_p = params.get("max_price")
    cond = (params.get("condition") or "").lower()
    category = (params.get("category") or "any").lower()

    def _filt(rows, kind):
        out = []
        for r in rows:
            raw_p = _row_price(r, kind)
            try:
                p = float(raw_p) if raw_p is not None else None
            except Exception:
                p = None
            if min_p is not None and p is not None and p < float(min_p):
                continue
            if max_p is not None and p is not None and p > float(max_p):
                continue
            if cond in ("original", "compatible") and kind == "toners":
                if (r.get("toner_type") or "").lower() != cond:
                    continue
            if cond in ("new", "refurbished") and kind == "printers":
                rc = (r.get("condition") or "").lower()
                if cond == "new" and rc not in ("", "new", "brand new"):
                    continue
                if cond == "refurbished" and "refurb" not in rc:
                    continue
            out.append(r)
        return out[:limit_per_type]

    grouped = {
        "toners": _filt(base.get("toners", []), "toners"),
        "printers": _filt(base.get("printers", []), "printers"),
        "papers": _filt(base.get("papers", []), "papers"),
        "consumables": _filt(base.get("consumables", []), "consumables"),
        "oem": (base.get("oem", []) or [])[:limit_per_type],
    }

    # If the AI is confident about a category and we have hits there, lead with
    # only that category so the most relevant results surface cleanly.
    cat_map = {"toner": "toners", "printer": "printers", "paper": "papers",
               "consumable": "consumables", "oem": "oem"}
    target = cat_map.get(category)
    if target and grouped.get(target):
        for k in list(grouped.keys()):
            if k != target:
                grouped[k] = []

    return {
        "q": q_norm,
        "ai": True,
        "params": params,
        "answer": params.get("answer") or None,
        **grouped,
        "counts": {k: len(v) for k, v in grouped.items()},
    }


@router.get("/listings/facets")
def listing_facets():
    rows = sb_admin.table("listings").select("brand,city").execute().data or []
    return {
        "brands": sorted({r["brand"] for r in rows if r.get("brand")}),
        "cities": sorted({r["city"] for r in rows if r.get("city")}),
        "toner_types": ["Original", "Compatible", "Refilled"],
    }


@router.get("/listings/grouped")
def listings_grouped(city: Optional[str] = None, limit: int = 12):
    """Group listings by toner model — used by Landing 'Top in <city>' grid."""
    qry = sb_admin.table("listings").select("brand,model_number,color,price,city")
    if city and city != "all":
        qry = qry.eq("city", city)
    rows = qry.execute().data or []
    grouped = {}
    for r in rows:
        key = r["model_number"]
        g = grouped.setdefault(key, {
            "model_number": key,
            "brand": r["brand"],
            "color": r.get("color") or "Black",
            "min_price": r["price"],
            "supplier_count": 0,
            "cities": set(),
        })
        g["min_price"] = min(g["min_price"], r["price"])
        g["supplier_count"] += 1
        g["cities"].add(r.get("city") or "")
    out = []
    for g in grouped.values():
        g["cities"] = sorted([c for c in g["cities"] if c])
        out.append(g)
    out.sort(key=lambda x: x["supplier_count"], reverse=True)
    return out[:limit]


@router.get("/listings/search/paginated")
def search_listings_paginated(
    q: Optional[str] = None, brand: Optional[str] = None,
    brands: Optional[str] = None,
    colors: Optional[str] = None,
    city: Optional[str] = None, toner_type: Optional[str] = None,
    supplier_id: Optional[str] = None,
    near_city: Optional[str] = None,
    page: int = 1, limit: int = 20,
):
    all_rows = search_listings(q=q, brand=brand, brands=brands, colors=colors, city=city, toner_type=toner_type, supplier_id=supplier_id, limit=2000)
    # Location-based ordering: surface the buyer's-city listings first (only
    # when not already hard-filtered by city).
    if near_city and not (city and city != "all"):
        all_rows = _sort_by_near_city(all_rows, near_city)
    total = len(all_rows)
    page = max(1, page)
    limit = max(1, min(limit, 100))
    pages = max(1, (total + limit - 1) // limit)
    start = (page - 1) * limit
    return {
        "results": all_rows[start:start + limit],
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit,
    }
