"""Orders, quotations and MPS inquiries routes (extracted from server.py)."""
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
from server import (_approved_supplier, _attach_direct_product, _create_direct_order, _gen_quote_number, _generate_order_number, _log_admin_action, _orders_with_listings, _resolve_delivery_charge, _safe_order_update)  # underscore kernel helpers

from server import (_commission_breakdown)  # auto: kernel underscore helpers
router = APIRouter(prefix="/api")


@router.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(require_user)):
    if user["role"] not in ("customer", "supplier"):
        raise HTTPException(403, "Only signed-in buyers and sellers can place orders")
    if (payload.listing_kind or "toner") in ("paper", "consumable", "scanner", "printer"):
        return await _create_direct_order(payload, user, payload.listing_kind)
    lst = sb_admin.table("listings").select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data

    # Variant resolution — when buyer picked a colour swatch, deduct from the variant's stock
    variant = None
    if payload.variant_id:
        try:
            v = sb_admin.table("listing_variants").select("*").eq("id", payload.variant_id).maybe_single().execute()
            if v and v.data and v.data.get("listing_id") == L["id"]:
                variant = v.data
        except Exception as e:
            if "listing_variants" not in str(e):
                logger.warning("variant lookup failed: %s", e)

    available = int(variant["stock"] if variant else (L.get("stock") or 0))
    if payload.qty > available:
        raise HTTPException(400, "Insufficient stock")
    unit_price = float(variant["price"]) if variant else float(L["price"])
    total = unit_price * payload.qty
    # System-defined intercity delivery (ignore any client-sent amount).
    # Dealer city: listing city if present, else the supplier's registered city.
    _dealer_city = L.get("city")
    if not _dealer_city:
        _sup = sb_admin.table("suppliers").select("city").eq("id", L["supplier_id"]).maybe_single().execute()
        _dealer_city = (_sup.data or {}).get("city") if _sup else None
    delivery_charge = _resolve_delivery_charge(
        "toner", _dealer_city, payload.order_city, bool(payload.charge_delivery), L
    )

    row = {
        "customer_id": user["id"],
        "supplier_id": L["supplier_id"],
        "listing_id": L["id"],
        "qty": payload.qty,
        "unit_price": unit_price,
        "total": total,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "delivery_address": payload.delivery_address,
        "notes": payload.notes or None,
        "status": "requested",
    }
    if variant:
        row["variant_id"] = variant["id"]
    # Optional structured address — drop columns that aren't migrated yet
    for k, v in {
        "street_address": payload.street_address,
        "area": payload.area,
        "order_city": payload.order_city,
        "order_state": payload.order_state,
        "pincode": payload.pincode,
        "delivery_charge": (delivery_charge if delivery_charge else None),
        "gst_rate": (int(payload.gst_rate) if payload.gst_rate is not None else None),
        "gst_amount": (float(payload.gst_amount) if payload.gst_amount is not None else None),
    }.items():
        if v is not None and v != "":
            row[k] = v
    while True:
        try:
            res = sb_admin.table("orders").insert(row).execute()
            break
        except Exception as e:
            msg = str(e)
            dropped = False
            for k in ("variant_id", "street_address", "area", "order_city", "order_state", "pincode", "delivery_charge", "gst_rate", "gst_amount"):
                if k in msg and k in row:
                    row.pop(k, None)
                    dropped = True
                    break
            if not dropped:
                raise
    # Decrement stock — variant if any, else listing
    try:
        if variant:
            sb_admin.table("listing_variants").update({"stock": max(0, int(variant["stock"]) - payload.qty)}).eq("id", variant["id"]).execute()
            # Also recompute total stock on parent listing
            try:
                allv = sb_admin.table("listing_variants").select("stock").eq("listing_id", L["id"]).execute().data or []
                sb_admin.table("listings").update({"stock": sum(int(x.get("stock") or 0) for x in allv)}).eq("id", L["id"]).execute()
            except Exception:
                pass
        else:
            sb_admin.table("listings").update({"stock": max(0, int(L.get("stock") or 0) - payload.qty)}).eq("id", L["id"]).execute()
    except Exception as e:
        logger.warning("stock decrement failed: %s", e)
    created = res.data[0] if res.data else row

    # Generate TC-YYYY-NNNNN order_number (best effort — gracefully degrades if column missing)
    try:
        order_number = _generate_order_number()
        if order_number and created.get("id"):
            upd = sb_admin.table("orders").update({"order_number": order_number}).eq("id", created["id"]).execute()
            if upd and upd.data:
                created["order_number"] = order_number
    except Exception:
        logger.exception("order_number generation skipped")

    # Fire confirmation emails (best effort — never block the order)
    try:
        sup = sb_admin.table("suppliers").select(
            "*"
        ).eq("id", L["supplier_id"]).maybe_single().execute()
        buyer_row = sb_admin.table("users").select("email,name,gst_number").eq("id", user["id"]).maybe_single().execute()
        order_for_email = dict(created)
        order_for_email["buyer_gst_number"] = (buyer_row.data or {}).get("gst_number") if buyer_row else None
        order_for_email["supplier_gst_number"] = (sup.data or {}).get("gst_number") if sup else None
        await email_order_placed(
            order=order_for_email,
            listing=L,
            supplier=(sup.data if sup else {}) or {},
            buyer=(buyer_row.data if buyer_row else {}) or {},
        )
    except Exception:
        logger.exception("order confirmation email failed (non-fatal)")

    return created


@router.get("/orders/mine")
def my_orders(user: dict = Depends(require_user)):
    if user["role"] == "customer":
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url),suppliers(business_name,city,gst_number)").eq("customer_id", user["id"]).order("created_at", desc=True).execute().data or []
        # Attach buyer GST (same for all rows since it's the same buyer)
        try:
            u = sb_admin.table("users").select("gst_number").eq("id", user["id"]).maybe_single().execute()
            buyer_gst = (u.data or {}).get("gst_number") if u else None
        except Exception:
            buyer_gst = None
        for r in rows:
            r["buyer_gst_number"] = buyer_gst
        _attach_direct_product(rows)
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url)").eq("supplier_id", s["id"]).order("created_at", desc=True).execute().data or []
        _attach_direct_product(rows)
        if rows:
            buyer_ids = list({r["customer_id"] for r in rows if r.get("customer_id")})
            buyer_map: dict = {}
            if buyer_ids:
                ulist = sb_admin.table("users").select("id,gst_number,email").in_("id", buyer_ids).execute().data or []
                buyer_map = {u["id"]: u for u in ulist}
            for r in rows:
                u = buyer_map.get(r.get("customer_id")) or {}
                r["buyer_gst_number"] = u.get("gst_number")
                r["buyer_email"] = u.get("email")
                r["supplier_gst_number"] = s.get("gst_number")
    else:
        rows = sb_admin.table("orders").select("*").order("created_at", desc=True).limit(500).execute().data or []
    return rows


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(require_user)):
    """Order lifecycle: Requested → Confirmed(accepted) → Dispatched(shipped) →
    Delivered → Completed. Dealer accepts/dispatches/marks-delivered; customer
    confirms receipt (delivered → completed) which starts the 5-day payout timer."""
    allowed = {"requested", "accepted", "shipped", "delivered", "completed", "rejected", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid status")
    o = sb_admin.table("orders").select("*").eq("id", order_id).maybe_single().execute()
    if not o or not o.data:
        raise HTTPException(404, "Order not found")
    O_row = o.data
    cur = O_row.get("status")
    role = user["role"]

    if role == "customer":
        if O_row["customer_id"] != user["id"]:
            raise HTTPException(403, "Not your order")
        if payload.status == "cancelled" and cur in ("requested", "accepted"):
            pass
        elif payload.status == "completed" and cur == "delivered":
            pass  # buyer confirms receipt
        else:
            raise HTTPException(403, "You can only cancel a pending order or confirm a delivered order")
    elif role == "supplier":
        s = _approved_supplier(user)
        if O_row["supplier_id"] != s["id"]:
            raise HTTPException(403, "Not your order")
        if payload.status in ("accepted", "rejected") and cur == "requested":
            pass
        elif payload.status == "shipped" and cur == "accepted":
            if not (payload.courier_name and payload.courier_name.strip()) or not (payload.tracking_number and payload.tracking_number.strip()):
                raise HTTPException(400, "Courier name and tracking number are required to dispatch")
        elif payload.status == "delivered" and cur == "shipped":
            pass
        else:
            raise HTTPException(403, "Invalid status transition for this order")
    elif role != "admin":
        raise HTTPException(403, "Not allowed")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    upd = {"status": payload.status, "updated_at": now_iso}
    if payload.status == "shipped":
        if payload.tracking_number:
            upd["tracking_number"] = payload.tracking_number.strip()
        if payload.courier_name:
            upd["courier_name"] = payload.courier_name.strip()
        # Wave 68 — payout is queued the moment the dealer dispatches with a
        # tracking number. Released within 2 business days. No more 5-day
        # buyer-confirmation gate. Buyer can still confirm delivery for their
        # own records, but it no longer drives payout eligibility.
        upd["dispatched_at"] = now_iso
        upd["payout_eligible_at"] = (now + _td(days=2)).isoformat()
    elif payload.status == "delivered":
        upd["delivered_at"] = now_iso
    elif payload.status == "completed":
        upd["completed_at"] = now_iso
        upd["auto_confirmed"] = False
    _safe_order_update(order_id, upd)
    if role == "admin":
        _log_admin_action(user, "order_status_changed", "order", order_id, {"status": payload.status})

    # --- Side-effect emails (best-effort) ---
    try:
        listing = sb_admin.table("listings").select("brand,model_number").eq("id", O_row["listing_id"]).maybe_single().execute().data or {}
        buyer = sb_admin.table("users").select("email,name").eq("id", O_row["customer_id"]).maybe_single().execute().data or {}
        if payload.status == "accepted":
            await email_order_confirmed(O_row, listing, buyer)
        elif payload.status == "shipped":
            await email_order_shipped({**O_row, "tracking_number": payload.tracking_number, "courier_name": payload.courier_name}, listing, buyer)
        elif payload.status == "delivered":
            await email_order_delivered_confirm(O_row, listing, buyer)
        elif payload.status == "completed":
            supplier = sb_admin.table("suppliers").select("business_name").eq("id", O_row["supplier_id"]).maybe_single().execute().data or {}
            await email_order_delivered_support({**O_row, "auto_confirmed": False}, listing, supplier, buyer)
    except Exception as e:
        logger.warning("order status email failed (%s): %s", payload.status, e)
    return {"ok": True}


@router.post("/mps/inquiry")
async def mps_inquiry(payload: MPSInquiry, request: Request):
    user_id = None
    tok = get_token(request)
    if tok:
        try:
            u = get_user_from_token(tok)
            if u:
                user_id = u.id
        except Exception:
            user_id = None
    row = {
        "user_id": user_id,
        "name": (payload.name or "").strip(),
        "email": str(payload.email),
        "phone": (payload.phone or "").strip(),
        "description": payload.description or "",
        "estimated_printers": payload.estimated_printers or "—",
        "selections": payload.selections or {},
    }
    # Best-effort DB insert; some enquiry types may not have a matching row in
    # the mps_inquiries table (e.g. interest captures). Email send is always
    # attempted so support@tonerscart.com is notified regardless.
    try:
        sb_admin.table("mps_inquiries").insert(row).execute()
    except Exception as e:
        logger.warning("mps_inquiries insert skipped: %s", e)
    try:
        await email_mps_inquiry(row)
    except Exception as e:
        logger.warning("MPS email failed: %s", e)
    return {"ok": True}


@router.post("/quotation")
async def create_quotation(payload: QuotationRequest, user: dict = Depends(require_user)):
    """Authenticated buyer requests a quotation. Sends a professional
    quotation email to the buyer's address + a copy to support@tonerscart.com.
    Dealer details are intentionally NOT included — only 'Verified Supplier on TonersCart'.
    """
    if payload.listing_type not in ("toner", "printer"):
        raise HTTPException(400, "listing_type must be 'toner' or 'printer'")

    table = "printer_listings" if payload.listing_type == "printer" else "listings"
    lst = sb_admin.table(table).select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data
    qty = max(1, int(payload.qty or 1))
    unit = float(L.get("price") or 0)
    total = round(unit * qty, 2)

    # Buyer details (name, email, gst, phone)
    u = sb_admin.table("users").select("name,email,phone,gst_number").eq(
        "id", user["id"]
    ).maybe_single().execute()
    buyer = u.data or {}

    qnum = _gen_quote_number()

    # Verified seller code (anonymised trust mark — name/contact stay hidden)
    seller_id = ""
    try:
        sup = sb_admin.table("suppliers").select("seller_id").eq(
            "id", L.get("supplier_id")
        ).maybe_single().execute()
        seller_id = (sup.data or {}).get("seller_id") or "" if sup else ""
    except Exception:
        seller_id = ""

    # Audit row (best-effort, no failure to the user)
    try:
        sb_admin.table("quotations").insert({
            "quote_number": qnum,
            "buyer_id": user["id"],
            "buyer_email": buyer.get("email"),
            "buyer_name": buyer.get("name"),
            "buyer_phone": buyer.get("phone"),
            "buyer_gst": buyer.get("gst_number"),
            "listing_id": payload.listing_id,
            "listing_type": payload.listing_type,
            "brand": L.get("brand"),
            "model_number": L.get("model_number"),
            "color": L.get("color"),
            "unit_price": unit,
            "qty": qty,
            "total": total,
            "supplier_id": L.get("supplier_id"),
        }).execute()
    except Exception as e:
        logger.warning("quotation audit insert failed: %s", e)

    item = {
        "brand": L.get("brand"),
        "model_number": L.get("model_number"),
        "color": L.get("color") or "—",
        "type": L.get("toner_type") if payload.listing_type == "toner" else L.get("condition"),
        "unit_price": unit,
        "qty": qty,
        "total": total,
        "listing_type": payload.listing_type,
        # Wave 14 — full tech specs for email
        "page_yield": L.get("page_yield"),
        "compatible_models": L.get("compatible_models"),
        "oem_part_number": L.get("oem_part_number"),
        "cartridge_weight": L.get("cartridge_weight"),
        "print_technology": L.get("print_technology"),
        "warranty": L.get("warranty"),
        "print_speed_ppm": L.get("print_speed_ppm"),
        "duty_cycle": L.get("duty_cycle"),
        "connectivity": L.get("connectivity"),
        "max_resolution": L.get("max_resolution"),
        "paper_sizes": L.get("paper_sizes"),
        "mobile_printing": L.get("mobile_printing"),
        "condition": L.get("condition"),
        "printer_warranty": L.get("printer_warranty"),
    }
    try:
        await email_quotation(
            quote_number=qnum,
            buyer={
                "name": buyer.get("name"),
                "email": buyer.get("email"),
                "phone": buyer.get("phone"),
                "gst": buyer.get("gst_number"),
            },
            item=item,
            seller_id=seller_id,
        )
    except Exception as e:
        logger.exception("quotation email failed")
        raise HTTPException(502, "Could not send quotation email — please try again") from e

    return {"ok": True, "quote_number": qnum, "email": buyer.get("email")}


@router.get("/supplier/earnings")
def supplier_earnings(user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can view earnings")
    s = sb_admin.table("suppliers").select("id,business_name").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    orders = _orders_with_listings(supplier_id=s.data["id"])
    items = []
    total_gmv = 0.0
    total_commission = 0.0
    total_net = 0.0
    for o in orders:
        total = float(o.get("total") or 0)
        c, p, label = _commission_breakdown(total)
        total_gmv += total
        total_commission += float(c)
        total_net += float(p)
        items.append({
            "id": o.get("id"),
            "brand": o.get("brand"),
            "model_number": o.get("model_number"),
            "qty": o.get("qty"),
            "total": total,
            "commission": c,
            "commission_rate": label,
            "payout": p,
            "status": o.get("status"),
            "created_at": o.get("created_at"),
        })
    return {
        "stats": {
            "total_gmv":        round(total_gmv, 2),
            "total_commission": round(total_commission, 2),
            "total_net":        round(total_net, 2),
            "orders":           len(items),
        },
        "orders": items,
    }
