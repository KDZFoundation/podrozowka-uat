from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.graphics.barcode import qr
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "podrozowka-sra3-proof-8up.pdf"

SHEET_W, SHEET_H = 450 * mm, 320 * mm  # SRA3, landscape
TRIM_W, TRIM_H = 148 * mm, 105 * mm
BLEED = 3 * mm
CELL_W, CELL_H = TRIM_H + 2 * BLEED, TRIM_W + 2 * BLEED  # cards rotated 90 degrees
COLS, ROWS = 4, 2
LEFT = (SHEET_W - COLS * CELL_W) / 2
BOTTOM = (SHEET_H - ROWS * CELL_H) / 2

def crop_marks(c, x, y, w, h):
    c.setStrokeColor(HexColor("#111827")); c.setLineWidth(.25 * mm)
    mark, gap = 5 * mm, 1.5 * mm
    for px, py, sx, sy in [(x, y, -1, -1), (x+w, y, 1, -1), (x, y+h, -1, 1), (x+w, y+h, 1, 1)]:
        c.line(px + sx*gap, py, px + sx*(gap+mark), py)
        c.line(px, py + sy*gap, px, py + sy*(gap+mark))

def qr_code(c, text, x, y, size):
    widget = qr.QrCodeWidget(text)
    drawing = Drawing(size, size)
    drawing.add(widget)
    bounds = widget.getBounds(); bw, bh = bounds[2]-bounds[0], bounds[3]-bounds[1]
    widget.barWidth = size / bw; widget.barHeight = size / bh
    renderPDF.draw(drawing, c, x, y)

def front(c, n):
    c.setFillColor(HexColor("#dff2fb")); c.rect(0, 0, TRIM_W, TRIM_H, fill=1, stroke=0)
    c.setFillColor(HexColor("#b9d9ee")); c.rect(0, 25*mm, TRIM_W, 80*mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#8bbf6a")); c.circle(35*mm, 26*mm, 40*mm, fill=1, stroke=0); c.circle(110*mm, 22*mm, 55*mm, fill=1, stroke=0)
    c.setFillColor(white); c.circle(28*mm, 88*mm, 9*mm, fill=1, stroke=0); c.circle(40*mm, 88*mm, 12*mm, fill=1, stroke=0)
    c.setFillColor(white); c.rect(0, 0, TRIM_W, 25*mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#334155")); c.setFont("Helvetica-Bold", 12); c.drawCentredString(TRIM_W/2, 11*mm, "PODZIĘKOWANIA")
    c.setFont("Helvetica", 6); c.drawRightString(TRIM_W-3*mm, 77*mm, "(C) Autor zdjęcia")
    c.setStrokeColor(HexColor("#475569")); c.setDash(2, 2); c.line(0, 1*mm, TRIM_W, 1*mm); c.setDash()
    c.setFont("Helvetica", 5); c.drawString(3*mm, 3*mm, f"PROOF F{n}")

def back(c, n):
    c.setFillColor(HexColor("#fffefb")); c.rect(0, 0, TRIM_W, TRIM_H, fill=1, stroke=0)
    c.setFillColor(HexColor("#1f4d3f")); c.setFont("Helvetica-Bold", 14); c.drawString(7*mm, 93*mm, "Podróżówka")
    c.setFillColor(HexColor("#64748b")); c.setFont("Helvetica", 6); c.drawString(8*mm, 88*mm, "odwrócona pocztówka")
    c.setStrokeColor(HexColor("#64748b")); c.setLineWidth(.35*mm); c.circle(45*mm, 54*mm, 23*mm, stroke=1, fill=0)
    c.setFillColor(HexColor("#dc2626")); c.rect(43*mm, 52*mm, 8*mm, 4*mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#334155")); c.setFont("Helvetica", 5); c.drawCentredString(47*mm, 35*mm, "EUROPA / POLSKA")
    c.setStrokeColor(HexColor("#334155")); c.setDash(2, 2); c.line(20*mm, 43*mm, 70*mm, 65*mm); c.setDash()
    for i in range(4): c.line(83*mm, (68-i*11)*mm, 140*mm, (68-i*11)*mm)
    qr_code(c, f"https://podrozowka.pl/r/PROOF-{n:02d}", 116*mm, 8*mm, 20*mm)
    c.setFillColor(HexColor("#1f4d3f")); c.setFont("Helvetica-Bold", 7); c.drawRightString(112*mm, 16*mm, "ZESKANUJ")
    c.setFont("Helvetica", 5); c.drawString(3*mm, 3*mm, f"PROOF B{n}")

def place(c, col, row, n, side):
    x, y = LEFT + col*CELL_W, BOTTOM + row*CELL_H
    crop_marks(c, x+BLEED, y+BLEED, TRIM_H, TRIM_W)
    c.saveState(); c.translate(x+BLEED, y+BLEED); c.rotate(90)
    (front if side == "front" else back)(c, n)
    c.restoreState()

OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=(SHEET_W, SHEET_H))
c.setTitle("Podróżówka - proof SRA3 8-up")
for side in ("front", "back"):
    c.setFillColor(black); c.setFont("Helvetica-Bold", 7)
    c.drawString(8*mm, SHEET_H-6*mm, f"PODRÓŻÓWKA | SRA3 | 8-UP | {side.upper()} | 3 mm BLEED | FLIP ON SHORT EDGE")
    for row in range(ROWS):
        for col in range(COLS):
            # Back sheet is reversed left-to-right for short-edge duplex proofing.
            n = row*COLS + col + 1 if side == "front" else row*COLS + (COLS-col)
            place(c, col, row, n, side)
    c.showPage()
c.save()
print(OUT)
