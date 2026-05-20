"""TonersCart FastAPI backend — Supabase edition."""
import os
import re
import uuid
import asyncio
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
import google.generativeai as genai

from supabase_client import sb_admin, sb_anon, get_user_from_token
from email_service import (
    email_application_received,
    email_application_approved,
    email_application_rejected,
    email_mps_inquiry,
)
from ai_check import check_documents

load_dotenv(Path(__file__).parent / ".env")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tonerscart")

app = FastAPI(title="TonersCart API (Supabase)")
api = APIRouter(prefix="/api")


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def get_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


def require_user(request: Request) -> dict:
    token = get_token(request)
    uid, profile = get_user_from_token(token) if token else (None, None)
    if not uid or not profile:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return profile


def require_role(*roles: str):
    def dep(request: Request):
        u = require_user(request)
        if u.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return u
    return dep


SIGNED_URL_TTL = 60

DOC_FIELDS = [
    "doc_brand_authorization",
    "doc_shop_photo",
    "doc_gst",
    "doc_pan",
    "doc_bank_proof",
    "doc_address_proof",
]


def _signed_doc_urls(application: dict, ttl: int = SIGNED_URL_TTL) -> dict:
    out = {}
    for f in DOC_FIELDS:
        path = application.get(f)
        if not path:
            continue
        try:
            res = sb_admin.storage.from_("supplier-documents").create_signed_url(path, ttl)
            url = res.get("signedURL") or res.get("signed_url") or res.get("signedUrl")
            if url:
                out[f] = url
        except Exception as e:
            logger.warning("sign url failed for %s: %s", path, e)
    return out


async def _run_ai_check(user_id: str, application: dict):
    docs = {f: application.get(f) for f in DOC_FIELDS if application.get(f)}
    if not docs:
        return
    signed = _signed_doc_urls(application, ttl=120)
    if not signed:
        return
    results = await check_documents(signed)
    sb_admin.table("suppliers_pending").update({"ai_check": results}).eq("user_id", user_id).execute()


class SignupCustomer(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    phone: Optional[str] = ""
    city: Optional[str] = ""


class SellerApplication(BaseModel):
    business_name: str
    contact_person: str
    phone: str
    city: str
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    cities_served: List[str] = Field(default_factory=list)
    gst_number: Optional[str] = ""
    pan_number: Optional[str] = ""
    annual_turnover: Optional[str] = ""
    years_in_business: Optional[int] = None
    business_address: str
    seller_types: List[str] = Field(default_factory=list)
    compatible_brands: List[str] = Field(default_factory=list)
    testing_before_delivery: bool = False
    doc_brand_authorization: Optional[str] = ""
    doc_shop_photo: Optional[str] = ""
    doc_gst: Optional[str] = ""
    doc_pan: Optional[str] = ""
    doc_bank_proof: Optional[str] = ""
    doc_address_proof: Optional[str] = ""


class SignupSupplier(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    business_name: str
    contact_person: str
    phone: str
    city: str
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    cities_served: List[str] = Field(default_factory=list)
    gst_number: Optional[str] = ""
    pan_number: Optional[str] = ""
    annual_turnover: Optional[str] = ""
    years_in_business: Optional[int] = None
    business_address: str
    seller_types: List[str] = Field(default_factory=list)
    compatible_brands: List[str] = Field(default_factory=list)
    testing_before_delivery: bool = False
    doc_brand_authorization: Optional[str] = ""
    doc_shop_photo: Optional[str] = ""
    doc_gst: Optional[str] = ""
    doc_pan: Optional[str] = ""
    doc_bank_proof: Optional[str] = ""
    doc_address_proof: Optional[str] = ""


class ListingCreate(BaseModel):
    toner_id: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    color: Optional[str] = "Black"
    page_yield: Optional[int] = None
    price: float = Field(ge=0)
    stock: int = Field(ge=0)
    toner_type: str
    image_url: Optional[str] = ""


class ListingUpdate(BaseModel):
    price: Optional[float] = None
    stock: Optional[int] = None
    toner_type: Optional[str] = None
    image_url: Optional[str] = None


class OrderCreate(BaseModel):
    listing_id: str
    qty: int = Field(gt=0)
    customer_name: str
    customer_phone: str
    delivery_address: str
    notes: Optional[str] = ""


class OrderStatusUpdate(BaseModel):
    status: str
    tracking_number: Optional[str] = None


class RejectPayload(BaseModel):
    reason: Optional[str] = ""


@api.post("/auth/oauth-bootstrap")
def oauth_bootstrap(payload: dict, request: Request):
    token = get_token(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        uid_resp = sb_anon.auth.get_user(token)
    except Exception:
        uid_resp = None
    if not uid_resp or not uid_resp.user:
        raise HTTPException(401, "Not authenticated")
    user = uid_resp.user
    uid = user.id
    existing = sb_admin.table("users").select("id,role").eq("id", uid).maybe_single().execute()
    if existing and existing.data:
        return {"ok": True, "role": existing.data["role"], "created": False}
    intended = (payload or {}).get("role") if isinstance(payload, dict) else None
    role = intended if intended in ("customer", "supplier") else "customer"
    name = (user.user_metadata or {}).get("full_name") or (user.user_metadata or {}).get("name") or (user.email or "").split("@")[0]
    sb_admin.table("users").insert({
        "id": uid,
        "email": user.email,
        "name": name,
        "role": role,
    }).execute()
    return {"ok": True, "role": role, "created": True}


@api.post("/auth/signup-customer")
def signup_customer(payload: SignupCustomer):
    try:
        created = sb_admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"name": payload.name, "role": "customer"},
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise HTTPException(400, "Email already registered") from e
        raise HTTPException(400, str(e)) from e
    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid,
        "email": payload.email,
        "name": payload.name,
        "role": "customer",
        "phone": payload.phone or None,
        "city": payload.city or None,
    }, on_conflict="id").execute()
    return {"ok": True, "user_id": uid}


@api.post("/auth/signup-supplier")
async def signup_supplier(payload: SignupSupplier):
    try:
        created = sb_admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"name": payload.contact_person, "role": "supplier"},
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "registered" in msg or "exists" in msg:
            raise HTTPException(400, "Email already registered") from e
        raise HTTPException(400, str(e)) from e
    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid,
        "email": payload.email,
        "name": payload.contact_person,
        "role": "supplier",
        "phone": payload.phone,
        "company": payload.business_name,
        "city": payload.city,
    }, on_conflict="id").execute()
    application = {
        "user_id": uid,
        "business_name": payload.business_name,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "email": payload.email,
        "city": payload.city,
        "state": payload.state or None,
        "pincode": payload.pincode or None,
        "cities_served": payload.cities_served or [],
        "gst_number": payload.gst_number or None,
        "pan_number": payload.pan_number or None,
        "annual_turnover": payload.annual_turnover or None,
        "years_in_business": payload.years_in_business,
        "business_address": payload.business_address,
        "seller_types": payload.seller_types or [],
        "compatible_brands": payload.compatible_brands or [],
        "testing_before_delivery": payload.testing_before_delivery,
        "doc_brand_authorization": payload.doc_brand_authorization or None,
        "doc_shop_photo": payload.doc_shop_photo or None,
        "doc_gst": payload.doc_gst or None,
        "doc_pan": payload.doc_pan or None,
        "doc_bank_proof": payload.doc_bank_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "status": "pending",
    }
    sb_admin.table("suppliers_pending").upsert(application, on_conflict="user_id").execute()
    try:
        await _run_ai_check(uid, application)
    except Exception as e:
        logger.warning("AI check skipped: %s", e)
    try:
        await email_application_received(application)
    except Exception as e:
        logger.warning("application email skipped: %s", e)
    return {"ok": True, "user_id": uid, "status": "pending"}


class SupplierDocPaths(BaseModel):
    doc_brand_authorization: Optional[str] = None
    doc_shop_photo: Optional[str] = None
    doc_gst: Optional[str] = None
    doc_pan: Optional[str] = None
    doc_bank_proof: Optional[str] = None
    doc_address_proof: Optional[str] = None


@api.post("/auth/apply-seller")
async def apply_seller(payload: SellerApplication, user: dict = Depends(require_user)):
    if user.get("role") == "supplier":
        raise HTTPException(400, "You are already a seller")
    if user.get("role") == "admin":
        raise HTTPException(400, "Admins cannot apply as sellers")
    application = {
        "user_id": user["id"],
        "business_name": payload.business_name,
        "contact_person": payload.contact_person,
        "phone": payload.phone,
        "email": user.get("email"),
        "city": payload.city,
        "state": payload.state or None,
        "pincode": payload.pincode or None,
        "cities_served": payload.cities_served or [],
        "gst_number": payload.gst_number or None,
        "pan_number": payload.pan_number or None,
        "annual_turnover": payload.annual_turnover or None,
        "years_in_business": payload.years_in_business,
        "business_address": payload.business_address,
        "seller_types": payload.seller_types or [],
        "compatible_brands": payload.compatible_brands or [],
        "testing_before_delivery": payload.testing_before_delivery,
        "doc_brand_authorization": payload.doc_brand_authorization or None,
        "doc_shop_photo": payload.doc_shop_photo or None,
        "doc_gst": payload.doc_gst or None,
        "doc_pan": payload.doc_pan or None,
        "doc_bank_proof": payload.doc_bank_proof or None,
        "doc_address_proof": payload.doc_address_proof or None,
        "status": "pending",
        "rejection_reason": None,
    }
    sb_admin.table("suppliers_pending").upsert(application, on_conflict="user_id").execute()
    async def _bg_ai():
        try:
            await _run_ai_check(user["id"], application)
        except Exception as e:
            logger.warning("background AI check skipped: %s", e)
    asyncio.create_task(_bg_ai())
    try:
        await email_application_received(application)
    except Exception as e:
        logger.warning("application email skipped: %s", e)
    return {"ok": True, "status": "pending"}


@api.post("/auth/supplier-documents")
async def supplier_documents_patch(payload: SupplierDocPaths, user: dict = Depends(require_user)):
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v}
    if not upd:
        return {"ok": True}
    sb_admin.table("suppliers_pending").update(upd).eq("user_id", user["id"]).execute()
    p = sb_admin.table("suppliers_pending").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if p and p.data:
        async def _bg_ai():
            try:
                await _run_ai_check(user["id"], p.data)
            except Exception as e:
                logger.warning("background AI check skipped: %s", e)
        asyncio.create_task(_bg_ai())
    return {"ok": True}


@api.post("/auth/supplier-document-upload")
async def supplier_document_upload(
    field: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    allowed = {
        "doc_brand_authorization", "doc_shop_photo", "doc_gst",
        "doc_pan", "doc_bank_proof", "doc_address_proof",
    }
    if field not in allowed:
        raise HTTPException(400, "Invalid document field")
    if not file.content_type or not (file.content_type.startswith("image/") or file.content_type == "application/pdf"):
        raise HTTPException(400, "Only images and PDF are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin").lower()
    path = f"{user['id']}/{field}-{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("supplier-documents").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("supplier doc upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    return {"path": path, "field": field}


@api.get("/auth/me")
def me(user: dict = Depends(require_user)):
    out = dict(user)
    if user.get("role") == "supplier":
        s = sb_admin.table("suppliers").select("id,business_name,city,approved_at").eq(
            "user_id", user["id"]
        ).maybe_single().execute()
        if s and s.data:
            out["supplier_status"] = "approved"
            out["application_status"] = None
            out["supplier"] = s.data
            return out
        out["supplier_status"] = "pending"
        out["application_status"] = "pending"
        return out
    p = sb_admin.table("suppliers_pending").select(
        "id,business_name,status,rejection_reason,submitted_at"
    ).eq("user_id", user["id"]).maybe_single().execute()
    if p and p.data:
        out["application_status"] = p.data["status"]
        out["application"] = p.data
    else:
        out["application_status"] = None
    return out


@api.get("/toner-master")
def toner_master(q: Optional[str] = None, brand: Optional[str] = None, limit: int = 100):
    qry = sb_admin.table("toner_master").select("*").order("brand").order("model_number").limit(limit)
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    return qry.execute().data or []


@api.get("/toner-master/brands")
def toner_master_brands():
    rows = sb_admin.table("toner_master").select("brand").execute().data or []
    return sorted({r["brand"] for r in rows})


@api.get("/listings/search")
def search_listings(q: Optional[str] = None, brand: Optional[str] = None,
                    city: Optional[str] = None, toner_type: Optional[str] = None,
                    limit: int = 200):
    qry = sb_admin.table("listings").select(
        "*,suppliers!inner(business_name,city)"
    ).order("price").limit(limit)
    if q:
        qry = qry.ilike("search_norm", f"%{normalize(q)}%")
    if brand and brand != "all":
        qry = qry.eq("brand", brand)
    if city and city != "all":
        qry = qry.eq("city", city)
    if toner_type and toner_type != "all":
        qry = qry.eq("toner_type", toner_type)
    rows = qry.execute().data or []
    for r in rows:
        s = r.pop("suppliers", None) or {}
        r["supplier_name"] = s.get("business_name")
        r["supplier_city"] = s.get("city")
    return rows


@api.get("/listings/facets")
def listing_facets():
    rows = sb_admin.table("listings").select("brand,city").execute().data or []
    return {
        "brands": sorted({r["brand"] for r in rows if r.get("brand")}),
        "cities": sorted({r["city"] for r in rows if r.get("city")}),
        "toner_types": ["Original", "Compatible", "Refilled"],
    }


@api.get("/listings/grouped")
def listings_grouped(city: Optional[str] = None, limit: int = 12):
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


def _approved_supplier(user: dict) -> dict:
    s = sb_admin.table("suppliers").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Supplier not approved yet")
    return s.data


@api.get("/supplier/listings")
def supplier_listings(user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    rows = sb_admin.table("listings").select("*").eq("supplier_id", s["id"]).order(
        "created_at", desc=True
    ).execute().data or []
    return rows


@api.post("/supplier/listings")
def create_listing(payload: ListingCreate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    if payload.toner_type not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    t = None
    if payload.toner_id:
        tm = sb_admin.table("toner_master").select("*").eq("id", payload.toner_id).maybe_single().execute()
        t = tm.data if tm and tm.data else None
    if not t:
        if not (payload.brand and payload.model_number):
            raise HTTPException(400, "Provide toner_id or brand+model_number")
        brand = payload.brand.strip()
        model = payload.model_number.strip()
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
        "brand": t["brand"],
        "model_number": t["model_number"],
        "search_norm": t.get("search_norm") or re.sub(r"[^a-z0-9]", "", f"{t['brand']}{t['model_number']}".lower()),
        "color": payload.color or t.get("color") or "Black",
        "toner_type": payload.toner_type,
        "price": payload.price,
        "stock": payload.stock,
        "image_url": payload.image_url or None,
        "city": s["city"],
    }
    res = sb_admin.table("listings").insert(row).execute()
    return res.data[0] if res.data else row


@api.put("/supplier/listings/{listing_id}")
def update_listing(listing_id: str, payload: ListingUpdate, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    existing = sb_admin.table("listings").select("supplier_id").eq("id", listing_id).maybe_single().execute()
    if not existing or not existing.data or existing.data["supplier_id"] != s["id"]:
        raise HTTPException(404, "Listing not found")
    upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "toner_type" in upd and upd["toner_type"] not in ("Original", "Compatible", "Refilled"):
        raise HTTPException(400, "toner_type must be Original, Compatible or Refilled")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb_admin.table("listings").update(upd).eq("id", listing_id).execute()
    return {"ok": True}


@api.delete("/supplier/listings/{listing_id}")
def delete_listing(listing_id: str, user: dict = Depends(require_role("supplier"))):
    s = _approved_supplier(user)
    sb_admin.table("listings").delete().eq("id", listing_id).eq("supplier_id", s["id"]).execute()
    return {"ok": True}


@api.post("/orders")
def create_order(payload: OrderCreate, user: dict = Depends(require_user)):
    if user["role"] not in ("customer", "supplier"):
        raise HTTPException(403, "Only signed-in buyers and sellers can place orders")
    lst = sb_admin.table("listings").select("*").eq("id", payload.listing_id).maybe_single().execute()
    if not lst or not lst.data:
        raise HTTPException(404, "Listing not found")
    L = lst.data
    if payload.qty > (L.get("stock") or 0):
        raise HTTPException(400, "Insufficient stock")
    total = float(L["price"]) * payload.qty
    row = {
        "customer_id": user["id"],
        "supplier_id": L["supplier_id"],
        "listing_id": L["id"],
        "qty": payload.qty,
        "unit_price": L["price"],
        "total": total,
        "customer_name": payload.customer_name,
        "customer_phone": payload.customer_phone,
        "delivery_address": payload.delivery_address,
        "notes": payload.notes or None,
        "status": "requested",
    }
    res = sb_admin.table("orders").insert(row).execute()
    sb_admin.table("listings").update({"stock": L["stock"] - payload.qty}).eq("id", L["id"]).execute()
    return res.data[0] if res.data else row


@api.get("/orders/mine")
def my_orders(user: dict = Depends(require_user)):
    if user["role"] == "customer":
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url),suppliers(business_name,city)").eq("customer_id", user["id"]).order("created_at", desc=True).execute().data or []
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        rows = sb_admin.table("orders").select("*,listings(model_number,brand,toner_type,image_url)").eq("supplier_id", s["id"]).order("created_at", desc=True).execute().data or []
    else:
        rows = sb_admin.table("orders").select("*").order("created_at", desc=True).limit(500).execute().data or []
    return rows


@api.put("/orders/{order_id}/status")
def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(require_user)):
    allowed = {"requested", "accepted", "shipped", "delivered", "rejected", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid status")
    o = sb_admin.table("orders").select("*").eq("id", order_id).maybe_single().execute()
    if not o or not o.data:
        raise HTTPException(404, "Order not found")
    O_row = o.data
    if user["role"] == "customer":
        if O_row["customer_id"] != user["id"] or payload.status != "cancelled":
            raise HTTPException(403, "Customers can only cancel their own orders")
    elif user["role"] == "supplier":
        s = _approved_supplier(user)
        if O_row["supplier_id"] != s["id"]:
            raise HTTPException(403, "Not your order")
    upd = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.tracking_number:
        upd["tracking_number"] = payload.tracking_number
    sb_admin.table("orders").update(upd).eq("id", order_id).execute()
    return {"ok": True}


@api.get("/admin/suppliers/pending")
def admin_pending(user: dict = Depends(require_role("admin"))):
    rows = sb_admin.table("suppliers_pending").select("*").eq("status", "pending").order("submitted_at", desc=True).execute().data or []
    return rows


@api.get("/admin/suppliers")
def admin_suppliers(user: dict = Depends(require_role("admin"))):
    return sb_admin.table("suppliers").select("*").order("approved_at", desc=True).execute().data or []


@api.post("/admin/suppliers/{pending_id}/approve")
async def admin_approve(pending_id: str, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    P = p.data
    if P["status"] != "pending":
        raise HTTPException(400, f"Already {P['status']}")
    sb_admin.table("suppliers").upsert({
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
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="user_id").execute()
    sb_admin.table("suppliers_pending").update({
        "status": "approved",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", pending_id).execute()
    sb_admin.table("users").update({"role": "supplier"}).eq("id", P["user_id"]).execute()
    try:
        await email_application_approved(P)
    except Exception as e:
        logger.warning("approval email failed: %s", e)
    return {"ok": True}


@api.post("/admin/suppliers/{pending_id}/reject")
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
    return {"ok": True}


@api.get("/admin/suppliers/{pending_id}/documents")
def admin_documents(pending_id: str, user: dict = Depends(require_role("admin"))):
    p = sb_admin.table("suppliers_pending").select("*").eq("id", pending_id).maybe_single().execute()
    if not p or not p.data:
        raise HTTPException(404, "Pending application not found")
    return {"documents": _signed_doc_urls(p.data, ttl=300), "ai_check": p.data.get("ai_check") or {}}


@api.get("/admin/stats")
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


PRINTER_USAGES = {"home", "corporate", "commercial", "print_shop"}
PRINTER_CATEGORIES = {"inkjet", "laser", "tank", "thermal", "production", "digital_press", "label_barcode", "ink", "other"}
PRINTER_CONDITIONS = {"new", "refurbished"}
PRINTER_COLORS = {"color", "bw", "both"}


class PrinterListingCreate(BaseModel):
    brand: str
    model_number: str
    description: Optional[str] = ""
    image_url: str
    condition: str = "new"
    usage_type: str
    category: str
    color: str = "color"
    paper_sizes: List[str] = Field(default_factory=list)
    functions: List[str] = Field(default_factory=list)
    connectivity: List[str] = Field(default_factory=list)
    features: List[str] = Field(default_factory=list)
    monthly_volume_min: int = 0
    monthly_volume_max: int = 0
    price: float
    stock: int = 1


def _supplier_id_for(user: dict) -> str:
    s = sb_admin.table("suppliers").select("id").eq("user_id", user["id"]).maybe_single().execute()
    if not s or not s.data:
        raise HTTPException(403, "Only approved sellers can manage printers")
    return s.data["id"]


@api.post("/supplier/printer-image")
async def upload_printer_image(file: UploadFile = File(...), user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can upload printer images")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5 MB")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg").lower()
    path = f"{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        sb_admin.storage.from_("printer-images").upload(
            path, content, {"content-type": file.content_type, "upsert": "false"}
        )
    except Exception as e:
        logger.exception("printer image upload failed")
        raise HTTPException(500, f"Upload failed: {e}") from e
    public_url = sb_admin.storage.from_("printer-images").get_public_url(path)
    return {"url": public_url, "path": path}


@api.post("/supplier/printers")
def create_printer(payload: PrinterListingCreate, user: dict = Depends(require_user)):
    if user.get("role") != "supplier":
        raise HTTPException(403, "Only approved sellers can list printers")
    if payload.condition not in PRINTER_CONDITIONS:
        raise HTTPException(400, "Invalid condition")
    if payload.usage_type not in PRINTER_USAGES:
        raise HTTPException(400, "Invalid usage_type")
    if payload.category not in PRINTER_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if payload.color not in PRINTER_COLORS:
        raise HTTPException(400, "Invalid color")
    if payload.price < 0 or payload.stock < 0:
        raise HTTPException(400, "price and stock must be non-negative")
    if not payload.image_url:
        raise HTTPException(400, "Image is required")
    sid = _supplier_id_for(user)
    row = {
        "supplier_id": sid,
        "brand": payload.brand.strip(),
        "model_number": payload.model_number.strip(),
        "description": payload.description or "",
        "image_url": payload.image_url,
        "condition": payload.condition,
        "usage_type": payload.usage_type,
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
    }
    res = sb_admin.table("printer_listings").insert(row).execute()
    if not res.data:
        raise HTTPException(500, "Failed to insert printer")
    return {"id": res.data[0]["id"]}


@api.delete("/supplier/printers/{printer_id}")
def delete_printer(printer_id: str, user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    sb_admin.table("printer_listings").delete().eq("id", printer_id).eq("supplier_id", sid).execute()
    return {"ok": True}


@api.get("/supplier/printers/mine")
def my_printers(user: dict = Depends(require_user)):
    sid = _supplier_id_for(user)
    res = sb_admin.table("printer_listings").select("*").eq("supplier_id", sid).order("created_at", desc=True).execute()
    return res.data or []


@api.get("/printers")
def list_printers(
    usage_type: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    paper_size: Optional[str] = None,
    function_: Optional[str] = None,
    connectivity: Optional[str] = None,
    feature: Optional[str] = None,
    min_volume: Optional[int] = None,
    max_volume: Optional[int] = None,
    city: Optional[str] = None,
    brand: Optional[str] = None,
    q: Optional[str] = None,
):
    sel = (
        "id,brand,model_number,description,image_url,condition,usage_type,category,"
        "color,paper_sizes,functions,connectivity,features,monthly_volume_min,monthly_volume_max,"
        "price,stock,supplier:suppliers(business_name,city)"
    )
    qry = sb_admin.table("printer_listings").select(sel).gt("stock", 0)
    if usage_type and usage_type in PRINTER_USAGES:
        qry = qry.eq("usage_type", usage_type)
    if category and category in PRINTER_CATEGORIES:
        qry = qry.eq("category", category)
    if condition and condition in PRINTER_CONDITIONS:
        qry = qry.eq("condition", condition)
    if color and color in PRINTER_COLORS:
        if color == "color":
            qry = qry.in_("color", ["color", "both"])
        elif color == "bw":
            qry = qry.in_("color", ["bw", "both"])
        else:
            qry = qry.eq("color", "both")
    if paper_size:
        qry = qry.contains("paper_sizes", [paper_size])
    if function_:
        qry = qry.contains("functions", [function_])
    if connectivity:
        qry = qry.contains("connectivity", [connectivity])
    if feature:
        qry = qry.contains("features", [feature])
    if min_volume is not None:
        qry = qry.gte("monthly_volume_max", min_volume)
    if max_volume is not None:
        qry = qry.lte("monthly_volume_min", max_volume)
    if brand:
        qry = qry.ilike("brand", f"%{brand}%")
    if q:
        qry = qry.or_(f"brand.ilike.%{q}%,model_number.ilike.%{q}%,description.ilike.%{q}%")
    res = qry.order("created_at", desc=True).limit(200).execute()
    rows = res.data or []
    out = []
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
        r["supplier_name"] = sup.get("business_name", "")
        r["city"] = sup.get("city", "")
        if accepted is not None and r["city"].lower() not in accepted:
            continue
        out.append(r)
    return out


class MPSInquiry(BaseModel):
    name: str
    email: EmailStr
    phone: str
    description: Optional[str] = ""
    estimated_printers: str
    selections: Optional[dict] = None


@api.post("/mps/inquiry")
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
        "name": payload.name.strip(),
        "email": str(payload.email),
        "phone": payload.phone.strip(),
        "description": payload.description or "",
        "estimated_printers": payload.estimated_printers,
        "selections": payload.selections or {},
    }
    sb_admin.table("mps_inquiries").insert(row).execute()
    try:
        await email_mps_inquiry(row)
    except Exception as e:
        logger.warning("MPS email failed: %s", e)
    return {"ok": True}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


CHAT_SYSTEM = (
    "You are TonerBot, a concise expert assistant for TonersCart — India's B2B printer-toner marketplace. "
    "You help buyers identify the right toner cartridge for their printer, explain Original vs Compatible, "
    "estimate page yield expectations, recommend trusted brands (HP, Canon, Brother, Samsung, Ricoh, Epson, Xerox, Kyocera), "
    "and answer bulk-purchase / sourcing questions in the Indian B2B context. "
    "Keep replies short (under 120 words) and practical. When you suggest a toner, mention the model number "
    "(e.g., HP 88A, Canon 925, Brother TN-2365) and ask the buyer to search it on TonersCart. "
    "If the user asks about anything unrelated to printers/toners, politely steer back to toner queries."
)


@api.post("/chat")
async def chat(payload: ChatRequest):
    if not payload.messages:
        raise HTTPException(400, "messages required")
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(500, "LLM key not configured")
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash-preview-04-17", system_instruction=CHAT_SYSTEM)
        messages = [{"role": "user" if m.role == "user" else "model", "parts": [m.content]} for m in payload.messages]
        response = model.generate_content(messages)
        reply = response.text
        return {"reply": reply, "session_id": payload.session_id or str(uuid.uuid4())}
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(502, f"Chat unavailable: {e}") from e


@api.get("/")
def root():
    return {"service": "TonersCart API (Supabase)", "ok": True}


app.include_router(api)

# CORS — explicit origin list (browsers reject the wildcard "*" combined with allow_credentials=True,
# which silently strips the Access-Control-Allow-Origin header on the response).
_default_origins = [
    "https://www.tonerscart.com",
    "https://tonerscart.com",
    "https://toners-marketplace.preview.emergentagent.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_env_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
_allowed_origins = sorted(set(_default_origins + _env_origins))
logger.info("CORS allowed origins: %s", _allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        "https://www.tonerscart.com",
        "https://tonerscart.com",
        "https://tonerscart.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)
