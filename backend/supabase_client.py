"""Supabase clients for TonersCart backend.

Provides:
  - sb_admin: service-role client (bypasses RLS, used for admin operations)
  - sb_anon : anon client used for token verification
  - get_user_from_token(token): returns the authenticated user dict or None
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not (SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY):
    raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY missing in /app/backend/.env")

# Service-role client — bypasses RLS, ONLY use server-side
sb_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Anon client — used to verify user JWTs
sb_anon: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_user_from_token(token: str):
    """Return (user_id, profile_dict) if token is valid, else (None, None)."""
    if not token:
        return None, None
    try:
        resp = sb_anon.auth.get_user(token)
        if not resp or not resp.user:
            return None, None
        uid = resp.user.id
        # Fetch profile via service role
        prof = sb_admin.table("users").select("*").eq("id", uid).maybe_single().execute()
        return uid, (prof.data if prof else None)
    except Exception:
        return None, None
