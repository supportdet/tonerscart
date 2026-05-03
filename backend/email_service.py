"""Resend email helpers — no-op cleanly when RESEND_API_KEY missing.

Used for supplier application notifications, approvals and rejections.
All HTML uses inline CSS only; templates are intentionally simple."""
import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("tonerscart.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "support@tonerscart.com")
SUPPORT_INBOX = os.environ.get("SUPPORT_INBOX", "support@tonerscart.com")

_resend = None
if RESEND_API_KEY:
    try:
        import resend as _resend_pkg
        _resend_pkg.api_key = RESEND_API_KEY
        _resend = _resend_pkg
        logger.info("Resend configured (sender=%s)", SENDER_EMAIL)
    except Exception as e:
        logger.warning("Resend SDK not available: %s", e)


def _envelope(subject: str, body_html: str) -> str:
    """Wrap email body in TonersCart shell."""
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1D1D1F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:#fff;border:1px solid #E5E5EA;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #E5E5EA;background:#0A0A0B;color:#fff;">
          <div style="font-size:18px;font-weight:600;letter-spacing:-0.02em;">TonersCart</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6);">India&apos;s B2B printer-toner marketplace</div>
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:14.5px;line-height:1.55;">
          {body_html}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#FAFAFA;border-top:1px solid #E5E5EA;font-size:11px;color:#86868B;">
          You&apos;re receiving this because you interacted with TonersCart. Replies go to {SUPPORT_INBOX}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def _send(to: str, subject: str, body_html: str, reply_to: str | None = None):
    if not _resend:
        logger.info("[EMAIL SKIPPED — no RESEND_API_KEY] to=%s subject=%s", to, subject)
        return False
    params = {
        "from": f"TonersCart <{SENDER_EMAIL}>",
        "to": [to],
        "subject": subject,
        "html": _envelope(subject, body_html),
    }
    if reply_to:
        params["reply_to"] = reply_to
    try:
        await asyncio.to_thread(_resend.Emails.send, params)
        return True
    except Exception as e:
        logger.warning("Resend send failed to=%s: %s", to, e)
        return False


# ===== Public helpers ===========================================================

async def email_application_received(application: dict):
    """Sends both:
       1. Notification → support inbox with full application details
       2. Confirmation → applicant"""
    biz = application.get("business_name", "—")
    name = application.get("contact_person", "")
    email_to_applicant = application.get("email")

    # 1. Admin notification
    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#86868B;'>{k}</td>"
        f"<td style='padding:6px 12px;'><strong>{v or '—'}</strong></td></tr>"
        for k, v in [
            ("Business name", application.get("business_name")),
            ("Contact person", application.get("contact_person")),
            ("Email", application.get("email")),
            ("Phone", application.get("phone")),
            ("City", application.get("city")),
            ("State", application.get("state")),
            ("Pincode", application.get("pincode")),
            ("GST", application.get("gst_number")),
            ("PAN", application.get("pan_number")),
            ("Annual turnover", application.get("annual_turnover")),
            ("Years in business", application.get("years_in_business")),
            ("Seller types", ", ".join(application.get("seller_types") or [])),
            ("Cities served", ", ".join(application.get("cities_served") or [])),
            ("Compatible brands", ", ".join(application.get("compatible_brands") or [])),
            ("Address", application.get("business_address")),
        ]
    )
    admin_html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">New supplier application</h2>
    <p style="margin:0 0 18px 0;color:#6E6E73;">Review at <a href="https://toners-marketplace.preview.emergentagent.com/admin">/admin</a>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows}</table>
    """
    await _send(SUPPORT_INBOX, f"[TonersCart] New supplier application — {biz}", admin_html, reply_to=email_to_applicant)

    # 2. Applicant confirmation
    if email_to_applicant:
        applicant_html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">Thanks {name or 'there'} — we&apos;ve got your application</h2>
        <p>Your business <strong>{biz}</strong> is now in TonersCart&apos;s review queue. Our team typically reviews applications within 1–2 working days.</p>
        <p>You can sign in at <a href="https://toners-marketplace.preview.emergentagent.com/login">tonerscart</a> any time to track approval status.</p>
        <p style="margin-top:22px;color:#86868B;font-size:12.5px;">Questions? Just reply to this email.</p>
        """
        await _send(email_to_applicant, "Your TonersCart supplier application is in review", applicant_html)


async def email_application_approved(application: dict):
    biz = application.get("business_name", "")
    name = application.get("contact_person", "")
    email_to_applicant = application.get("email")
    if not email_to_applicant:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0A8754;">You&apos;re approved 🎉</h2>
    <p>Hi {name or 'there'},</p>
    <p>Great news — your application for <strong>{biz}</strong> has been approved on TonersCart.
    You can now sign in and start listing your toner products.</p>
    <p style="margin:22px 0;">
      <a href="https://toners-marketplace.preview.emergentagent.com/supplier"
         style="display:inline-block;padding:12px 22px;background:#F7C600;color:#0A0A0B;border-radius:10px;font-weight:600;text-decoration:none;">
        Go to my dashboard
      </a>
    </p>
    <p style="color:#6E6E73;font-size:12.5px;">Tip: clear product photos and accurate stock levels drive more orders.</p>
    """
    await _send(email_to_applicant, "Your TonersCart supplier account is approved", html)


async def email_application_rejected(application: dict, reason: str):
    biz = application.get("business_name", "")
    name = application.get("contact_person", "")
    email_to_applicant = application.get("email")
    if not email_to_applicant:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Application update — {biz}</h2>
    <p>Hi {name or 'there'},</p>
    <p>After review, we weren&apos;t able to approve your TonersCart supplier application at this time.</p>
    <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #FF3B30;background:#FFF5F5;border-radius:6px;">
      <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;">Reason</div>
      <div style="margin-top:6px;">{reason or 'Not specified.'}</div>
    </div>
    <p>If you&apos;d like to appeal or share more documentation, just reply to this email — we&apos;ll be happy to take another look.</p>
    """
    await _send(email_to_applicant, "Update on your TonersCart supplier application", html)
