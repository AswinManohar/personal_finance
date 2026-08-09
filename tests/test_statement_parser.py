import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fpdf import FPDF

from api.statement_review.parser import extract_text
from api.statement_review.errors import PdfUnreadableError


def make_pdf(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_extracts_text_from_pdf():
    pdf_bytes = make_pdf(["Statement June 2026",
                          "01.06.2026 REWE -54.30",
                          "15.06.2026 Netflix -12.99"])
    text = extract_text(pdf_bytes)
    assert "REWE" in text
    assert "Netflix" in text


def test_not_a_pdf_raises_typed_error():
    with pytest.raises(PdfUnreadableError):
        extract_text(b"this is not a pdf at all")


def test_empty_text_layer_raises_typed_error():
    with pytest.raises(PdfUnreadableError, match="text layer"):
        extract_text(make_pdf([]))
