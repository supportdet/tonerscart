import os
import json
import logging
import asyncio
from pathlib import Path
import httpx
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("tonerscart.aicheck")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

PROMPT = (
    "You are reviewing a document or photo a supplier uploaded for KYC verification on a "
    "B2B printer-toner marketplace. Look at the image and return STRICT JSON ONLY (no markdown), "
    "of shape: {\"clear\": true/false, \"kind\": \"<short label>\", \"notes\": \"<one short sentence>\"}. "
    "`clear` should be false if the image is blank, blurry, cropped, illegible, or clearly not a "
    "real document. `kind` should be a 1-3 word guess of what's shown (e.g., \"GST certificate\", "
    "\"PAN card\", \"Brand authorization\", \"Shop photo\", \"Bank passbook\"). Keep `notes` <= 80 chars."
)

def _safe_parse(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        return json.loads(text)
    except Exception:
        return {"clear": None, "kind": "unknown", "notes": text[:120]}

async def check_document_url(url: str, label: str = "document") -> dict:
    if not GOOGLE_API_KEY:
        return {"ok": False, "clear": None, "kind": label, "notes": "AI key missing"}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            img_bytes = r.content
            mime = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        if len(img_bytes) > 8 * 1024 * 1024:
            return {"ok": False, "clear": False, "kind": label, "notes": "File >8MB; skipped"}
    except Exception as e:
        logger.warning("AI check download failed: %s", e)
        return {"ok": False, "clear": None, "kind": label, "notes": "Download failed"}
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash-preview-04-17")
        img_part = {"mime_type": "image/jpeg", "data": b64}
        response = model.generate_content([PROMPT, img_part])
        parsed = _safe_parse(response.text)
        parsed["ok"] = True
        return parsed
    except Exception as e:
        logger.warning("Gemini doc-check failed: %s", e)
        return {"ok": False, "clear": None, "kind": label, "notes": "LLM error"}

async def check_documents(doc_map: dict) -> dict:
    if not doc_map:
        return {}
    items = [(k, v) for k, v in doc_map.items() if v]
    results = await asyncio.gather(*[check_document_url(v, k) for k, v in items], return_exceptions=True)
    out = {}
    for (k, _), r in zip(items, results):
        out[k] = r if isinstance(r, dict) else {"ok": False, "clear": None, "kind": k, "notes": "error"}
    return out
