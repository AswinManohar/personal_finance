"""Local PDF → text. No network involved."""
from io import BytesIO

from pypdf import PdfReader

from api.statement_review.errors import PdfUnreadableError


def extract_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise PdfUnreadableError(f"Could not read PDF: {exc}") from exc
    if len(text.strip()) < 50:
        raise PdfUnreadableError(
            "PDF has no usable text layer (scanned image?). OCR is not supported."
        )
    return text
