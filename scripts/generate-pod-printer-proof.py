from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output" / "pdf" / "WZOR_PACZKI_POD_DLA_DRUKARNI.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("DejaVu", r"C:\Windows\Fonts\DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"))

RED = colors.HexColor("#cd1f26")
INK = colors.HexColor("#2d221e")
MUTED = colors.HexColor("#75655b")
PAPER = colors.HexColor("#fbf8f4")
LINE = colors.HexColor("#ddd2c8")


def text(c, value, x, y, size=10, bold=False, color=INK):
    c.setFont("DejaVu-Bold" if bold else "DejaVu", size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def wrapped(c, value, x, y, max_width, size=10, leading=14, bold=False, color=INK):
    c.setFont("DejaVu-Bold" if bold else "DejaVu", size)
    c.setFillColor(color)
    words = value.split()
    line, lines = "", []
    for word in words:
        candidate = f"{line} {word}".strip()
        if c.stringWidth(candidate, "DejaVu-Bold" if bold else "DejaVu", size) <= max_width:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    for index, line in enumerate(lines):
        c.drawString(x, y - index * leading, line)
    return y - len(lines) * leading


def header(c, title, subtitle, page_width, page_height):
    c.setFillColor(RED)
    c.rect(0, page_height - 9 * mm, page_width, 9 * mm, stroke=0, fill=1)
    text(c, title, 16 * mm, page_height - 21 * mm, 18, True)
    text(c, subtitle, 16 * mm, page_height - 28 * mm, 9.5, False, MUTED)
    c.setStrokeColor(LINE)
    c.line(16 * mm, page_height - 33 * mm, page_width - 16 * mm, page_height - 33 * mm)


def page_cover(c):
    w, h = 210 * mm, 297 * mm
    header(c, "WZÓR PACZKI PRODUKCYJNEJ POD", "Dokument demonstracyjny do akceptacji przez drukarnię", w, h)
    y = h - 47 * mm
    text(c, "POD-20260813-01", 16 * mm, y, 14, True)
    y -= 8 * mm
    text(c, "Data produkcji: 13.08.2026 | 3 zamówienia | 18 Podróżówek | 3 metody doręczenia", 16 * mm, y, 9.5, False, MUTED)
    y -= 17 * mm
    c.setFillColor(PAPER)
    c.setStrokeColor(LINE)
    c.roundRect(16 * mm, y - 80 * mm, w - 32 * mm, 80 * mm, 4 * mm, stroke=1, fill=1)
    text(c, "Co otrzymuje drukarnia", 23 * mm, y - 12 * mm, 12, True)
    bullets = [
        ("1. PDF produkcyjny SRA3", "Arkusze 320 x 450 mm, 8 Podróżówek na stronę, front i rewers w trybie duplex - flip on short edge."),
        ("2. Manifest kompletacyjny", "Każde zamówienie ma odrębną kartę z liczbą kartek, metodą doręczenia i adresem lub punktem odbioru."),
        ("3. Etykiety przewoźnika", "Nie są częścią tego PDF. Powstają osobno w systemie InPost, ORLEN Paczka albo wybranego kuriera."),
    ]
    bullet_y = y - 25 * mm
    for heading, description in bullets:
        text(c, heading, 25 * mm, bullet_y, 10, True)
        bullet_y = wrapped(c, description, 25 * mm, bullet_y - 5 * mm, w - 55 * mm, 8.8, 12, color=MUTED) - 5 * mm
    y -= 101 * mm
    text(c, "Parametry produkcyjne SRA3", 16 * mm, y, 12, True)
    y -= 8 * mm
    rows = [
        ("Format arkusza", "SRA3 320 x 450 mm, pion"),
        ("Format netto Podróżówki", "148 x 105 mm"),
        ("Spad", "3 mm z każdej strony"),
        ("Znaczniki cięcia", "2,5 mm dodatkowego odstępu od końca spadu"),
        ("Druk dwustronny", "obrot po krótszej krawędzi (short-edge flip)"),
        ("Struktura pliku", "front arkusza, następnie odpowiadający mu rewers"),
    ]
    for label, value in rows:
        c.setStrokeColor(LINE)
        c.line(16 * mm, y - 3 * mm, w - 16 * mm, y - 3 * mm)
        text(c, label, 18 * mm, y - 9 * mm, 9, True)
        text(c, value, 76 * mm, y - 9 * mm, 9, False, MUTED)
        y -= 12 * mm
    text(c, "WZÓR - nie zawiera danych osobowych ani prawdziwych kodów QR", 16 * mm, 14 * mm, 8, False, MUTED)
    c.showPage()


def draw_crop_marks(c, x, y, trim_w, trim_h, bleed):
    # Crop marks start outside a bleed + 2.5 mm safe gap.
    safe = 2.5 * mm
    gap = bleed + safe
    c.setStrokeColor(colors.HexColor("#141414"))
    c.setLineWidth(0.35)
    c.line(x, y + bleed, x + bleed - gap, y + bleed)
    c.line(x + trim_w + bleed + gap, y + bleed, x + trim_w + 2 * bleed, y + bleed)
    c.line(x, y + trim_h + bleed, x + bleed - gap, y + trim_h + bleed)
    c.line(x + trim_w + bleed + gap, y + trim_h + bleed, x + trim_w + 2 * bleed, y + trim_h + bleed)
    c.line(x + bleed, y, x + bleed, y + bleed - gap)
    c.line(x + bleed, y + trim_h + bleed + gap, x + bleed, y + trim_h + 2 * bleed)
    c.line(x + trim_w + bleed, y, x + trim_w + bleed, y + bleed - gap)
    c.line(x + trim_w + bleed, y + trim_h + bleed + gap, x + trim_w + bleed, y + trim_h + 2 * bleed)


def page_sra3(c, back=False):
    w, h = 320 * mm, 450 * mm
    c.setFillColor(colors.white)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    trim_w, trim_h, bleed = 148 * mm, 105 * mm, 3 * mm
    slot_w, slot_h = trim_w + 2 * bleed, trim_h + 2 * bleed
    left, top = (w - 2 * slot_w) / 2, (h - 4 * slot_h) / 2
    labels = ["TATRY", "WROCŁAW", "WISŁA", "KASZUBY", "MAZURY", "GDAŃSK", "BIESZCZADY", "KRAKÓW"]
    colorset = [colors.HexColor(v) for v in ["#d9e6ed", "#e9c7b5", "#d8e1b9", "#eedab6", "#b8d2d7", "#e7c3bd", "#c9d7ae", "#e2c6ae"]]
    for i, label in enumerate(labels):
        row = 3 - (i // 2) if back else i // 2
        col = i % 2
        x, y = left + col * slot_w, top + row * slot_h
        c.setFillColor(colorset[i])
        c.rect(x, y, slot_w, slot_h, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.roundRect(x + 11 * mm, y + 12 * mm, trim_w - 22 * mm, trim_h - 24 * mm, 3 * mm, fill=1, stroke=0)
        if not back:
            c.setFillColor(INK)
            c.setFont("DejaVu-Bold", 13)
            c.drawCentredString(x + slot_w / 2, y + slot_h / 2 + 9 * mm, "PODRÓŻÓWKA")
            c.setFont("DejaVu", 8)
            c.setFillColor(MUTED)
            c.drawCentredString(x + slot_w / 2, y + slot_h / 2 + 3 * mm, label)
            c.setStrokeColor(RED)
            c.setLineWidth(1.1)
            c.line(x + 31 * mm, y + slot_h / 2 - 3 * mm, x + slot_w - 31 * mm, y + slot_h / 2 - 3 * mm)
            c.setFillColor(RED)
            c.setFont("DejaVu", 8)
            c.drawCentredString(x + slot_w / 2, y + slot_h / 2 - 11 * mm, "Dziękuję, że jesteś częścią mojej podróży")
        else:
            c.setFillColor(INK)
            c.setFont("DejaVu-Bold", 10)
            c.drawString(x + 15 * mm, y + slot_h - 22 * mm, "PODRÓŻÓWKA")
            c.setFont("DejaVu", 7)
            c.setFillColor(MUTED)
            c.drawString(x + 15 * mm, y + slot_h - 29 * mm, label)
            c.setStrokeColor(LINE)
            for line in range(4):
                c.line(x + 20 * mm, y + 45 * mm - line * 11 * mm, x + slot_w - 55 * mm, y + 45 * mm - line * 11 * mm)
            c.setFillColor(colors.HexColor("#1a1a1a"))
            c.rect(x + slot_w - 40 * mm, y + 21 * mm, 18 * mm, 18 * mm, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("DejaVu-Bold", 5)
            c.drawCentredString(x + slot_w - 31 * mm, y + 29 * mm, "QR")
            c.setFillColor(MUTED)
            c.setFont("DejaVu", 6)
            c.drawCentredString(x + slot_w - 31 * mm, y + 15 * mm, "PRZYKŁAD")
        draw_crop_marks(c, x, y, trim_w, trim_h, bleed)
    text(c, f"WZÓR SRA3 - {'REWERS' if back else 'FRONT'} - 8 UP - DUPLEX SHORT EDGE", 10 * mm, 8 * mm, 7, False, MUTED)
    c.showPage()


def page_manifest(c):
    w, h = 210 * mm, 297 * mm
    header(c, "MANIFEST KOMPLETACYJNY", "Wzór dokumentu towarzyszącego paczce produkcyjnej POD", w, h)
    orders = [
        ("ORD-260813-01A2", "10 Podróżówek", "InPost Paczkomat", ["Paczkomat: WAW01M", "ul. Przykładowa 1", "00-001 Warszawa"]),
        ("ORD-260813-02B4", "5 Podróżówek", "InPost Kurier", ["Anna Kowalska", "ul. Leśna 12/4", "80-001 Gdańsk"]),
        ("ORD-260813-03C7", "3 Podróżówki", "ORLEN Paczka", ["Punkt: ORLEN GDA123", "ul. Nadmorska 20", "81-001 Gdynia"]),
    ]
    y = h - 48 * mm
    for idx, (number, quantity, method, address) in enumerate(orders, 1):
        block_h = 57 * mm
        c.setFillColor(PAPER)
        c.setStrokeColor(LINE)
        c.roundRect(16 * mm, y - block_h, w - 32 * mm, block_h, 4 * mm, stroke=1, fill=1)
        c.setFillColor(RED)
        c.roundRect(21 * mm, y - 12 * mm, 28 * mm, 8 * mm, 2 * mm, fill=1, stroke=0)
        text(c, f"POZYCJA {idx:02d}", 25 * mm, y - 9 * mm, 7.5, True, colors.white)
        text(c, number, 56 * mm, y - 9 * mm, 11, True)
        text(c, f"{quantity} | {method}", 56 * mm, y - 16 * mm, 8.5, False, MUTED)
        text(c, "DANE DO KOMPLETACJI", 23 * mm, y - 28 * mm, 8, True)
        for line, item in enumerate(address):
            text(c, item, 23 * mm, y - 35 * mm - line * 5 * mm, 9.5, False)
        text(c, "Etykieta przewoźnika tworzona osobno przez API", 23 * mm, y - block_h + 8 * mm, 8, False, MUTED)
        y -= block_h + 8 * mm
    text(c, "WZÓR - bez danych osobowych. Dokument nie jest etykietą przewoźnika.", 16 * mm, 14 * mm, 8, False, MUTED)
    c.showPage()


def main():
    c = canvas.Canvas(str(OUTPUT), pagesize=(210 * mm, 297 * mm))
    c.setTitle("Wzór paczki produkcyjnej POD dla drukarni")
    c.setAuthor("Podróżówka")
    page_cover(c)
    page_sra3(c, back=False)
    page_sra3(c, back=True)
    page_manifest(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
