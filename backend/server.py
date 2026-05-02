from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import random
import logging
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage

from toner_master_seed import TONER_MASTER, SUPPLIERS_25, CUSTOMERS


# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="TonersCart API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("tonerscart")


# ----- Helpers: normalization -----
def normalize_model(s: str) -> str:
    """Lowercase, strip non-alphanumeric. 'HP 88A', 'hp-88a', 'HP88 A' → 'hp88a'."""
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]", "", s.lower())


# ----- Models -----
Role = Literal["customer", "supplier", "admin"]
SupplierStatus = Literal["pending", "approved", "rejected"]
OrderStatus = Literal["requested", "accepted", "shipped", "completed", "rejected"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["customer", "supplier"]
    company: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProductCreate(BaseModel):
    master_id: Optional[str] = None  # preferred: chosen from TonerMaster
    model_number: str
    brand: str
    title: Optional[str] = None
    description: Optional[str] = ""
    price: float
    stock: int
    city: str
    color: Optional[str] = "Black"
    toner_type: Optional[str] = "Original"
    compatible_printers: Optional[str] = ""
    page_yield: Optional[int] = None


class ProductUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    city: Optional[str] = None
    color: Optional[str] = None
    toner_type: Optional[str] = None
    compatible_printers: Optional[str] = None


class OrderCreate(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    notes: Optional[str] = ""
    delivery_address: str
    contact_phone: str


class OrderStatusUpdate(BaseModel):
    status: Literal["accepted", "shipped", "completed", "rejected"]
    tracking_number: Optional[str] = None


# ----- Helpers: auth -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_to_public(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"],
        "company": u.get("company"), "city": u.get("city"), "phone": u.get("phone"),
        "supplier_status": u.get("supplier_status"),
        "created_at": u["created_at"] if isinstance(u["created_at"], datetime) else datetime.fromisoformat(u["created_at"]),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        if user["role"] == "supplier" and user.get("supplier_status") != "approved":
            raise HTTPException(status_code=403, detail="Supplier account not approved yet")
        return user
    return dep


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True, secure=False,
                        samesite="lax", max_age=ACCESS_TOKEN_MINUTES * 60, path="/")


# ===== Auth =====
@api.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": user_id, "email": email, "name": payload.name, "role": payload.role,
        "company": payload.company, "city": payload.city, "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "supplier_status": "pending" if payload.role == "supplier" else None,
        "created_at": now.isoformat(),
    }
    await db.users.insert_one(doc.copy())
    token = create_access_token(user_id, email, payload.role)
    set_auth_cookie(response, token)
    return {"user": user_to_public(doc), "token": token}


@api.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    return {"user": user_to_public(user), "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


# ===== TonerMaster =====
@api.get("/toner-master")
async def list_toner_master(q: Optional[str] = None, brand: Optional[str] = None, limit: int = 50):
    """Smart, typo-tolerant search. Tries:
       1. exact normalized prefix match
       2. normalized substring match (handles 'HP88A', '88-A', 'hp 88 a' all → '88a')
    """
    query: dict = {}
    if brand and brand != "all":
        query["brand"] = brand
    if q:
        nq = normalize_model(q)
        if nq:
            query["$or"] = [
                {"search_norm": {"$regex": nq, "$options": "i"}},
                {"normalized": {"$regex": nq, "$options": "i"}},
                {"model_number": {"$regex": re.escape(q), "$options": "i"}},
                {"printer_compatibility": {"$regex": re.escape(q), "$options": "i"}},
            ]
    cursor = db.toner_master.find(query, {"_id": 0}).limit(limit)
    return await cursor.to_list(length=limit)


@api.get("/toner-master/brands")
async def toner_master_brands():
    return sorted(await db.toner_master.distinct("brand"))


@api.get("/toner-master/{master_id}")
async def get_toner_master(master_id: str):
    item = await db.toner_master.find_one({"id": master_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Toner not found")
    return item


# ===== Public products =====
@api.get("/products/search")
async def search_products(q: Optional[str] = None, brand: Optional[str] = None,
                          city: Optional[str] = None, limit: int = 200):
    query: dict = {}
    if q:
        nq = normalize_model(q)
        if nq:
            query["$or"] = [
                {"search_norm": {"$regex": nq, "$options": "i"}},
                {"model_normalized": {"$regex": nq, "$options": "i"}},
                {"model_number": {"$regex": re.escape(q), "$options": "i"}},
                {"title": {"$regex": re.escape(q), "$options": "i"}},
                {"compatible_printers": {"$regex": re.escape(q), "$options": "i"}},
            ]
    if brand and brand != "all":
        query["brand"] = brand
    if city and city != "all":
        query["city"] = city
    cursor = db.products.find(query, {"_id": 0}).limit(limit)
    items = await cursor.to_list(length=limit)
    return items


@api.get("/products/facets")
async def product_facets():
    brands = await db.products.distinct("brand")
    cities = await db.products.distinct("city")
    models = await db.products.distinct("model_number")
    return {"brands": sorted(brands), "cities": sorted(cities), "models": sorted(models)}


@api.get("/products/grouped")
async def grouped_products(q: Optional[str] = None, brand: Optional[str] = None,
                           city: Optional[str] = None, toner_type: Optional[str] = None):
    items = await search_products(q=q, brand=brand, city=city, limit=1000)
    if toner_type and toner_type != "all":
        items = [i for i in items if i.get("toner_type") == toner_type]
    groups: dict = {}
    for it in items:
        key = it["model_number"]
        groups.setdefault(key, {
            "model_number": key, "brand": it["brand"], "title": it.get("title", key),
            "color": it.get("color", "Black"),
            "compatible_printers": it.get("compatible_printers", ""),
            "page_yield": it.get("page_yield"),
            "listings": [],
        })
        groups[key]["listings"].append(it)
    result = []
    for g in groups.values():
        g["listings"].sort(key=lambda x: x["price"])
        g["min_price"] = g["listings"][0]["price"] if g["listings"] else 0
        g["max_price"] = g["listings"][-1]["price"] if g["listings"] else 0
        g["supplier_count"] = len(g["listings"])
        g["cities"] = sorted({li["city"] for li in g["listings"]})
        result.append(g)
    result.sort(key=lambda x: x["model_number"])
    return result


@api.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    return p


# ===== Supplier =====
@api.post("/supplier/products")
async def create_product(payload: ProductCreate, user: dict = Depends(require_role("supplier"))):
    master = None
    if payload.master_id:
        master = await db.toner_master.find_one({"id": payload.master_id}, {"_id": 0})
    pid = str(uuid.uuid4())
    model_number = (master["model_number"] if master else payload.model_number).strip()
    brand = (master["brand"] if master else payload.brand).strip()
    title = payload.title or (master["title"] if master else f"{brand} {model_number} Toner")
    color = (master["color"] if master else payload.color) or "Black"
    toner_type = payload.toner_type or (master["toner_type"] if master else "Original")
    printers = payload.compatible_printers or (master["printer_compatibility"] if master else "")
    page_yield = payload.page_yield or (master.get("page_yield") if master else None)

    doc = {
        "id": pid,
        "supplier_id": user["id"],
        "supplier_name": user["name"],
        "supplier_company": user.get("company"),
        "master_id": payload.master_id,
        "model_number": model_number,
        "model_normalized": normalize_model(model_number),
        "search_norm": normalize_model(f"{brand} {model_number} {color}"),
        "brand": brand,
        "title": title,
        "description": payload.description or "",
        "price": float(payload.price),
        "stock": int(payload.stock),
        "city": payload.city.strip(),
        "color": color,
        "toner_type": toner_type,
        "compatible_printers": printers,
        "page_yield": page_yield,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/supplier/products")
async def list_supplier_products(user: dict = Depends(require_role("supplier"))):
    return await db.products.find({"supplier_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.put("/supplier/products/{product_id}")
async def update_product(product_id: str, payload: ProductUpdate, user: dict = Depends(require_role("supplier"))):
    p = await db.products.find_one({"id": product_id})
    if not p or p["supplier_id"] != user["id"]:
        raise HTTPException(404, "Product not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.products.update_one({"id": product_id}, {"$set": update})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api.delete("/supplier/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role("supplier"))):
    p = await db.products.find_one({"id": product_id})
    if not p or p["supplier_id"] != user["id"]:
        raise HTTPException(404, "Product not found")
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ===== Orders =====
@api.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(403, "Only customers can place order requests")
    p = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    if payload.quantity > p["stock"]:
        raise HTTPException(400, f"Requested quantity exceeds stock ({p['stock']} available)")
    oid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": oid,
        "customer_id": user["id"], "customer_name": user["name"], "customer_email": user["email"],
        "supplier_id": p["supplier_id"], "supplier_name": p["supplier_name"], "supplier_company": p.get("supplier_company"),
        "product_id": p["id"], "product_title": p.get("title", p["model_number"]),
        "model_number": p["model_number"], "brand": p["brand"],
        "unit_price": p["price"], "quantity": payload.quantity,
        "total": round(p["price"] * payload.quantity, 2),
        "notes": payload.notes or "",
        "delivery_address": payload.delivery_address, "contact_phone": payload.contact_phone,
        "status": "requested", "tracking_number": None,
        "created_at": now, "updated_at": now,
    }
    await db.orders.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/orders/mine")
async def my_orders(user: dict = Depends(get_current_user)):
    if user["role"] == "customer":
        q = {"customer_id": user["id"]}
    elif user["role"] == "supplier":
        q = {"supplier_id": user["id"]}
    else:
        q = {}
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in ("supplier", "admin"):
        raise HTTPException(403, "Forbidden")
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if user["role"] == "supplier" and order["supplier_id"] != user["id"]:
        raise HTTPException(403, "Not your order")
    update = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.tracking_number:
        update["tracking_number"] = payload.tracking_number
    await db.orders.update_one({"id": order_id}, {"$set": update})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ===== Admin =====
@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)


@api.get("/admin/suppliers/pending")
async def admin_pending_suppliers(user: dict = Depends(require_role("admin"))):
    return await db.users.find({"role": "supplier", "supplier_status": "pending"}, {"_id": 0, "password_hash": 0}).to_list(500)


@api.post("/admin/suppliers/{supplier_id}/approve")
async def admin_approve(supplier_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": supplier_id, "role": "supplier"}, {"$set": {"supplier_status": "approved"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Supplier not found")
    return {"ok": True}


@api.post("/admin/suppliers/{supplier_id}/reject")
async def admin_reject(supplier_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": supplier_id, "role": "supplier"}, {"$set": {"supplier_status": "rejected"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Supplier not found")
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user: dict = Depends(require_role("admin"))):
    if user_id == user["id"]:
        raise HTTPException(400, "Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("role") == "admin":
        raise HTTPException(400, "Cannot delete admin")
    await db.users.delete_one({"id": user_id})
    if target.get("role") == "supplier":
        await db.products.delete_many({"supplier_id": user_id})
    return {"ok": True}


@api.get("/admin/products")
async def admin_products(user: dict = Depends(require_role("admin"))):
    return await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)


@api.get("/admin/orders")
async def admin_orders(user: dict = Depends(require_role("admin"))):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)


@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_role("admin"))):
    return {
        "users": await db.users.count_documents({}),
        "customers": await db.users.count_documents({"role": "customer"}),
        "suppliers_total": await db.users.count_documents({"role": "supplier"}),
        "suppliers_pending": await db.users.count_documents({"role": "supplier", "supplier_status": "pending"}),
        "products": await db.products.count_documents({}),
        "orders": await db.orders.count_documents({}),
        "toner_master": await db.toner_master.count_documents({}),
    }


@api.get("/")
async def root():
    return {"service": "TonersCart API", "ok": True}


# ===== Emergent Google Auth =====
class GoogleSessionRequest(BaseModel):
    session_id: str


@api.post("/auth/google-session")
async def google_session(payload: GoogleSessionRequest, response: Response):
    """Exchange Emergent Google auth session_id for our JWT token."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": payload.session_id},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google session")
            data = r.json()
    except httpx.HTTPError as e:
        logger.exception("Emergent auth fetch failed")
        raise HTTPException(status_code=502, detail="Auth provider unreachable") from e

    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    if not email:
        raise HTTPException(status_code=400, detail="Email missing from Google session")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id, "email": email, "name": name, "role": "customer",
            "company": None, "city": "Bangalore", "phone": None,
            "password_hash": "google-oauth",
            "supplier_status": None,
            "picture": picture,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc.copy())
        user = doc
    else:
        if picture and not user.get("picture"):
            await db.users.update_one({"email": email}, {"$set": {"picture": picture}})
            user["picture"] = picture

    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    return {"user": user_to_public(user), "token": token}


# ===== AI Chat (Claude Sonnet 4.5 via Emergent LLM key) =====
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


CHAT_SYSTEM = (
    "You are TonerBot, a concise expert assistant for TonersCart — India's B2B printer-toner marketplace. "
    "You help buyers identify the right toner cartridge for their printer, explain Original vs Compatible vs Refilled, "
    "estimate page yield expectations, recommend trusted brands (HP, Canon, Brother, Samsung, Ricoh, Epson, Xerox, Kyocera), "
    "and answer bulk-purchase / sourcing questions in the Indian B2B context. "
    "Keep replies short (under 120 words) and practical. When you suggest a toner, mention the model number "
    "(e.g., HP 88A, Canon 925, Brother TN-2365) and ask the buyer to search it on TonersCart. "
    "If the user asks about anything unrelated to printers/toners, politely steer back to toner queries."
)


@api.post("/chat")
async def chat(payload: ChatRequest):
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages required")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    session_id = payload.session_id or str(uuid.uuid4())
    try:
        chat_client = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=CHAT_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        latest = payload.messages[-1]
        if latest.role != "user":
            raise HTTPException(status_code=400, detail="last message must be from user")
        reply = await chat_client.send_message(UserMessage(text=latest.content))
        return {"reply": str(reply), "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"Chat unavailable: {e}") from e


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== Seed =====
async def seed_toner_master():
    if await db.toner_master.count_documents({}) > 0:
        return
    docs = []
    for brand, model, printers, ttype, color, page_yield in TONER_MASTER:
        title = f"{brand} {model} {ttype} {color} Toner"
        docs.append({
            "id": str(uuid.uuid4()),
            "brand": brand,
            "model_number": model,
            "normalized": normalize_model(model),
            "search_norm": normalize_model(f"{brand} {model} {color} {ttype}"),
            "title": title,
            "printer_compatibility": printers,
            "toner_type": ttype,
            "color": color,
            "page_yield": page_yield,
        })
    if docs:
        await db.toner_master.insert_many(docs)
    logger.info("Seeded %d TonerMaster entries", len(docs))


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tonerscart.in").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email, "name": "Platform Admin", "role": "admin",
            "company": "TonersCart", "city": "Delhi", "phone": None,
            "password_hash": hash_password(admin_password),
            "supplier_status": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def seed_users_and_products():
    if await db.products.count_documents({}) > 0:
        return

    # 25 approved suppliers
    supplier_records = []
    for email, name, company, city, phone in SUPPLIERS_25:
        existing = await db.users.find_one({"email": email})
        if existing:
            supplier_records.append(existing)
            continue
        sid = str(uuid.uuid4())
        doc = {
            "id": sid, "email": email, "name": name, "role": "supplier",
            "company": company, "city": city, "phone": phone,
            "password_hash": hash_password("Supplier@123"),
            "supplier_status": "approved",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc.copy())
        supplier_records.append(doc)

    # Customers
    customer_records = []
    for email, name, company, city, phone in CUSTOMERS:
        existing = await db.users.find_one({"email": email})
        if existing:
            customer_records.append(existing)
            continue
        cid = str(uuid.uuid4())
        doc = {
            "id": cid, "email": email, "name": name, "role": "customer",
            "company": company, "city": city, "phone": phone,
            "password_hash": hash_password("Customer@123"),
            "supplier_status": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc.copy())
        customer_records.append(doc)

    # 1 pending supplier (for admin approval testing)
    if not await db.users.find_one({"email": "pending.supplier@tonerscart.in"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "pending.supplier@tonerscart.in",
            "name": "Suresh Kumar", "role": "supplier",
            "company": "Kumar Toner Traders", "city": "Hyderabad",
            "phone": "+91-9876543210",
            "password_hash": hash_password("Supplier@123"),
            "supplier_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Products: each TonerMaster entry → 2-5 supplier listings with varied price & stock
    rng = random.Random(2026)
    masters = await db.toner_master.find({}, {"_id": 0}).to_list(5000)

    base_price_band = {
        "Original": (1800, 9500),
        "Compatible": (700, 4200),
        "Refilled": (450, 2200),
    }

    product_docs = []
    for m in masters:
        lo, hi = base_price_band.get(m["toner_type"], (1500, 6500))
        base = rng.randint(lo, hi)
        n_sup = rng.randint(2, 5)
        for sup in rng.sample(supplier_records, k=min(n_sup, len(supplier_records))):
            price = base + rng.randint(-int(base * 0.12), int(base * 0.18))
            price = max(price, 200)
            product_docs.append({
                "id": str(uuid.uuid4()),
                "supplier_id": sup["id"],
                "supplier_name": sup["name"],
                "supplier_company": sup.get("company"),
                "master_id": m["id"],
                "model_number": m["model_number"],
                "model_normalized": m["normalized"],
                "search_norm": normalize_model(f'{m["brand"]} {m["model_number"]} {m["color"]}'),
                "brand": m["brand"],
                "title": f'{m["brand"]} {m["model_number"]} {m["toner_type"]} {m["color"]} Toner',
                "description": f'{m["toner_type"]} {m["brand"]} {m["model_number"]} cartridge. Page yield ~{m["page_yield"]} pages. Bulk pricing available.',
                "price": float(price),
                "stock": rng.randint(5, 180),
                "city": sup.get("city"),
                "color": m["color"],
                "toner_type": m["toner_type"],
                "compatible_printers": m["printer_compatibility"],
                "page_yield": m["page_yield"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if product_docs:
        await db.products.insert_many(product_docs)
    logger.info("Seeded %d product listings across %d suppliers", len(product_docs), len(supplier_records))

    # Demo orders
    if customer_records and product_docs:
        for _ in range(8):
            cust = rng.choice(customer_records)
            prod = rng.choice(product_docs)
            qty = rng.randint(2, 12)
            status = rng.choice(["requested", "accepted", "shipped", "completed"])
            tracking = f"TC{rng.randint(100000, 999999)}IN" if status in ("shipped", "completed") else None
            now = datetime.now(timezone.utc).isoformat()
            await db.orders.insert_one({
                "id": str(uuid.uuid4()),
                "customer_id": cust["id"], "customer_name": cust["name"], "customer_email": cust["email"],
                "supplier_id": prod["supplier_id"], "supplier_name": prod["supplier_name"], "supplier_company": prod["supplier_company"],
                "product_id": prod["id"], "product_title": prod["title"],
                "model_number": prod["model_number"], "brand": prod["brand"],
                "unit_price": prod["price"], "quantity": qty,
                "total": round(prod["price"] * qty, 2),
                "notes": "Demo seed order",
                "delivery_address": f'{cust["company"]}, {cust["city"]}',
                "contact_phone": cust["phone"],
                "status": status, "tracking_number": tracking,
                "created_at": now, "updated_at": now,
            })


async def setup_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.products.create_index("model_normalized")
    await db.products.create_index("brand")
    await db.products.create_index("city")
    await db.products.create_index("supplier_id")
    await db.orders.create_index("customer_id")
    await db.orders.create_index("supplier_id")
    await db.toner_master.create_index([("normalized", 1)])
    await db.toner_master.create_index("brand")


@app.on_event("startup")
async def on_startup():
    try:
        await setup_indexes()
        await seed_toner_master()
        await seed_admin()
        await seed_users_and_products()
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
