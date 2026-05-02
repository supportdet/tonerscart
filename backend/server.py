from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day for B2B convenience

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="TonersCart API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("tonerscart")


# ----- Models -----
Role = Literal["customer", "supplier", "admin"]
SupplierStatus = Literal["pending", "approved", "rejected"]
OrderStatus = Literal["requested", "accepted", "shipped", "completed", "rejected"]


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: Role
    company: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    supplier_status: Optional[SupplierStatus] = None
    created_at: datetime


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
    model_number: str
    brand: str
    title: str
    description: Optional[str] = ""
    price: float
    stock: int
    city: str
    color: Optional[str] = "Black"
    compatible_printers: Optional[str] = ""


class ProductUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    city: Optional[str] = None
    color: Optional[str] = None
    compatible_printers: Optional[str] = None


class ProductOut(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    supplier_company: Optional[str] = None
    model_number: str
    brand: str
    title: str
    description: Optional[str] = ""
    price: float
    stock: int
    city: str
    color: Optional[str] = "Black"
    compatible_printers: Optional[str] = ""
    created_at: datetime


class OrderCreate(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    notes: Optional[str] = ""
    delivery_address: str
    contact_phone: str


class OrderStatusUpdate(BaseModel):
    status: Literal["accepted", "shipped", "completed", "rejected"]
    tracking_number: Optional[str] = None


class OrderOut(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    customer_email: str
    supplier_id: str
    supplier_name: str
    supplier_company: Optional[str] = None
    product_id: str
    product_title: str
    model_number: str
    brand: str
    unit_price: float
    quantity: int
    total: float
    notes: Optional[str] = ""
    delivery_address: str
    contact_phone: str
    status: OrderStatus
    tracking_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ----- Helpers -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def user_to_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "company": u.get("company"),
        "city": u.get("city"),
        "phone": u.get("phone"),
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
            # only restrict supplier-only endpoints; admin is allowed implicitly
            raise HTTPException(status_code=403, detail="Supplier account not approved yet")
        return user
    return dep


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )


# ----- Auth Endpoints -----
@api.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "company": payload.company,
        "city": payload.city,
        "phone": payload.phone,
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


# ----- Public Product Endpoints -----
@api.get("/products/search")
async def search_products(q: Optional[str] = None, brand: Optional[str] = None, city: Optional[str] = None, limit: int = 100):
    query: dict = {}
    if q:
        query["$or"] = [
            {"model_number": {"$regex": q, "$options": "i"}},
            {"title": {"$regex": q, "$options": "i"}},
            {"compatible_printers": {"$regex": q, "$options": "i"}},
        ]
    if brand and brand != "all":
        query["brand"] = brand
    if city and city != "all":
        query["city"] = city
    cursor = db.products.find(query, {"_id": 0}).limit(limit)
    items = await cursor.to_list(length=limit)
    for item in items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    return items


@api.get("/products/facets")
async def product_facets():
    brands = await db.products.distinct("brand")
    cities = await db.products.distinct("city")
    models = await db.products.distinct("model_number")
    return {"brands": sorted(brands), "cities": sorted(cities), "models": sorted(models)}


@api.get("/products/grouped")
async def grouped_products(q: Optional[str] = None, brand: Optional[str] = None, city: Optional[str] = None):
    items = await search_products(q=q, brand=brand, city=city, limit=500)
    groups: dict = {}
    for it in items:
        key = it["model_number"]
        groups.setdefault(key, {"model_number": key, "brand": it["brand"], "title": it["title"], "listings": []})
        groups[key]["listings"].append(it)
    # sort listings by price asc
    result = []
    for g in groups.values():
        g["listings"].sort(key=lambda x: x["price"])
        g["min_price"] = g["listings"][0]["price"] if g["listings"] else 0
        g["supplier_count"] = len(g["listings"])
        result.append(g)
    result.sort(key=lambda x: x["model_number"])
    return result


@api.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if isinstance(p.get("created_at"), str):
        p["created_at"] = datetime.fromisoformat(p["created_at"])
    return p


# ----- Supplier Product Management -----
@api.post("/supplier/products")
async def create_product(payload: ProductCreate, user: dict = Depends(require_role("supplier"))):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "supplier_id": user["id"],
        "supplier_name": user["name"],
        "supplier_company": user.get("company"),
        "model_number": payload.model_number.upper().strip(),
        "brand": payload.brand.strip(),
        "title": payload.title.strip(),
        "description": payload.description or "",
        "price": float(payload.price),
        "stock": int(payload.stock),
        "city": payload.city.strip(),
        "color": payload.color or "Black",
        "compatible_printers": payload.compatible_printers or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/supplier/products")
async def list_supplier_products(user: dict = Depends(require_role("supplier"))):
    items = await db.products.find({"supplier_id": user["id"]}, {"_id": 0}).to_list(500)
    return items


@api.put("/supplier/products/{product_id}")
async def update_product(product_id: str, payload: ProductUpdate, user: dict = Depends(require_role("supplier"))):
    p = await db.products.find_one({"id": product_id})
    if not p or p["supplier_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Product not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.products.update_one({"id": product_id}, {"$set": update})
    p2 = await db.products.find_one({"id": product_id}, {"_id": 0})
    return p2


@api.delete("/supplier/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role("supplier"))):
    p = await db.products.find_one({"id": product_id})
    if not p or p["supplier_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ----- Orders -----
@api.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(status_code=403, detail="Only customers can place order requests")
    p = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.quantity > p["stock"]:
        raise HTTPException(status_code=400, detail="Requested quantity exceeds stock")
    oid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": oid,
        "customer_id": user["id"],
        "customer_name": user["name"],
        "customer_email": user["email"],
        "supplier_id": p["supplier_id"],
        "supplier_name": p["supplier_name"],
        "supplier_company": p.get("supplier_company"),
        "product_id": p["id"],
        "product_title": p["title"],
        "model_number": p["model_number"],
        "brand": p["brand"],
        "unit_price": p["price"],
        "quantity": payload.quantity,
        "total": round(p["price"] * payload.quantity, 2),
        "notes": payload.notes or "",
        "delivery_address": payload.delivery_address,
        "contact_phone": payload.contact_phone,
        "status": "requested",
        "tracking_number": None,
        "created_at": now,
        "updated_at": now,
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
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in ("supplier", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "supplier" and order["supplier_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your order")
    update = {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.tracking_number:
        update["tracking_number"] = payload.tracking_number
    await db.orders.update_one({"id": order_id}, {"$set": update})
    o2 = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return o2


# ----- Admin -----
@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_role("admin"))):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.get("/admin/suppliers/pending")
async def admin_pending_suppliers(user: dict = Depends(require_role("admin"))):
    items = await db.users.find({"role": "supplier", "supplier_status": "pending"}, {"_id": 0, "password_hash": 0}).to_list(500)
    return items


@api.post("/admin/suppliers/{supplier_id}/approve")
async def admin_approve(supplier_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": supplier_id, "role": "supplier"}, {"$set": {"supplier_status": "approved"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"ok": True}


@api.post("/admin/suppliers/{supplier_id}/reject")
async def admin_reject(supplier_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"id": supplier_id, "role": "supplier"}, {"$set": {"supplier_status": "rejected"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user: dict = Depends(require_role("admin"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin")
    await db.users.delete_one({"id": user_id})
    if target.get("role") == "supplier":
        await db.products.delete_many({"supplier_id": user_id})
    return {"ok": True}


@api.get("/admin/products")
async def admin_products(user: dict = Depends(require_role("admin"))):
    items = await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@api.get("/admin/orders")
async def admin_orders(user: dict = Depends(require_role("admin"))):
    items = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_role("admin"))):
    return {
        "users": await db.users.count_documents({}),
        "customers": await db.users.count_documents({"role": "customer"}),
        "suppliers_total": await db.users.count_documents({"role": "supplier"}),
        "suppliers_pending": await db.users.count_documents({"role": "supplier", "supplier_status": "pending"}),
        "products": await db.products.count_documents({}),
        "orders": await db.orders.count_documents({}),
    }


@api.get("/")
async def root():
    return {"service": "TonersCart API", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Seed -----
SAMPLE_SUPPLIERS = [
    {"email": "delhi.toners@tonerscart.in", "name": "Rohit Sharma", "company": "Delhi Toner House", "city": "Delhi", "phone": "+91-9810000001"},
    {"email": "mumbai.print@tonerscart.in", "name": "Anil Mehta", "company": "Mumbai Print Supplies", "city": "Mumbai", "phone": "+91-9820000002"},
    {"email": "blr.cartridge@tonerscart.in", "name": "Priya Iyer", "company": "Bangalore Cartridge Co.", "city": "Bangalore", "phone": "+91-9840000003"},
    {"email": "chennai.ink@tonerscart.in", "name": "Karthik Rajan", "company": "Chennai Ink & Toner", "city": "Chennai", "phone": "+91-9840000004"},
    {"email": "pune.printers@tonerscart.in", "name": "Sneha Patil", "company": "Pune Printer Hub", "city": "Pune", "phone": "+91-9890000005"},
]

SAMPLE_CUSTOMERS = [
    {"email": "buyer@tonerscart.in", "name": "Amit Verma", "company": "Verma Office Solutions", "city": "Delhi", "phone": "+91-9811112222"},
    {"email": "buyer2@tonerscart.in", "name": "Neha Singh", "company": "Singh Enterprises", "city": "Mumbai", "phone": "+91-9822223333"},
]

SAMPLE_TONERS = [
    # (model, brand, title, color, printers)
    ("HP 88A", "HP", "HP 88A Black LaserJet Toner Cartridge", "Black", "HP LaserJet P1007, P1008, M1213nf, M1136"),
    ("HP 12A", "HP", "HP 12A Black Original Toner", "Black", "HP LaserJet 1010, 1012, 1015, 1018, 1020, 3015"),
    ("HP 78A", "HP", "HP 78A Black LaserJet Toner", "Black", "HP LaserJet P1566, P1606dn, M1536"),
    ("HP 05A", "HP", "HP 05A Black LaserJet Toner", "Black", "HP LaserJet P2035, P2055"),
    ("HP 26A", "HP", "HP 26A Black Original Toner", "Black", "HP LaserJet Pro M402, M426"),
    ("Canon 925", "Canon", "Canon 925 Black Toner Cartridge", "Black", "Canon LBP6018, LBP6030, MF3010"),
    ("Canon 337", "Canon", "Canon 337 Black Toner", "Black", "Canon imageCLASS MF211, MF212w, MF215, MF217w"),
    ("Brother TN-2365", "Brother", "Brother TN-2365 Black Toner", "Black", "Brother HL-L2321D, L2361DN, L2366DW, MFC-L2701D"),
    ("Brother TN-1020", "Brother", "Brother TN-1020 Black Toner", "Black", "Brother HL-1111, 1201, 1211W, DCP-1511, 1514"),
    ("Samsung MLT-D101S", "Samsung", "Samsung MLT-D101S Black Toner", "Black", "Samsung ML-2160, 2165, SCX-3400, 3405"),
    ("Samsung MLT-D111S", "Samsung", "Samsung MLT-D111S Black Toner", "Black", "Samsung Xpress M2020, M2070"),
    ("Ricoh SP 200", "Ricoh", "Ricoh SP 200 Toner Cartridge", "Black", "Ricoh SP 200, SP 200N, SP 200S, SP 202SN"),
]


async def seed_data():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.products.create_index("model_number")
    await db.products.create_index("brand")
    await db.products.create_index("city")
    await db.products.create_index("supplier_id")
    await db.orders.create_index("customer_id")
    await db.orders.create_index("supplier_id")

    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tonerscart.in").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Platform Admin",
            "role": "admin",
            "company": "TonersCart",
            "city": "Delhi",
            "phone": None,
            "password_hash": hash_password(admin_password),
            "supplier_status": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Suppliers (approved) + customers
    supplier_ids = {}
    for s in SAMPLE_SUPPLIERS:
        u = await db.users.find_one({"email": s["email"]})
        if not u:
            uid = str(uuid.uuid4())
            await db.users.insert_one({
                "id": uid,
                "email": s["email"],
                "name": s["name"],
                "role": "supplier",
                "company": s["company"],
                "city": s["city"],
                "phone": s["phone"],
                "password_hash": hash_password("Supplier@123"),
                "supplier_status": "approved",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            supplier_ids[s["email"]] = (uid, s)
        else:
            supplier_ids[s["email"]] = (u["id"], s)

    for c in SAMPLE_CUSTOMERS:
        if not await db.users.find_one({"email": c["email"]}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": c["email"],
                "name": c["name"],
                "role": "customer",
                "company": c["company"],
                "city": c["city"],
                "phone": c["phone"],
                "password_hash": hash_password("Customer@123"),
                "supplier_status": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # Pending demo supplier
    if not await db.users.find_one({"email": "pending.supplier@tonerscart.in"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "pending.supplier@tonerscart.in",
            "name": "Suresh Kumar",
            "role": "supplier",
            "company": "Kumar Toner Traders",
            "city": "Hyderabad",
            "phone": "+91-9876543210",
            "password_hash": hash_password("Supplier@123"),
            "supplier_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Products: each toner across 2-4 suppliers with varied price
    if await db.products.count_documents({}) == 0:
        import random
        random.seed(42)
        sup_list = list(supplier_ids.values())
        for model, brand, title, color, printers in SAMPLE_TONERS:
            base = random.randint(1200, 6500)
            chosen = random.sample(sup_list, k=random.randint(2, 4))
            for (sid, sinfo) in chosen:
                price = base + random.randint(-300, 500)
                await db.products.insert_one({
                    "id": str(uuid.uuid4()),
                    "supplier_id": sid,
                    "supplier_name": sinfo["name"],
                    "supplier_company": sinfo["company"],
                    "model_number": model,
                    "brand": brand,
                    "title": title,
                    "description": f"Genuine {brand} {model} cartridge. Reliable quality, ready stock for B2B bulk orders.",
                    "price": float(price),
                    "stock": random.randint(8, 120),
                    "city": sinfo["city"],
                    "color": color,
                    "compatible_printers": printers,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        logger.info("Seeded sample products")


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
