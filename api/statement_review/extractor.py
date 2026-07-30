"""Redacted text → structured transactions via OpenAI structured output,
with validate-and-retry. The ONLY module (with reviewer.py) that talks to
the LLM, and it must only ever receive redacted text."""
from datetime import date

from api.statement_review.errors import (
    ExtractionFailedError,
    LlmUnavailableError,
    NoTransactionsFoundError,
)
from api.statement_review.models import ExtractionResult

_SYSTEM = (
    "You extract transactions from a {statement_type} statement. "
    "Amounts are positive numbers; use direction=debit for money out, "
    "credit for money in. Dates are ISO YYYY-MM-DD. If the statement "
    "prints its own debit total, set total_debits. Categorize each "
    "transaction (Food, Transport, Housing, Utilities, Entertainment, Other)."
)


def validate_extraction(result: ExtractionResult) -> list[str]:
    problems: list[str] = []
    for tx in result.transactions:
        try:
            date.fromisoformat(tx.date)
        except ValueError:
            problems.append(f"transaction date not ISO YYYY-MM-DD: {tx.date!r}")
    if result.total_debits is not None:
        extracted = sum(t.amount for t in result.transactions if t.direction == "debit")
        tolerance = max(1.00, abs(result.total_debits) * 0.01)
        if abs(extracted - result.total_debits) > tolerance:
            problems.append(
                f"extracted debits {extracted:.2f} do not reconcile with the "
                f"statement total {result.total_debits:.2f} (tolerance {tolerance:.2f})"
            )
    return problems


def extract_transactions(text, statement_type, client, model, max_retries=2):
    prompt = f"Statement text (PII already redacted):\n\n{text}"
    last_problems: list[str] = []
    for _ in range(max_retries + 1):
        try:
            response = client.responses.parse(
                model=model,
                input=[
                    {"role": "system", "content": _SYSTEM.format(statement_type=statement_type)},
                    {"role": "user", "content": prompt},
                ],
                text_format=ExtractionResult,
            )
        except (ExtractionFailedError, LlmUnavailableError):
            raise
        except Exception as exc:
            # `client` is duck-typed (real openai.OpenAI or a test fake), so
            # the SDK's exception types are unknown at this layer. Any
            # failure to even reach a response — connection, auth,
            # rate-limit, or a bug in the fake — is treated as the LLM
            # being unavailable rather than an extraction/validation
            # problem, and is raised immediately without retrying.
            raise LlmUnavailableError(str(exc)) from exc
        result = response.output_parsed
        if result is None:
            last_problems = ["model returned no parsed result"]
        else:
            last_problems = validate_extraction(result)
        if not last_problems:
            if not result.transactions:
                raise NoTransactionsFoundError("No transactions found in statement text")
            return result
        prompt = (
            f"Statement text (PII already redacted):\n\n{text}\n\n"
            f"Your previous answer had these problems, fix them:\n- "
            + "\n- ".join(last_problems)
        )
    raise ExtractionFailedError("; ".join(last_problems))
