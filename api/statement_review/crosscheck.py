"""Deterministic statement-vs-ledger comparison. Deliberately no LLM: the
numbers either line up or they don't."""
from datetime import date, datetime
from difflib import SequenceMatcher

from api.statement_review.models import AmountMismatch, CrosscheckReport, StatementTransaction

DATE_WINDOW_DAYS = 3
AMOUNT_TOLERANCE = 0.01
MISMATCH_SIMILARITY = 0.75


def _row_date(row: dict) -> date:
    return datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")).date()


def _similarity(tx: StatementTransaction, row: dict) -> float:
    desc = tx.description.lower()
    best = SequenceMatcher(None, desc, (row.get("name") or "").lower()).ratio()
    if row.get("vendor"):
        best = max(best, SequenceMatcher(None, desc, row["vendor"].lower()).ratio())
    return best


def crosscheck(transactions, app_expenses) -> CrosscheckReport:
    debits = [t for t in transactions if t.direction == "debit"]
    report = CrosscheckReport()
    if not debits:
        return report

    unmatched_rows = list(app_expenses)
    for tx in debits:
        tx_date = date.fromisoformat(tx.date)
        candidates = [
            r for r in unmatched_rows
            if abs(float(r["amount"]) - tx.amount) <= AMOUNT_TOLERANCE
            and abs((_row_date(r) - tx_date).days) <= DATE_WINDOW_DAYS
        ]
        if candidates:
            best = max(candidates, key=lambda r: _similarity(tx, r))
            unmatched_rows.remove(best)
            continue
        near = [
            r for r in unmatched_rows
            if _similarity(tx, r) >= MISMATCH_SIMILARITY
            and abs((_row_date(r) - tx_date).days) <= DATE_WINDOW_DAYS
        ]
        if near:
            best = max(near, key=lambda r: _similarity(tx, r))
            unmatched_rows.remove(best)
            report.amount_mismatch.append(AmountMismatch(
                statement_tx=tx, app_expense=best,
                delta=round(tx.amount - float(best["amount"]), 2)))
        else:
            report.missing_in_app.append(tx)

    period_start = min(date.fromisoformat(t.date) for t in debits)
    period_end = max(date.fromisoformat(t.date) for t in debits)
    report.missing_on_statement = [
        r for r in unmatched_rows if period_start <= _row_date(r) <= period_end
    ]
    return report
