"""Razorpay Standard Checkout — order creation + signature verification.

Two endpoints back the frontend Pay Now button:
    POST /api/payments/create-order   — creates a Razorpay order (server-side
                                        so KEY_SECRET never touches the browser)
    POST /api/payments/verify-payment — HMAC-SHA256 verifies the signature
                                        Razorpay returns after the customer
                                        completes payment in the modal

Amounts flow in paise (₹1 = 100 paise). Minimum ₹1 = 100 paise.

Wave 105.4 — replaces the previously-disabled "Proceed to Payment (coming
soon)" button. The full order-row insert in the DB still happens through the
existing /api/orders endpoint after signature verification succeeds — this
router is intentionally decoupled from that so a signature failure never
half-creates an order.
"""
import hmac
import hashlib
import logging
import os
from typing import Optional

import razorpay
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from supabase_client import get_user_from_token
from server import limiter

logger = logging.getLogger("payments")

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _get_client() -> razorpay.Client:
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise HTTPException(503, "Payment gateway not configured on server")
    return razorpay.Client(auth=(key_id, key_secret))


def _key_id() -> str:
    val = os.environ.get("RAZORPAY_KEY_ID", "")
    if not val:
        raise HTTPException(503, "Payment gateway not configured on server")
    return val


def _key_secret() -> str:
    val = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not val:
        raise HTTPException(503, "Payment gateway not configured on server")
    return val


def _optional_user(request: Request) -> Optional[dict]:
    tok = request.headers.get("authorization", "")
    if not tok.lower().startswith("bearer "):
        return None
    try:
        uid, prof = get_user_from_token(tok.split(" ", 1)[1])
        if uid and prof:
            return {"id": uid, **prof}
    except Exception:
        pass
    return None


# ============================================================================
# Models
# ============================================================================

class CreateOrderRequest(BaseModel):
    amount: int = Field(..., description="Amount in paise (INR). Minimum 100.")
    currency: str = Field(default="INR", max_length=3)
    receipt: Optional[str] = Field(default=None, max_length=120)


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/config-check")
def config_check():
    """Wave 105.4-fix — lightweight prod diagnostic. Returns whether the
    Razorpay env vars are visible to the process AT THIS MOMENT (not just
    at import time). Never returns the secret itself — only booleans and
    a redacted key prefix. Safe to leave enabled in prod.

    Curl this in Railway to confirm env vars propagated after a redeploy:
        curl https://<your-backend>.railway.app/api/payments/config-check
    """
    kid = os.environ.get("RAZORPAY_KEY_ID") or ""
    ksecret = os.environ.get("RAZORPAY_KEY_SECRET") or ""
    return {
        "key_id_present": bool(kid),
        "key_id_prefix": kid[:12] + "…" if kid else None,
        "key_secret_present": bool(ksecret),
        "key_secret_len": len(ksecret) if ksecret else 0,
        "client_initialised": _get_client() is not None,
    }


@router.post("/create-order", response_model=CreateOrderResponse)
@limiter.limit("30/minute")
def create_order(request: Request, payload: CreateOrderRequest):
    if payload.amount < 100:
        raise HTTPException(400, "Amount must be at least 100 paise (₹1)")
    if payload.currency != "INR":
        raise HTTPException(400, "Only INR supported")

    client = _get_client()
    receipt = (payload.receipt or "").strip()[:40] or None

    try:
        order = client.order.create({
            "amount": int(payload.amount),
            "currency": payload.currency,
            "receipt": receipt,
            "payment_capture": 1,
        })
    except razorpay.errors.BadRequestError as e:
        logger.warning("razorpay bad request: %s", e)
        raise HTTPException(400, f"Razorpay rejected the order: {e}") from e
    except razorpay.errors.ServerError as e:
        logger.error("razorpay server error: %s", e)
        raise HTTPException(502, "Payment gateway is temporarily unavailable") from e
    except Exception as e:
        logger.exception("razorpay create-order failed")
        raise HTTPException(500, f"Payment gateway error: {e}") from e

    return CreateOrderResponse(
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        key_id=_key_id(),
    )


@router.post("/verify-payment")
@limiter.limit("30/minute")
def verify_payment(request: Request, payload: VerifyPaymentRequest):
    if not (payload.razorpay_order_id and payload.razorpay_payment_id and payload.razorpay_signature):
        raise HTTPException(400, "Missing payment identifiers")

    secret = _key_secret()
    body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, payload.razorpay_signature):
        logger.warning("payment signature mismatch order=%s payment=%s",
                       payload.razorpay_order_id, payload.razorpay_payment_id)
        raise HTTPException(400, "Payment signature verification failed")

    return {
        "ok": True,
        "verified": True,
        "order_id": payload.razorpay_order_id,
        "payment_id": payload.razorpay_payment_id,
    }


@router.get("/config-check")
def config_check():
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    return {
        "key_id_present": bool(key_id),
        "key_id_prefix": key_id[:12] + "..." if key_id else "",
        "key_secret_present": bool(key_secret),
        "key_secret_len": len(key_secret),
        "client_initialised": bool(key_id and key_secret),
    }
