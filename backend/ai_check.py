"""AI document-clarity check using Gemini 2.5 Flash via Emergent LLM key.

For each uploaded supplier document we ask the model whether the image is
legible, returning a small JSON the admin can read at a glance."""
import os
import json
import base64
import logging
import asyncio
from pathlib import Path

import httpx
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("tonerscart.aicheck")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

PROMPT = (
    "You are reviewing a document or photo a supplier uploaded for KYC verification on a "
    "B2B printer-toner marketplace. Look at the image and return STRICT JSON ONLY (no markdown), "
    "of shape: {\"clear\": true/false, \"kind\": \"<short label>\", \"notes\": \"<one short sentence>\"}. "
    "`clear` should be false if the image is blank, blurry, cropped, illegible, or clearly not a "
    "real document. `kind` should be a 1-3 word guess of what's shown (e.g., \"GST certificate\", "
    "\"PAN card\", \"Brand authorization\", \"Shop photo\", \"Bank passbook\"). Keep `notes` ≤ 80 chars."
)


def _safe_parse(text: str) -> dict:
    text = (text or "").strip()
    # Strip code fences if present
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        return json.loads(text)
    except Exception:
        return {"clear": None, "kind": "unknown", "notes": text[:120]}


async def check_document_url(url: str, label: str = "document") -> dict:
    """Download an image and ask Gemini to verify clarity. Returns dict with
       keys: clear, kind, notes, ok (False on transport/llm error)."""
    if not EMERGENT_LLM_KEY:
        return {"ok": False, "clear": None, "kind": label, "notes": "AI key missing"}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            img_bytes = r.content
        if len(img_bytes) > 8 * 1024 * 1024:
            return {"ok": False, "clear": False, "kind": label, "notes": "File >8MB; skipped"}
        b64 = base64.b64encode(img_bytes).decode("ascii")
    except Exception as e:
        logger.warning("AI check download failed: %s", e)
        return {"ok": False, "clear": None, "kind": label, "notes": "Download failed"}

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"doc-check-{label}",
            system_message=PROMPT,
        ).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(
            text=f"Check this {label}.",
            file_contents=[ImageContent(image_base64=b64)],
        ))
        parsed = _safe_parse(str(resp))
        parsed["ok"] = True
        return parsed
    except Exception as e:
        logger.warning("AI check LLM failed: %s", e)
        return {"ok": False, "clear": None, "kind": label, "notes": "LLM error"}


async def check_documents(doc_map: dict[str, str]) -> dict:
    """doc_map: {label: signed_url}. Runs all checks concurrently."""
    if not doc_map:
        return {}
    items = [(k, v) for k, v in doc_map.items() if v]
    results = await asyncio.gather(*[check_document_url(v, k) for k, v in items], return_exceptions=True)
    out = {}
    for (k, _), r in zip(items, results):
        out[k] = r if isinstance(r, dict) else {"ok": False, "clear": None, "kind": k, "notes": "error"}
    return out
