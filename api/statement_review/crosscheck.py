"""Deterministic statement-vs-ledger comparison. Deliberately no LLM: the
numbers either line up or they don't."""
from datetime import date, datetime, timezone
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

from api.statement_review.models import AmountMismatch, CrosscheckReport, StatementTransaction

BERLIN = ZoneInfo("Europe/Berlin")
DATE_WINDOW_DAYS = 3
AMOUNT_TOLERANCE = 0.01
AMOUNT_TOLERANCE_CENTS = round(AMOUNT_TOLERANCE * 100)
MISMATCH_SIMILARITY = 0.75


def _cents(amount: float) -> int:
    """Integer cents so amount comparisons never trip on binary-float
    rounding (e.g. abs(54.31 - 54.30) > 0.01 in IEEE 754)."""
    return round(amount * 100)


def _row_date(row: dict) -> date:
    # `date` is authoritative once the write path stops overloading
    # created_at; the created_at fallback covers rows written before the
    # column existed (or by a producer, like the Telegram bot, that only
    # ever sends created_at).
    if row.get("date"):
        return date.fromisoformat(row["date"])
    # Read in Europe/Berlin, as the migration backfill and the integration
    # feed do: the UTC day would put a 00:30 purchase on the previous date.
    parsed = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(BERLIN).date()


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

    rows = list(app_expenses)

    # Phase 1: exact-amount match, resolved as a single order-independent
    # global assignment. Processing transactions one at a time (in input
    # order) and greedily claiming the best row for each is order-dependent:
    # an earlier transaction can steal the only row a later transaction
    # could have matched, producing a false missing_in_app that depends on
    # transaction order. Instead, collect every eligible (tx, row) pair
    # up front, then assign the globally best pairs first. Similarity is a
    # tie-break only here, never a threshold — the match rule is amount +
    # date, per spec.
    pairs = []
    for tx_idx, tx in enumerate(debits):
        tx_date = date.fromisoformat(tx.date)
        tx_cents = _cents(tx.amount)
        for row_idx, row in enumerate(rows):
            if abs(_cents(float(row["amount"])) - tx_cents) > AMOUNT_TOLERANCE_CENTS:
                continue
            date_diff = abs((_row_date(row) - tx_date).days)
            if date_diff > DATE_WINDOW_DAYS:
                continue
            pairs.append((tx_idx, row_idx, _similarity(tx, row), date_diff))

    pairs.sort(key=lambda p: (-p[2], p[3], p[0], p[1]))

    matched_tx_idx: set[int] = set()
    matched_row_idx: set[int] = set()
    for tx_idx, row_idx, _sim, _diff in pairs:
        if tx_idx in matched_tx_idx or row_idx in matched_row_idx:
            continue
        matched_tx_idx.add(tx_idx)
        matched_row_idx.add(row_idx)

    unmatched_rows = [row for idx, row in enumerate(rows) if idx not in matched_row_idx]

    # Phase 2: near-name mismatch pass for transactions still unmatched,
    # over the rows left over from phase 1 — unchanged from before.
    for tx_idx, tx in enumerate(debits):
        if tx_idx in matched_tx_idx:
            continue
        tx_date = date.fromisoformat(tx.date)
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
