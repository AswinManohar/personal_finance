class StatementReviewError(Exception):
    """Base for pipeline errors; `code` is the machine-readable API error code."""
    code = "STATEMENT_REVIEW_ERROR"


class PdfUnreadableError(StatementReviewError):
    code = "PDF_UNREADABLE"


class ExtractionFailedError(StatementReviewError):
    code = "EXTRACTION_FAILED"


class LlmUnavailableError(StatementReviewError):
    code = "LLM_UNAVAILABLE"


class NoTransactionsFoundError(StatementReviewError):
    code = "NO_TRANSACTIONS_FOUND"
