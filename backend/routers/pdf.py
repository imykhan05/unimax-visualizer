"""Server-side PDF report (ReportLab).

The frontend normally builds the PDF itself with jsPDF; this endpoint exists so
the report can also be produced from a script, a mobile browser that chokes on
canvas export, or any future integration.
"""

import base64
import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas

router = APIRouter(prefix="/api", tags=["pdf"])

NAVY = colors.HexColor("#0F1C2E")
ACCENT = colors.HexColor("#2A5ABB")
ORANGE = colors.HexColor("#E85D20")
MUTED = colors.HexColor("#4A6A90")
BORDER = colors.HexColor("#1E3050")


class AppliedShade(BaseModel):
    code: str
    name: str
    hex: str


class ExportPdfRequest(BaseModel):
    original_image_base64: str
    painted_image_base64: str
    applied_shades: List[AppliedShade] = Field(default_factory=list)
    customer_name: str = ""
    notes: str = ""
    project_date: Optional[str] = None


def _decode_image(data_uri: str, label: str) -> ImageReader:
    payload = data_uri.split(",", 1)[-1] if data_uri.startswith("data:") else data_uri
    try:
        return ImageReader(io.BytesIO(base64.b64decode(payload)))
    except Exception:
        raise HTTPException(400, f"Could not decode {label} image")


def _draw_fitted(c, reader, x, y, box_w, box_h):
    """Draw the image contained inside the box, centred, aspect preserved."""
    iw, ih = reader.getSize()
    scale = min(box_w / iw, box_h / ih)
    w, h = iw * scale, ih * scale
    c.drawImage(
        reader, x + (box_w - w) / 2, y + (box_h - h) / 2, width=w, height=h,
        preserveAspectRatio=True, mask="auto",
    )


@router.post("/export-pdf")
async def export_pdf(req: ExportPdfRequest):
    original = _decode_image(req.original_image_base64, "original")
    painted = _decode_image(req.painted_image_base64, "painted")

    stamp = req.project_date or datetime.now().strftime("%d %B %Y")
    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    margin = 16 * mm
    content_w = page_w - 2 * margin

    # ---- Header -----------------------------------------------------------
    c.setFillColor(NAVY)
    c.rect(0, page_h - 34 * mm, page_w, 34 * mm, stroke=0, fill=1)
    c.setFillColor(ORANGE)
    c.rect(0, page_h - 36 * mm, page_w, 2 * mm, stroke=0, fill=1)

    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(margin, page_h - 18 * mm, "UNIMAX PAINTS")
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor("#7A9FCC"))
    c.drawString(margin, page_h - 25 * mm, "Color Preview Report")
    c.setFont("Helvetica", 9)
    c.drawRightString(page_w - margin, page_h - 18 * mm, stamp)
    if req.customer_name:
        c.drawRightString(page_w - margin, page_h - 24 * mm, f"Customer: {req.customer_name}")

    y = page_h - 46 * mm

    # ---- Section 1: before / after ---------------------------------------
    styles = getSampleStyleSheet()
    label = ParagraphStyle("label", parent=styles["Normal"], fontSize=10,
                           textColor=MUTED, fontName="Helvetica-Bold")

    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "1. Before  /  After")
    y -= 6 * mm

    box_w = (content_w - 6 * mm) / 2
    box_h = 62 * mm
    for idx, (reader, caption) in enumerate(((original, "Original Photo"), (painted, "Painted Preview"))):
        bx = margin + idx * (box_w + 6 * mm)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.8)
        c.rect(bx, y - box_h, box_w, box_h, stroke=1, fill=0)
        _draw_fitted(c, reader, bx + 2 * mm, y - box_h + 2 * mm, box_w - 4 * mm, box_h - 4 * mm)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(bx + box_w / 2, y - box_h - 5 * mm, caption)

    y = y - box_h - 14 * mm

    # ---- Section 2: applied shades ---------------------------------------
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "2. Applied Shades")
    y -= 7 * mm

    header_h = 7 * mm
    row_h = 8 * mm
    cols = [margin, margin + 22 * mm, margin + 95 * mm, margin + 130 * mm]

    c.setFillColor(colors.HexColor("#EDF2FA"))
    c.rect(margin, y - header_h, content_w, header_h, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 9)
    for cx, title in zip(cols, ("SWATCH", "SHADE NAME", "CODE", "HEX")):
        c.drawString(cx + 2 * mm, y - header_h + 2.4 * mm, title)
    y -= header_h

    if not req.applied_shades:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(margin + 2 * mm, y - 5.5 * mm, "No shades applied.")
        y -= row_h
    else:
        c.setFont("Helvetica", 9)
        for i, shade in enumerate(req.applied_shades):
            if y < 55 * mm:  # keep room for info + footer
                c.showPage()
                y = page_h - margin
                c.setFont("Helvetica", 9)
            if i % 2 == 1:
                c.setFillColor(colors.HexColor("#F7F9FC"))
                c.rect(margin, y - row_h, content_w, row_h, stroke=0, fill=1)
            try:
                swatch = colors.HexColor(shade.hex)
            except Exception:
                swatch = colors.grey
            c.setFillColor(swatch)
            c.setStrokeColor(BORDER)
            c.rect(cols[0] + 2 * mm, y - row_h + 1.6 * mm, 14 * mm, row_h - 3.2 * mm, stroke=1, fill=1)
            c.setFillColor(NAVY)
            c.drawString(cols[1] + 2 * mm, y - row_h + 2.6 * mm, shade.name)
            c.drawString(cols[2] + 2 * mm, y - row_h + 2.6 * mm, shade.code)
            c.drawString(cols[3] + 2 * mm, y - row_h + 2.6 * mm, shade.hex.upper())
            y -= row_h

    y -= 8 * mm

    # ---- Section 3: project info -----------------------------------------
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "3. Project Information")
    y -= 7 * mm

    c.setFont("Helvetica", 9)
    c.setFillColor(NAVY)
    c.drawString(margin, y, f"Customer: {req.customer_name or '—'}")
    y -= 5.5 * mm
    c.drawString(margin, y, f"Date: {stamp}")
    y -= 5.5 * mm

    notes_style = ParagraphStyle(
        "notes", parent=styles["Normal"], fontSize=9, leading=12,
        textColor=NAVY,
    )
    from reportlab.platypus import Paragraph  # local import keeps module load light

    para = Paragraph(f"<b>Notes:</b> {(req.notes or '—').replace(chr(10), '<br/>')}", notes_style)
    _, ph = para.wrap(content_w, 60 * mm)
    para.drawOn(c, margin, y - ph)

    # ---- Footer -----------------------------------------------------------
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.8)
    c.line(margin, 16 * mm, page_w - margin, 16 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(margin, 11 * mm, "Unimax Paint Industries — Islamic Republic of Pakistan")
    c.drawRightString(page_w - margin, 11 * mm, stamp)

    c.showPage()
    c.save()

    return {"pdf_base64": base64.b64encode(buf.getvalue()).decode("ascii")}
