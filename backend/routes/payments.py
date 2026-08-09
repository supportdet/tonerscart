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
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from supabase_client import get_user_from_token
from server import limiter

logger = logging.getLogger("payments")

router = APIRouter(prefix="/api/payments", tags=["payments"])

_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")

# Client is initialised at import time. If the keys are missing, requests will
# raise 500 with a clear message rather than crashing the whole app.
_client: Optional[razorpay.Client] = None
if _KEY_ID and _KEY_SECRET:
    _client = razorpay.Client(auth=(_KEY_ID, _KEY_SECRET))
else:
    logger.warning("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing — payment endpoints will 503")


def _require_client() -> razorpay.Client:
    if not _client:
        raise HTTPException(503, "Payment gateway not configured on server")
    return _client


def _optional_user(request: Request) -> Optional[dict]:
    """Payment endpoints work for both logged-in customers (normal checkout)
    and guest carts (rare fallback). Returns None if no valid token."""
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
    receipt: Optional[str] = Field(default=None, max_length=120,
                                   description="Merchant receipt ID; auto-trimmed to Razorpay's 40-char cap")


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str  # public key, safe to return so the frontend doesn't need env access


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/create-order", response_model=CreateOrderResponse)
@limiter.limit("30/minute")
def create_order(request: Request, payload: CreateOrderRequest):
    """Create a Razorpay order. Frontend uses the returned order_id to open the
    Razorpay checkout modal. Amount is enforced server-side (Wave 105-B trust
    boundary) — the client-supplied value must be at least ₹1."""
    if payload.amount < 100:
        raise HTTPException(400, "Amount must be at least 100 paise (₹1)")
    if payload.currency != "INR":
        raise HTTPException(400, "Only INR supported")
    client = _require_client()

    # Razorpay caps receipt at 40 chars — trim silently rather than 400ing.
    receipt = (payload.receipt or "").strip()[:40] or None

    try:
        order = client.order.create({
            "amount": int(payload.amount),
            "currency": payload.currency,
            "receipt": receipt,
            "payment_capture": 1,  # auto-capture on success
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
        key_id=_KEY_ID or "",
    )


@router.post("/verify-payment")
@limiter.limit("30/minute")
def verify_payment(request: Request, payload: VerifyPaymentRequest):
    """HMAC-SHA256 verify the Razorpay signature. Only after this succeeds
    should the caller (frontend) trigger the actual DB order insert.

    Algorithm (per Razorpay docs):
        expected = HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
        compare with razorpay_signature (constant-time)
    """
    if not (payload.razorpay_order_id and payload.razorpay_payment_id and payload.razorpay_signature):
        raise HTTPException(400, "Missing payment identifiers")
    if not _KEY_SECRET:
        raise HTTPException(503, "Payment gateway not configured on server")

    body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    expected = hmac.new(_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()

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
