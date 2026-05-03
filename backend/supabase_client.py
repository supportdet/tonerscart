"""Supabase clients for TonersCart backend.

Uses HTTP/1.1 with connection retries to avoid intermittent
"Server disconnected" errors from Supabase's edge that occasionally
drop long-lived HTTP/2 connections.
"""
import os
from pathlib import Path
import httpx
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not (SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY):
    raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY missing in /app/backend/.env")


def _http1_client(timeout: float = 30.0) -> httpx.Client:
    """httpx Client pinned to HTTP/1.1 with transport-level retries.
    Avoids the HTTP/2 'Server disconnected' issue with Supabase edge."""
    transport = httpx.HTTPTransport(retries=3, http2=False)
    return httpx.Client(transport=transport, timeout=timeout, http2=False)


_admin_options = ClientOptions(
    schema="public",
    auto_refresh_token=False,
    persist_session=False,
    httpx_client=_http1_client(),
    postgrest_client_timeout=30,
)
_anon_options = ClientOptions(
    schema="public",
    auto_refresh_token=False,
    persist_session=False,
    httpx_client=_http1_client(),
    postgrest_client_timeout=30,
)

# Service-role client — bypasses RLS, server-only
sb_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options=_admin_options)
# Anon client — used only to verify user JWTs
sb_anon: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=_anon_options)


def get_user_from_token(token: str):
    """Return (user_id, profile_dict) if token is valid, else (None, None)."""
    if not token:
        return None, None
    try:
        resp = sb_anon.auth.get_user(token)
        if not resp or not resp.user:
            return None, None
        uid = resp.user.id
        prof = sb_admin.table("users").select("*").eq("id", uid).maybe_single().execute()
        return uid, (prof.data if prof else None)
    except Exception:
        return None, None
