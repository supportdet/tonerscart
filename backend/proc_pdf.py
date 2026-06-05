"""ReportLab PDF generation for the Procurement module — formal quotations.

Pure-Python (no system deps). Uses 'Rs.' for currency since the core
Helvetica fonts don't carry the ₹ glyph.
"""
from io import BytesIO
from datetime import datetime

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
    ss.add(ParagraphStyle("DocType", fontName="Helvetica-Bold", fontSize=13, textColor=TEAL, alignment=2))
    ss.add(ParagraphStyle("Meta", fontName="Helvetica", fontSize=9, textColor=INK, alignment=2, leading=13))
    ss.add(ParagraphStyle("H", fontName="Helvetica-Bold", fontSize=9.5, textColor=INK, leading=13, spaceBefore=4, spaceAfter=3))
    ss.add(ParagraphStyle("Body", fontName="Helvetica", fontSize=9, textColor=INK, leading=13))
    ss.add(ParagraphStyle("Small", fontName="Helvetica", fontSize=8, textColor=MUTED, leading=11))
    ss.add(ParagraphStyle("CellL", fontName="Helvetica", fontSize=8, textColor=INK, leading=10))
    ss.add(ParagraphStyle("CellLb", fontName="Helvetica-Bold", fontSize=8, textColor=INK, leading=10))
    return ss


def build_quotation_pdf(quotation: dict, user: dict) -> bytes:
    """Returns the quotation PDF as bytes."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Quotation {quotation.get('ref_number')}",
    )
    ss = _styles()
    el = []

    is_govt = user.get("type") == "govt"
    ref = quotation.get("ref_number", "")
    created = (quotation.get("created_at") or datetime.utcnow().isoformat())[:10]
    valid = (quotation.get("expires_at") or "")[:10]

    # ---- Header band ----
    brand = Paragraph('Toners<font color="#00B7C7">Cart</font>', ss["Brand"])
    tag = Paragraph("India&apos;s printer, toner &amp; supplies marketplace", ss["Tag"])
    meta = Paragraph(
        f"<b>TAX QUOTATION</b><br/>Ref: <b>{ref}</b><br/>Date: {created}<br/>"
        f'Valid until: <b>{valid}</b> (7 days)',
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
        f"<b>{user.get('org_name', '')}</b>",
        f"{'Government Department' if is_govt else 'Corporate'} &nbsp;|&nbsp; Contact: {user.get('name', '')}"
        + (f", {user.get('designation')}" if user.get("designation") else ""),
        user.get("address", "") or "",
    ]
    if is_govt and user.get("ministry_state"):
        buyer_lines.append(f"Ministry / State: {user.get('ministry_state')}")
    if not is_govt and user.get("gst_number"):
        buyer_lines.append(f"GSTIN: <b>{user.get('gst_number')}</b>")
    buyer_lines.append(f"Email: {user.get('email', '')} &nbsp;|&nbsp; Phone: {user.get('phone', '') or '—'}")

    el.append(Paragraph("QUOTATION FOR", ss["Small"]))
    el.append(Paragraph("<br/>".join([b for b in buyer_lines if b]), ss["Body"]))
    el.append(Spacer(1, 8))
    el.append(Paragraph(
        f"<b>Item:</b> {quotation.get('product_label', '')} &nbsp;&nbsp; <b>Quantity:</b> {quotation.get('qty', 1)} unit(s)",
        ss["Body"],
    ))
    el.append(Spacer(1, 10))

    # ---- Comparison table ----
    qty = int(quotation.get("qty") or 1)
    head = ["Rank", "Supplier", "Unit (ex GST)", "GST%", "GST Amt", "Total (inc GST)", "Stock", "Delivery", "City", "Rating"]
    data = [[Paragraph(f"<b>{h}</b>", ss["CellLb"]) for h in head]]
    for it in quotation.get("items", []):
        line_total = float(it.get("total_price", 0)) * qty
        gst_amt = float(it.get("gst_amount", 0)) * qty
        verified = " ✓" if it.get("verified") else ""
        data.append([
            Paragraph(f"<b>{it.get('rank', '')}</b>", ss["CellLb"]),
            Paragraph(f"{it.get('supplier_name', '—')}{verified}<br/><font size=7 color='#6E6E73'>{it.get('brand', '')} {it.get('model_number', '')}</font>", ss["CellL"]),
            Paragraph(rs(it.get("unit_price")), ss["CellL"]),
            Paragraph(f"{it.get('gst_rate', 18)}%", ss["CellL"]),
            Paragraph(rs(gst_amt), ss["CellL"]),
            Paragraph(f"<b>{rs(line_total)}</b>", ss["CellLb"]),
            Paragraph(str(it.get("stock", "—")), ss["CellL"]),
            Paragraph(f"{it.get('delivery_days', '—')} days", ss["CellL"]),
            Paragraph(it.get("city", "—") or "—", ss["CellL"]),
            Paragraph(f"{it.get('rating', '—')}", ss["CellL"]),
        ])
    tbl = Table(data, colWidths=[12 * mm, 36 * mm, 20 * mm, 11 * mm, 18 * mm, 23 * mm, 12 * mm, 16 * mm, 14 * mm, 12 * mm], repeatRows=1)
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
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#E6F7F9")),  # highlight L1
        ("ROWBACKGROUNDS", (0, 2), (-1, -1), [colors.white, LIGHT]),
    ]))
    el.append(tbl)
    el.append(Spacer(1, 6))
    el.append(Paragraph(
        "L1 is the lowest total price (inclusive of GST). Prices shown are per the quantity requested. "
        "Header colour denotes the recommended L1 supplier.", ss["Small"]))
    el.append(Spacer(1, 14))

    # ---- Terms ----
    el.append(Paragraph("Terms &amp; Conditions", ss["H"]))
    terms = [
        "This quotation is valid for 7 days from the date of issue.",
        "Prices are inclusive of GST at the rates shown; HSN-wise breakup is provided on the tax invoice.",
        "Delivery timelines are indicative and counted in business days from confirmed order.",
        "Payment terms for approved procurement accounts: NEFT / RTGS / Cheque, net 30 days from delivery.",
        "Orders are subject to stock availability at the time of confirmation.",
        "All disputes are subject to jurisdiction as per TonersCart's standard terms.",
    ]
    for t in terms:
        el.append(Paragraph(f"•&nbsp; {t}", ss["Small"]))
    el.append(Spacer(1, 22))

    # ---- Signature block ----
    sig = Table([
        [Paragraph("For TonersCart", ss["Small"]), Paragraph("Authorised buyer signature", ss["Small"])],
        [Paragraph("<br/><br/>_______________________<br/>Authorised Signatory", ss["Body"]),
         Paragraph(f"<br/><br/>_______________________<br/>{user.get('name', '')} ({user.get('org_name', '')})", ss["Body"])],
    ], colWidths=[84 * mm, 84 * mm])
    sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    el.append(sig)

    doc.build(el)
    return buf.getvalue()
