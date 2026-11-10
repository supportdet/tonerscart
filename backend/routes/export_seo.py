"""Excel product/price export + SEO prerender routes.

Two concerns in one small module:

1) `GET /api/export/products.xlsx`
   Streams a single-sheet XLSX of the marketplace catalog. Admin sees every
   row; approved suppliers see only their own listings.

2) `GET /seo/{kind}/{id}` (and `/api/seo/{kind}/{id}`)
   Returns a fully server-rendered HTML page for a single product (toner,
   printer, consumable, paper, scanner) with full title / meta / canonical /
   OpenGraph tags and JSON-LD `Product` structured data. The SPA frontend
   routes `/toner/:id` etc. on the browser; this endpoint gives AI/search
   crawlers (ClaudeBot, GPTBot, Googlebot, etc.) a readable snapshot without
   any JavaScript execution. Vercel middleware proxies bot requests on the
   SPA product URLs to this endpoint.
"""
# ruff: noqa: F403, F405
from __future__ import annotations

import html
import io
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from server import require_user, sb_admin  # noqa: F401

logger = logging.getLogger("tonerscart")

router = APIRouter()
api_router = APIRouter(prefix="/api")

SITE = "https://www.tonerscart.com"


# =============================================================================
# 1) Excel export
# =============================================================================

_HEADER_FILL = PatternFill("solid", fgColor="0A0A0B")
_HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
_HEADER_ALIGN = Alignment(horizontal="left", vertical="center")

COLUMNS = [
    "Category", "Brand", "Model", "Subtype / Color",
    "Price (INR)", "GST %", "Price incl. GST (INR)",
    "Stock", "City", "Supplier", "Listing ID", "Created",
]


def _supplier_name_map() -> Dict[str, str]:
    try:
        rows = sb_admin.table("suppliers").select("id,business_name").limit(5000).execute().data or []
        return {r["id"]: (r.get("business_name") or "") for r in rows if r.get("id")}
    except Exception as e:
        logger.debug("supplier name map failed: %s", e)
        return {}


def _money(n: Any) -> Optional[float]:
    try:
        return round(float(n or 0), 2)
    except Exception:
        return None


def _incl_gst(price: Any, gst_rate: Any, default_gst: float = 18.0) -> Optional[float]:
    p = _money(price)
    if p is None:
        return None
    try:
        rate = float(gst_rate) if gst_rate is not None else default_gst
    except Exception:
        rate = default_gst
    return round(p * (1 + rate / 100.0), 2)


def _fmt_dt(d: Any) -> str:
    if not d:
        return ""
    try:
        return datetime.fromisoformat(str(d).replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except Exception:
        return str(d)[:10]


def _collect_rows(supplier_id: Optional[str]) -> List[List[Any]]:
    """Pull every listing table once and flatten into Excel rows."""
    out: List[List[Any]] = []
    name_map = _supplier_name_map()

    def _s(sid: Any) -> str:
        return name_map.get(sid, "") if sid else ""

    # Toners (`listings`) — GST not stored; default to 18%.
    try:
        q = sb_admin.table("listings").select(
            "id,supplier_id,brand,model_number,color,toner_type,price,stock,city,created_at"
        )
        if supplier_id:
            q = q.eq("supplier_id", supplier_id)
        for r in (q.limit(10000).execute().data or []):
            price = _money(r.get("price"))
            out.append([
                "Toner",
                r.get("brand") or "",
                r.get("model_number") or "",
                f"{r.get('toner_type') or ''} / {r.get('color') or ''}".strip(" /"),
                price,
                18,
                _incl_gst(price, 18),
                r.get("stock") or 0,
                r.get("city") or "",
                _s(r.get("supplier_id")),
                r.get("id") or "",
                _fmt_dt(r.get("created_at")),
            ])
    except Exception as e:
        logger.warning("export: listings feed failed: %s", e)

    # Printers — GST not stored; default 18.
    try:
        q = sb_admin.table("printer_listings").select(
            "id,supplier_id,brand,model_number,category,color,price,stock,created_at"
        )
        if supplier_id:
            q = q.eq("supplier_id", supplier_id)
        for r in (q.limit(10000).execute().data or []):
            price = _money(r.get("price"))
            out.append([
                "Printer",
                r.get("brand") or "",
                r.get("model_number") or "",
                f"{r.get('category') or ''} / {r.get('color') or ''}".strip(" /"),
                price,
                18,
                _incl_gst(price, 18),
                r.get("stock") or 0,
                "",
                _s(r.get("supplier_id")),
                r.get("id") or "",
                _fmt_dt(r.get("created_at")),
            ])
    except Exception as e:
        logger.warning("export: printer_listings feed failed: %s", e)

    # Consumables — has gst_rate.
    try:
        q = sb_admin.table("consumable_listings").select(
            "id,supplier_id,brand,model_number,subcategory,price,gst_rate,stock,city,created_at"
        )
        if supplier_id:
            q = q.eq("supplier_id", supplier_id)
        for r in (q.limit(10000).execute().data or []):
            price = _money(r.get("price"))
            gst = r.get("gst_rate") if r.get("gst_rate") is not None else 18
            out.append([
                "Consumable",
                r.get("brand") or "",
                r.get("model_number") or "",
                r.get("subcategory") or "",
                price,
                gst,
                _incl_gst(price, gst),
                r.get("stock") or 0,
                r.get("city") or "",
                _s(r.get("supplier_id")),
                r.get("id") or "",
                _fmt_dt(r.get("created_at")),
            ])
    except Exception as e:
        logger.warning("export: consumable_listings feed failed: %s", e)

    # Papers — price per ream; no GST column.
    try:
        q = sb_admin.table("paper_listings").select(
            "id,supplier_id,brand,size,gsm,price_per_ream,stock,city,created_at"
        )
        if supplier_id:
            q = q.eq("supplier_id", supplier_id)
        for r in (q.limit(10000).execute().data or []):
            price = _money(r.get("price_per_ream"))
            out.append([
                "Paper",
                r.get("brand") or "",
                f"{r.get('size') or ''} {r.get('gsm') or ''}GSM".strip(),
                "Ream",
                price,
                12,
                _incl_gst(price, 12),
                r.get("stock") or 0,
                r.get("city") or "",
                _s(r.get("supplier_id")),
                r.get("id") or "",
                _fmt_dt(r.get("created_at")),
            ])
    except Exception as e:
        logger.warning("export: paper_listings feed failed: %s", e)

    # Scanners — has gst_rate.
    try:
        q = sb_admin.table("scanner_listings").select(
            "id,supplier_id,brand,model_number,scanner_type,price,gst_rate,stock,city,created_at"
        )
        if supplier_id:
            q = q.eq("supplier_id", supplier_id)
        for r in (q.limit(10000).execute().data or []):
            price = _money(r.get("price"))
            gst = r.get("gst_rate") if r.get("gst_rate") is not None else 18
            out.append([
                "Scanner",
                r.get("brand") or "",
                r.get("model_number") or "",
                r.get("scanner_type") or "",
                price,
                gst,
                _incl_gst(price, gst),
                r.get("stock") or 0,
                r.get("city") or "",
                _s(r.get("supplier_id")),
                r.get("id") or "",
                _fmt_dt(r.get("created_at")),
            ])
    except Exception as e:
        logger.warning("export: scanner_listings feed failed: %s", e)

    return out


def _build_workbook(rows: List[List[Any]], title: str) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"

    # Header
    ws.append(COLUMNS)
    for col_idx in range(1, len(COLUMNS) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = _HEADER_ALIGN
    ws.freeze_panes = "A2"

    for r in rows:
        ws.append(r)

    # Column widths
    widths = [12, 16, 24, 22, 14, 8, 18, 8, 14, 28, 38, 12]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Metadata sheet
    meta = wb.create_sheet("About")
    meta.append(["TonersCart product & price export"])
    meta.append(["Generated at (UTC)", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")])
    meta.append(["Scope", title])
    meta.append(["Row count", len(rows)])
    meta.append([])
    meta.append(["Note: Price incl. GST is computed as Price × (1 + GST%/100)."])
    meta.column_dimensions["A"].width = 28
    meta.column_dimensions["B"].width = 40

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


@api_router.get("/export/products.xlsx")
def export_products(user: dict = Depends(require_user)):
    """Admin: full catalog. Supplier: only their listings. Everyone else: 403."""
    role = (user.get("role") or "").lower()
    supplier_id: Optional[str] = None
    scope_label = "All products (admin)"

    if role == "admin":
        supplier_id = None
    elif role == "supplier":
        s = sb_admin.table("suppliers").select("id,business_name").eq(
            "user_id", user["id"]
        ).maybe_single().execute()
        if not s or not s.data:
            raise HTTPException(403, "Supplier profile not found")
        supplier_id = s.data["id"]
        scope_label = f"Supplier: {s.data.get('business_name') or supplier_id}"
    else:
        raise HTTPException(403, "Only admin or approved suppliers can export")

    rows = _collect_rows(supplier_id)
    content = _build_workbook(rows, scope_label)

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M")
    fname = f"tonerscart-products-{stamp}.xlsx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# =============================================================================
# 2) SEO prerender for AI / search crawlers
# =============================================================================

_KIND_CONFIG = {
    # kind -> (table, title fields, price field, gst field, type label)
    "toner": {
        "table": "listings",
        "price": "price",
        "gst": None,
        "cat_label": "Toner Cartridge",
    },
    "consumable": {
        "table": "consumable_listings",
        "price": "price",
        "gst": "gst_rate",
        "cat_label": "Printer Consumable",
    },
    "printer": {
        "table": "printer_listings",
        "price": "price",
        "gst": None,
        "cat_label": "Printer",
    },
    "paper": {
        "table": "paper_listings",
        "price": "price_per_ream",
        "gst": None,
        "cat_label": "Printing Paper",
    },
    "scanner": {
        "table": "scanner_listings",
        "price": "price",
        "gst": "gst_rate",
        "cat_label": "Scanner",
    },
}


def _fetch_product(kind: str, pid: str) -> Optional[Dict[str, Any]]:
    cfg = _KIND_CONFIG.get(kind)
    if not cfg:
        return None
    try:
        row = sb_admin.table(cfg["table"]).select("*").eq("id", pid).maybe_single().execute()
        return row.data if row and row.data else None
    except Exception as e:
        logger.debug("seo fetch %s/%s failed: %s", kind, pid, e)
        return None


def _supplier_info(sid: Optional[str]) -> Dict[str, Any]:
    if not sid:
        return {}
    try:
        r = sb_admin.table("suppliers").select(
            "id,business_name,city"
        ).eq("id", sid).maybe_single().execute()
        return r.data or {}
    except Exception:
        return {}


def _render_product_html(kind: str, product: Dict[str, Any]) -> str:
    cfg = _KIND_CONFIG[kind]
    brand = (product.get("brand") or "").strip()
    model = (product.get("model_number") or product.get("size") or "").strip()
    price = product.get(cfg["price"])
    gst_rate = product.get(cfg["gst"]) if cfg["gst"] else 18
    try:
        price_num = float(price or 0)
    except Exception:
        price_num = 0.0
    try:
        gst_num = float(gst_rate if gst_rate is not None else 18)
    except Exception:
        gst_num = 18.0
    price_incl = round(price_num * (1 + gst_num / 100.0), 2)
    stock = int(product.get("stock") or 0)
    supplier = _supplier_info(product.get("supplier_id"))
    supplier_name = supplier.get("business_name") or ""
    city = product.get("city") or supplier.get("city") or ""
    description = (product.get("description") or "").strip()
    image = (product.get("image_url") or "").strip()
    pid = product.get("id") or ""
    cat = cfg["cat_label"]

    title_bits = [b for b in [brand, model, cat] if b]
    title = " ".join(title_bits) + " | TonersCart"

    meta_desc_bits = [
        f"{brand} {model} {cat}".strip(),
        f"Price ₹{price_incl:,.0f} incl. GST" if price_num else None,
        f"Sold by {supplier_name}" if supplier_name else None,
        f"Delivery in {city}" if city else None,
    ]
    meta_desc = ". ".join([b for b in meta_desc_bits if b])[:300]

    url = f"{SITE}/{kind}/{pid}"

    # JSON-LD Product
    ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": f"{brand} {model} {cat}".strip(),
        "brand": {"@type": "Brand", "name": brand} if brand else None,
        "sku": pid,
        "mpn": model,
        "description": description or meta_desc,
        "image": image or f"{SITE}/toner-placeholder.png",
        "url": url,
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "INR",
            "price": f"{price_incl:.2f}",
            "availability": (
                "https://schema.org/InStock" if stock > 0
                else "https://schema.org/OutOfStock"
            ),
            "seller": {"@type": "Organization", "name": supplier_name or "TonersCart"},
        },
    }
    ld = {k: v for k, v in ld.items() if v is not None}
    ld_json = json.dumps(ld, ensure_ascii=False)

    def esc(x: Any) -> str:
        return html.escape(str(x or ""), quote=True)

    # Visible body — crawler-readable structured text.
    body_rows = []
    specs = [
        ("Brand", brand),
        ("Model", model),
        ("Category", cat),
        ("Color", product.get("color")),
        ("Type", product.get("toner_type") or product.get("condition") or product.get("subcategory")),
        ("GSM", product.get("gsm")),
        ("Size", product.get("size")),
        ("Scanner type", product.get("scanner_type")),
        ("Scan resolution", product.get("scan_resolution")),
        ("Page yield", product.get("page_yield")),
        ("Warranty", product.get("warranty")),
        ("City", city),
        ("Supplier", supplier_name),
    ]
    for label, value in specs:
        if value in (None, "", 0):
            continue
        body_rows.append(f"<tr><th scope='row'>{esc(label)}</th><td>{esc(value)}</td></tr>")

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(meta_desc)}" />
<link rel="canonical" href="{esc(url)}" />
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
<meta property="og:type" content="product" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(meta_desc)}" />
<meta property="og:url" content="{esc(url)}" />
<meta property="og:image" content="{esc(image or f'{SITE}/toner-placeholder.png')}" />
<meta property="product:price:amount" content="{price_incl:.2f}" />
<meta property="product:price:currency" content="INR" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{ld_json}</script>
<style>
body{{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:860px;margin:24px auto;padding:0 20px;color:#1d1d1f;line-height:1.5}}
h1{{font-size:28px;margin:0 0 8px}}
.breadcrumb{{color:#6e6e73;font-size:14px;margin-bottom:12px}}
.price{{font-size:22px;font-weight:600;color:#0a0a0b;margin:12px 0}}
.price small{{color:#6e6e73;font-weight:400;font-size:14px}}
table{{width:100%;border-collapse:collapse;margin-top:20px}}
th,td{{padding:8px 10px;border-bottom:1px solid #e5e5ea;text-align:left;font-size:14px}}
th{{width:200px;color:#6e6e73;font-weight:500}}
img.hero{{max-width:360px;border-radius:12px;border:1px solid #e5e5ea}}
.cta{{display:inline-block;margin-top:16px;padding:10px 20px;background:#0a0a0b;color:#fff;border-radius:999px;text-decoration:none;font-weight:600}}
</style>
</head>
<body>
<div class="breadcrumb"><a href="{SITE}">TonersCart</a> › {esc(cat)}</div>
<h1>{esc(brand)} {esc(model)}</h1>
<p>{esc(cat)}{(' — ' + esc(product.get('subcategory') or product.get('category') or '')) if (product.get('subcategory') or product.get('category')) else ''}</p>
{f'<img class="hero" src="{esc(image)}" alt="{esc(brand)} {esc(model)}" />' if image else ''}
<div class="price">₹{price_incl:,.0f} <small>incl. {gst_num:.0f}% GST</small></div>
<p><strong>Availability:</strong> {'In stock' if stock > 0 else 'Out of stock'}</p>
{f'<p>{esc(description)}</p>' if description else ''}
<table>
{''.join(body_rows)}
</table>
<p><a class="cta" href="{esc(url)}">View on TonersCart</a></p>
<hr/>
<p><small>This is a crawler-readable snapshot of {esc(brand)} {esc(model)} on TonersCart. Visit
<a href="{esc(url)}">{esc(url)}</a> for live pricing, supplier details and purchase.</small></p>
</body>
</html>
"""


def _render_404(kind: str, pid: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"/>
<title>Product not found | TonersCart</title>
<meta name="robots" content="noindex" />
</head><body><h1>Product not found</h1>
<p>The {html.escape(kind)} with id {html.escape(pid)} could not be located.</p>
<p><a href="{SITE}">Return to TonersCart</a></p></body></html>"""


def _seo_response(kind: str, pid: str) -> HTMLResponse:
    if kind not in _KIND_CONFIG:
        raise HTTPException(404, "Unknown product kind")
    product = _fetch_product(kind, pid)
    if not product:
        return HTMLResponse(_render_404(kind, pid), status_code=404)
    html_body = _render_product_html(kind, product)
    # Cache for 10 min at edge — product data changes rarely.
    return HTMLResponse(
        html_body,
        headers={"Cache-Control": "public, max-age=600, s-maxage=600"},
    )


# Public SEO URL (no /api prefix) — accessible to any crawler and simple to
# proxy from Vercel middleware.
@router.get("/seo/{kind}/{pid}", include_in_schema=False)
def seo_product(kind: str, pid: str):
    return _seo_response(kind, pid)


# `/api/`-prefixed alias so the ingress rule in the preview environment (which
# only forwards `/api/*` to the backend) can reach it too.
@api_router.get("/seo/{kind}/{pid}")
def seo_product_api(kind: str, pid: str):
    return _seo_response(kind, pid)
