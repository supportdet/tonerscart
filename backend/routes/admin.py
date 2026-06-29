"""Admin console routes (extracted from server.py)."""
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
from server import (_FEATURED_CACHE, _exec_dropping_cols, _generate_seller_id, _log_admin_action, _orders_with_listings, _set_suspended, _signed_doc_urls, _update_order_dispute_cols)  # underscore kernel helpers

from server import (_commission_breakdown)  # auto: kernel underscore helpers
router = APIRouter(prefix="/api")


@router.get("/admin/suppliers/pending")
def admin_pending(user: dict = Depends(require_role("admin"))):
    rows = sb_admin.table("suppliers_pending").select("*").eq("status", "pending").order("submitted_at", desc=True).execute().data or []
    return rows


@router.get("/admin/suppliers")
def admin_suppliers(user: dict = Depends(require_role("admin"))):
    rows = sb_admin.table("suppliers").select("*").order("approved_at", desc=True).execute().data or []
    # Wave 64 — surface `pending_docs` per dealer so the list can show a
    # "Pending documents" badge at a glance. We merge any doc paths from the
    # original `suppliers_pending` row (where the full KYC set lives) before
    # deciding what's missing — same merge the detail endpoint does.
    if not rows:
        return rows
    user_ids = [r.get("user_id") for r in rows if r.get("user_id")]
    pending_docs_by_uid: Dict[str, dict] = {}
    if user_ids:
        try:
            pend = sb_admin.table("suppliers_pending").select(
                "user_id," + ",".join(DOC_FIELDS)
            ).in_("user_id", user_ids).execute().data or []
            for p in pend:
                pending_docs_by_uid[p["user_id"]] = p
        except Exception:
            pass
    # Mandatory at-a-glance set per product spec (cancelled cheque required
    # only before first payout — still surfaced separately).
    mandatory = ("doc_gst", "doc_pan", "doc_id_proof")
    for r in rows:
        merged = {f: r.get(f) for f in DOC_FIELDS}
        prow = pending_docs_by_uid.get(r.get("user_id")) or {}
        for f in DOC_FIELDS:
            if not merged.get(f) and prow.get(f):
                merged[f] = prow[f]
        r["pending_docs"] = [f for f in mandatory if not merged.get(f)]
        r["cheque_uploaded"] = bool(
            r.get("cheque_uploaded") if r.get("cheque_uploaded") is not None
            else merged.get("doc_bank_proof")
        )
        if not r["cheque_uploaded"]:
            r["pending_docs"].append("doc_bank_proof")
    return rows


@router.post("/admin/suppliers/{pending_id}/approve")
async def admin_approve(pending_id: str, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    P = p.data
    if P["status"] != "pending":
        raise HTTPException(400, f"Already {P['status']}")

    # Human-readable seller ID — keep existing if already assigned, else generate
    seller_id = None
    try:
        ex = sb_admin.table("users").select("seller_id").eq("id", P["user_id"]).maybe_single().execute()
        seller_id = (ex.data or {}).get("seller_id") if ex else None
    except Exception:
        seller_id = None
    if not seller_id:
        seller_id = _generate_seller_id()
    if seller_id:
        P["seller_id"] = seller_id

    _exec_dropping_cols(lambda a: sb_admin.table("suppliers").upsert(a, on_conflict="user_id").execute(), {
        "user_id": P["user_id"],
        "business_name": P["business_name"],
        "contact_person": P["contact_person"],
        "phone": P["phone"],
        "email": P["email"],
        "city": P["city"],
        "state": P.get("state"),
        "pincode": P.get("pincode"),
        "cities_served": P.get("cities_served") or [],
        "gst_number": P.get("gst_number"),
        "pan_number": P.get("pan_number"),
        "annual_turnover": P.get("annual_turnover"),
        "years_in_business": P.get("years_in_business"),
        "business_address": P["business_address"],
        "seller_types": P.get("seller_types") or [],
        "compatible_brands": P.get("compatible_brands") or [],
        "testing_before_delivery": P.get("testing_before_delivery") or False,
        "account_holder_name": P.get("account_holder_name"),
        "account_number": P.get("account_number"),
        "ifsc_code": P.get("ifsc_code"),
        "bank_name": P.get("bank_name"),
        "bank_branch": P.get("bank_branch"),
        "doc_id_proof": P.get("doc_id_proof"),
        "seller_id": seller_id,
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    })
    sb_admin.table("suppliers_pending").update({
        "status": "approved",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    # Flip the user's role to supplier (= seller). This is the only place role becomes 'supplier'.
    sb_admin.table("users").update({"role": "supplier"}).eq("id", P["user_id"]).execute()
    if seller_id:
        _exec_dropping_cols(lambda a: sb_admin.table("users").update(a).eq("id", P["user_id"]).execute(), {"seller_id": seller_id})
    try:
        await email_application_approved(P)
    except Exception as e:
        logger.warning("approval email failed: %s", e)
    _log_admin_action(user, "supplier_approved", "supplier", pending_id,
                      {"business_name": P.get("business_name"), "seller_id": seller_id})
    return {"ok": True, "seller_id": seller_id}


@router.post("/admin/seller-ids/backfill")
def admin_backfill_seller_ids(user: dict = Depends(require_role("admin"))):
    """Assign TC-DLR-{year}-{NNNN} IDs to already-approved dealers that lack one.
    Requires the seller_id migration to have been run."""
    try:
        sups = sb_admin.table("suppliers").select("id,user_id,seller_id,approved_at").execute().data or []
    except Exception:
        raise HTTPException(400, "seller_id column missing — run the migration first")
    missing = [s for s in sups if not s.get("seller_id")]
    # Stable order: oldest approvals first
    missing.sort(key=lambda s: s.get("approved_at") or "")
    assigned = 0
    for s in missing:
        sid = _generate_seller_id()
        if not sid:
            raise HTTPException(400, "seller_id column missing — run the migration first")
        try:
            sb_admin.table("suppliers").update({"seller_id": sid}).eq("id", s["id"]).execute()
            if s.get("user_id"):
                sb_admin.table("users").update({"seller_id": sid}).eq("id", s["user_id"]).execute()
            assigned += 1
        except Exception as e:
            logger.warning("backfill seller_id failed for %s: %s", s.get("id"), e)
    return {"ok": True, "assigned": assigned, "already_had": len(sups) - len(missing)}


@router.post("/admin/suppliers/{pending_id}/reject")
async def admin_reject(pending_id: str, payload: RejectPayload, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    if p.data["status"] != "pending":
        raise HTTPException(400, f"Already {p.data['status']}")
    reason = payload.reason or "Not approved"
    sb_admin.table("suppliers_pending").update({
        "status": "rejected",
        "rejection_reason": reason,
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    try:
        await email_application_rejected(p.data, reason)
    except Exception as e:
        logger.warning("rejection email failed: %s", e)
    _log_admin_action(user, "supplier_rejected", "supplier", pending_id,
                      {"business_name": p.data.get("business_name"), "reason": reason})
    return {"ok": True}


@router.get("/admin/suppliers/{pending_id}/documents")
def admin_documents(pending_id: str, user: dict = Depends(require_role("admin"))):
    """Returns short-lived signed URLs for each uploaded supplier document."""
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    return {"documents": _signed_doc_urls(p.data, ttl=300), "ai_check": p.data.get("ai_check") or {}}


@router.get("/admin/user-segments")
def admin_user_segments(user: dict = Depends(require_role("admin"))):
    """Buyer segmentation breakdown for the admin analytics dashboard."""
    try:
        rows = sb_admin.table("users").select("user_type,role").execute().data or []
    except Exception:
        return {"segments": {}, "total": 0}
    seg: dict = {"personal": 0, "corporate": 0, "dealer": 0, "referred_to_procurement": 0, "unspecified": 0}
    for r in rows:
        t = r.get("user_type") or "unspecified"
        seg[t] = seg.get(t, 0) + 1
    return {"segments": seg, "total": len(rows)}


@router.get("/admin/stats")
def admin_stats(user: dict = Depends(require_role("admin"))):
    def cnt(table, **filters):
        q = sb_admin.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return q.execute().count or 0
    return {
        "toner_master": cnt("toner_master"),
        "suppliers_pending": cnt("suppliers_pending", status="pending"),
        "suppliers_approved": cnt("suppliers"),
        "listings": cnt("listings"),
        "orders": cnt("orders"),
    }


@router.get("/admin/featured/applications")
def admin_featured_applications(user: dict = Depends(require_role("admin"))):
    try:
        rows = sb_admin.table("featured_applications").select("*").order(
            "created_at", desc=True
        ).limit(500).execute().data or []
    except Exception as e:
        logger.warning("featured_applications table missing: %s", e)
        return []
    # Surface a signed URL for any uploaded banner image
    for r in rows:
        path = r.get("image_path")
        if path:
            try:
                signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60)
                r["image_url"] = signed.get("signedURL") or signed.get("signed_url")
            except Exception:
                r["image_url"] = None
        else:
            r["image_url"] = None
    return rows


@router.post("/admin/featured/feature-from-application")
def admin_feature_from_application(payload: FeaturedFromApplication,
                                    user: dict = Depends(require_role("admin"))):
    """Admin clicks "Feature this company" on an application.
    Marks the chosen supplier is_featured=true, copies the application's
    company tagline (description) into suppliers.tagline, and stores the
    application's image_path as the supplier's featured_image_url."""
    app_row = sb_admin.table("featured_applications").select("*").eq(
        "id", payload.application_id
    ).maybe_single().execute()
    if not app_row or not app_row.data:
        raise HTTPException(404, "Application not found")
    sup_row = sb_admin.table("suppliers").select("id").eq("id", payload.supplier_id).maybe_single().execute()
    if not sup_row or not sup_row.data:
        raise HTTPException(404, "Supplier not found")
    a = app_row.data
    upd = {"is_featured": True}
    if a.get("image_path"):
        upd["featured_image_url"] = a["image_path"]
    if a.get("description"):
        upd["tagline"] = a["description"][:280]
    try:
        sb_admin.table("suppliers").update(upd).eq("id", payload.supplier_id).execute()
    except Exception as e:
        msg = str(e)
        # Drop missing columns and retry
        retry = {k: v for k, v in upd.items() if k not in msg}
        if retry:
            sb_admin.table("suppliers").update(retry).eq("id", payload.supplier_id).execute()
        else:
            raise HTTPException(503, f"Featuring failed — missing column: {msg}") from e
    # Move application to 'active' status
    try:
        sb_admin.table("featured_applications").update({
            "status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", payload.application_id).execute()
    except Exception as e:
        logger.warning("featured_applications status update failed: %s", e)
    _FEATURED_CACHE.clear()
    return {"ok": True, "supplier_id": payload.supplier_id, "featured": True}


@router.put("/admin/featured/applications/{app_id}/status")
def admin_featured_status(app_id: str, payload: FeaturedStatusUpdate,
                          user: dict = Depends(require_role("admin"))):
    if payload.status not in {"new", "contacted", "active", "rejected"}:
        raise HTTPException(400, "Invalid status")
    sb_admin.table("featured_applications").update({
        "status": payload.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()
    return {"ok": True}


@router.put("/admin/suppliers/{supplier_id}/featured")
def admin_toggle_supplier_featured(supplier_id: str, payload: SupplierFeaturedToggle,
                                    user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("suppliers").update({"is_featured": bool(payload.is_featured)}).eq(
            "id", supplier_id
        ).execute()
    except Exception as e:
        logger.warning("toggle featured failed (column missing?): %s", e)
        raise HTTPException(503, "is_featured column not yet migrated — run supabase_schema_quotation_featured.sql") from e
    _FEATURED_CACHE.clear()
    return {"ok": True, "is_featured": bool(payload.is_featured)}


@router.get("/admin/analytics")
def admin_analytics(user: dict = Depends(require_role("admin"))):
    """Single payload powering the admin Analytics dashboard.
    Everything is computed from live Supabase tables — no cached or hardcoded numbers.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - _td(days=7)
    month_ago = now - _td(days=30)
    today_date = now.date()

    # Pull every order (limit reasonably for now; orders table is small in MVP)
    # Brand/model live on the joined listings row; supplier city → "orders by city".
    orders = sb_admin.table("orders").select(
        "id,total,unit_price,qty,status,supplier_id,customer_id,delivery_address,created_at,"
        "listings(brand,model_number,city)"
    ).order("created_at", desc=True).limit(5000).execute().data or []
    # Flatten the join so the rest of the function can reference o['brand']/o['model_number']/o['city']
    for o in orders:
        L = o.pop("listings", None) or {}
        o["brand"] = L.get("brand")
        o["model_number"] = L.get("model_number")
        o["delivery_city"] = L.get("city")

    suppliers = sb_admin.table("suppliers").select(
        "id,business_name,city,approved_at"
    ).execute().data or []
    suppliers_by_id = {s["id"]: s for s in suppliers}

    users = sb_admin.table("users").select("id,role,name,created_at").execute().data or []
    listings_cnt = sb_admin.table("listings").select("id", count="exact").execute().count or 0
    printers_cnt = sb_admin.table("printer_listings").select("id", count="exact").execute().count or 0
    try:
        scanners_cnt = sb_admin.table("scanner_listings").select("id", count="exact").execute().count or 0
    except Exception:
        scanners_cnt = 0

    # Aggregates
    total_gmv = 0.0
    total_commission = 0.0
    orders_week = 0
    orders_month = 0
    by_day_orders = defaultdict(int)
    by_day_commission = defaultdict(float)
    by_model = Counter()
    by_dealer_gmv = defaultdict(float)
    by_city = Counter()

    # Pre-seed last-30-day buckets so charts have continuous x-axis
    for i in range(30):
        d = (today_date - _td(days=i)).isoformat()
        by_day_orders[d] = 0
        by_day_commission[d] = 0.0

    for o in orders:
        total = float(o.get("total") or 0)
        total_gmv += total
        commission, _payout, _label = _commission_breakdown(total)
        total_commission += commission

        created = o.get("created_at")
        if created:
            try:
                cdt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            except Exception:
                cdt = None
        else:
            cdt = None

        if cdt:
            if cdt >= week_ago:
                orders_week += 1
            if cdt >= month_ago:
                orders_month += 1
                day_key = cdt.date().isoformat()
                by_day_orders[day_key] += 1
                by_day_commission[day_key] += float(commission)

        model_label = f"{o.get('brand') or '—'} {o.get('model_number') or ''}".strip()
        by_model[model_label] += 1

        sid = o.get("supplier_id")
        if sid:
            by_dealer_gmv[sid] += total

        city = (o.get("delivery_city") or "").strip()
        if city:
            by_city[city] += 1

    new_dealers_week = sum(
        1 for s in suppliers
        if (s.get("approved_at") or "") and
        datetime.fromisoformat(s["approved_at"].replace("Z", "+00:00")) >= week_ago
    )
    buyers = [u for u in users if u.get("role") == "customer"]
    new_buyers_week = sum(
        1 for u in buyers
        if (u.get("created_at") or "") and
        datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")) >= week_ago
    )

    top_dealers = sorted(by_dealer_gmv.items(), key=lambda x: x[1], reverse=True)[:5]
    top_dealers_out = [
        {
            "supplier_id": sid,
            "name": (suppliers_by_id.get(sid) or {}).get("business_name") or "Unknown",
            "gmv": round(g, 2),
        }
        for sid, g in top_dealers
    ]

    return {
        "stats": {
            "total_gmv": round(total_gmv, 2),
            "total_commission": round(total_commission, 2),
            "total_orders": len(orders),
            "orders_week": orders_week,
            "orders_month": orders_month,
            "total_dealers": len(suppliers),
            "new_dealers_week": new_dealers_week,
            "total_buyers": len(buyers),
            "new_buyers_week": new_buyers_week,
            "active_listings": int(listings_cnt) + int(printers_cnt) + int(scanners_cnt),
        },
        "orders_per_day": [
            {"date": d, "count": by_day_orders[d]}
            for d in sorted(by_day_orders.keys())
        ],
        "commission_per_day": [
            {"date": d, "amount": round(by_day_commission[d], 2)}
            for d in sorted(by_day_commission.keys())
        ],
        "top_models": [
            {"model": m, "count": c}
            for m, c in by_model.most_common(5)
        ],
        "top_dealers": top_dealers_out,
        "orders_by_city": [
            {"city": c, "count": n}
            for c, n in by_city.most_common(8)
        ],
    }


@router.get("/admin/suppliers/{supplier_id}/detail")
def admin_supplier_detail(supplier_id: str, user: dict = Depends(require_role("admin"))):
    s = sb_admin.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(404, "Supplier not found")
    sup = dict(s.data)
    toners = sb_admin.table("listings").select("*").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).execute().data or []
    printers = sb_admin.table("printer_listings").select("*").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).execute().data or []
    try:
        papers = sb_admin.table("paper_listings").select("*").eq("supplier_id", supplier_id).order(
            "created_at", desc=True
        ).execute().data or []
    except Exception:
        papers = []
    try:
        scanners = sb_admin.table("scanner_listings").select("*").eq("supplier_id", supplier_id).order(
            "created_at", desc=True
        ).execute().data or []
    except Exception:
        scanners = []
    try:
        consumables = sb_admin.table("consumable_listings").select("*").eq("supplier_id", supplier_id).order(
            "created_at", desc=True
        ).execute().data or []
    except Exception:
        consumables = []
    orders = sb_admin.table("orders").select("*,listings(brand,model_number)").eq("supplier_id", supplier_id).order(
        "created_at", desc=True
    ).limit(500).execute().data or []
    for o in orders:
        L = o.pop("listings", None) or {}
        o["brand"] = L.get("brand") or o.get("product_brand")
        o["model_number"] = L.get("model_number") or o.get("product_model")

    gmv = 0.0
    commission_earned = 0.0
    pending_payout = 0.0
    _open = {"requested", "accepted", "shipped"}
    for o in orders:
        total = float(o.get("total") or 0)
        c, p, _label = _commission_breakdown(total)
        gmv += total
        commission_earned += float(c)
        if (o.get("status") or "") in _open:
            pending_payout += float(p)

    # Signed document links (5 min) for KYC / bank / ID proof.
    # On approval only `doc_id_proof` is copied onto the `suppliers` row — the
    # full KYC set (GST, PAN, bank proof, address proof, brand authorization,
    # shop photo) remains on the original `suppliers_pending` application. Merge
    # those paths in so admins can view every document the dealer uploaded.
    doc_source = dict(sup)
    if sup.get("user_id"):
        try:
            pend = sb_admin.table("suppliers_pending").select("*").eq(
                "user_id", sup["user_id"]
            ).maybe_single().execute()
            prow = pend.data if pend and pend.data else None
            if prow:
                for f in DOC_FIELDS:
                    if not doc_source.get(f) and prow.get(f):
                        doc_source[f] = prow[f]
        except Exception:
            pass
    try:
        documents = _signed_doc_urls(doc_source, ttl=300)
    except Exception:
        documents = {}

    # Agreement acceptance (most recent of any type by this dealer's user)
    agreements = []
    if sup.get("user_id"):
        try:
            agreements = sb_admin.table("user_agreements").select("*").eq(
                "user_id", sup["user_id"]
            ).order("accepted_at", desc=True).execute().data or []
        except Exception:
            agreements = []

    # Account email + registration date from users
    if sup.get("user_id"):
        try:
            u = sb_admin.table("users").select("email,created_at,user_type,name").eq(
                "id", sup["user_id"]
            ).maybe_single().execute()
            if u and u.data:
                sup.setdefault("email", u.data.get("email"))
                sup["account_email"] = u.data.get("email")
                sup["registration_date"] = u.data.get("created_at")
                sup["user_type"] = u.data.get("user_type")
        except Exception:
            pass

    active_toners = len([t for t in toners if int(t.get("stock") or 0) > 0])
    active_printers = len([p for p in printers if int(p.get("stock") or 0) > 0])
    active_papers = len([p for p in papers if int(p.get("stock") or 0) > 0])
    active_scanners = len([s for s in scanners if int(s.get("stock") or 0) > 0])
    active_consumables = len([c for c in consumables if int(c.get("stock") or 0) > 0])

    return {
        "supplier": sup,
        "toner_listings": toners,
        "printer_listings": printers,
        "paper_listings": papers,
        "scanner_listings": scanners,
        "consumable_listings": consumables,
        "orders": orders,
        "documents": documents,
        "agreements": agreements,
        "stats": {
            "listing_count": len(toners) + len(printers) + len(papers) + len(scanners) + len(consumables),
            "active_listing_count": active_toners + active_printers + active_papers + active_scanners + active_consumables,
            "toner_count": len(toners),
            "printer_count": len(printers),
            "paper_count": len(papers),
            "scanner_count": len(scanners),
            "consumable_count": len(consumables),
            "order_count": len(orders),
            "gmv": round(gmv, 2),
            "commission_earned": round(commission_earned, 2),
            "pending_payout": round(pending_payout, 2),
        },
    }


def _resolve_doc_path(supplier_id: str, field: str) -> Optional[str]:
    """Resolve the storage path for a single KYC document of a supplier,
    checking the `suppliers` row first then falling back to the original
    `suppliers_pending` application (where the full KYC set lives)."""
    if field not in DOC_FIELDS:
        return None
    s = sb_admin.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute()
    if not s or not s.data:
        return None
    row = s.data
    path = row.get(field)
    if path:
        return path
    uid = row.get("user_id")
    if uid:
        try:
            pend = sb_admin.table("suppliers_pending").select("*").eq("user_id", uid).maybe_single().execute()
            if pend and pend.data:
                return pend.data.get(field)
        except Exception:
            return None
    return None


@router.get("/admin/suppliers/{supplier_id}/document")
def admin_supplier_document(supplier_id: str, field: str, download: bool = False,
                            user: dict = Depends(require_role("admin"))):
    """Mint a FRESH 1-hour signed URL for a single dealer document on demand,
    so admin View/Download links never hit an expired URL. When download=true
    the URL carries Supabase's download flag → forces a file download with the
    document's original filename instead of rendering inline."""
    path = _resolve_doc_path(supplier_id, field)
    if not path:
        raise HTTPException(404, "Document not found")
    filename = path.rsplit("/", 1)[-1] or f"{field}"
    try:
        opts = {"download": filename} if download else None
        res = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 3600, opts) if opts \
            else sb_admin.storage.from_("supplier-documents").create_signed_url(path, 3600)
        url = res.get("signedURL") or res.get("signed_url") or res.get("signedUrl")
    except Exception as e:
        logger.warning("admin document signed url failed for %s/%s: %s", supplier_id, field, e)
        raise HTTPException(502, "Could not generate document link") from e
    if not url:
        raise HTTPException(502, "Could not generate document link")
    return {"url": url, "filename": filename, "field": field}


@router.post("/admin/suppliers/{supplier_id}/document")
async def admin_upload_supplier_document(
    supplier_id: str,
    field: str = Query(..., description="One of the doc_* fields"),
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin")),
):
    """Wave 64 — admin uploads a KYC document on a dealer's behalf when the
    dealer forgot or hasn't submitted it yet (typical case: cancelled cheque
    submitted later, after onboarding). Stores in the same private
    supplier-documents bucket, writes the path back to `suppliers.{field}`,
    and — when the field is `doc_bank_proof` — also flips `cheque_uploaded`
    so the admin list badge clears."""
    if field not in DOC_FIELDS:
        raise HTTPException(400, "Invalid document field")
    if not file.content_type or not (file.content_type.startswith("image/") or file.content_type == "application/pdf"):
        raise HTTPException(400, "Only images and PDF are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")

    try:
        s = sb_admin.table("suppliers").select("user_id,business_name").eq("id", supplier_id).maybe_single().execute()
    except Exception as e:
        # Malformed UUID or other DB-level error → clean 400 instead of 500.
        raise HTTPException(400, f"Invalid supplier id: {e}") from e
    if not s or not s.data:
        raise HTTPException(404, "Supplier not found")
    sup_user_id = s.data.get("user_id") or supplier_id
    business_name = s.data.get("business_name") or "dealer"

    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin").lower()
    path = f"{sup_user_id}/{field}-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("admin doc upload failed for %s/%s", supplier_id, field)
        raise HTTPException(500, f"Upload failed: {e}") from e

    # Persist the new path on the suppliers row. If `field` isn't a column on
    # `suppliers` yet (older deployments still keep some doc fields only on
    # suppliers_pending), drop it down to the pending row too.
    update_payload = {field: path}
    if field == "doc_bank_proof":
        update_payload["cheque_uploaded"] = True
    optional_cols = (field, "cheque_uploaded") if field == "doc_bank_proof" else (field,)
    try:
        _exec_dropping_cols(
            lambda p: sb_admin.table("suppliers").update(p).eq("id", supplier_id).execute(),
            update_payload,
            optional_cols=optional_cols,
        )
    except Exception as e:
        logger.warning("supplier doc column update failed for %s/%s: %s", supplier_id, field, e)
    try:
        sb_admin.table("suppliers_pending").update({field: path}).eq("user_id", sup_user_id).execute()
    except Exception:
        pass

    _log_admin_action(user["id"], "supplier.doc_upload", supplier_id, {"field": field, "by_admin": True})
    logger.info("admin %s uploaded %s for supplier %s (%s)", user.get("email"), field, supplier_id, business_name)
    return {"ok": True, "field": field, "path": path}




@router.put("/admin/suppliers/{supplier_id}/notes")
def admin_supplier_notes(supplier_id: str, payload: SupplierNotes,
                         user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("suppliers").update({"admin_notes": payload.admin_notes}).eq("id", supplier_id).execute()
    except Exception as e:
        if "admin_notes" in str(e):
            raise HTTPException(503, "admin_notes column not migrated — run supabase_schema_admin_extras.sql") from e
        raise
    _log_admin_action(user, "dealer_notes_updated", "supplier", supplier_id)
    return {"ok": True}


@router.post("/admin/suppliers/{supplier_id}/impersonate")
def admin_impersonate_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    """Wave 77 — admin-only impersonation. Returns the dealer's user_id +
    business name so the frontend can flip into impersonation mode (the
    admin keeps their own bearer token; subsequent requests are sent with
    an `X-Impersonate-User-Id` header which `require_user` honours)."""
    s = sb_admin.table("suppliers").select(
        "id,user_id,business_name,city"
    ).eq("id", supplier_id).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(404, "Supplier not found")
    sd = s.data
    if not sd.get("user_id"):
        raise HTTPException(400, "Supplier has no user account — impersonation unavailable")
    u = sb_admin.table("users").select("id,email,name").eq("id", sd["user_id"]).maybe_single().execute()
    if not u or not u.data:
        raise HTTPException(404, "Dealer user account not found")
    try:
        sb_admin.table("audit_log").insert({
            "actor_id": user["id"],
            "actor_email": user.get("email"),
            "action": "impersonate_start",
            "target_id": sd["user_id"],
            "target_email": u.data.get("email"),
            "metadata": {"supplier_id": supplier_id, "business_name": sd.get("business_name")},
        }).execute()
    except Exception:
        pass  # audit_log table optional — see migrations/2026_06_24_wave77_audit_log.sql
    return {
        "ok": True,
        "user_id": sd["user_id"],
        "supplier_id": supplier_id,
        "email": u.data.get("email"),
        "business_name": sd.get("business_name"),
        "city": sd.get("city"),
    }


@router.put("/admin/suppliers/{supplier_id}")
def admin_edit_supplier(supplier_id: str, payload: SupplierEdit,
                        user: dict = Depends(require_role("admin"))):
    upd = {}
    if payload.business_name is not None and payload.business_name.strip():
        upd["business_name"] = payload.business_name.strip()
    if payload.city is not None and payload.city.strip():
        upd["city"] = payload.city.strip()
    if not upd:
        return {"ok": True, "updated": []}
    sb_admin.table("suppliers").update(upd).eq("id", supplier_id).execute()
    return {"ok": True, "updated": list(upd.keys())}


@router.post("/admin/suppliers/{supplier_id}/suspend")
async def admin_suspend_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    _set_suspended(supplier_id, True)
    try:
        sup = sb_admin.table("suppliers").select("business_name,city,email,contact_person,user_id").eq("id", supplier_id).maybe_single().execute()
        if sup and sup.data:
            sd = dict(sup.data)
            # Fall back to users.email if suppliers row has no email
            if not sd.get("email") and sd.get("user_id"):
                u = sb_admin.table("users").select("email").eq("id", sd["user_id"]).maybe_single().execute()
                if u and u.data:
                    sd["email"] = u.data.get("email")
            asyncio.create_task(email_dealer_suspended(sd))
    except Exception as e:
        logger.warning("suspend email skipped: %s", e)
    _log_admin_action(user, "dealer_suspended", "supplier", supplier_id)
    return {"ok": True, "is_suspended": True}


@router.post("/admin/suppliers/{supplier_id}/unsuspend")
async def admin_unsuspend_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    _set_suspended(supplier_id, False)
    try:
        sup = sb_admin.table("suppliers").select("business_name,city,email,contact_person,user_id").eq("id", supplier_id).maybe_single().execute()
        if sup and sup.data:
            sd = dict(sup.data)
            if not sd.get("email") and sd.get("user_id"):
                u = sb_admin.table("users").select("email").eq("id", sd["user_id"]).maybe_single().execute()
                if u and u.data:
                    sd["email"] = u.data.get("email")
            asyncio.create_task(email_dealer_unsuspended(sd))
    except Exception as e:
        logger.warning("unsuspend email skipped: %s", e)
    _log_admin_action(user, "dealer_unsuspended", "supplier", supplier_id)
    return {"ok": True, "is_suspended": False}


@router.delete("/admin/listings/{listing_id}")
def admin_delete_listing(listing_id: str, user: dict = Depends(require_role("admin"))):
    sb_admin.table("listings").delete().eq("id", listing_id).execute()
    _log_admin_action(user, "listing_deleted", "listing", listing_id)
    return {"ok": True}


class AdminListingUpdate(BaseModel):
    """Admin edit payload — every field across all 5 product categories.
    Only fields that are not None are written. Per-category fields are
    silently dropped if they don't apply to that kind's table (best-effort
    via the column-not-found retry below)."""
    # Pricing & stock — shared across all kinds
    price: Optional[float] = None
    stock: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None  # "active" | "inactive" — flips stock 0/min when toggling
    gst_rate: Optional[int] = None
    intercity_delivery_charge: Optional[float] = None
    # Identity
    brand: Optional[str] = None
    model_number: Optional[str] = None
    # Toner-specific
    color: Optional[str] = None
    toner_type: Optional[str] = None  # Original / Compatible / Refilled
    compatible_models: Optional[str] = None
    page_yield: Optional[int] = None
    oem_part_number: Optional[str] = None
    cartridge_weight: Optional[int] = None
    warranty: Optional[str] = None
    print_technology: Optional[str] = None
    # Printer-specific
    category: Optional[str] = None  # laser / inkjet / multifunction etc
    condition: Optional[str] = None
    usage_type: Optional[str] = None
    usage_types: Optional[List[str]] = None
    print_speed_ppm: Optional[int] = None
    monthly_volume_min: Optional[int] = None
    monthly_volume_max: Optional[int] = None
    connectivity: Optional[List[str]] = None
    paper_sizes: Optional[List[str]] = None
    functions: Optional[List[str]] = None
    # Paper-specific
    size: Optional[str] = None
    gsm: Optional[int] = None
    reams_per_box: Optional[int] = None
    brightness: Optional[int] = None
    thickness_microns: Optional[int] = None
    acid_free: Optional[bool] = None
    suitable_for: Optional[List[str]] = None
    # Consumable-specific
    subcategory: Optional[str] = None
    subcategory_other: Optional[str] = None
    # Scanner-specific
    scanner_type: Optional[str] = None
    scan_resolution: Optional[str] = None
    scan_speed_ppm: Optional[int] = None
    color_mode: Optional[str] = None
    # Images
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None


_KIND_TABLE = {
    "toner": "listings",
    "printer": "printer_listings",
    "paper": "paper_listings",
    "consumable": "consumable_listings",
    "scanner": "scanner_listings",
}


@router.put("/admin/listings/{kind}/{listing_id}")
def admin_update_listing(
    kind: str, listing_id: str, payload: AdminListingUpdate,
    user: dict = Depends(require_role("admin")),
):
    """Single endpoint for admins to edit any listing across all 5 product
    categories. Updates price / stock / description; status=inactive zeroes
    stock (so the listing falls out of public browse), active restores 1 if
    the row was at 0."""
    table = _KIND_TABLE.get(kind)
    if not table:
        raise HTTPException(400, f"Unknown listing kind '{kind}'")
    upd: Dict[str, Any] = {}
    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(400, "Price must be ≥ 0")
        # papers use price_per_ream, everything else uses price
        upd["price_per_ream" if kind == "paper" else "price"] = float(payload.price)
    if payload.stock is not None:
        if payload.stock < 0:
            raise HTTPException(400, "Stock must be ≥ 0")
        upd["stock"] = int(payload.stock)
    if payload.description is not None:
        upd["description"] = payload.description.strip() or None
    # Pass-through fields — the column-not-found retry strips any field that
    # doesn't exist on the target table, so consumable_listings.color (etc.)
    # is silently dropped without 500ing the whole request.
    _SIMPLE_FIELDS = (
        "brand", "model_number", "color", "toner_type", "compatible_models",
        "page_yield", "oem_part_number", "cartridge_weight", "warranty",
        "print_technology", "category", "condition", "usage_type",
        "usage_types", "print_speed_ppm", "monthly_volume_min",
        "monthly_volume_max", "connectivity", "paper_sizes", "functions",
        "size", "gsm", "reams_per_box", "brightness", "thickness_microns",
        "acid_free", "suitable_for", "subcategory", "subcategory_other",
        "scanner_type", "scan_resolution", "scan_speed_ppm", "color_mode",
        "image_url", "image_urls", "gst_rate", "intercity_delivery_charge",
    )
    for k in _SIMPLE_FIELDS:
        v = getattr(payload, k, None)
        if v is not None:
            upd[k] = v
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    if payload.status in ("active", "inactive"):
        # If admin didn't also pass a stock value, derive from current row.
        if "stock" not in upd:
            try:
                cur = sb_admin.table(table).select("stock").eq("id", listing_id).maybe_single().execute()
                cur_stock = int((cur.data or {}).get("stock") or 0) if cur and cur.data else 0
            except Exception:
                cur_stock = 0
            if payload.status == "inactive":
                upd["stock"] = 0
            elif payload.status == "active" and cur_stock <= 0:
                upd["stock"] = 1
    if not upd:
        return {"ok": True, "updated": []}
    try:
        sb_admin.table(table).update(upd).eq("id", listing_id).execute()
    except Exception as e:
        msg = str(e)
        # Some fields don't exist on every product table (e.g. `color` only
        # on listings/printer_listings, `subcategory` only on
        # consumable_listings). Strip any column the DB complains about and
        # retry up to 8 times; if a column we explicitly need is missing,
        # bubble the error.
        attempts = 0
        while attempts < 8 and upd:
            stripped = False
            for k in list(upd.keys()):
                if k in msg:
                    upd.pop(k, None)
                    stripped = True
                    break
            if not stripped:
                raise HTTPException(500, f"Update failed: {e}") from e
            try:
                if upd:
                    sb_admin.table(table).update(upd).eq("id", listing_id).execute()
                break
            except Exception as e2:
                msg = str(e2)
                attempts += 1
                continue
    # Keep listing_variants in sync when an admin edits a toner price —
    # the buyer-facing card pulls from listings.price but the detail page
    # pulls from listing_variants.price; if they diverge the same SKU shows
    # two different prices (CRG 303 incident, 2026-06-12).
    if kind == "toner" and "price" in upd:
        try:
            sb_admin.table("listing_variants").update({"price": upd["price"]}).eq("listing_id", listing_id).execute()
        except Exception:
            pass
    _log_admin_action(user, f"{kind}_listing_edited", "listing", listing_id)
    return {"ok": True, "updated": list(upd.keys())}


class _RestoreApprovalBody(BaseModel):
    approved_at: Optional[str] = None  # ISO timestamp; defaults to now()
    note: Optional[str] = None


@router.post("/admin/suppliers/{supplier_id}/restore-approval")
def admin_restore_supplier_approval(
    supplier_id: str, body: _RestoreApprovalBody,
    user: dict = Depends(require_role("admin")),
):
    """Re-set a supplier to approved / not-suspended. Created after the
    12-Jun-2026 incident; remains useful any time an admin needs to
    re-instate a dealer without sending them through the application flow.
    ONLY admins can call this — there is no equivalent endpoint exposed to
    suppliers or customers."""
    from datetime import datetime, timezone
    row = sb_admin.table("suppliers").select("*").eq("id", supplier_id).maybe_single().execute()
    if not row or not row.data:
        raise HTTPException(404, "Supplier not found")
    approved_at = body.approved_at or datetime.now(timezone.utc).isoformat()
    upd: Dict[str, Any] = {"approved_at": approved_at, "is_suspended": False}
    if body.note:
        existing_notes = (row.data or {}).get("admin_notes") or ""
        stamp = datetime.now(timezone.utc).strftime("%d-%b-%Y %H:%M")
        upd["admin_notes"] = (existing_notes + f"\n[{stamp}] restore-approval: {body.note}").strip()
    sb_admin.table("suppliers").update(upd).eq("id", supplier_id).execute()
    _log_admin_action(user, "supplier_approval_restored", "supplier", supplier_id)
    return {"ok": True, "approved_at": approved_at}




@router.get("/admin/suppliers/{supplier_id}/export")
def admin_supplier_export(supplier_id: str, user: dict = Depends(require_role("admin"))):
    """Streams a ZIP archive of the dealer's full profile: PDF summary,
    Excel analytics, and every uploaded KYC document. Used by the
    "Download Full Profile" button on the admin dealer profile page."""
    from fastapi.responses import Response
    from dealer_export import build_dealer_export_zip

    # Reuse the existing detail endpoint payload — keeps the export aligned
    # with whatever fields the admin profile currently shows.
    detail = admin_supplier_detail(supplier_id, user=user)  # type: ignore[arg-type]
    blob, filename = build_dealer_export_zip(sb_admin, supplier_id, detail)
    _log_admin_action(user, "dealer_export_downloaded", "supplier", supplier_id)
    return Response(
        content=blob,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(blob)),
        },
    )


@router.delete("/admin/printers/{printer_id}")
def admin_delete_printer(printer_id: str, user: dict = Depends(require_role("admin"))):
    sb_admin.table("printer_listings").delete().eq("id", printer_id).execute()
    _log_admin_action(user, "printer_deleted", "printer", printer_id)
    return {"ok": True}


@router.get("/admin/orders")
def admin_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("admin")),
):
    page = max(1, page)
    limit = max(1, min(limit, 200))
    qry = sb_admin.table("orders").select("*,listings(brand,model_number,toner_type)").order("created_at", desc=True)
    if status and status != "all":
        qry = qry.eq("status", status)
    rows = qry.limit(2000).execute().data or []
    # Flatten join
    for r in rows:
        L = r.pop("listings", None) or {}
        r["brand"] = L.get("brand")
        r["model_number"] = L.get("model_number")
        r["toner_type"] = L.get("toner_type")
    if search:
        s = search.lower()
        rows = [
            r for r in rows
            if s in (r.get("customer_name") or "").lower()
            or s in (r.get("model_number") or "").lower()
            or s in (r.get("brand") or "").lower()
            or s in (r.get("customer_phone") or "")
        ]
    suppliers = sb_admin.table("suppliers").select("id,business_name").execute().data or []
    sup_map = {s["id"]: s.get("business_name") for s in suppliers}
    total = len(rows)
    start = (page - 1) * limit
    end = start + limit
    page_rows = rows[start:end]
    for r in page_rows:
        c, p, lbl = _commission_breakdown(r.get("total") or 0)
        r["commission"] = c
        r["payout"] = p
        r["commission_rate"] = lbl
        r["supplier_name"] = sup_map.get(r.get("supplier_id")) or "—"
        # Apply search filter to brand/model after flatten (already done above)
    return {"rows": page_rows, "total": total, "page": page, "limit": limit}


@router.get("/admin/orders/export")
def admin_orders_export(user: dict = Depends(require_role("admin"))):
    orders = sb_admin.table("orders").select("*,listings(brand,model_number,toner_type)").order("created_at", desc=True).limit(5000).execute().data or []
    suppliers = sb_admin.table("suppliers").select("id,business_name").execute().data or []
    sup_map = {s["id"]: s.get("business_name") for s in suppliers}
    buf = io.StringIO()
    buf.write("\ufeff")  # UTF-8 BOM for Excel
    writer = csv.writer(buf)
    writer.writerow([
        "Order ID", "Created", "Status", "Tracking",
        "Buyer Name", "Buyer Phone", "Delivery Address",
        "Brand", "Model", "Type", "Qty", "Unit Price", "Total",
        "Commission Rate", "Commission", "Payout",
        "Dealer Name",
    ])
    for o in orders:
        L = o.get("listings") or {}
        total = float(o.get("total") or 0)
        c, p, label = _commission_breakdown(total)
        writer.writerow([
            o.get("id"),
            o.get("created_at"),
            o.get("status"),
            o.get("tracking_number") or "",
            o.get("customer_name") or "",
            o.get("customer_phone") or "",
            o.get("delivery_address") or "",
            L.get("brand") or "",
            L.get("model_number") or "",
            L.get("toner_type") or "",
            o.get("qty") or 0,
            o.get("unit_price") or 0,
            total,
            label,
            c,
            p,
            sup_map.get(o.get("supplier_id")) or "",
        ])
    csv_text = buf.getvalue()
    headers = {
        "Content-Disposition": 'attachment; filename="tonerscart_orders.csv"',
    }
    return Response(content=csv_text, media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/admin/config/{key}")
def set_site_config(key: str, payload: ConfigPayload, user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("site_config").upsert({
            "key": key,
            "value": payload.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="key").execute()
    except Exception as e:
        if "site_config" in str(e):
            raise HTTPException(503, "site_config table not yet migrated — run supabase_schema_admin_v2.sql") from e
        raise
    return {"ok": True, "key": key}


@router.get("/admin/finance/summary")
def admin_finance_summary(user: dict = Depends(require_role("admin"))):
    orders = _orders_with_listings()
    buckets: dict = {}
    for o in orders:
        ts = o.get("created_at") or ""
        if not ts:
            continue
        try:
            d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            continue
        key = d.strftime("%Y-%m")
        b = buckets.setdefault(key, {"month": key, "orders": 0, "gmv": 0.0, "commission": 0.0, "payout": 0.0})
        total = float(o.get("total") or 0)
        c, p, _label = _commission_breakdown(total)
        b["orders"] += 1
        b["gmv"] += total
        b["commission"] += float(c)
        b["payout"] += float(p)
    rows = sorted(buckets.values(), key=lambda r: r["month"], reverse=True)
    for r in rows:
        r["gmv"] = round(r["gmv"], 2)
        r["commission"] = round(r["commission"], 2)
        r["payout"] = round(r["payout"], 2)
    return rows


@router.get("/admin/finance/dealers")
def admin_finance_dealers(user: dict = Depends(require_role("admin"))):
    orders = _orders_with_listings()
    suppliers = sb_admin.table("suppliers").select("id,business_name,city,seller_id").execute().data or []
    by_sid: dict = {s["id"]: {"id": s["id"], "name": s.get("business_name") or "—", "city": s.get("city") or "—",
                                "seller_id": s.get("seller_id"),
                                "orders": 0, "gmv": 0.0, "commission": 0.0, "payout": 0.0, "pending_payout": 0.0}
                       for s in suppliers}
    _open = {"requested", "accepted", "shipped"}
    for o in orders:
        sid = o.get("supplier_id")
        if not sid or sid not in by_sid:
            continue
        total = float(o.get("total") or 0)
        c, p, _label = _commission_breakdown(total)
        by_sid[sid]["orders"] += 1
        by_sid[sid]["gmv"] += total
        by_sid[sid]["commission"] += float(c)
        by_sid[sid]["payout"] += float(p)
        if (o.get("status") or "") in _open:
            by_sid[sid]["pending_payout"] += float(p)
    rows = [r for r in by_sid.values() if r["orders"] > 0]
    for r in rows:
        r["gmv"] = round(r["gmv"], 2)
        r["commission"] = round(r["commission"], 2)
        r["payout"] = round(r["payout"], 2)
        r["pending_payout"] = round(r["pending_payout"], 2)
    rows.sort(key=lambda r: r["gmv"], reverse=True)
    return rows


@router.get("/admin/finance/export")
def admin_finance_export(user: dict = Depends(require_role("admin"))):
    summary = admin_finance_summary(user)
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(["Month", "Orders", "GMV (₹)", "Commission (₹)", "Dealer payouts (₹)"])
    for r in summary:
        w.writerow([r["month"], r["orders"], r["gmv"], r["commission"], r["payout"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tonerscart_monthly_report.csv"'},
    )


@router.get("/admin/finance/dealer-payouts/export")
def admin_finance_dealers_export(user: dict = Depends(require_role("admin"))):
    rows = admin_finance_dealers(user)
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(["Dealer", "City", "Orders", "GMV (₹)", "Commission taken (₹)", "Net payout (₹)"])
    for r in rows:
        w.writerow([r["name"], r["city"], r["orders"], r["gmv"], r["commission"], r["payout"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tonerscart_dealer_payouts.csv"'},
    )


@router.get("/admin/activity-log")
def admin_activity_log(limit: int = 200, user: dict = Depends(require_role("admin"))):
    try:
        rows = sb_admin.table("admin_activity_log").select("*").order(
            "created_at", desc=True
        ).limit(min(max(limit, 1), 500)).execute().data or []
        return {"rows": rows, "migrated": True}
    except Exception:
        return {"rows": [], "migrated": False}


@router.get("/admin/customers")
def admin_customers(user: dict = Depends(require_role("admin"))):
    """All buyers (role=customer) with order count + total spend."""
    try:
        users = sb_admin.table("users").select(
            "id,name,email,phone,city,user_type,created_at"
        ).eq("role", "customer").order("created_at", desc=True).execute().data or []
    except Exception:
        users = sb_admin.table("users").select(
            "id,name,email,phone,city,role"
        ).eq("role", "customer").execute().data or []
    orders = sb_admin.table("orders").select("customer_id,total").execute().data or []
    agg: dict = {}
    for o in orders:
        cid = o.get("customer_id")
        if not cid:
            continue
        a = agg.setdefault(cid, {"orders": 0, "spend": 0.0})
        a["orders"] += 1
        a["spend"] += float(o.get("total") or 0)
    for u in users:
        a = agg.get(u["id"], {"orders": 0, "spend": 0.0})
        u["order_count"] = a["orders"]
        u["total_spend"] = round(a["spend"], 2)
    return users


@router.get("/admin/customers/{customer_id}")
def admin_customer_detail(customer_id: str, user: dict = Depends(require_role("admin"))):
    u = sb_admin.table("users").select("*").eq("id", customer_id).maybe_single().execute()
    if not u or not u.data:
        raise HTTPException(404, "Customer not found")
    orders = sb_admin.table("orders").select("*,listings(brand,model_number)").eq(
        "customer_id", customer_id
    ).order("created_at", desc=True).limit(300).execute().data or []
    for o in orders:
        L = o.pop("listings", None) or {}
        o["brand"] = L.get("brand") or o.get("product_brand")
        o["model_number"] = L.get("model_number") or o.get("product_model")
    try:
        agreements = sb_admin.table("user_agreements").select("*").eq(
            "user_id", customer_id
        ).order("accepted_at", desc=True).execute().data or []
    except Exception:
        agreements = []
    spend = round(sum(float(o.get("total") or 0) for o in orders), 2)
    return {
        "customer": u.data,
        "orders": orders,
        "agreements": agreements,
        "stats": {"order_count": len(orders), "total_spend": spend},
    }


@router.get("/admin/finance/procurement-dues")
def admin_procurement_dues(user: dict = Depends(require_role("admin"))):
    """Procurement accounts that owe money (credit_used > 0)."""
    try:
        rows = sb_admin.table("procurement_users").select(
            "id,org_name,name,email,type,credit_limit,credit_used,status"
        ).execute().data or []
    except Exception:
        return {"rows": [], "migrated": False}
    out = []
    for r in rows:
        used = float(r.get("credit_used") or 0)
        if used <= 0:
            continue
        limit_v = float(r.get("credit_limit") or 0)
        out.append({
            "id": r.get("id"),
            "org_name": r.get("org_name"),
            "name": r.get("name"),
            "email": r.get("email"),
            "type": r.get("type"),
            "credit_limit": round(limit_v, 2),
            "owed": round(used, 2),
            "available": round(limit_v - used, 2),
        })
    out.sort(key=lambda x: x["owed"], reverse=True)
    return {"rows": out, "migrated": True}


@router.post("/admin/orders/{order_id}/flag")
def admin_flag_order(order_id: str, payload: OrderFlag, user: dict = Depends(require_role("admin"))):
    o = sb_admin.table("orders").select("id").eq("id", order_id).maybe_single().execute()
    if not o or not o.data:
        raise HTTPException(404, "Order not found")
    if payload.flag:
        upd = {
            "is_flagged": True,
            "dispute_status": "open",
            "flagged_at": datetime.now(timezone.utc).isoformat(),
            "flagged_by": user["id"],
        }
    else:
        upd = {"is_flagged": False, "dispute_status": None}
    _update_order_dispute_cols(order_id, upd)
    _log_admin_action(user, "order_flagged" if payload.flag else "order_unflagged", "order", order_id)
    return {"ok": True, "is_flagged": payload.flag}


@router.put("/admin/orders/{order_id}/dispute")
def admin_update_dispute(order_id: str, payload: DisputeUpdate, user: dict = Depends(require_role("admin"))):
    upd: dict = {}
    if payload.dispute_status is not None:
        if payload.dispute_status not in ("open", "investigating", "resolved"):
            raise HTTPException(400, "Invalid dispute_status")
        upd["dispute_status"] = payload.dispute_status
    if payload.dispute_notes is not None:
        upd["dispute_notes"] = payload.dispute_notes
    if not upd:
        return {"ok": True}
    _update_order_dispute_cols(order_id, upd)
    _log_admin_action(user, "dispute_updated", "order", order_id, {"status": payload.dispute_status})
    return {"ok": True}


@router.get("/admin/disputes")
def admin_disputes(user: dict = Depends(require_role("admin"))):
    try:
        rows = sb_admin.table("orders").select("*,listings(brand,model_number)").eq(
            "is_flagged", True
        ).order("flagged_at", desc=True).execute().data or []
    except Exception as e:
        if "is_flagged" in str(e) or "flagged_at" in str(e) or "column" in str(e).lower():
            return {"rows": [], "migrated": False}
        raise
    suppliers = sb_admin.table("suppliers").select("id,business_name").execute().data or []
    sup_map = {s["id"]: s.get("business_name") for s in suppliers}
    for r in rows:
        L = r.pop("listings", None) or {}
        r["brand"] = L.get("brand") or r.get("product_brand")
        r["model_number"] = L.get("model_number") or r.get("product_model")
        r["supplier_name"] = sup_map.get(r.get("supplier_id")) or "—"
        c, p, lbl = _commission_breakdown(r.get("total") or 0)
        r["commission"] = c
        r["payout"] = p
    return {"rows": rows, "migrated": True}


@router.get("/admin/messages")
def admin_messages(limit: int = 300, user: dict = Depends(require_role("admin"))):
    rows = sb_admin.table("mps_inquiries").select("*").order(
        "created_at", desc=True
    ).limit(min(max(limit, 1), 1000)).execute().data or []
    for r in rows:
        sel = r.get("selections") or {}
        if isinstance(sel, dict):
            r["company"] = sel.get("company") or sel.get("company_name") or sel.get("organisation")
            r["msg_type"] = sel.get("type")
        if "is_read" not in r:
            r["is_read"] = False
    unread = sum(1 for r in rows if not r.get("is_read"))
    return {"rows": rows, "unread": unread}


@router.put("/admin/messages/{msg_id}/read")
def admin_message_read(msg_id: str, payload: MessageRead, user: dict = Depends(require_role("admin"))):
    try:
        sb_admin.table("mps_inquiries").update({"is_read": payload.is_read}).eq("id", msg_id).execute()
    except Exception as e:
        if "is_read" in str(e):
            raise HTTPException(503, "is_read column not migrated — run supabase_schema_admin_extras.sql") from e
        raise
    return {"ok": True, "is_read": payload.is_read}


@router.post("/admin/messages/{msg_id}/reply")
async def admin_message_reply(msg_id: str, payload: MessageReply, user: dict = Depends(require_role("admin"))):
    m = sb_admin.table("mps_inquiries").select("*").eq("id", msg_id).maybe_single().execute()
    if not m or not m.data:
        raise HTTPException(404, "Message not found")
    to = m.data.get("email")
    if not to:
        raise HTTPException(400, "This message has no email address to reply to")
    sent = await email_admin_reply(to, payload.subject, payload.message, m.data.get("name"))
    _log_admin_action(user, "message_replied", "message", msg_id, {"to": to})
    try:
        sb_admin.table("mps_inquiries").update({"is_read": True}).eq("id", msg_id).execute()
    except Exception:
        pass
    return {"ok": True, "sent": sent}


@router.post("/admin/cleanup-test-data")
def admin_cleanup_test_data(apply: bool = False, user: dict = Depends(require_role("admin"))):
    """Find and (optionally) delete any test / seed / demo / dummy data from the database.

    Pass `?apply=true` to actually delete. Without it, returns a dry-run preview.
    """
    try:
        from cleanup_test_data import run as _run_cleanup
        return _run_cleanup(apply=bool(apply))
    except Exception as e:
        logger.exception("cleanup_test_data failed")
        raise HTTPException(500, f"Cleanup failed: {e}") from e


@router.get("/admin/visitor-analytics")
def admin_visitor_analytics(user: dict = Depends(require_role("admin"))):
    """Aggregated page_views — never errors out, returns empty bucket if migration not run."""
    try:
        rows = sb_admin.table("page_views").select("page,device_type,referrer,ip_hash,created_at").order(
            "created_at", desc=True
        ).limit(20000).execute().data or []
    except Exception:
        rows = []
    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()
    week_start = today - _td(days=7)
    week_iso = week_start.isoformat()
    month_start = today - _td(days=30)
    month_iso = month_start.isoformat()
    today_count = sum(1 for r in rows if (r.get("created_at") or "").startswith(today_iso))
    week_count = sum(1 for r in rows if (r.get("created_at") or "") >= week_iso)
    month_count = sum(1 for r in rows if (r.get("created_at") or "") >= month_iso)
    pages = Counter([r.get("page") or "/" for r in rows])
    devices = Counter([r.get("device_type") or "desktop" for r in rows])
    refs = Counter([r.get("referrer") or "Direct" for r in rows])
    unique = len({r.get("ip_hash") for r in rows if r.get("ip_hash")})
    return {
        "total": len(rows),
        "today": today_count,
        "week": week_count,
        "month": month_count,
        "unique_estimate": unique,
        "top_pages": [{"page": p, "views": c} for p, c in pages.most_common(5)],
        "devices": [{"name": k, "value": v} for k, v in devices.items()],
        "referrers": [{"name": k, "value": v} for k, v in refs.items()],
    }


@router.post("/admin/suppliers/{supplier_id}/featured-image")
async def admin_upload_featured_image(supplier_id: str, file: UploadFile = File(...), user: dict = Depends(require_role("admin"))):
    """Upload a feature-banner / logo for a supplier. Stored via the existing
    supplier-documents bucket and the public-ish signed URL is persisted in
    suppliers.business_logo. Sets is_featured=true atomically."""
    # Validate supplier exists FIRST to avoid orphaned blobs
    sup_row = sb_admin.table("suppliers").select("id").eq("id", supplier_id).maybe_single().execute()
    if not sup_row or not sup_row.data:
        raise HTTPException(404, "Supplier not found")
    try:
        raw = await file.read()
        if len(raw) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 5 MB)")
        ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "webp"):
            ext = "png"
        path = f"{supplier_id}/featured-logo-{int(datetime.now(timezone.utc).timestamp())}.{ext}"
        sb_admin.storage.from_("supplier-documents").upload(path, raw, {"content-type": file.content_type or f"image/{ext}", "upsert": "true"})
        signed = sb_admin.storage.from_("supplier-documents").create_signed_url(path, 60 * 60 * 24 * 365)
        url = signed.get("signedURL") or signed.get("signed_url")
        try:
            sb_admin.table("suppliers").update({"business_logo": path, "is_featured": True}).eq("id", supplier_id).execute()
        except Exception as e:
            if "is_featured" in str(e):
                sb_admin.table("suppliers").update({"business_logo": path}).eq("id", supplier_id).execute()
            else:
                raise
        _FEATURED_CACHE.clear()
        return {"ok": True, "path": path, "url": url}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("upload featured image failed")
        raise HTTPException(500, f"Failed to upload featured image: {e}") from e


# ============================================================================
# Wave 98 — Admin bulk-create dealers (CSV/Excel) + magic-link welcome email
# ============================================================================

class BulkDealerRow(BaseModel):
    business_name: str
    email: EmailStr
    phone: Optional[str] = ""
    city: Optional[str] = ""
    gstin: Optional[str] = ""


class BulkDealerPayload(BaseModel):
    rows: List[BulkDealerRow] = Field(default_factory=list)


def _frontend_origin() -> str:
    """Best-effort canonical frontend URL for embed-in-email links."""
    raw = (os.environ.get("FRONTEND_URL")
           or os.environ.get("REACT_APP_BACKEND_URL")
           or os.environ.get("APP_URL")
           or "").strip().rstrip("/")
    if raw:
        return raw
    return "https://tonerscart.com"


@router.post("/admin/dealers/bulk-create")
async def admin_bulk_create_dealers(payload: BulkDealerPayload, _: dict = Depends(require_role("admin"))):
    """Wave 98 — bulk dealer onboarding.

    For each input row (business_name, email, phone, city, gstin):
      * Skip if the email already exists in `public.users` (case-insensitive).
        This protects every existing dealer (Big C, DET, Zion Entr, Bios,
        Verve IT, Ravi Marketing, Shree Infotech, Amman Gaming Origin, …).
      * Otherwise: create a Supabase auth user (no password, email confirmed),
        insert `public.users` (role=supplier), insert `suppliers_pending`
        (Phase 1 only — no bank or KYC docs), generate a single-use magic-link
        via `sb_admin.auth.admin.generate_link` (7-day TTL), and send the
        branded welcome email through Resend.

    Returns a summary `{created, skipped_existing, skipped_duplicate, failed}`
    so the admin UI can show counts + a per-row error breakdown."""

    # De-duplicate by email *inside the file* first — first row wins.
    seen_in_file = set()
    deduped: List[BulkDealerRow] = []
    duplicates_in_file = 0
    for r in payload.rows:
        e = (r.email or "").strip().lower()
        if not e:
            continue
        if e in seen_in_file:
            duplicates_in_file += 1
            continue
        seen_in_file.add(e)
        deduped.append(r)

    # Fetch already-existing emails in one shot (case-insensitive).
    existing_emails: set = set()
    if deduped:
        chunk = [r.email.lower() for r in deduped]
        try:
            res = sb_admin.table("users").select("email").in_("email", chunk).execute()
            existing_emails = {(u.get("email") or "").lower() for u in (res.data or [])}
        except Exception:
            existing_emails = set()
        # Also check capitalised variants (some legacy rows are mixed-case).
        try:
            res2 = sb_admin.table("users").select("email").execute()
            existing_emails |= {(u.get("email") or "").lower() for u in (res2.data or [])}
        except Exception:
            pass

    origin = _frontend_origin()
    redirect_to = f"{origin}/auth/callback?next=/supplier"

    created: List[dict] = []
    skipped_existing: List[dict] = []
    failed: List[dict] = []
    email_sent_count = 0

    for r in deduped:
        e = r.email.strip().lower()
        if e in existing_emails:
            skipped_existing.append({"email": e, "business_name": r.business_name, "reason": "already exists — preserved"})
            continue
        # Step 1 — create the Supabase auth user (no password).
        try:
            created_user = sb_admin.auth.admin.create_user({
                "email": e,
                "email_confirm": True,
                "user_metadata": {"name": r.business_name, "role": "supplier"},
            })
        except Exception as ex:
            failed.append({"email": e, "business_name": r.business_name, "reason": f"auth create failed: {ex}"})
            continue
        uid = created_user.user.id

        # Step 2 — users row (role=supplier so they land on the dealer dashboard).
        try:
            sb_admin.table("users").upsert({
                "id": uid,
                "email": e,
                "name": r.business_name,
                "role": "supplier",
                "phone": (r.phone or None),
                "city": (r.city or None),
            }, on_conflict="id").execute()
        except Exception as ex:
            failed.append({"email": e, "business_name": r.business_name, "reason": f"profile insert failed: {ex}"})
            continue

        # Step 3 — suppliers_pending Phase 1 row. Status = 'pending' so admin
        # still has to approve before the dealer can publish listings. The
        # imported batch is treated like a regular application.
        try:
            sb_admin.table("suppliers_pending").upsert({
                "user_id": uid,
                "business_name": r.business_name,
                "contact_person": r.business_name,
                "phone": (r.phone or None),
                "city": (r.city or None),
                "gst_number": (r.gstin or "").strip().upper() or None,
                "status": "pending",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            }, on_conflict="user_id").execute()
        except Exception as ex:
            logger.warning("bulk-dealer pending row insert failed for %s: %s", e, ex)
            # Don't abort — user already created. Admin can patch later.

        # Step 4 — generate magic-link (Supabase) and send branded email.
        action_link = ""
        try:
            link_res = sb_admin.auth.admin.generate_link({
                "type": "magiclink",
                "email": e,
                "options": {"redirect_to": redirect_to},
            })
            # supabase-py returns either `.properties.action_link` (object) or
            # a dict with `properties: {action_link: ...}`. Handle both.
            props = getattr(link_res, "properties", None) or (link_res.get("properties") if isinstance(link_res, dict) else None)
            action_link = (getattr(props, "action_link", None) if props is not None else None) or (props.get("action_link") if isinstance(props, dict) else "")
            action_link = action_link or ""
        except Exception as ex:
            logger.warning("bulk-dealer magic-link generation failed for %s: %s", e, ex)

        # Fallback link → forgot-password flow.
        dashboard_link = action_link or f"{origin}/forgot-password?email={e}"
        try:
            sent = await email_dealer_welcome_magic(e, r.business_name, dashboard_link)
            if sent:
                email_sent_count += 1
        except Exception as ex:
            logger.warning("bulk-dealer welcome email send failed for %s: %s", e, ex)

        created.append({"email": e, "business_name": r.business_name, "user_id": uid, "magic_link_sent": bool(action_link)})

    return {
        "created": len(created),
        "skipped_existing": len(skipped_existing),
        "skipped_duplicate_in_file": duplicates_in_file,
        "failed": len(failed),
        "emails_sent": email_sent_count,
        "created_rows": created,
        "skipped_rows": skipped_existing,
        "failed_rows": failed,
    }

