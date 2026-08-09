# Statement Review Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a bank/credit-card statement PDF; a plain-OpenAI pipeline redacts it locally, extracts transactions, flags avoidable spend with reasons, and cross-checks against manually entered expenses with one-click import.

**Architecture:** New backend package `api/statement_review/` with five stages — parser (pypdf, local) → redactor (regex, local) → extractor (OpenAI structured output + validate/retry) → reviewer (OpenAI + Supabase context) → crosscheck (pure Python). One new FastAPI router `POST /api/statements/review` returns an ephemeral JSON report. Frontend adds a "Review statement" card to the Expenses view.

**Tech Stack:** FastAPI, pydantic v2, pypdf, `openai` SDK (structured outputs), Supabase (existing client), React 19 + Vite + vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-statement-review-agent-design.md`

## Global Constraints

- Redaction runs BEFORE any network/LLM call; only redacted text may reach OpenAI. pypdf text extraction is local and may run before redaction.
- No agent framework (no LangChain/LangGraph). Plain `openai` SDK + pydantic.
- Model config: `OPENAI_API_KEY` (required), `OPENAI_MODEL` (name, no default hardcoded in more than one place), optional `REDACT_NAMES` (comma-separated strings to mask).
- No new DB tables. Report is ephemeral.
- Typed error codes: `PDF_UNREADABLE`, `EXTRACTION_FAILED`, `LLM_UNAVAILABLE`, `NO_TRANSACTIONS_FOUND`.
- Extraction reconciliation tolerance: max(1.00, 1% of statement total).
- Crosscheck: debits only; amount within ±0.01 AND date within ±3 days; merchant similarity as tie-break.
- Python ≥3.13, run everything with `uv run`. Backend tests live in `tests/`, frontend tests in `tests/frontend/`.
- All backend tests are no-network: fake OpenAI client, fake Supabase client (follow the fake pattern in `tests/test_integrations.py`).
- Commit after each task with the message given in the task.

---

### Task 1: Typed errors + Redactor

**Files:**
- Create: `api/statement_review/__init__.py` (empty)
- Create: `api/statement_review/errors.py`
- Create: `api/statement_review/redactor.py`
- Test: `tests/test_statement_redactor.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `errors.StatementReviewError(Exception)` with class attr `code: str`; subclasses `PdfUnreadableError` (`PDF_UNREADABLE`), `ExtractionFailedError` (`EXTRACTION_FAILED`), `LlmUnavailableError` (`LLM_UNAVAILABLE`), `NoTransactionsFoundError` (`NO_TRANSACTIONS_FOUND`).
  - `redactor.redact(text: str, extra_names: list[str] | None = None) -> RedactionResult` where `RedactionResult` is a dataclass with `text: str` and `masked_counts: dict[str, int]`.

- [ ] **Step 1: Add pytest as a dev dependency**

```bash
uv add --dev pytest
```

- [ ] **Step 2: Write the failing tests**

`tests/test_statement_redactor.py`:

```python
"""Redactor is the privacy boundary: PII must be masked, transaction lines
must survive untouched. All local, no network."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review.redactor import redact

SAMPLE = """ACME Bank Monthly Statement
Account Holder: Aswin Manohar
IBAN: DE89 3704 0044 0532 0130 00
Account Number: 532013000
Card: 4111 1111 1111 1111 (**** 1111)
Phone: +49 176 12345678
Opening balance: 2,500.00

01.06.2026  REWE SAGT DANKE 44012  -54.30
03.06.2026  Lieferando.de           -28.90
15.06.2026  Netflix.com             -12.99

Closing balance: 2,403.81
"""


def test_masks_all_pii_types():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    assert "DE89" not in result.text
    assert "4111" not in result.text
    assert "532013000" not in result.text
    assert "12345678" not in result.text
    assert "Aswin Manohar" not in result.text
    assert "2,500.00" not in result.text  # balance line dropped
    assert "2,403.81" not in result.text


def test_counts_reported_per_type():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    assert result.masked_counts["iban"] == 1
    assert result.masked_counts["name"] == 1
    assert result.masked_counts["card"] >= 1
    assert result.masked_counts["balance_line"] == 2


def test_transaction_lines_survive():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    for keep in ("REWE SAGT DANKE", "-54.30", "Lieferando.de", "-28.90",
                 "Netflix.com", "-12.99", "01.06.2026"):
        assert keep in result.text


def test_no_names_arg_is_fine():
    result = redact("hello world")
    assert result.text == "hello world"
    assert result.masked_counts == {}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_statement_redactor.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.statement_review'`

- [ ] **Step 4: Implement errors.py and redactor.py**

`api/statement_review/errors.py`:

```python
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
```

`api/statement_review/redactor.py`:

```python
"""Local, deterministic PII scrub. This is the privacy boundary: only the
text returned by redact() may ever be sent to an LLM."""
import re
from dataclasses import dataclass, field


@dataclass
class RedactionResult:
    text: str
    masked_counts: dict[str, int] = field(default_factory=dict)


# Order matters: IBAN before card so the card pattern can't eat IBAN digits.
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("balance_line", re.compile(r"(?im)^.*\b(?:balance|saldo)\b.*$")),
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,8}(?:\s?[A-Z0-9]{1,3})?\b")),
    ("card", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
    ("partial_card", re.compile(r"\*{2,4}\s?-?\s?\d{4}\b")),
    ("phone", re.compile(r"(?:\+|00)\d{1,3}[\s\-/]?(?:\d[\s\-/]?){6,12}\d")),
    ("account", re.compile(r"(?i)(?:account\s*(?:no\.?|number)|kontonummer|a/c)\s*[:#]?\s*\S+")),
]


def redact(text: str, extra_names: list[str] | None = None) -> RedactionResult:
    counts: dict[str, int] = {}
    for label, pattern in _PATTERNS:
        text, n = pattern.subn(f"[{label.upper()}]", text)
        if n:
            counts[label] = n
    for name in extra_names or []:
        name = name.strip()
        if not name:
            continue
        text, n = re.subn(re.escape(name), "[NAME]", text, flags=re.IGNORECASE)
        if n:
            counts["name"] = counts.get("name", 0) + n
    return RedactionResult(text=text, masked_counts=counts)
```

Also create empty `api/statement_review/__init__.py`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_statement_redactor.py -v`
Expected: 4 passed. If a PII assertion fails, fix the regex — do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml uv.lock api/statement_review tests/test_statement_redactor.py
git commit -m "feat: statement redactor + typed pipeline errors"
```

---

### Task 2: PDF parser

**Files:**
- Create: `api/statement_review/parser.py`
- Test: `tests/test_statement_parser.py`

**Interfaces:**
- Consumes: `errors.PdfUnreadableError` from Task 1.
- Produces: `parser.extract_text(pdf_bytes: bytes) -> str` — raises `PdfUnreadableError` on unparseable input or when the text layer is effectively empty (<50 chars stripped).

- [ ] **Step 1: Add fpdf2 as a dev dependency (test fixture generation only)**

```bash
uv add --dev fpdf2
```

- [ ] **Step 2: Write the failing tests**

`tests/test_statement_parser.py`:

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_statement_parser.py -v`
Expected: FAIL — `No module named 'api.statement_review.parser'`

- [ ] **Step 4: Implement parser.py**

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_statement_parser.py -v`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml uv.lock api/statement_review/parser.py tests/test_statement_parser.py
git commit -m "feat: statement PDF parser with typed no-text-layer error"
```

---

### Task 3: Report models + LLM extractor with validate/retry

**Files:**
- Create: `api/statement_review/models.py`
- Create: `api/statement_review/extractor.py`
- Test: `tests/test_statement_extractor.py`

**Interfaces:**
- Consumes: `errors` from Task 1.
- Produces (models used by every later task):

```python
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
```

  - `extractor.extract_transactions(text: str, statement_type: str, client, model: str, max_retries: int = 2) -> ExtractionResult`. `client` is any object exposing `responses.parse(model=..., input=..., text_format=...)` returning an object with `.output_parsed` (the real `openai.OpenAI` does; tests pass a fake). Raises `ExtractionFailedError` after retries, `NoTransactionsFoundError` if the final valid result has zero transactions, `LlmUnavailableError` on connection/auth errors.
  - `extractor.validate_extraction(result: ExtractionResult) -> list[str]` — returns problem strings, empty when valid.

- [ ] **Step 1: Add the openai dependency**

```bash
uv add openai
```

- [ ] **Step 2: Write models.py exactly as in the Interfaces block above**

Top of file:

```python
from typing import Literal
from pydantic import BaseModel
```

(No test of its own — the extractor tests exercise it.)

- [ ] **Step 3: Write the failing tests**

`tests/test_statement_extractor.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from api.statement_review.extractor import extract_transactions, validate_extraction
from api.statement_review.models import ExtractionResult, StatementTransaction
from api.statement_review.errors import ExtractionFailedError, NoTransactionsFoundError

TX = StatementTransaction(date="2026-06-01", description="REWE", amount=54.30,
                          category="Food", direction="debit")


class FakeParsed:
    def __init__(self, result):
        self.output_parsed = result


class FakeResponses:
    def __init__(self, results):
        self._results = list(results)
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return FakeParsed(self._results.pop(0))


class FakeClient:
    def __init__(self, results):
        self.responses = FakeResponses(results)


def test_valid_first_try_returns_result():
    good = ExtractionResult(transactions=[TX], total_debits=54.30)
    client = FakeClient([good])
    result = extract_transactions("text", "bank", client, model="test-model")
    assert result.transactions[0].description == "REWE"
    assert len(client.responses.calls) == 1


def test_invalid_then_valid_retries_with_error_feedback():
    bad = ExtractionResult(transactions=[TX], total_debits=999.0)  # fails reconciliation
    good = ExtractionResult(transactions=[TX], total_debits=54.30)
    client = FakeClient([bad, good])
    result = extract_transactions("text", "bank", client, model="test-model")
    assert result.total_debits == 54.30
    assert len(client.responses.calls) == 2
    # the retry prompt must carry the validation error back to the model
    retry_input = str(client.responses.calls[1]["input"])
    assert "reconcile" in retry_input


def test_exhausted_retries_raises_extraction_failed():
    bad = ExtractionResult(transactions=[TX], total_debits=999.0)
    client = FakeClient([bad, bad, bad])
    with pytest.raises(ExtractionFailedError):
        extract_transactions("text", "bank", client, model="test-model", max_retries=2)


def test_zero_transactions_raises_no_transactions():
    empty = ExtractionResult(transactions=[])
    client = FakeClient([empty])
    with pytest.raises(NoTransactionsFoundError):
        extract_transactions("text", "bank", client, model="test-model")


def test_validate_flags_bad_dates_and_reconciliation():
    bad_date = StatementTransaction(date="junk", description="x", amount=1,
                                    category="Other", direction="debit")
    problems = validate_extraction(ExtractionResult(transactions=[bad_date]))
    assert any("date" in p for p in problems)
    off_problems = validate_extraction(ExtractionResult(transactions=[TX], total_debits=500.0))
    assert any("reconcile" in p for p in off_problems)
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `uv run pytest tests/test_statement_extractor.py -v`
Expected: FAIL — `No module named 'api.statement_review.extractor'`

- [ ] **Step 5: Implement extractor.py**

```python
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
        except Exception as exc:  # connection/auth/rate-limit from the SDK
            raise LlmUnavailableError(str(exc)) from exc
        result = response.output_parsed
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_statement_extractor.py -v`
Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock api/statement_review/models.py api/statement_review/extractor.py tests/test_statement_extractor.py
git commit -m "feat: statement transaction extractor with structured-output retry loop"
```

---

### Task 4: Reviewer (app context + avoidable-spend flags)

**Files:**
- Create: `api/statement_review/reviewer.py`
- Test: `tests/test_statement_reviewer.py`

**Interfaces:**
- Consumes: `models.StatementTransaction`, `models.Flag`, `models.FlagList` (Task 3); `errors.LlmUnavailableError` (Task 1).
- Produces:
  - `reviewer.ReviewContext` — dataclass: `monthly_income: float`, `recurring: list[dict]` (each `{"name", "amount", "category"}`), `baseline: dict[str, float]` (category → avg monthly spend over last 90 days).
  - `reviewer.build_context(supabase, user_id: str) -> ReviewContext` — reads `user_income` (`salary_me + salary_partner`) and `user_expenses` (rows: `name, amount, category, is_recurring, created_at`), both filtered `.eq("user_key", user_id)`.
  - `reviewer.review_transactions(transactions: list[StatementTransaction], context: ReviewContext, client, model: str, max_retries: int = 2) -> list[Flag]` — same fake-able client contract as the extractor (`responses.parse(...).output_parsed` returning a `FlagList`). A flag whose `transaction` is not in `transactions` (matched by date+description+amount) is dropped, and if the model returns unparseable output the call retries; on exhaustion return `[]` (review is best-effort, never fails the pipeline). SDK/connection errors raise `LlmUnavailableError`.

- [ ] **Step 1: Write the failing tests**

`tests/test_statement_reviewer.py`:

```python
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review.reviewer import ReviewContext, build_context, review_transactions
from api.statement_review.models import Flag, FlagList, StatementTransaction

TX = StatementTransaction(date="2026-06-15", description="Netflix", amount=12.99,
                          category="Entertainment", direction="debit")
GOOD_FLAG = Flag(transaction=TX, flag_type="duplicate_subscription",
                 reason="Also paying for Disney+", severity="medium",
                 monthly_saving_estimate=12.99)
ROGUE = Flag(transaction=StatementTransaction(date="2020-01-01", description="Ghost",
             amount=1.0, category="Other", direction="debit"),
             flag_type="impulse", reason="not real", severity="low")


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
    def select(self, *_a, **_k): return self
    def eq(self, *_a, **_k): return self
    def gte(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self._rows; return r


class FakeSupabase:
    def __init__(self, income_rows, expense_rows):
        self._income, self._expenses = income_rows, expense_rows
    def table(self, name):
        return FakeTable(self._income if name == "user_income" else self._expenses)


class FakeParsed:
    def __init__(self, r): self.output_parsed = r
class FakeResponses:
    def __init__(self, results): self._r = list(results); self.calls = []
    def parse(self, **kw):
        self.calls.append(kw); return FakeParsed(self._r.pop(0))
class FakeClient:
    def __init__(self, results): self.responses = FakeResponses(results)


def test_build_context_reads_income_recurring_and_baseline():
    now = datetime.now(timezone.utc)
    expenses = [
        {"name": "Rent", "amount": 900, "category": "Housing", "is_recurring": True,
         "created_at": (now - timedelta(days=10)).isoformat()},
        {"name": "Groceries", "amount": 300, "category": "Food", "is_recurring": False,
         "created_at": (now - timedelta(days=20)).isoformat()},
    ]
    ctx = build_context(FakeSupabase([{"salary_me": 3000, "salary_partner": 1500}], expenses), "u1")
    assert ctx.monthly_income == 4500
    assert ctx.recurring == [{"name": "Rent", "amount": 900, "category": "Housing"}]
    assert ctx.baseline["Food"] == 100.0  # 300 over 90 days → 100/month


def test_review_returns_flags_and_drops_rogue_transactions():
    client = FakeClient([FlagList(flags=[GOOD_FLAG, ROGUE])])
    ctx = ReviewContext(monthly_income=4500, recurring=[], baseline={})
    flags = review_transactions([TX], ctx, client, model="test-model")
    assert [f.reason for f in flags] == ["Also paying for Disney+"]
    # context must be in the prompt so the LLM judges against MY numbers
    assert "4500" in str(client.responses.calls[0]["input"])


def test_review_is_best_effort_on_persistent_garbage():
    class Boom:
        output_parsed = None
    class BoomResponses:
        def __init__(self): self.calls = []
        def parse(self, **kw):
            self.calls.append(kw); return Boom()
    class BoomClient:
        def __init__(self): self.responses = BoomResponses()
    ctx = ReviewContext(monthly_income=0, recurring=[], baseline={})
    assert review_transactions([TX], ctx, BoomClient(), model="m", max_retries=1) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_statement_reviewer.py -v`
Expected: FAIL — `No module named 'api.statement_review.reviewer'`

- [ ] **Step 3: Implement reviewer.py**

```python
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
        {"name": r["name"], "amount": r["amount"], "category": r["category"]}
        for r in rows
        if r.get("is_recurring")
    ]
    totals: dict[str, float] = {}
    for r in rows:
        totals[r["category"]] = totals.get(r["category"], 0.0) + float(r["amount"])
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
            raise LlmUnavailableError(str(exc)) from exc
        parsed = response.output_parsed
        if isinstance(parsed, FlagList):
            return [f for f in parsed.flags if _tx_key(f.transaction) in known]
    return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_statement_reviewer.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add api/statement_review/reviewer.py tests/test_statement_reviewer.py
git commit -m "feat: avoidable-spend reviewer grounded in app context"
```

---

### Task 5: Crosscheck (deterministic, no LLM)

**Files:**
- Create: `api/statement_review/crosscheck.py`
- Test: `tests/test_statement_crosscheck.py`

**Interfaces:**
- Consumes: `models.StatementTransaction`, `models.CrosscheckReport`, `models.AmountMismatch` (Task 3).
- Produces: `crosscheck.crosscheck(transactions: list[StatementTransaction], app_expenses: list[dict]) -> CrosscheckReport`. `app_expenses` rows carry `id, name, amount, vendor, created_at` (Supabase `user_expenses` shape). Debits only. Match = amount within ±0.01 AND date within ±3 days; ties broken by highest `difflib.SequenceMatcher` ratio of description vs name/vendor. `amount_mismatch` = description similarity ≥0.75 and date within ±3 days but amount delta >0.01. `missing_on_statement` = unmatched app expenses dated inside the statement period (min..max transaction date).

- [ ] **Step 1: Write the failing tests**

`tests/test_statement_crosscheck.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review.crosscheck import crosscheck
from api.statement_review.models import StatementTransaction


def tx(date, desc, amount, direction="debit"):
    return StatementTransaction(date=date, description=desc, amount=amount,
                                category="Other", direction=direction)


def app_row(id, name, amount, created_at, vendor=None):
    return {"id": id, "name": name, "amount": amount,
            "vendor": vendor, "created_at": created_at}


def test_exact_match_produces_no_discrepancies():
    report = crosscheck([tx("2026-06-01", "REWE SAGT DANKE", 54.30)],
                        [app_row("e1", "Groceries", 54.30, "2026-06-02T10:00:00+00:00",
                                 vendor="REWE")])
    assert report.missing_in_app == []
    assert report.missing_on_statement == []
    assert report.amount_mismatch == []


def test_unmatched_statement_tx_is_missing_in_app():
    report = crosscheck([tx("2026-06-05", "Lieferando", 28.90)], [])
    assert [t.description for t in report.missing_in_app] == ["Lieferando"]


def test_app_expense_inside_period_not_on_statement():
    txs = [tx("2026-06-01", "REWE", 54.30), tx("2026-06-30", "Netflix", 12.99)]
    rows = [app_row("e1", "REWE", 54.30, "2026-06-01T00:00:00+00:00"),
            app_row("e2", "Netflix", 12.99, "2026-06-30T00:00:00+00:00"),
            app_row("e3", "Gym", 29.99, "2026-06-15T00:00:00+00:00"),
            app_row("e4", "Outside period", 10.0, "2026-05-01T00:00:00+00:00")]
    report = crosscheck(txs, rows)
    assert [r["id"] for r in report.missing_on_statement] == ["e3"]


def test_similar_name_wrong_amount_is_mismatch_not_missing():
    report = crosscheck([tx("2026-06-10", "Netflix", 17.99)],
                        [app_row("e1", "Netflix", 12.99, "2026-06-10T00:00:00+00:00")])
    assert report.missing_in_app == []
    assert len(report.amount_mismatch) == 1
    assert round(report.amount_mismatch[0].delta, 2) == 5.00


def test_date_window_boundary_three_days_matches_four_does_not():
    row = [app_row("e1", "REWE", 54.30, "2026-06-05T00:00:00+00:00")]
    assert crosscheck([tx("2026-06-08", "REWE", 54.30)], row).missing_in_app == []
    assert len(crosscheck([tx("2026-06-09", "REWE", 54.30)], row).missing_in_app) == 1


def test_credits_are_ignored():
    report = crosscheck([tx("2026-06-01", "SALARY", 3000, direction="credit")], [])
    assert report.missing_in_app == []


def test_duplicate_amounts_each_match_a_distinct_row():
    txs = [tx("2026-06-01", "Coffee A", 4.50), tx("2026-06-01", "Coffee B", 4.50)]
    rows = [app_row("e1", "Coffee A", 4.50, "2026-06-01T00:00:00+00:00"),
            app_row("e2", "Coffee B", 4.50, "2026-06-01T00:00:00+00:00")]
    assert crosscheck(txs, rows).missing_in_app == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_statement_crosscheck.py -v`
Expected: FAIL — `No module named 'api.statement_review.crosscheck'`

- [ ] **Step 3: Implement crosscheck.py**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_statement_crosscheck.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add api/statement_review/crosscheck.py tests/test_statement_crosscheck.py
git commit -m "feat: deterministic statement-vs-ledger crosscheck"
```

---

### Task 6: Pipeline + API endpoint

**Files:**
- Create: `api/statement_review/pipeline.py`
- Create: `api/routers/statements.py`
- Modify: `api/main.py` (add router import + include, next to the existing `include_router` calls at lines 29-32)
- Test: `tests/test_statements_endpoint.py`

**Interfaces:**
- Consumes: everything from Tasks 1-5, plus existing `api.dependencies.get_current_user_id` and `api.dependencies.get_supabase_client`.
- Produces:
  - `pipeline.run_review(pdf_bytes: bytes, *, redact_enabled: bool, statement_type: str, user_id: str, supabase, client, model: str) -> ReviewReport`.
  - `POST /api/statements/review` — multipart fields `file` (PDF), `redact` (bool, default true), `statement_type` (`bank`|`credit_card`, default `bank`). Auth: existing bearer/personal-token dependency. Error mapping: `PDF_UNREADABLE`/`NO_TRANSACTIONS_FOUND` → 422, `EXTRACTION_FAILED` → 502, `LLM_UNAVAILABLE` → 503; body `{"detail": {"code": ..., "message": ...}}`.
  - Router module exposes `get_openai_client()` so tests can override via FastAPI `dependency_overrides`.

- [ ] **Step 1: Implement pipeline.py (plain orchestration, tested through the endpoint)**

```python
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
```

- [ ] **Step 2: Write the failing endpoint tests**

`tests/test_statements_endpoint.py`:

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from fpdf import FPDF

import api.routers.statements as statements
from api.dependencies import get_current_user_id
from api.main import app
from api.statement_review.models import ExtractionResult, FlagList, StatementTransaction

client = TestClient(app)


def make_pdf(lines):
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Helvetica", size=10)
    for line in lines:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


PDF = make_pdf(["Statement June 2026", "IBAN: DE89 3704 0044 0532 0130 00",
                "01.06.2026 REWE -54.30", "15.06.2026 Netflix -12.99"])
TXS = [StatementTransaction(date="2026-06-01", description="REWE", amount=54.30,
                            category="Food", direction="debit"),
       StatementTransaction(date="2026-06-15", description="Netflix", amount=12.99,
                            category="Entertainment", direction="debit")]


class FakeParsed:
    def __init__(self, r): self.output_parsed = r
class FakeResponses:
    def __init__(self): self.calls = []
    def parse(self, **kw):
        self.calls.append(kw)
        if kw["text_format"] is ExtractionResult:
            return FakeParsed(ExtractionResult(transactions=TXS))
        return FakeParsed(FlagList(flags=[]))
class FakeOpenAI:
    def __init__(self): self.responses = FakeResponses()


class FakeTable:
    def __init__(self, rows): self._rows = rows
    def select(self, *_a, **_k): return self
    def eq(self, *_a, **_k): return self
    def gte(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self._rows; return r
class FakeSupabase:
    def table(self, name):
        if name == "user_income":
            return FakeTable([{"salary_me": 3000, "salary_partner": 0}])
        return FakeTable([{"id": "e1", "name": "Groceries", "amount": 54.30,
                           "vendor": "REWE", "category": "Food", "is_recurring": False,
                           "created_at": "2026-06-01T00:00:00+00:00"}])


_real_get_supabase = statements.get_supabase_for_review


def setup_module(_m):
    fake_llm = FakeOpenAI()
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    app.dependency_overrides[statements.get_openai_client] = lambda: fake_llm
    statements._fake_llm_for_tests = fake_llm
    # route supabase reads to the fake (module attribute, resolved at call time)
    statements.get_supabase_for_review = lambda: FakeSupabase()


def teardown_module(_m):
    app.dependency_overrides.clear()
    statements.get_supabase_for_review = _real_get_supabase


def _post(**form):
    files = {"file": ("stmt.pdf", PDF, "application/pdf")}
    return client.post("/api/statements/review", files=files, data=form)


def test_happy_path_returns_report_and_redacts_before_llm():
    resp = _post(redact="true", statement_type="bank")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["transactions"]) == 2
    assert body["crosscheck"]["missing_in_app"][0]["description"] == "Netflix"
    assert body["totals"]["statement_spend"] == 67.29
    assert body["redaction_preview"]["masked_counts"]["iban"] == 1
    # the IBAN must never appear in what was sent to the LLM
    llm_input = str(statements._fake_llm_for_tests.responses.calls[0]["input"])
    assert "DE89" not in llm_input


def test_unauthenticated_is_rejected():
    del app.dependency_overrides[get_current_user_id]
    try:
        resp = _post(redact="true", statement_type="bank")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides[get_current_user_id] = lambda: "user-1"


def test_garbage_pdf_maps_to_422_with_code():
    files = {"file": ("x.pdf", b"not a pdf", "application/pdf")}
    resp = client.post("/api/statements/review", files=files, data={"redact": "true"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "PDF_UNREADABLE"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_statements_endpoint.py -v`
Expected: FAIL — `No module named 'api.routers.statements'`

- [ ] **Step 4: Implement api/routers/statements.py**

```python
"""Statement upload → review report. Ephemeral: nothing is persisted."""
import os
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from api.dependencies import get_current_user_id, get_supabase_client
from api.statement_review.errors import StatementReviewError
from api.statement_review.models import ReviewReport
from api.statement_review.pipeline import run_review

router = APIRouter(prefix="/statements", tags=["statements"])

MAX_PDF_BYTES = 10 * 1024 * 1024

_STATUS_BY_CODE = {
    "PDF_UNREADABLE": 422,
    "NO_TRANSACTIONS_FOUND": 422,
    "EXTRACTION_FAILED": 502,
    "LLM_UNAVAILABLE": 503,
}


def get_openai_client():
    """Dependency so tests can override with a fake."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail={
            "code": "LLM_UNAVAILABLE", "message": "OPENAI_API_KEY is not configured"})
    from openai import OpenAI
    return OpenAI(api_key=api_key)


def get_supabase_for_review():
    """Indirection point so tests can swap in a fake Supabase."""
    return get_supabase_client()


@router.post("/review", response_model=ReviewReport, operation_id="review_statement")
async def review_statement(
    file: UploadFile = File(...),
    redact: bool = Form(True),
    statement_type: Literal["bank", "credit_card"] = Form("bank"),
    user_id: str = Depends(get_current_user_id),
    llm=Depends(get_openai_client),
):
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail={
            "code": "PDF_UNREADABLE", "message": "PDF larger than 10 MB"})
    supabase = get_supabase_for_review()
    if not supabase:
        raise HTTPException(status_code=500, detail={
            "code": "STATEMENT_REVIEW_ERROR", "message": "Supabase client is not configured"})
    try:
        return run_review(
            pdf_bytes,
            redact_enabled=redact,
            statement_type=statement_type,
            user_id=user_id,
            supabase=supabase,
            client=llm,
            model=os.getenv("OPENAI_MODEL", "gpt-5.1"),
        )
    except StatementReviewError as exc:
        raise HTTPException(
            status_code=_STATUS_BY_CODE.get(exc.code, 500),
            detail={"code": exc.code, "message": str(exc)},
        )
```

- [ ] **Step 5: Register the router in api/main.py**

In `api/main.py`, change the imports and router block (currently lines 5 and 29-32):

```python
from api.routers import expenses, integrations, statements
```

```python
app.include_router(expenses.router, prefix="/api")
app.include_router(statements.router, prefix="/api")
# Read-only service-to-service feeds (e.g. Life OS). Registered before the SPA
# catch-all below so /v1/* resolves to the API, not index.html.
app.include_router(integrations.router)
```

- [ ] **Step 6: Run the new tests, then the whole backend suite**

Run: `uv run pytest tests/test_statements_endpoint.py -v` — Expected: 3 passed
Run: `uv run pytest tests/ -v` — Expected: all pass (existing integration/telegram tests must not break)

- [ ] **Step 7: Commit**

```bash
git add api/statement_review/pipeline.py api/routers/statements.py api/main.py tests/test_statements_endpoint.py
git commit -m "feat: POST /api/statements/review endpoint wiring the full pipeline"
```

---

### Task 7: Frontend service + Vite dev proxy

**Files:**
- Create: `services/statementReview.ts`
- Modify: `vite.config.ts` (add `server.proxy`)
- Test: `tests/frontend/statementReview.test.ts`

**Interfaces:**
- Consumes: `supabase` client exported from `services/supabaseService.ts`; backend endpoint from Task 6.
- Produces (used by Task 8's component):

```ts
export interface StatementTransaction {
  date: string; description: string; amount: number;
  category: string; direction: 'debit' | 'credit';
}
export interface ReviewFlag {
  transaction: StatementTransaction;
  flag_type: 'duplicate_subscription' | 'fee_or_charge' | 'above_baseline' | 'impulse';
  reason: string; severity: 'low' | 'medium' | 'high';
  monthly_saving_estimate: number;
}
export interface ReviewReport {
  transactions: StatementTransaction[];
  flags: ReviewFlag[];
  crosscheck: {
    missing_in_app: StatementTransaction[];
    missing_on_statement: Record<string, unknown>[];
    amount_mismatch: { statement_tx: StatementTransaction; app_expense: Record<string, unknown>; delta: number }[];
  };
  redaction_preview: { masked_counts: Record<string, number> };
  totals: { statement_spend: number; flagged_spend: number; coverage_pct: number };
}
export const reviewStatement: (file: File, redact: boolean, statementType: 'bank' | 'credit_card') => Promise<ReviewReport>;
export const importTransaction: (tx: StatementTransaction) => Promise<void>;
```

- [ ] **Step 1: Add the dev proxy to vite.config.ts**

Inside the returned config's `server` block (next to `port: 5173`):

```ts
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': 'http://localhost:8000',
      },
    },
```

- [ ] **Step 2: Write the failing tests**

`tests/frontend/statementReview.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/supabaseService', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'jwt-123' } },
      }),
    },
  },
}));

import { reviewStatement, importTransaction } from '../../services/statementReview';

const tx = { date: '2026-06-01', description: 'REWE', amount: 54.3,
             category: 'Food', direction: 'debit' as const };

describe('reviewStatement', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [tx] }),
    }) as any;
  });

  it('POSTs multipart form with bearer token', async () => {
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await reviewStatement(file, true, 'bank');
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/statements/review');
    expect(init.headers.Authorization).toBe('Bearer jwt-123');
    const form = init.body as FormData;
    expect(form.get('redact')).toBe('true');
    expect(form.get('statement_type')).toBe('bank');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('surfaces the backend error message', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false, status: 422,
      json: async () => ({ detail: { code: 'PDF_UNREADABLE', message: 'no text layer' } }),
    });
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await expect(reviewStatement(file, true, 'bank')).rejects.toThrow('no text layer');
  });
});

describe('importTransaction', () => {
  it('POSTs the mapped expense to /api/expenses/', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
    await importTransaction(tx);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/expenses/');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ name: 'REWE', amount: 54.3, category: 'Food',
                                 created_at: '2026-06-01' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- tests/frontend/statementReview.test.ts`
Expected: FAIL — cannot resolve `services/statementReview`

- [ ] **Step 4: Implement services/statementReview.ts**

```ts
import { supabase } from './supabaseService';

export interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  direction: 'debit' | 'credit';
}

export interface ReviewFlag {
  transaction: StatementTransaction;
  flag_type: 'duplicate_subscription' | 'fee_or_charge' | 'above_baseline' | 'impulse';
  reason: string;
  severity: 'low' | 'medium' | 'high';
  monthly_saving_estimate: number;
}

export interface ReviewReport {
  transactions: StatementTransaction[];
  flags: ReviewFlag[];
  crosscheck: {
    missing_in_app: StatementTransaction[];
    missing_on_statement: Record<string, unknown>[];
    amount_mismatch: {
      statement_tx: StatementTransaction;
      app_expense: Record<string, unknown>;
      delta: number;
    }[];
  };
  redaction_preview: { masked_counts: Record<string, number> };
  totals: { statement_spend: number; flagged_spend: number; coverage_pct: number };
}

const VALID_CATEGORIES = ['Housing', 'Food', 'Transport', 'Utilities', 'Entertainment', 'Other'];

const authHeader = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return { Authorization: `Bearer ${session.access_token}` };
};

const errorMessage = async (res: Response): Promise<string> => {
  const body = await res.json().catch(() => null);
  return body?.detail?.message || body?.detail || `Request failed (${res.status})`;
};

export const reviewStatement = async (
  file: File,
  redact: boolean,
  statementType: 'bank' | 'credit_card',
): Promise<ReviewReport> => {
  const form = new FormData();
  form.append('file', file);
  form.append('redact', String(redact));
  form.append('statement_type', statementType);
  const res = await fetch('/api/statements/review', {
    method: 'POST',
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
};

export const importTransaction = async (tx: StatementTransaction): Promise<void> => {
  const res = await fetch('/api/expenses/', {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tx.description,
      amount: tx.amount,
      category: VALID_CATEGORIES.includes(tx.category) ? tx.category : 'Other',
      created_at: tx.date,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- tests/frontend/statementReview.test.ts`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add services/statementReview.ts vite.config.ts tests/frontend/statementReview.test.ts
git commit -m "feat: statement review frontend service + vite /api proxy"
```

---

### Task 8: StatementReview card in the Expenses view

**Files:**
- Create: `components/StatementReview.tsx`
- Modify: `components/Expenses.tsx` (render the new card; pass `onSync`)
- Test: `tests/frontend/StatementReview.test.tsx`

**Interfaces:**
- Consumes: `reviewStatement`, `importTransaction`, `ReviewReport`, `StatementTransaction` from Task 7.
- Produces: `<StatementReview onImported={() => void} />` — `onImported` fires after a successful one-click import so the parent can refresh app state (Expenses passes its existing `onSync`).

- [ ] **Step 1: Write the failing tests**

`tests/frontend/StatementReview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const tx = { date: '2026-06-05', description: 'Lieferando', amount: 28.9,
             category: 'Food', direction: 'debit' as const };
const report = {
  transactions: [tx],
  flags: [{ transaction: tx, flag_type: 'impulse', reason: 'Third delivery this week',
            severity: 'medium', monthly_saving_estimate: 60 }],
  crosscheck: { missing_in_app: [tx], missing_on_statement: [], amount_mismatch: [] },
  redaction_preview: { masked_counts: { iban: 1 } },
  totals: { statement_spend: 28.9, flagged_spend: 28.9, coverage_pct: 0 },
};

vi.mock('../../services/statementReview', () => ({
  reviewStatement: vi.fn().mockResolvedValue(report),
  importTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { reviewStatement, importTransaction } from '../../services/statementReview';
import { StatementReview } from '../../components/StatementReview';

describe('StatementReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads with redaction on by default and renders flags + crosscheck', async () => {
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    await waitFor(() => expect(reviewStatement).toHaveBeenCalledWith(file, true, 'bank'));
    expect(await screen.findByText(/third delivery this week/i)).toBeInTheDocument();
    expect(screen.getByText(/missing in app/i)).toBeInTheDocument();
  });

  it('one-click import calls the service then onImported', async () => {
    const onImported = vi.fn();
    render(<StatementReview onImported={onImported} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add to expenses/i }));
    await waitFor(() => expect(importTransaction).toHaveBeenCalledWith(tx));
    expect(onImported).toHaveBeenCalled();
  });

  it('shows a friendly error when review fails', async () => {
    (reviewStatement as any).mockRejectedValueOnce(new Error('no text layer'));
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    expect(await screen.findByText(/no text layer/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/frontend/StatementReview.test.tsx`
Expected: FAIL — cannot resolve `components/StatementReview`

- [ ] **Step 3: Implement components/StatementReview.tsx**

Follow the styling conventions already in `components/Expenses.tsx` (`bg-surface-container-low p-6 rounded-xl` sections, `bg-surface-container-lowest border border-outline-variant/20 rounded-lg` inputs, lucide icons).

```tsx
import React, { useState } from 'react';
import { FileScan, ShieldCheck, Plus, AlertTriangle } from 'lucide-react';
import {
  reviewStatement, importTransaction, ReviewReport, StatementTransaction,
} from '../services/statementReview';

interface StatementReviewProps {
  onImported: () => void;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export const StatementReview: React.FC<StatementReviewProps> = ({ onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [redact, setRedact] = useState(true);
  const [statementType, setStatementType] = useState<'bank' | 'credit_card'>('bank');
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());

  const txKey = (tx: StatementTransaction) => `${tx.date}|${tx.description}|${tx.amount}`;

  const runReview = async () => {
    if (!file) return;
    setBusy(true); setError(null); setReport(null);
    try {
      setReport(await reviewStatement(file, redact, statementType));
    } catch (e: any) {
      setError(e.message || 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (tx: StatementTransaction) => {
    await importTransaction(tx);
    setImportedKeys(prev => new Set(prev).add(txKey(tx)));
    onImported();
  };

  const sortedFlags = report
    ? [...report.flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <section className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
        <FileScan size={20} /> Review statement
      </h2>

      <label htmlFor="statement-pdf" className="text-sm text-on-surface-variant">
        Statement PDF
      </label>
      <input
        id="statement-pdf"
        type="file"
        accept="application/pdf"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface"
      />

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
          <input type="checkbox" checked={redact} onChange={e => setRedact(e.target.checked)} />
          <ShieldCheck size={16} /> Redact personal data before sending
        </label>
        <select
          value={statementType}
          onChange={e => setStatementType(e.target.value as 'bank' | 'credit_card')}
          className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-2 text-on-surface"
        >
          <option value="bank">Bank statement</option>
          <option value="credit_card">Credit card</option>
        </select>
      </div>

      <button
        onClick={runReview}
        disabled={!file || busy}
        className="bg-primary text-on-primary rounded-lg py-3 px-4 font-semibold disabled:opacity-40"
      >
        {busy ? 'Reviewing…' : 'Review statement'}
      </button>

      {error && (
        <p className="text-[#F26B6B] text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </p>
      )}

      {report && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-semibold text-on-surface mb-2">
              Flagged spend · {report.totals.flagged_spend.toFixed(2)} of{' '}
              {report.totals.statement_spend.toFixed(2)}
            </h3>
            {sortedFlags.length === 0 && (
              <p className="text-sm text-on-surface-variant">Nothing looked avoidable. Nice.</p>
            )}
            {sortedFlags.map((f, i) => (
              <div key={i} className="py-2 border-b border-outline-variant/20 text-sm">
                <span className="font-medium text-on-surface">
                  {f.transaction.description} · {f.transaction.amount.toFixed(2)}
                </span>{' '}
                <span className="uppercase text-xs text-on-surface-variant">{f.severity}</span>
                <p className="text-on-surface-variant">{f.reason}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-semibold text-on-surface mb-2">Missing in app</h3>
            {report.crosscheck.missing_in_app.length === 0 && (
              <p className="text-sm text-on-surface-variant">Everything on the statement is tracked.</p>
            )}
            {report.crosscheck.missing_in_app.map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-outline-variant/20 text-sm">
                <span className="text-on-surface">
                  {tx.date} · {tx.description} · {tx.amount.toFixed(2)}
                </span>
                {importedKeys.has(txKey(tx)) ? (
                  <span className="text-[#3DD68C] text-xs">Added</span>
                ) : (
                  <button
                    onClick={() => handleImport(tx)}
                    className="flex items-center gap-1 text-primary text-xs font-semibold"
                  >
                    <Plus size={14} /> Add to expenses
                  </button>
                )}
              </div>
            ))}
            {report.crosscheck.amount_mismatch.length > 0 && (
              <div className="mt-2 text-sm text-on-surface-variant">
                {report.crosscheck.amount_mismatch.map((m, i) => (
                  <p key={i}>
                    Amount differs for {m.statement_tx.description}: statement{' '}
                    {m.statement_tx.amount.toFixed(2)} vs app entry (Δ {m.delta.toFixed(2)})
                  </p>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-on-surface-variant">
            Redacted before upload:{' '}
            {Object.entries(report.redaction_preview.masked_counts)
              .map(([k, v]) => `${k}×${v}`)
              .join(', ') || 'nothing (redaction off)'}
          </p>
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/frontend/StatementReview.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Render the card in Expenses.tsx**

In `components/Expenses.tsx`: add the import at the top and render the card after the existing add-expense `<section>` (the component receives `onSync` already):

```tsx
import { StatementReview } from './StatementReview';
```

```tsx
<StatementReview onImported={() => { void onSync?.(); }} />
```

- [ ] **Step 6: Run the full frontend and backend suites**

Run: `npm run test` — Expected: all pass (existing Expenses tests unaffected)
Run: `uv run pytest tests/ -v` — Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add components/StatementReview.tsx components/Expenses.tsx tests/frontend/StatementReview.test.tsx
git commit -m "feat: statement review card with flags, crosscheck and one-click import"
```

---

## Manual verification (after all tasks)

1. `just start` (backend :8000 + frontend :5173).
2. Sign in with Google at `localhost:5173`, open Expenses.
3. Upload a real statement PDF with redaction ON; confirm the redaction summary lists masked items and flags/crosscheck render.
4. Click "Add to expenses" on a missing transaction; confirm it appears in the expense list after sync.
5. Requires `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, `REDACT_NAMES="Your Name"`) in `.env`.
