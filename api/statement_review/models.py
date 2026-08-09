from typing import Literal
from pydantic import BaseModel


class StatementTransaction(BaseModel):
    date: str                    # ISO YYYY-MM-DD
    description: str
    amount: float                # always positive
    category: str                # e.g. Food, Transport — free text from LLM
    direction: Literal["debit", "credit"]


class ExtractionResult(BaseModel):
    transactions: list[StatementTransaction]
    period_start: str | None = None   # ISO date
    period_end: str | None = None
    total_debits: float | None = None # statement's own printed total, if any


class Flag(BaseModel):
    transaction: StatementTransaction
    flag_type: Literal["duplicate_subscription", "fee_or_charge",
                       "above_baseline", "impulse"]
    reason: str
    severity: Literal["low", "medium", "high"]
    monthly_saving_estimate: float = 0


class FlagList(BaseModel):
    flags: list[Flag]


class AmountMismatch(BaseModel):
    statement_tx: StatementTransaction
    app_expense: dict
    delta: float


class CrosscheckReport(BaseModel):
    missing_in_app: list[StatementTransaction] = []
    missing_on_statement: list[dict] = []
    amount_mismatch: list[AmountMismatch] = []


class RedactionPreview(BaseModel):
    masked_counts: dict[str, int] = {}


class ReviewTotals(BaseModel):
    statement_spend: float
    flagged_spend: float
    coverage_pct: float


class ReviewReport(BaseModel):
    transactions: list[StatementTransaction]
    flags: list[Flag]
    crosscheck: CrosscheckReport
    redaction_preview: RedactionPreview
    totals: ReviewTotals
