"""One-shot seed of realistic dealer listings under DET (Bangalore).

Wave 53 — six printer listings + six ink-cartridge listings using current
Indian market prices (incl. GST). Idempotent: re-running will SKIP any row
whose (supplier_id, brand, model_number) already exists. Cartridge weights,
page yields, warranty + compat printers are real product specs.

Run from /app/backend with:
    python3 seed_det_listings_wave53.py
"""
from __future__ import annotations

import logging
import re
from supabase_client import sb_admin

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed-det-w53")

DET_SUPPLIER_ID = "fe966b61-fe70-496b-b092-695c2c8fc880"
DET_CITY = "Bangalore"
GST = 18  # both printers and inks are 18%


def excl(incl: float, gst_rate: int = GST) -> float:
    """Strip GST → base price (DB always stores base, never inclusive)."""
    return round(incl / (1 + gst_rate / 100.0), 2)


# ---------------------------------------------------------------------------
# PRINTERS
# ---------------------------------------------------------------------------
PRINTERS = [
    {
        "brand": "HP", "model_number": "LaserJet Pro M404dn",
        "incl_price": 27490,
        "description": (
            "HP LaserJet Pro M404dn is a fast, secure, single-function monochrome "
            "laser printer built for small office workgroups. 38 ppm, automatic "
            "two-sided printing, Gigabit Ethernet, JetIntelligence toner technology "
            "and HP Auto-On/Auto-Off for energy savings. 1200 x 1200 dpi resolution."
        ),
        "color": "Mono",
        "functions": ["Print"],
        "usage_types": ["Office"], "usage_type": "Office",
        "category": "laser",
        "print_speed_ppm": 38,
        "duty_cycle": 80000,
        "monthly_volume_min": 750, "monthly_volume_max": 4000, "monthly_volume_recommended": 1800,
        "connectivity": ["USB", "Ethernet"],
        "max_resolution": "1200x1200",
        "paper_sizes": ["A4", "A5", "Letter", "Legal"],
        "mobile_printing": [],
        "special_features": ["Auto Duplex", "Gigabit Ethernet"],
        "compatible_models": "CF258A · CF258X · HP 58A · HP 58X",
    },
    {
        "brand": "Canon", "model_number": "imageCLASS LBP6030",
        "incl_price": 11199,
        "description": (
            "Canon imageCLASS LBP6030 is a compact, affordable monochrome laser "
            "printer ideal for home and small offices. 18 ppm, single-cartridge "
            "system (Cartridge 925), USB connectivity, quiet mode for libraries "
            "and bedrooms. Power consumption as low as 0.8 W in sleep mode."
        ),
        "color": "Mono",
        "functions": ["Print"],
        "usage_types": ["Home", "Small Office"], "usage_type": "Home",
        "category": "laser",
        "print_speed_ppm": 18,
        "duty_cycle": 5000,
        "monthly_volume_min": 100, "monthly_volume_max": 500, "monthly_volume_recommended": 250,
        "connectivity": ["USB"],
        "max_resolution": "2400x600",
        "paper_sizes": ["A4", "A5", "B5", "Letter", "Legal"],
        "mobile_printing": [],
        "special_features": ["Quiet Mode", "Low Power"],
        "compatible_models": "Canon 925 · CRG-925",
    },
    {
        "brand": "Epson", "model_number": "EcoTank L3250",
        "incl_price": 17499,
        "description": (
            "Epson EcoTank L3250 is a 3-in-1 (Print/Scan/Copy) integrated ink-tank "
            "colour printer with Wi-Fi Direct, mobile printing via Epson Smart "
            "Panel and ultra-low running cost — up to 7,500 colour / 4,500 black "
            "pages per ink-bottle set. Includes 2 years warranty + 1 extra year "
            "on registration."
        ),
        "color": "Color",
        "functions": ["Print", "Scan", "Copy"],
        "usage_types": ["Home", "Small Office"], "usage_type": "Home",
        "category": "inktank",
        "print_speed_ppm": 10,
        "duty_cycle": 3000,
        "monthly_volume_min": 50, "monthly_volume_max": 600, "monthly_volume_recommended": 300,
        "connectivity": ["USB", "Wi-Fi", "Wi-Fi Direct"],
        "max_resolution": "5760x1440",
        "paper_sizes": ["A4", "A5", "A6", "B5", "Letter", "Legal"],
        "mobile_printing": ["Epson Smart Panel", "Mopria"],
        "special_features": ["Borderless Photo", "Ink Tank", "Wi-Fi Direct"],
        "compatible_models": "Epson 003 · T00V100 · T00V200 · T00V300 · T00V400",
    },
    {
        "brand": "Brother", "model_number": "HL-L2321D",
        "incl_price": 13499,
        "description": (
            "Brother HL-L2321D is a compact, reliable monochrome laser printer "
            "with automatic two-sided printing for SOHO and small businesses. "
            "30 ppm, 250-sheet paper tray, quiet operation (49 dB), Hi-Speed "
            "USB 2.0. Toner: TN-2365 (standard) / TN-2380 (high-yield). "
            "Compact footprint (356 x 360 x 183 mm)."
        ),
        "color": "Mono",
        "functions": ["Print"],
        "usage_types": ["Home", "Small Office"], "usage_type": "Small Office",
        "category": "laser",
        "print_speed_ppm": 30,
        "duty_cycle": 10000,
        "monthly_volume_min": 250, "monthly_volume_max": 2000, "monthly_volume_recommended": 800,
        "connectivity": ["USB"],
        "max_resolution": "2400x600",
        "paper_sizes": ["A4", "A5", "A6", "Letter", "Legal"],
        "mobile_printing": [],
        "special_features": ["Auto Duplex", "Quiet Mode"],
        "compatible_models": "TN-2365 · TN-2380 · DR-2355",
    },
    {
        "brand": "Xerox", "model_number": "B205",
        "incl_price": 19899,
        "description": (
            "Xerox B205 Multifunction Printer combines print, copy and scan in "
            "one compact desktop unit, perfect for small workgroups. 30 ppm, "
            "wireless connectivity, automatic document feeder, dual-purpose "
            "scanner. Uses Xerox 106R04347 toner cartridge (3,000-page yield)."
        ),
        "color": "Mono",
        "functions": ["Print", "Scan", "Copy"],
        "usage_types": ["Small Office"], "usage_type": "Small Office",
        "category": "laser",
        "print_speed_ppm": 30,
        "duty_cycle": 30000,
        "monthly_volume_min": 500, "monthly_volume_max": 3000, "monthly_volume_recommended": 1200,
        "connectivity": ["USB", "Wi-Fi", "Ethernet"],
        "max_resolution": "1200x1200",
        "paper_sizes": ["A4", "A5", "Letter", "Legal"],
        "mobile_printing": ["Mopria", "AirPrint"],
        "special_features": ["ADF", "Wi-Fi Direct"],
        "compatible_models": "Xerox 106R04347 · 106R04348",
    },
    {
        "brand": "Canon", "model_number": "imageCLASS MF3010",
        "incl_price": 15290,
        "description": (
            "Canon imageCLASS MF3010 is a popular 3-in-1 (Print/Scan/Copy) "
            "monochrome laser printer for home and small offices. 18 ppm first-"
            "page-out in 7.8 sec, single-cartridge design (Cartridge 925), USB "
            "connectivity, full-colour scan, 9-second warm-up from sleep."
        ),
        "color": "Mono",
        "functions": ["Print", "Scan", "Copy"],
        "usage_types": ["Home", "Small Office"], "usage_type": "Home",
        "category": "laser",
        "print_speed_ppm": 18,
        "duty_cycle": 8000,
        "monthly_volume_min": 100, "monthly_volume_max": 800, "monthly_volume_recommended": 400,
        "connectivity": ["USB"],
        "max_resolution": "2400x600",
        "paper_sizes": ["A4", "A5", "B5", "Letter", "Legal"],
        "mobile_printing": [],
        "special_features": ["Compact", "Quiet Mode"],
        "compatible_models": "Canon 925 · CRG-925",
    },
]


def _normalize_usage(u: str) -> str:
    """DB constraint: usage_type IN ('home','corporate','commercial','print_shop')."""
    u = (u or "").lower().strip()
    mapping = {
        "office": "corporate", "small office": "corporate", "soho": "corporate",
        "home": "home", "personal": "home",
        "enterprise": "corporate", "business": "corporate",
        "shop": "print_shop", "print shop": "print_shop", "production": "print_shop",
        "commercial": "commercial", "retail": "commercial",
    }
    return mapping.get(u, "corporate")


def _normalize_color(c: str) -> str:
    """DB constraint: color IN ('color','bw','both')."""
    c = (c or "").lower().strip()
    if c in {"mono", "monochrome", "bw", "b&w", "black", "black and white"}:
        return "bw"
    if c in {"both", "color and bw", "mixed"}:
        return "both"
    return "color"


def _normalize_category(c: str) -> str:
    """DB constraint: category IN ('inkjet','laser','tank','thermal','production','digital_press','label_barcode','ink','other')."""
    c = (c or "").lower().strip()
    mapping = {
        "inktank": "tank", "ink-tank": "tank", "ecotank": "tank",
        "single-function": "laser", "multifunction": "laser",  # fall back to dominant tech
    }
    return mapping.get(c, c if c in {"inkjet", "laser", "tank", "thermal", "production", "digital_press", "label_barcode", "ink", "other"} else "laser")


def seed_printers():
    inserted = 0
    skipped = 0
    for p in PRINTERS:
        exists = (
            sb_admin.table("printer_listings")
            .select("id")
            .eq("supplier_id", DET_SUPPLIER_ID)
            .eq("brand", p["brand"])
            .eq("model_number", p["model_number"])
            .execute().data
        )
        if exists:
            log.info("[skip] %s %s already listed", p["brand"], p["model_number"])
            skipped += 1
            continue
        base = excl(p["incl_price"])
        row = {
            "supplier_id": DET_SUPPLIER_ID,
            "brand": p["brand"],
            "model_number": p["model_number"],
            "description": p["description"],
            "color": _normalize_color(p["color"]),
            "functions": p["functions"],
            "usage_type": _normalize_usage(p["usage_type"]),
            "usage_types": p["usage_types"],
            "category": _normalize_category(p["category"]),
            "condition": "new",
            "print_speed_ppm": p["print_speed_ppm"],
            "duty_cycle": p["duty_cycle"],
            "monthly_volume_min": p["monthly_volume_min"],
            "monthly_volume_max": p["monthly_volume_max"],
            "monthly_volume_recommended": p["monthly_volume_recommended"],
            "connectivity": p["connectivity"],
            "max_resolution": p["max_resolution"],
            "paper_sizes": p["paper_sizes"],
            "mobile_printing": p["mobile_printing"],
            "special_features": p["special_features"],
            "compatible_models": p["compatible_models"],
            "price": base,
            "gst_rate": GST,
            "stock": 5,
            "intercity_delivery_charge": 0,
            "printer_warranty": "1 year",
        }
        try:
            sb_admin.table("printer_listings").insert(row).execute()
            log.info("[ok]  %s %s — ₹%s incl GST (base ₹%s)", p["brand"], p["model_number"], p["incl_price"], base)
            inserted += 1
        except Exception as e:
            log.error("[err] %s %s: %s", p["brand"], p["model_number"], e)
    log.info("Printers — inserted=%d skipped=%d", inserted, skipped)


# ---------------------------------------------------------------------------
# INKS & CONSUMABLES
# ---------------------------------------------------------------------------
INKS = [
    {
        "brand": "Epson", "model_number": "003 Black",
        "incl_price": 499,
        "page_yield": 4500,
        "cartridge_weight": 65,
        "compatible_models": (
            "Epson L3110 · L3115 · L3116 · L3150 · L3152 · L3156 · L3210 · L3215 · "
            "L3216 · L3250 · L3252 · L3256 · L5190"
        ),
        "description": (
            "Genuine Epson 003 Black ink bottle (65 ml) — yields up to 4,500 "
            "black pages. Easy spill-free refill via integrated key-and-lock "
            "design. Engineered for Epson EcoTank L3110/L3150/L3210/L3250 series."
        ),
    },
    {
        "brand": "Epson", "model_number": "664 Black",
        "incl_price": 449,
        "page_yield": 7500,
        "cartridge_weight": 70,
        "compatible_models": (
            "Epson L100 · L110 · L200 · L210 · L220 · L300 · L350 · L355 · L360 · "
            "L365 · L380 · L385 · L405 · L455 · L550 · L555 · L565 · L1300 · L1455"
        ),
        "description": (
            "Genuine Epson 664 Black ink bottle (70 ml) — yields up to 7,500 "
            "black pages. Designed for L100-series EcoTank printers."
        ),
    },
    {
        "brand": "Epson", "model_number": "008 Black",
        "incl_price": 699,
        "page_yield": 7500,
        "cartridge_weight": 127,
        "compatible_models": (
            "Epson L6260 · L6270 · L6290 · L15150 · L15160"
        ),
        "description": (
            "Genuine Epson 008 Black ink bottle (127 ml) for the high-volume "
            "L6260/L6270/L6290/L15150 ink-tank printers — yields up to 7,500 "
            "black pages and uses Epson's DURABrite EcoTank pigment formula."
        ),
    },
    {
        "brand": "Canon", "model_number": "CL-811 Color",
        "incl_price": 1899,
        "page_yield": 244,
        "cartridge_weight": 80,
        "compatible_models": (
            "Canon PIXMA MP237 · MP245 · MP258 · MP276 · MP287 · MP486 · MP496 · "
            "MP497 · MX328 · MX338 · MX347 · MX357 · MX366 · MX416 · MX426 · "
            "iP2770 · iP2772"
        ),
        "description": (
            "Genuine Canon CL-811 Tri-Colour FINE ink cartridge — cyan + magenta "
            "+ yellow in a single cartridge. Yields ~244 colour pages at 5% "
            "coverage. ChromaLife100+ photo dyes for fade-resistant prints."
        ),
    },
    {
        "brand": "HP", "model_number": "GT53 Black",
        "incl_price": 599,
        "page_yield": 4000,
        "cartridge_weight": 90,
        "compatible_models": (
            "HP Smart Tank 500 · 515 · 530 · 615 · Smart Tank Plus 555 · 559 · 570 · "
            "571 · Ink Tank 310 · 315 · 319 · 410 · 415 · 419"
        ),
        "description": (
            "Original HP GT53 Black ink bottle (90 ml) — yields up to 4,000 "
            "black pages. Spill-free auto-stop bottle for HP Smart Tank and "
            "Ink Tank printers. ISO/IEC 24711 page-yield rated."
        ),
    },
    {
        "brand": "Brother", "model_number": "BTD60BK",
        "incl_price": 649,
        "page_yield": 6500,
        "cartridge_weight": 108,
        "compatible_models": (
            "Brother DCP-T310 · T420W · T425W · T520W · T525W · T720DW · T725DW · "
            "T820DW · T825DW · T920DW · T925DW · MFC-T810W · T910DW · T4500DW"
        ),
        "description": (
            "Genuine Brother BTD60BK Black ink bottle (108 ml) — yields up to "
            "6,500 black pages. Designed for Brother InkBenefit Plus T-series "
            "refillable ink-tank printers. Safe-fill bottle with auto-stop neck."
        ),
    },
]


def seed_inks():
    """Insert each ink with graceful column-drop on schema mismatch — mirrors
    the backend `create_consumable` pattern so the seed survives even when
    `cartridge_weight` / `page_yield` / `warranty` columns haven't been added
    yet (see `supabase_schema_consumable_spec_columns.sql`)."""
    inserted = 0
    skipped = 0
    deferred_cols = []  # remember which cols are missing across attempts
    for c in INKS:
        exists = (
            sb_admin.table("consumable_listings")
            .select("id")
            .eq("supplier_id", DET_SUPPLIER_ID)
            .eq("brand", c["brand"])
            .eq("model_number", c["model_number"])
            .execute().data
        )
        if exists:
            log.info("[skip] %s %s already listed", c["brand"], c["model_number"])
            skipped += 1
            continue
        base = excl(c["incl_price"])
        search_norm = re.sub(r"[^a-z0-9]", "", f"{c['brand']}{c['model_number']}".lower())
        row = {
            "supplier_id": DET_SUPPLIER_ID,
            "subcategory": "Ink Cartridges",
            "brand": c["brand"],
            "model_number": c["model_number"],
            "compatible_models": c["compatible_models"],
            "condition": "New",
            "price": base,
            "gst_rate": GST,
            "stock": 5,
            "description": c["description"],
            "city": DET_CITY,
            "intercity_delivery_charge": 0,
            "warranty": "6 months",
            "page_yield": c["page_yield"],
            "cartridge_weight": c["cartridge_weight"],
            "search_norm": search_norm,
        }
        for k in deferred_cols:
            row.pop(k, None)
        while True:
            try:
                sb_admin.table("consumable_listings").insert(row).execute()
                log.info(
                    "[ok]  %s %s — ₹%s incl GST (base ₹%s, yield %s)",
                    c["brand"], c["model_number"], c["incl_price"], base, c["page_yield"],
                )
                inserted += 1
                break
            except Exception as e:
                msg = str(e)
                dropped = False
                for k in ("cartridge_weight", "page_yield", "warranty", "search_norm"):
                    if k in msg and k in row:
                        log.warning("[col-drop] %s missing from schema — dropping for remaining rows too", k)
                        row.pop(k, None)
                        if k not in deferred_cols:
                            deferred_cols.append(k)
                        dropped = True
                        break
                if not dropped:
                    log.error("[err] %s %s: %s", c["brand"], c["model_number"], e)
                    break
    log.info("Inks    — inserted=%d skipped=%d (deferred cols: %s)", inserted, skipped, deferred_cols or "none")


if __name__ == "__main__":
    log.info("Seeding DET (supplier_id=%s) — printers + inks", DET_SUPPLIER_ID)
    seed_printers()
    seed_inks()
    log.info("Done.")
