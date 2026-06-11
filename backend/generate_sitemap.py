#!/usr/bin/env python3
"""Generate a COMPLETE, standalone sitemap.xml into the frontend public folder.

The file is served directly by Vercel (frontend/public/sitemap.xml) with NO
dependency on the Railway backend — Google fetches it straight from the static
host. It contains:
  - All static marketing/category pages.
  - One /compatible/<slug> page per printer model in compatibility_db (546).
  - One /toner/<slug> page per toner/consumable model in compatibility_db (572).

Re-run whenever compatibility_db.py changes:
    cd /app/backend && python generate_sitemap.py
"""
import os
from datetime import datetime, timezone

import compatibility_db as cdb

BASE = "https://www.tonerscart.com"
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "sitemap.xml")

# Real, crawlable static routes (see frontend/src/App.js). "Toners" nav → /search.
STATIC_PAGES = [
    ("/", "1.0"),
    ("/search", "0.9"),
    ("/printers", "0.9"),
    ("/papers", "0.9"),
    ("/consumables", "0.9"),
    ("/scanners", "0.9"),
    ("/oem", "0.7"),
    ("/mps", "0.7"),
    ("/sell", "0.7"),
    ("/get-featured", "0.6"),
    ("/about", "0.5"),
    ("/contact", "0.6"),
    ("/terms", "0.4"),
    ("/privacy", "0.4"),
]


def build_xml() -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    def add(path: str, prio: str) -> None:
        lines.append(
            f"  <url><loc>{BASE}{path}</loc>"
            f"<lastmod>{today}</lastmod><priority>{prio}</priority></url>"
        )

    for path, prio in STATIC_PAGES:
        add(path, prio)

    # Programmatic SEO — printer compatibility pages
    seen = set()
    for p in cdb.all_printers():
        slug = p.get("slug")
        if slug and slug not in seen:
            seen.add(slug)
            add(f"/compatible/{slug}", "0.6")

    # Programmatic SEO — toner model pages
    seen_t = set()
    for t in cdb.all_toners():
        slug = t.get("slug")
        if slug and slug not in seen_t:
            seen_t.add(slug)
            add(f"/toner/{slug}", "0.6")

    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main() -> None:
    xml = build_xml()
    out_path = os.path.abspath(OUT)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml)
    url_count = xml.count("<url>")
    print(f"Wrote {url_count} URLs to {out_path}")


if __name__ == "__main__":
    main()
