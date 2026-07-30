"""Judge extracted transactions against the user's own financial context.
Best-effort: a broken review never sinks the pipeline (empty flags instead)."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from api.statement_review.errors import LlmUnavailableError
from api.statement_review.models import Flag, FlagList, StatementTransaction

_SYSTEM = (
    "You review personal spending. Flag ONLY clearly avoidable spend, using "
    "flag types: duplicate_subscription, fee_or_charge, above_baseline, impulse. "
    "One-sentence reason each; set severity and a realistic monthly_saving_estimate. "
    "Judge against the user's context (income, recurring bills, category baseline). "
    "Do not flag essentials like rent or groceries at normal levels."
)


@dataclass
class ReviewContext:
    monthly_income: float
    recurring: list[dict]
    baseline: dict[str, float]


def build_context(supabase, user_id: str) -> ReviewContext:
    income_rows = (
        supabase.table("user_income")
        .select("salary_me, salary_partner")
        .eq("user_key", user_id)
        .limit(1)
        .execute()
    ).data or []
    income = 0.0
    if income_rows:
        income = float(income_rows[0].get("salary_me") or 0) + float(
            income_rows[0].get("salary_partner") or 0
        )

    since = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    rows = (
        supabase.table("user_expenses")
        .select("name, amount, category, is_recurring, created_at")
        .eq("user_key", user_id)
        .gte("created_at", since)
        .execute()
    ).data or []

    recurring = [
        {
            "name": r.get("name"),
            "amount": float(r.get("amount") or 0),
            "category": r.get("category"),
        }
        for r in rows
        if r.get("is_recurring")
    ]
    totals: dict[str, float] = {}
    for r in rows:
        category = r.get("category")
        totals[category] = totals.get(category, 0.0) + float(r.get("amount") or 0)
    baseline = {cat: round(total / 3.0, 2) for cat, total in totals.items()}
    return ReviewContext(monthly_income=income, recurring=recurring, baseline=baseline)


def _tx_key(tx: StatementTransaction) -> tuple:
    return (tx.date, tx.description, round(tx.amount, 2))


def review_transactions(transactions, context, client, model, max_retries=2):
    user_msg = (
        f"Monthly income: {context.monthly_income}\n"
        f"Known recurring bills: {context.recurring}\n"
        f"Avg monthly spend by category (last 3 months): {context.baseline}\n\n"
        f"Transactions:\n"
        + "\n".join(f"{t.date} {t.description} {t.amount} ({t.direction})" for t in transactions)
    )
    known = {_tx_key(t) for t in transactions}
    for _ in range(max_retries + 1):
        try:
            response = client.responses.parse(
                model=model,
                input=[{"role": "system", "content": _SYSTEM},
                       {"role": "user", "content": user_msg}],
                text_format=FlagList,
            )
        except Exception as exc:
            # `client` is duck-typed (real SDK client or a test fake), so the
            # SDK's exception types are unknown at this layer. Any failure to
            # even reach a response is treated as the LLM being unavailable.
            raise LlmUnavailableError(str(exc)) from exc
        parsed = response.output_parsed
        if isinstance(parsed, FlagList):
            return [f for f in parsed.flags if _tx_key(f.transaction) in known]
    return []
