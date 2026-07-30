"""Orchestrates the five stages. Redaction ALWAYS precedes any LLM call."""
import os

from api.statement_review.crosscheck import crosscheck
from api.statement_review.extractor import extract_transactions
from api.statement_review.models import RedactionPreview, ReviewReport, ReviewTotals
from api.statement_review.parser import extract_text
from api.statement_review.redactor import redact
from api.statement_review.reviewer import build_context, review_transactions


def run_review(pdf_bytes, *, redact_enabled, statement_type, user_id, supabase, client, model):
    text = extract_text(pdf_bytes)

    masked_counts: dict[str, int] = {}
    if redact_enabled:
        extra = [n for n in os.getenv("REDACT_NAMES", "").split(",") if n.strip()]
        redaction = redact(text, extra_names=extra)
        text, masked_counts = redaction.text, redaction.masked_counts

    extraction = extract_transactions(text, statement_type, client, model)
    context = build_context(supabase, user_id)
    flags = review_transactions(extraction.transactions, context, client, model)

    rows = (
        supabase.table("user_expenses")
        .select("id, name, amount, vendor, created_at")
        .eq("user_key", user_id)
        .execute()
    ).data or []
    check = crosscheck(extraction.transactions, rows)

    debits = [t for t in extraction.transactions if t.direction == "debit"]
    statement_spend = round(sum(t.amount for t in debits), 2)
    flagged_spend = round(sum(f.transaction.amount for f in flags), 2)
    matched = len(debits) - len(check.missing_in_app) - len(check.amount_mismatch)
    coverage = round(100.0 * matched / len(debits), 1) if debits else 0.0

    return ReviewReport(
        transactions=extraction.transactions,
        flags=flags,
        crosscheck=check,
        redaction_preview=RedactionPreview(masked_counts=masked_counts),
        totals=ReviewTotals(statement_spend=statement_spend,
                            flagged_spend=flagged_spend, coverage_pct=coverage),
    )
