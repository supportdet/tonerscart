"""ReportLab PDF generation for procurement Tax Invoices.

A formal tax invoice produced when a procurement order is confirmed. Shares
the visual language (CMYK header band + INK/TEAL palette) with the existing
quotation PDF, but renders the chosen supplier line items, GST breakup,
net-30 terms and payment instructions.
"""
from io import BytesIO
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)

INK = colors.HexColor("#0A0A0B")
TEAL = colors.HexColor("#00B7C7")
MUTED = colors.HexColor("#6E6E73")
LIGHT = colors.HexColor("#F2F4F7")
LINE = colors.HexColor("#D9DCE1")


def rs(n) -> str:
    try:
        return f"Rs. {float(n or 0):,.2f}"
    except Exception:
        return "Rs. 0.00"


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=22, textColor=INK, leading=24))
    ss.add(ParagraphStyle("Tag", fontName="Helvetica", fontSize=8.5, textColor=MUTED, leading=11))
    ss.add(ParagraphStyle("Meta", fontName="Helvetica", fontSize=9, textColor=INK, alignment=2, leading=13))
    ss.add(ParagraphStyle("H", fontName="Helvetica-Bold", fontSize=9.5, textColor=INK, leading=13, spaceBefore=4, spaceAfter=3))
    ss.add(ParagraphStyle("Body", fontName="Helvetica", fontSize=9, textColor=INK, leading=13))
    ss.add(ParagraphStyle("Small", fontName="Helvetica", fontSize=8, textColor=MUTED, leading=11))
    ss.add(ParagraphStyle("CellL", fontName="Helvetica", fontSize=8, textColor=INK, leading=10))
    ss.add(ParagraphStyle("CellLb", fontName="Helvetica-Bold", fontSize=8, textColor=INK, leading=10))
    ss.add(ParagraphStyle("Total", fontName="Helvetica-Bold", fontSize=11, textColor=INK, alignment=2, leading=14))
    return ss


def build_invoice_pdf(order: dict, user: dict) -> bytes:
    """Returns a tax-invoice PDF as bytes for a confirmed procurement order."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Invoice {order.get('ref_number')}",
    )
    ss = _styles()
    el = []

    is_govt = user.get("type") == "govt"
    ref = order.get("ref_number", "")
    created = (order.get("created_at") or datetime.now(timezone.utc).isoformat())[:10]
    due = (order.get("payment_due_date") or "")[:10]

    # ---- Header band ----
    brand = Paragraph('Toners<font color="#00B7C7">Cart</font>', ss["Brand"])
    tag = Paragraph("India&apos;s printer, toner &amp; supplies marketplace", ss["Tag"])
    meta = Paragraph(
        f"<b>TAX INVOICE</b><br/>Invoice no.: <b>{ref}</b><br/>Date: {created}<br/>"
        f"Payment due: <b>{due}</b> (net-30)",
        ss["Meta"],
    )
    header = Table([[[brand, tag], meta]], colWidths=[95 * mm, 73 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    el.append(header)
    el.append(Spacer(1, 6))
    el.append(HRFlowable(width="100%", thickness=1, color=TEAL))
    el.append(Spacer(1, 10))

    # ---- Buyer block ----
    buyer_lines = [
        f"<b>{user.get('org_name', '') or ''}</b>",
        f"{'Government Department' if is_govt else 'Corporate'} &nbsp;|&nbsp; Contact: {user.get('name', '') or ''}"
        + (f", {user.get('designation')}" if user.get("designation") else ""),
        user.get("address", "") or "",
    ]
    if is_govt and user.get("ministry_state"):
        buyer_lines.append(f"Ministry / State: {user.get('ministry_state')}")
    if not is_govt and user.get("gst_number"):
        buyer_lines.append(f"GSTIN: <b>{user.get('gst_number')}</b>")
    buyer_lines.append(f"Email: {user.get('email', '') or ''} &nbsp;|&nbsp; Phone: {user.get('phone', '') or '—'}")

    el.append(Paragraph("BILL TO", ss["Small"]))
    el.append(Paragraph("<br/>".join([b for b in buyer_lines if b]), ss["Body"]))
    el.append(Spacer(1, 12))

    # ---- Supplier (snapshot) ----
    el.append(Paragraph("SUPPLIED BY (FULFILLMENT PARTNER)", ss["Small"]))
    sup_lines = [
        f"<b>{order.get('supplier_name', '') or '—'}</b>",
        f"Selected rank: <b>{order.get('rank') or 'L1'}</b>",
    ]
    el.append(Paragraph("<br/>".join(sup_lines), ss["Body"]))
    el.append(Spacer(1, 10))

    # ---- Line-items table ----
    qty = int(order.get("qty") or 1)
    items = order.get("items") or []
    head = ["#", "Description", "HSN/SAC", "Qty", "Unit (ex GST)", "GST%", "GST Amt", "Line total"]
    data = [[Paragraph(f"<b>{h}</b>", ss["CellLb"]) for h in head]]
    subtotal = 0.0
    gst_total = 0.0
    grand_total = 0.0
    for i, it in enumerate(items, start=1):
        unit = float(it.get("unit_price") or 0)
        gst_rate = float(it.get("gst_rate") or 18)
        gst_amt_unit = float(it.get("gst_amount") or 0)
        total_per_unit = float(it.get("total_price") or (unit + gst_amt_unit))
        line_subtotal = unit * qty
        line_gst = gst_amt_unit * qty
        line_total = total_per_unit * qty
        subtotal += line_subtotal
        gst_total += line_gst
        grand_total += line_total
        desc = f"<b>{it.get('brand', '') or ''} {it.get('model_number', '') or ''}</b>"
        if it.get("description"):
            desc += f"<br/><font size=7 color='#6E6E73'>{it.get('description')}</font>"
        data.append([
            Paragraph(str(i), ss["CellL"]),
            Paragraph(desc, ss["CellL"]),
            Paragraph(it.get("hsn") or it.get("hsn_code") or "—", ss["CellL"]),
            Paragraph(str(qty), ss["CellL"]),
            Paragraph(rs(unit), ss["CellL"]),
            Paragraph(f"{gst_rate:g}%", ss["CellL"]),
            Paragraph(rs(line_gst), ss["CellL"]),
            Paragraph(f"<b>{rs(line_total)}</b>", ss["CellLb"]),
        ])
    tbl = Table(data, colWidths=[8 * mm, 55 * mm, 18 * mm, 11 * mm, 22 * mm, 12 * mm, 20 * mm, 28 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ]))
    el.append(tbl)
    el.append(Spacer(1, 6))

    # Fallback: order may store only a top-level total (legacy rows).
    if grand_total <= 0:
        grand_total = float(order.get("total_amount") or 0)
        gst_total = round(grand_total * 18 / 118, 2)  # back-calc 18%
        subtotal = round(grand_total - gst_total, 2)

    # ---- Totals ----
    totals = Table([
        ["", Paragraph("Subtotal (ex GST)", ss["Body"]), Paragraph(rs(subtotal), ss["Body"])],
        ["", Paragraph("GST (total)", ss["Body"]), Paragraph(rs(gst_total), ss["Body"])],
        ["", Paragraph("<b>Total payable</b>", ss["Total"]), Paragraph(f"<b>{rs(grand_total)}</b>", ss["Total"])],
    ], colWidths=[80 * mm, 50 * mm, 38 * mm])
    totals.setStyle(TableStyle([
        ("LINEABOVE", (1, -1), (-1, -1), 0.6, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(totals)
    el.append(Spacer(1, 14))

    # ---- Payment + terms ----
    el.append(Paragraph("Payment instructions", ss["H"]))
    pay_lines = [
        f"<b>Net 30 days</b> from delivery — due by <b>{due or 'date of delivery + 30 days'}</b>.",
        "Bank transfer (NEFT / RTGS / IMPS) preferred. Account details will be shared via support@tonerscart.com on request.",
        "Cheques are accepted in favour of <b>TonersCart Technologies Pvt. Ltd.</b>",
        "Quote the invoice reference above on every remittance.",
    ]
    for t in pay_lines:
        el.append(Paragraph(f"•&nbsp; {t}", ss["Small"]))
    el.append(Spacer(1, 10))

    el.append(Paragraph("Terms &amp; Conditions", ss["H"]))
    terms = [
        "Goods once delivered & accepted are non-returnable except for the dealer-shipped wrong model or DOA within 48 hours (with photo proof).",
        "Delivery is fulfilled by the listed supplier; TonersCart facilitates the transaction and collects a referral fee from the supplier.",
        "All disputes are subject to jurisdiction as per TonersCart's standard procurement terms (see /procurement-terms).",
        "GST shown is for the supplier's state-of-supply at the time of order.",
    ]
    for t in terms:
        el.append(Paragraph(f"•&nbsp; {t}", ss["Small"]))
    el.append(Spacer(1, 18))

    # ---- Signature block ----
    sig = Table([
        [Paragraph("For TonersCart", ss["Small"]), Paragraph("Buyer", ss["Small"])],
        [Paragraph("<br/><br/>_______________________<br/>Authorised Signatory", ss["Body"]),
         Paragraph(f"<br/><br/>_______________________<br/>{user.get('name', '') or ''} ({user.get('org_name', '') or ''})", ss["Body"])],
    ], colWidths=[84 * mm, 84 * mm])
    sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    el.append(sig)

    doc.build(el)
    return buf.getvalue()
