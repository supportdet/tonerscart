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
    return sb_admin.table("suppliers").select("*").order("approved_at", desc=True).execute().data or []


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
            "active_listings": int(listings_cnt) + int(printers_cnt),
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

    return {
        "supplier": sup,
        "toner_listings": toners,
        "printer_listings": printers,
        "paper_listings": papers,
        "orders": orders,
        "documents": documents,
        "agreements": agreements,
        "stats": {
            "listing_count": len(toners) + len(printers) + len(papers),
            "active_listing_count": active_toners + active_printers + active_papers,
            "toner_count": len(toners),
            "printer_count": len(printers),
            "paper_count": len(papers),
            "order_count": len(orders),
            "gmv": round(gmv, 2),
            "commission_earned": round(commission_earned, 2),
            "pending_payout": round(pending_payout, 2),
        },
    }


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
