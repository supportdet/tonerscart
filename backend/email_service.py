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
        <tr><td style="padding:24px 32px;border-bottom:1px solid #E5E5EA;background:#FFFFFF;color:#0A0A0B;">
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">
            <span style="color:#0A0A0B;">Toners</span><span style="color:#00B7C7;">Cart</span>
          </div>
          <div style="font-size:12px;color:#86868B;margin-top:2px;">India&apos;s printer, toner &amp; supplies marketplace</div>
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


async def _send(to: str, subject: str, body_html: str, reply_to: str | None = None, attachments: list | None = None):
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
    if attachments:
        # Resend expects [{ "filename": str, "content": [bytes] or base64 str }]
        params["attachments"] = attachments
    try:
        await asyncio.to_thread(_resend.Emails.send, params)
        return True
    except Exception as e:
        logger.warning("Resend send failed to=%s: %s", to, e)
        return False


async def email_proc_quotation(u: dict, quotation: dict, pdf_bytes: bytes):
    """Email a generated quotation PDF to the procurement user."""
    email_to = u.get("email")
    if not email_to:
        return False
    import base64
    ref = quotation.get("ref_number")
    valid_until = (quotation.get("expires_at") or "")[:10]
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Your quotation {ref} is ready</h2>
    <p>Hi {u.get('name') or 'there'},</p>
    <p>Please find your formal TonersCart quotation attached (PDF). It compares the
    lowest-priced verified suppliers (L1/L2/L3) for your requirement.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
      <tr><td style="padding:4px 12px;color:#86868B;">Reference</td><td style="padding:4px 12px;"><strong>{ref}</strong></td></tr>
      <tr><td style="padding:4px 12px;color:#86868B;">Valid until</td><td style="padding:4px 12px;"><strong>{valid_until}</strong> (7 days)</td></tr>
    </table>
    <p style="margin-top:16px;color:#6E6E73;font-size:12.5px;">Sign in to your dashboard to proceed with an order from any listed supplier.</p>
    """
    attachment = {"filename": f"{ref}.pdf", "content": list(pdf_bytes)}
    return await _send(email_to, f"TonersCart Quotation {ref}", html, attachments=[attachment])


# ===== Public helpers ===========================================================

# Public app base for links inside emails (matches the rest of this module).
PROC_BASE = "https://printer-supply-hub.preview.emergentagent.com"


async def email_proc_registration_received(u: dict):
    """Procurement registration: applicant 'under review' + admin notification."""
    typ = "Government" if u.get("type") == "govt" else "Corporate"
    org = u.get("org_name") or "—"
    email_to = u.get("email")

    # Applicant confirmation
    if email_to:
        applicant_html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">Thanks {u.get('name') or 'there'} — we&apos;ve received your registration</h2>
        <p>Your {typ.lower()} procurement account for <strong>{org}</strong> is now under review.
        Our team verifies every government and corporate account before activation.</p>
        <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #00B7C7;background:#F0FBFC;border-radius:6px;">
          <strong>Your account is under review.</strong> You will receive an email once it&apos;s approved.
        </div>
        <p style="color:#86868B;font-size:12.5px;">Questions? Just reply to this email.</p>
        """
        await _send(email_to, "Your TonersCart procurement registration is under review", applicant_html)

    # Admin notification
    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#86868B;'>{k}</td>"
        f"<td style='padding:6px 12px;'><strong>{v or '—'}</strong></td></tr>"
        for k, v in [
            ("Type", typ),
            ("Name", u.get("name")),
            ("Designation", u.get("designation")),
            ("Department / Company", org),
            ("Ministry / State", u.get("ministry_state")),
            ("Employee ID", u.get("employee_id")),
            ("GST", u.get("gst_number")),
            ("Email", u.get("email")),
            ("Phone", u.get("phone")),
            ("Address", u.get("address")),
        ]
    )
    admin_html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">New {typ} procurement account pending approval</h2>
    <p style="margin:0 0 18px 0;color:#6E6E73;">Review at <a href="{PROC_BASE}/admin">/admin → Procurement</a>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows}</table>
    """
    await _send(SUPPORT_INBOX, f"[TonersCart] New {typ} procurement account — {org}", admin_html, reply_to=email_to)


async def email_proc_approved(u: dict):
    email_to = u.get("email")
    if not email_to:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0A8754;">Your procurement account is approved 🎉</h2>
    <p>Hi {u.get('name') or 'there'},</p>
    <p>Your TonersCart procurement account for <strong>{u.get('org_name') or ''}</strong> has been approved.
    You can now sign in to search &amp; compare suppliers, generate quotations and place orders.</p>
    <p style="margin:22px 0;">
      <a href="{PROC_BASE}/procurement/login"
         style="display:inline-block;padding:12px 22px;background:#F7C600;color:#0A0A0B;border-radius:10px;font-weight:600;text-decoration:none;">
        Sign in to procurement portal
      </a>
    </p>
    <p style="color:#6E6E73;font-size:12.5px;">Your credit limit will be set by our team — you&apos;ll see it on your dashboard.</p>
    """
    await _send(email_to, "Your TonersCart procurement account is approved", html)


async def email_proc_rejected(u: dict, reason: str):
    email_to = u.get("email")
    if not email_to:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Update on your procurement application</h2>
    <p>Hi {u.get('name') or 'there'},</p>
    <p>After review, we weren&apos;t able to approve your TonersCart procurement account at this time.</p>
    <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #FF3B30;background:#FFF5F5;border-radius:6px;">
      <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;">Reason</div>
      <div style="margin-top:6px;">{reason or 'Not specified.'}</div>
    </div>
    <p>If you&apos;d like to re-apply or share more details, just reply to this email.</p>
    """
    await _send(email_to, "Update on your TonersCart procurement application", html)


# ===== OEM (manufacturer showcase) ==============================================

async def email_oem_application_received(p: dict):
    """OEM showcase application: applicant acknowledgement + admin notification."""
    email_to = p.get("email")
    brand = p.get("brand") or p.get("company") or "your brand"
    if email_to:
        html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">Thanks {p.get('contact_name') or 'there'} — application received</h2>
        <p>We&apos;ve received your request to showcase <strong>{brand}</strong> on the TonersCart OEM Marketplace.</p>
        <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #00B7C7;background:#F0FBFC;border-radius:6px;">
          <strong>Your application is under review.</strong> Once approved, you&apos;ll receive login details to add your products.
        </div>
        <p style="color:#86868B;font-size:12.5px;">Questions? Just reply to this email.</p>
        """
        await _send(email_to, "Your TonersCart OEM application is under review", html)

    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#86868B;'>{k}</td>"
        f"<td style='padding:6px 12px;'><strong>{v or '—'}</strong></td></tr>"
        for k, v in [
            ("Company", p.get("company")), ("Brand", p.get("brand")),
            ("Contact", p.get("contact_name")), ("Email", p.get("email")),
            ("Phone", p.get("phone")), ("Products", p.get("products_note")),
        ]
    )
    admin_html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">New OEM partner application</h2>
    <p style="margin:0 0 18px 0;color:#6E6E73;">Review at <a href="{PROC_BASE}/admin">/admin → OEM</a>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows}</table>
    """
    await _send(SUPPORT_INBOX, f"[TonersCart] New OEM application — {brand}", admin_html, reply_to=p.get("email"))


async def email_oem_approved(p: dict, email: str, temp_password):
    if not email:
        return
    cred_block = ""
    if temp_password:
        cred_block = f"""
        <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #0A8754;background:#F0FBF6;border-radius:6px;">
          <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;">Temporary password</div>
          <div style="margin-top:6px;font-family:monospace;font-size:15px;"><strong>{temp_password}</strong></div>
          <div style="margin-top:6px;color:#6E6E73;font-size:12px;">Please change it after first sign-in (use &quot;Forgot password&quot; on the login page).</div>
        </div>"""
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0A8754;">Your OEM account is approved 🎉</h2>
    <p>Hi {p.get('contact_name') or 'there'},</p>
    <p><strong>{p.get('brand') or p.get('company')}</strong> is now a verified OEM partner. Sign in to add products to your showcase on the TonersCart OEM Marketplace.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
      <tr><td style="padding:4px 12px;color:#86868B;">Login email</td><td style="padding:4px 12px;"><strong>{email}</strong></td></tr>
    </table>
    {cred_block}
    <p style="margin:22px 0;">
      <a href="{PROC_BASE}/login" style="display:inline-block;padding:12px 22px;background:#F7C600;color:#0A0A0B;border-radius:10px;font-weight:600;text-decoration:none;">Sign in to OEM dashboard</a>
    </p>
    """
    await _send(email, "Your TonersCart OEM account is approved", html)


async def email_oem_rejected(p: dict, reason: str):
    email_to = p.get("email")
    if not email_to:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Update on your OEM application</h2>
    <p>Hi {p.get('contact_name') or 'there'},</p>
    <p>After review, we weren&apos;t able to approve <strong>{p.get('brand') or p.get('company')}</strong> for the OEM Marketplace at this time.</p>
    <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #FF3B30;background:#FFF5F5;border-radius:6px;">
      <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;">Reason</div>
      <div style="margin-top:6px;">{reason or 'Not specified.'}</div>
    </div>
    <p>If you&apos;d like to re-apply, just reply to this email.</p>
    """
    await _send(email_to, "Update on your TonersCart OEM application", html)


async def email_oem_enquiry(partner: dict, product: dict, buyer: dict):
    """Buyer enquiry about an OEM product → routed to the OEM brand's contact email."""
    to = partner.get("email")
    if not to:
        return
    pname = product.get("name") or product.get("model_number") or "your product"
    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#86868B;'>{k}</td>"
        f"<td style='padding:6px 12px;'><strong>{v or '—'}</strong></td></tr>"
        for k, v in [
            ("Name", buyer.get("name")), ("Email", buyer.get("email")),
            ("Phone", buyer.get("phone")), ("Product", pname),
            ("Message", buyer.get("message")),
        ]
    )
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">New enquiry for {pname}</h2>
    <p>You&apos;ve received a buyer enquiry from the TonersCart OEM Marketplace for <strong>{partner.get('brand') or partner.get('company')}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">{rows}</table>
    <p style="margin-top:16px;color:#6E6E73;font-size:12.5px;">Reply directly to this email to reach the buyer.</p>
    """
    await _send(to, f"[TonersCart OEM] Enquiry for {pname}", html, reply_to=buyer.get("email"))



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
    <p style="margin:0 0 18px 0;color:#6E6E73;">Review at <a href="https://printer-supply-hub.preview.emergentagent.com/admin">/admin</a>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows}</table>
    """
    await _send(SUPPORT_INBOX, f"[TonersCart] New supplier application — {biz}", admin_html, reply_to=email_to_applicant)

    # 2. Applicant confirmation
    if email_to_applicant:
        applicant_html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">Thanks {name or 'there'} — we&apos;ve got your application</h2>
        <p>Your business <strong>{biz}</strong> is now in TonersCart&apos;s review queue. Our team typically reviews applications within 1–2 working days.</p>
        <p>You can sign in at <a href="https://printer-supply-hub.preview.emergentagent.com/login">tonerscart</a> any time to track approval status.</p>
        <p style="margin-top:22px;color:#86868B;font-size:12.5px;">Questions? Just reply to this email.</p>
        """
        await _send(email_to_applicant, "Your TonersCart supplier application is in review", applicant_html)


async def email_application_approved(application: dict):
    biz = application.get("business_name", "")
    name = application.get("contact_person", "")
    email_to_applicant = application.get("email")
    if not email_to_applicant:
        return
    sid = application.get("seller_id")
    sid_block = (
        f"""<div style="margin:16px 0;padding:14px 16px;background:#F0FBFC;border:1px solid #BFEAEF;border-radius:10px;">
      <div style="font-size:12px;color:#6E6E73;">Your Seller ID</div>
      <div style="font-size:18px;font-weight:700;font-family:monospace;color:#00838f;letter-spacing:0.5px;">{sid}</div>
      <div style="font-size:11.5px;color:#86868B;margin-top:2px;">Use this in all communication with TonersCart.</div>
    </div>"""
        if sid else ""
    )
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0A8754;">You&apos;re approved 🎉</h2>
    <p>Hi {name or 'there'},</p>
    <p>Great news — your application for <strong>{biz}</strong> has been approved on TonersCart.
    You can now sign in and start listing your toner products.</p>
    {sid_block}
    <p style="margin:22px 0;">
      <a href="https://printer-supply-hub.preview.emergentagent.com/supplier"
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



async def email_mps_inquiry(payload: dict):
    """Sends an MPS or Contact / Featured-application inquiry to the support
    inbox. The subject line and heading adapt based on `selections.type`:
       - 'featured_application' → Featured supplier application
       - default                → MPS enquiry
    """
    name = payload.get("name", "")
    email = payload.get("email", "")
    phone = payload.get("phone", "")
    description = payload.get("description") or ""
    estimated = payload.get("estimated_printers", "—")
    sel = payload.get("selections") or {}
    kind = (sel.get("type") or "").lower()
    is_featured = kind == "featured_application"
    sel_rows = "".join(
        f"<tr><td style='padding:4px 12px;color:#86868B;'>{k}</td>"
        f"<td style='padding:4px 12px;'><strong>{v if not isinstance(v, list) else ', '.join(v)}</strong></td></tr>"
        for k, v in sel.items() if v
    )

    if is_featured:
        company = sel.get("company") or name
        heading = "New Featured Supplier Application"
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Company: <strong>{company}</strong></p>"
        subject = f"New Featured Supplier Application — {company}"
    elif kind == "bulk_enquiry":
        product = sel.get("product_type") or "—"
        qty = sel.get("quantity") or "—"
        heading = "New Buy-Bulk Enquiry"
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Product: <strong>{product}</strong> · Quantity: <strong>{qty}</strong></p>"
        subject = f"[TonersCart Bulk] {product} × {qty} — {email}"
    elif kind == "oem_application":
        company = sel.get("company") or name or email
        heading = "New OEM Marketplace Application"
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Company: <strong>{company}</strong></p>"
        subject = f"[TonersCart OEM] Application — {company}"
    elif kind.endswith("_interest"):
        cat = sel.get("category") or kind.replace("_interest", "").title()
        heading = f"New {cat} Interest Capture"
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Category: <strong>{cat}</strong></p>"
        subject = f"[TonersCart Notify] {cat} interest — {email}"
    elif kind == "deal_enquiry":
        product = sel.get("product") or "—"
        price = sel.get("price")
        heading = "New high-value (deal-basis) enquiry"
        price_line = f" · Listed ₹{int(price):,}" if price else ""
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Product: <strong>{product}</strong>{price_line}</p>"
        subject = f"[TonersCart Deal] {product} — {email}"
    else:
        heading = "New Managed Print Services (MPS) enquiry"
        intro = f"<p style='margin:0 0 18px 0;color:#6E6E73;'>Estimated fleet: <strong>{estimated}</strong> printers</p>"
        subject = f"[TonersCart MPS] New enquiry — {name} ({estimated} printers)"

    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">{heading}</h2>
    {intro}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style='padding:4px 12px;color:#86868B;'>Name</td><td style='padding:4px 12px;'><strong>{name}</strong></td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Email</td><td style='padding:4px 12px;'><strong>{email}</strong></td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Phone</td><td style='padding:4px 12px;'><strong>{phone}</strong></td></tr>
      {sel_rows}
    </table>
    {f'<p style="margin-top:18px;"><strong>Requirement:</strong><br/>{description}</p>' if description else ''}
    """
    await _send(SUPPORT_INBOX, subject, html, reply_to=email)


async def email_featured_applicant_reply(app: dict):
    """Auto-reply sent to the applicant after they submit a Get-Featured form.
    Includes pricing tiers (kept OFF the public website, only here)."""
    company = app.get("company") or app.get("name") or "there"
    to_email = app.get("email")
    if not to_email:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Thank you, {company}!</h2>
    <p>We&apos;ve received your <strong>featured placement</strong> request on TonersCart. Our team will
    contact you within <strong>24 hours</strong> with placement options.</p>

    <div style="margin:18px 0;padding:16px 18px;border:1px solid #F5E5A6;background:#FFFBEB;border-radius:10px;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#8C6A00;margin-bottom:8px;">Featured placement pricing</div>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px;color:#0A0A0B;">
        <tr><td style="padding:6px 0;">3 days featured placement</td><td style="padding:6px 0;text-align:right;"><strong>₹5,000</strong></td></tr>
        <tr><td style="padding:6px 0;border-top:1px solid #F5E5A6;">1 week featured placement</td><td style="padding:6px 0;border-top:1px solid #F5E5A6;text-align:right;"><strong>₹7,000</strong></td></tr>
        <tr><td style="padding:6px 0;border-top:1px solid #F5E5A6;">1 month featured placement</td><td style="padding:6px 0;border-top:1px solid #F5E5A6;text-align:right;"><strong>₹25,000</strong></td></tr>
      </table>
      <div style="margin-top:8px;font-size:11.5px;color:#6E6E73;">All prices exclusive of GST. Custom packages available on request.</div>
    </div>

    <p>For urgent queries, reply to this email or write to <a href="mailto:support@tonerscart.com" style="color:#0A0A0B;font-weight:600;">support@tonerscart.com</a>.</p>
    <p style="margin-top:22px;color:#86868B;font-size:12.5px;">— Team TonersCart</p>
    """
    await _send(to_email, f"We received your featured placement request, {company}", html)


def _quote_money(n) -> str:
    try:
        return f"₹{int(round(float(n))):,}"
    except Exception:
        return f"₹{n}"


async def email_quotation(*, quote_number: str, buyer: dict, item: dict, supplier_label: str = "Verified Supplier on TonersCart", seller_id: str = ""):
    """Send a formal quotation email to the buyer + BCC copy to support.
    `item` keys expected:
        brand, model_number, type/color, unit_price, qty, total, listing_type, notes
    `buyer` keys expected: name, email, phone, gst
    """
    from datetime import datetime as _dt
    today = _dt.now().strftime("%d %b %Y")
    buyer_name = buyer.get("name") or "Customer"
    buyer_email = buyer.get("email")
    buyer_phone = buyer.get("phone") or "—"
    raw_gst = (buyer.get("gst") or "").strip()
    buyer_gst = raw_gst if raw_gst else "Not provided"

    brand = item.get("brand") or ""
    model = item.get("model_number") or ""
    color = item.get("color") or "—"
    # Pretty product-type label — toner_type for toners, category for printers
    raw_type = (item.get("type") or item.get("listing_type") or "—")
    if (item.get("listing_type") == "printer") and raw_type:
        type_label = raw_type.title() if raw_type not in ("—",) else raw_type
    else:
        type_label = raw_type
    qty = int(item.get("qty") or 1)
    unit = float(item.get("unit_price") or 0)
    total = float(item.get("total") or (unit * qty))

    # ----- Tech specs table (two-column) ------------------------------------
    listing_type = (item.get("listing_type") or "toner").lower()
    spec_rows: list[tuple[str, str]] = []
    def _push(label: str, val):
        if val is None:
            return
        s = str(val).strip()
        if not s or s.lower() in ("none", "null", "—"):
            return
        spec_rows.append((label, s))
    if listing_type == "printer":
        _push("Print speed", f"{item.get('print_speed_ppm')} ppm" if item.get('print_speed_ppm') else None)
        _push("Duty cycle", item.get('duty_cycle'))
        connectivity = item.get('connectivity')
        _push("Connectivity", ", ".join(connectivity) if isinstance(connectivity, list) else connectivity)
        _push("Max resolution", item.get('max_resolution'))
        paper_sizes = item.get('paper_sizes')
        _push("Paper sizes", ", ".join(paper_sizes) if isinstance(paper_sizes, list) else paper_sizes)
        mobile = item.get('mobile_printing')
        _push("Mobile printing", ", ".join(mobile) if isinstance(mobile, list) else mobile)
        _push("Condition", item.get('condition'))
        _push("Warranty", item.get('printer_warranty'))
    else:  # toner (default)
        _push("Page yield", f"{item.get('page_yield')} pages" if item.get('page_yield') else None)
        compat = item.get('compatible_models')
        _push("Compatible models", ", ".join(compat) if isinstance(compat, list) else compat)
        _push("OEM part number", item.get('oem_part_number'))
        _push("Cartridge weight", f"{item.get('cartridge_weight')} g" if item.get('cartridge_weight') else None)
        _push("Print technology", item.get('print_technology'))
        _push("Toner type", raw_type)
        _push("Color", color if color != "—" else None)
        _push("Warranty", item.get('warranty'))

    specs_html = ""
    if spec_rows:
        cells = []
        for i, (lbl, val) in enumerate(spec_rows):
            cells.append(f"""
            <td style="padding:10px 14px;border-top:1px solid #E5E5EA;width:50%;vertical-align:top;">
              <div style="font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:#86868B;">{lbl}</div>
              <div style="font-size:13px;color:#0A0A0B;margin-top:3px;line-height:1.45;">{val}</div>
            </td>""")
        rows_html = ""
        for i in range(0, len(cells), 2):
            pair = cells[i:i+2]
            if len(pair) == 1:
                pair.append('<td style="padding:10px 14px;border-top:1px solid #E5E5EA;width:50%;"></td>')
            rows_html += f"<tr>{''.join(pair)}</tr>"
        specs_html = f"""
        <div style="margin-top:22px;">
          <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#00B7C7;margin-bottom:8px;">Technical Specifications</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #E5E5EA;border-radius:8px;overflow:hidden;background:#FFFFFF;">
            {rows_html}
          </table>
        </div>
        """

    verified_seller_html = ""
    if seller_id:
        verified_seller_html = (
            "<div style='margin-top:6px;display:inline-block;padding:3px 10px;border-radius:999px;"
            "background:#E6F7EC;border:1px solid #0A8754;color:#0A8754;font-size:11px;font-weight:700;letter-spacing:0.03em;'>"
            f"&#10003; Verified Seller &middot; <span style='font-family:monospace;'>{seller_id}</span></div>"
        )

    body = f"""
    <div style="border-top:4px solid #00B7C7;background:#FFFFFF;padding:24px 0 8px 0;">    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #E5E5EA;">
      <div>
        <div style="font-family:'Montserrat',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;">
          <span style="color:#0A0A0B;">Toners</span><span style="color:#00B7C7;">Cart</span>
        </div>
        <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#00B7C7;margin-top:8px;">Quotation</div>
        <div style="font-family:monospace;font-size:15px;font-weight:700;color:#0A0A0B;margin-top:2px;">{quote_number}</div>
        <div style="font-size:12px;color:#6E6E73;margin-top:2px;">Issued: {today}</div>
      </div>
      <div style="text-align:right;font-size:12.5px;color:#0A0A0B;line-height:1.5;">
        <div style="font-weight:700;">TonersCart Private Limited</div>
        <div style="color:#6E6E73;">Bangalore, Karnataka, India</div>
        <div style="color:#6E6E73;">support@tonerscart.com</div>
      </div>
    </div>
    </div>

    <div style="display:flex;gap:18px;margin-bottom:18px;">
      <div style="flex:1;padding:12px 14px;background:#F5F5F7;border-radius:10px;">
        <div style="font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#86868B;font-weight:700;">Bill to</div>
        <div style="font-size:14px;font-weight:600;color:#0A0A0B;margin-top:4px;">{buyer_name}</div>
        <div style="font-size:12.5px;color:#3a3a40;">{buyer_email or '—'}</div>
        <div style="font-size:12.5px;color:#3a3a40;">{buyer_phone}</div>
        <div style="font-size:12px;color:#6E6E73;margin-top:6px;">GST: <strong style="color:#0A0A0B;">{buyer_gst}</strong></div>
      </div>
      <div style="flex:1;padding:12px 14px;background:#F5F5F7;border-radius:10px;">
        <div style="font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#86868B;font-weight:700;">Sold by</div>
        <div style="font-size:14px;font-weight:600;color:#0A0A0B;margin-top:4px;">{supplier_label}</div>
        <div style="font-size:12.5px;color:#3a3a40;">via tonerscart.com</div>
        {verified_seller_html}
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #E5E5EA;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#F5F5F7;color:#0A0A0B;">
          <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Item</th>
          <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Type</th>
          <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Color</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Unit</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Qty</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:12px;border-top:1px solid #E5E5EA;"><strong>{brand}</strong> · <span style="font-family:monospace;">{model}</span></td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#FFFBEB;color:#8C6A00;border:1px solid #F5C400;font-size:11.5px;font-weight:600;">{type_label}</span></td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;">{color}</td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;text-align:right;">{_quote_money(unit)}</td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;text-align:right;">{qty}</td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;text-align:right;font-weight:700;">{_quote_money(total)}</td>
        </tr>
        <tr>
          <td colspan="5" style="padding:12px;border-top:1px solid #E5E5EA;text-align:right;font-size:11.5px;letter-spacing:0.16em;text-transform:uppercase;color:#6E6E73;">Grand Total</td>
          <td style="padding:12px;border-top:1px solid #E5E5EA;text-align:right;font-weight:800;font-size:15px;">{_quote_money(total)}</td>
        </tr>
      </tbody>
    </table>
    {specs_html}

    <div style="margin-top:16px;padding:12px 14px;border-left:3px solid #F5C400;background:#FFFBEB;border-radius:6px;font-size:12.5px;color:#5C4A00;">
      This quotation is valid for <strong>7 days</strong>. Prices are subject to availability.
      Place your order at <a href="https://tonerscart.com" style="color:#0A0A0B;font-weight:600;">tonerscart.com</a>.
    </div>

    <p style="margin-top:22px;color:#86868B;font-size:11.5px;">
      TonersCart — operated by <strong>TonersCart Private Limited, Bangalore</strong> · GST invoice raised by the supplier on order confirmation.
    </p>
    """

    subject = f"Quotation {quote_number} — {brand} {model}"
    if buyer_email:
        await _send(buyer_email, subject, body)
    # Always BCC support inbox
    if SUPPORT_INBOX and SUPPORT_INBOX != buyer_email:
        await _send(SUPPORT_INBOX, f"[Quotation copy] {subject}", body, reply_to=buyer_email)


# ===== Order notifications =====================================================

_COMMISSION_TIERS = [
    (15000,  0.12),
    (30000,  0.10),
    (75000,  0.08),
    (100000, 0.06),
]


def _commission_breakdown(total: float) -> tuple[float, float, str]:
    """Return (commission ₹, payout ₹, rateLabel) — matches frontend rules.
    Charged on bill value excluding GST; ₹1,00,000 and above is a flat 5%."""
    t = float(total or 0)
    for cap, rate in _COMMISSION_TIERS:
        if t < cap:
            c = round(t * rate)
            return c, t - c, f"{int(rate * 100)}%"
    c = round(t * 0.05)
    return c, t - c, "5%"


def _money(n) -> str:
    try:
        return f"₹{int(round(float(n))):,}"
    except Exception:
        return f"₹{n}"


async def email_order_placed(order: dict, listing: dict, supplier: dict, buyer: dict):
    """Send confirmation email to buyer AND seller for a new order.

    `order` keys expected: id, qty, unit_price, total, delivery_address,
        delivery_city, delivery_pincode, customer_name, customer_phone,
        buyer_gst_number, supplier_gst_number, created_at
    `listing` keys: brand, model_number, toner_type
    `supplier` keys: business_name, city, gst_number, contact_email
    `buyer` keys: email, name
    """
    brand = (listing or {}).get("brand", "")
    model = (listing or {}).get("model_number", "")
    toner_type = (listing or {}).get("toner_type", "")
    seller_biz = (supplier or {}).get("business_name") or "Seller"
    seller_city = (supplier or {}).get("city") or ""
    seller_id = (supplier or {}).get("seller_id") or order.get("seller_id") or ""
    seller_id_html = f" · <span style=\"font-family:monospace;color:#00838f;\">{seller_id}</span>" if seller_id else ""
    seller_gst = (supplier or {}).get("gst_number") or order.get("supplier_gst_number")
    buyer_gst = order.get("buyer_gst_number") or buyer.get("gst_number")
    order_id_short = str(order.get("id", ""))[:8].upper()
    qty = order.get("qty", 1)
    unit_price = order.get("unit_price", 0)
    total = order.get("total", 0)
    delivery_address = order.get("delivery_address") or "—"
    delivery_city = order.get("delivery_city") or ""
    delivery_pin = order.get("delivery_pincode") or ""
    # Structured address (new shipping flow) — overrides legacy single-line if present
    street = order.get("street_address") or ""
    area = order.get("area") or ""
    order_city = order.get("order_city") or ""
    order_state = order.get("order_state") or ""
    order_pin = order.get("pincode") or ""
    if street or area or order_city or order_pin:
        parts = [p for p in [street, area] if p]
        loc = f"{order_city} - {order_pin}" if order_city and order_pin else (order_city or order_pin)
        if loc:
            parts.append(loc)
        if order_state:
            parts.append(order_state)
        delivery_full = ", ".join(parts)
    else:
        delivery_full = f"{delivery_address}{', ' + delivery_city if delivery_city else ''}{' - ' + delivery_pin if delivery_pin else ''}"
    delivery_charge = float(order.get("delivery_charge") or 0)
    # Determine intercity vs intra-city note
    seller_city_norm = (seller_city or "").strip().lower()
    buyer_city_norm = (order_city or delivery_city or "").strip().lower()
    is_intercity = bool(buyer_city_norm and seller_city_norm and buyer_city_norm != seller_city_norm)
    delivery_note_buyer = (
        "Intercity delivery — dealer to arrange courier and confirm dispatch timeline with you."
        if is_intercity
        else f"Free delivery within {seller_city or 'dealer city'}. Intercity delivery charges to be confirmed by supplier before dispatch."
    )
    delivery_note_seller = (
        "Intercity delivery — please arrange courier and confirm dispatch timeline with the buyer."
        if is_intercity
        else "Please confirm delivery charges with the buyer for intercity orders before dispatching."
    )
    customer_name = order.get("customer_name") or (buyer or {}).get("name") or "Buyer"
    customer_phone = order.get("customer_phone") or "—"

    commission, payout, rate_label = _commission_breakdown(total)
    gst_block_b = ""
    if buyer_gst or seller_gst:
        rows_g = ""
        if buyer_gst:
            rows_g += f"<tr><td style='padding:4px 12px;color:#86868B;'>Buyer GST</td><td style='padding:4px 12px;'><strong>{buyer_gst}</strong></td></tr>"
        if seller_gst:
            rows_g += f"<tr><td style='padding:4px 12px;color:#86868B;'>Seller GST</td><td style='padding:4px 12px;'><strong>{seller_gst}</strong></td></tr>"
        gst_block_b = f"""
        <div style="margin:14px 0;padding:14px 16px;background:#F5F5F7;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;margin-bottom:6px;">GST</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows_g}</table>
          <div style="margin-top:8px;font-size:11.5px;color:#6E6E73;">GST invoice to be issued by seller directly. TonersCart is a marketplace platform.</div>
        </div>"""

    # ---------- Buyer email ----------
    buyer_email = (buyer or {}).get("email")
    if buyer_email:
        buyer_html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">Order confirmed — {brand} {model}</h2>
        <p style="margin:0 0 18px 0;color:#6E6E73;">Hi {customer_name}, your order has been sent to the seller.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style='padding:4px 12px;color:#86868B;'>Order ID</td><td style='padding:4px 12px;'><strong style="font-family:monospace;">#{order_id_short}</strong></td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Product</td><td style='padding:4px 12px;'><strong>{brand} · {model}</strong>{f' · {toner_type}' if toner_type else ''}</td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Quantity</td><td style='padding:4px 12px;'><strong>{qty}</strong></td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Unit price</td><td style='padding:4px 12px;'>{_money(unit_price)}</td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Total <span style="font-weight:400;color:#86868B;">(locked)</span></td><td style='padding:4px 12px;'><strong>{_money(total)}</strong></td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Delivery</td><td style='padding:4px 12px;'>{delivery_full}</td></tr>
          {("<tr><td style='padding:4px 12px;color:#86868B;'>Delivery charge</td><td style='padding:4px 12px;'><strong>" + _money(delivery_charge) + "</strong></td></tr>") if delivery_charge > 0 else ""}
          <tr><td style='padding:4px 12px;color:#86868B;'>Seller</td><td style='padding:4px 12px;'><strong>{seller_biz}</strong>{f' · {seller_city}' if seller_city else ''}{seller_id_html}</td></tr>
        </table>
        <div style="margin:14px 0;padding:12px 14px;background:#FFFBEB;border:1px solid #F5E5A6;border-radius:10px;font-size:12.5px;color:#8C6A00;">
          {delivery_note_buyer}
        </div>
        {gst_block_b}
        <p style="margin:18px 0 4px 0;">Seller will dispatch within <strong>2 business days</strong>. You&apos;ll receive tracking once shipped.</p>
        <p style="margin:18px 0;">
          <a href="mailto:support@tonerscart.com?subject=Order%20%23{order_id_short}%20support"
             style="display:inline-block;padding:12px 20px;background:#0A0A0B;color:#fff;border-radius:10px;font-weight:600;text-decoration:none;">
            Email support
          </a>
        </p>
        <p style="color:#6E6E73;font-size:12.5px;">Prices are locked at order time and never change after placement.</p>
        """
        await _send(buyer_email, f"Order confirmed — {brand} {model} on TonersCart", buyer_html)

    # ---------- Seller email ----------
    seller_email = (supplier or {}).get("contact_email") or (supplier or {}).get("email")
    if seller_email:
        payout_line = (
            f"<tr><td style='padding:4px 12px;color:#86868B;'>Commission ({rate_label})</td><td style='padding:4px 12px;'>−{_money(commission)}</td></tr>"
            f"<tr><td style='padding:4px 12px;color:#86868B;'>Your payout</td><td style='padding:4px 12px;'><strong style='color:#0A8754;'>{_money(payout)}</strong></td></tr>"
            if rate_label != "Deal basis"
            else "<tr><td style='padding:4px 12px;color:#86868B;'>Commission</td><td style='padding:4px 12px;'>Deal basis — our team will contact you.</td></tr>"
        )
        seller_id_row = (
            f"<tr><td style='padding:4px 12px;color:#86868B;'>Your Seller ID</td><td style='padding:4px 12px;'><strong style='font-family:monospace;color:#00838f;'>{seller_id}</strong></td></tr>"
            if seller_id else ""
        )
        gst_block_s = ""
        if buyer_gst or seller_gst:
            rows_gs = ""
            if buyer_gst:
                rows_gs += f"<tr><td style='padding:4px 12px;color:#86868B;'>Buyer GST</td><td style='padding:4px 12px;'><strong>{buyer_gst}</strong></td></tr>"
            if seller_gst:
                rows_gs += f"<tr><td style='padding:4px 12px;color:#86868B;'>Seller GST</td><td style='padding:4px 12px;'><strong>{seller_gst}</strong></td></tr>"
            gst_block_s = f"""
            <div style="margin:14px 0;padding:14px 16px;background:#F5F5F7;border-radius:10px;">
              <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;margin-bottom:6px;">GST</div>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">{rows_gs}</table>
              <div style="margin-top:8px;font-size:11.5px;color:#6E6E73;">Please raise a GST-compliant invoice for the buyer.</div>
            </div>"""

        seller_html = f"""
        <h2 style="margin:0 0 6px 0;font-size:18px;">New order received — {brand} {model}</h2>
        <p style="margin:0 0 18px 0;color:#6E6E73;">A buyer has placed an order against your listing.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style='padding:4px 12px;color:#86868B;'>Order ID</td><td style='padding:4px 12px;'><strong style="font-family:monospace;">#{order_id_short}</strong></td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Product</td><td style='padding:4px 12px;'><strong>{brand} · {model}</strong>{f' · {toner_type}' if toner_type else ''}</td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Quantity</td><td style='padding:4px 12px;'><strong>{qty}</strong></td></tr>
          <tr><td style='padding:4px 12px;color:#86868B;'>Order value</td><td style='padding:4px 12px;'><strong>{_money(total)}</strong></td></tr>
          {payout_line}
          {seller_id_row}
          <tr><td style='padding:4px 12px;color:#86868B;'>Buyer</td><td style='padding:4px 12px;'>{customer_name}{f' · {customer_phone}' if customer_phone else ''}</td></tr>
          {("<tr><td style='padding:4px 12px;color:#86868B;'>Buyer city</td><td style='padding:4px 12px;'><strong>" + (order_city or delivery_city or '—') + "</strong>" + (" <span style='display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#FFF3CD;color:#8C6A00;font-size:11px;font-weight:600;'>Intercity</span>" if is_intercity else " <span style='display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#E6F7EC;color:#0A8754;font-size:11px;font-weight:600;'>Local · free delivery</span>") + "</td></tr>")}
          <tr><td style='padding:4px 12px;color:#86868B;'>Delivery</td><td style='padding:4px 12px;'>{delivery_full}</td></tr>
          {("<tr><td style='padding:4px 12px;color:#86868B;'>Delivery charge</td><td style='padding:4px 12px;'><strong>" + _money(delivery_charge) + "</strong></td></tr>") if delivery_charge > 0 else ""}
        </table>
        <div style="margin:14px 0;padding:12px 14px;background:#FFFBEB;border:1px solid #F5E5A6;border-radius:10px;font-size:12.5px;color:#8C6A00;">
          {delivery_note_seller}
        </div>
        {gst_block_s}
        <p style="margin:18px 0 4px 0;"><strong>Please dispatch within 2 business days</strong> and update tracking in your dashboard.</p>
        <p style="margin:18px 0;">
          <a href="https://printer-supply-hub.preview.emergentagent.com/supplier"
             style="display:inline-block;padding:12px 22px;background:#F7C600;color:#0A0A0B;border-radius:10px;font-weight:600;text-decoration:none;">
            Open my dashboard
          </a>
        </p>
        """
        await _send(seller_email, f"New order received — {brand} {model}", seller_html)



async def email_order_shipped(order: dict, listing: dict, buyer: dict):
    """Notify buyer that their order has shipped — includes tracking number,
    product details, and an email support link."""
    short_id = str(order.get("id", ""))[:8].upper()
    brand = (listing or {}).get("brand") or ""
    model = (listing or {}).get("model_number") or ""
    tracking = (order or {}).get("tracking_number") or "—"
    buyer_email = (buyer or {}).get("email")
    buyer_name = (buyer or {}).get("name") or order.get("customer_name") or "there"
    if not buyer_email:
        return
    qty = order.get("qty", 1)
    total = order.get("total", 0)

    body = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Your TonersCart order is on its way</h2>
    <p style="color:#3a3a40;">Hi {buyer_name}, good news — your order has been dispatched.</p>

    <div style="margin:14px 0;padding:14px 16px;background:#F5F5F7;border-radius:10px;font-size:13.5px;">
      <div style="font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;font-weight:700;">Tracking</div>
      <div style="font-family:monospace;font-size:18px;font-weight:700;color:#0A0A0B;margin-top:4px;letter-spacing:0.04em;">{tracking}</div>
      <div style="margin-top:6px;font-size:11.5px;color:#6E6E73;">Use this number with the courier&apos;s tracking page.</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
      <tr><td style='padding:4px 12px;color:#86868B;'>Order</td><td style='padding:4px 12px;font-family:monospace;'><strong>#{short_id}</strong></td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Product</td><td style='padding:4px 12px;'><strong>{brand} {model}</strong></td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Quantity</td><td style='padding:4px 12px;'>{qty}</td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Total</td><td style='padding:4px 12px;'><strong>{_money(total)}</strong></td></tr>
    </table>

    <p style="margin-top:18px;">
      Once you receive it, please confirm delivery in your
      <a href="https://tonerscart.com/dashboard" style="color:#0A0A0B;font-weight:600;">TonersCart dashboard</a>.
    </p>

    <p style="margin-top:16px;font-size:12.5px;color:#3a3a40;">
      Need help? Email <a href="mailto:support@tonerscart.com" style="color:#0A0A0B;font-weight:600;">support@tonerscart.com</a>.
    </p>
    <p style="margin-top:22px;color:#86868B;font-size:11.5px;">— Team TonersCart</p>
    """
    await _send(buyer_email, f"Your order #{short_id} has been shipped", body)


async def email_order_delivered_support(order: dict, listing: dict, supplier: dict, buyer: dict):
    """Notify the support inbox that a buyer marked an order delivered so we can release payout."""
    short_id = str(order.get("id", ""))[:8].upper()
    brand = (listing or {}).get("brand") or "—"
    model = (listing or {}).get("model_number") or "—"
    seller = (supplier or {}).get("business_name") or "—"
    buyer_name = (buyer or {}).get("name") or order.get("customer_name") or "Buyer"
    commission, payout, rate_label = _commission_breakdown(order.get("total") or 0)
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;">Order delivered — release payout</h2>
    <p style="color:#3a3a40;">Buyer <strong>{buyer_name}</strong> has confirmed delivery for order
    <strong>#{short_id}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style='padding:4px 12px;color:#86868B;'>Product</td><td style='padding:4px 12px;'>{brand} {model}</td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Dealer</td><td style='padding:4px 12px;'>{seller}</td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Total</td><td style='padding:4px 12px;'><strong>{_money(order.get('total') or 0)}</strong></td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Commission ({rate_label})</td><td style='padding:4px 12px;'>{_money(commission)}</td></tr>
      <tr><td style='padding:4px 12px;color:#86868B;'>Payout to dealer</td><td style='padding:4px 12px;'><strong>{_money(payout)}</strong></td></tr>
    </table>
    """
    await _send(SUPPORT_INBOX, f"Payout ready — order #{short_id} delivered", html)


async def email_dealer_suspended(supplier: dict, reason: str | None = None):
    """Notify a dealer their TonersCart account has been suspended."""
    to = (supplier or {}).get("email") or (supplier or {}).get("contact_email")
    biz = (supplier or {}).get("business_name") or "Dealer"
    name = (supplier or {}).get("contact_person") or "there"
    if not to:
        return
    reason_block = (
        f"<div style='margin:14px 0;padding:12px 16px;background:#FFF5F5;border-left:3px solid #FF3B30;border-radius:6px;'>"
        f"<div style='font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#86868B;'>Reason</div>"
        f"<div style='margin-top:4px;'>{reason}</div></div>"
        if reason else ""
    )
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#B91C1C;">Your TonersCart account has been suspended</h2>
    <p>Hi {name},</p>
    <p>Your dealer account for <strong>{biz}</strong> has been temporarily suspended on TonersCart.
    Your listings are now hidden from buyers while the matter is reviewed.</p>
    {reason_block}
    <p>Please contact us at <a href="mailto:support@tonerscart.com" style="color:#0A0A0B;font-weight:600;">support@tonerscart.com</a>
    to resolve this. We&apos;ll do our best to help you reinstate your account quickly.</p>
    <p style="margin-top:22px;color:#86868B;font-size:12.5px;">— Team TonersCart</p>
    """
    await _send(to, "Your TonersCart account has been suspended", html)


async def email_dealer_unsuspended(supplier: dict):
    to = (supplier or {}).get("email") or (supplier or {}).get("contact_email")
    biz = (supplier or {}).get("business_name") or "Dealer"
    name = (supplier or {}).get("contact_person") or "there"
    if not to:
        return
    html = f"""
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0A8754;">Your TonersCart account has been reinstated</h2>
    <p>Hi {name},</p>
    <p>Good news — your dealer account for <strong>{biz}</strong> is active again on TonersCart.
    You can now list products and receive orders as usual.</p>
    <p style="margin:18px 0;">
      <a href="https://www.tonerscart.com/supplier"
         style="display:inline-block;padding:12px 22px;background:#F7C600;color:#0A0A0B;border-radius:10px;font-weight:600;text-decoration:none;">
        Open my dashboard
      </a>
    </p>
    <p style="color:#6E6E73;font-size:12.5px;">If you have any questions, just reply to this email.</p>
    """
    await _send(to, "Your TonersCart account has been reinstated", html)

