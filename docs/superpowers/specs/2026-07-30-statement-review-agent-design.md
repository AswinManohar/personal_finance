# Statement Review Agent — Design

**Date:** 2026-07-30
**Status:** Approved
**Approach:** Plain OpenAI SDK pipeline (no agent framework), redaction before any LLM call

## Purpose

Upload a bank or credit-card statement PDF to Cashflow. An LLM-backed pipeline
extracts the transactions, flags spending that was unnecessary or avoidable
(with reasons), and cross-checks the statement against expenses entered
manually in the app. Redaction of personal data happens locally before any
text is sent to OpenAI.

## Decisions made during brainstorm

| Decision | Choice |
|---|---|
| Model provider | OpenAI (key in `.env` as `OPENAI_API_KEY`; model via `OPENAI_MODEL`) |
| Framework | None — plain OpenAI SDK + pydantic (Approach B; LangGraph prototype in `notebooks/test_bankstatements.ipynb` is superseded) |
| Ingestion | Upload in the app UI |
| Redaction | Local, deterministic, **before** any LLM call; toggle in UI, default ON |
| Cross-check outcome | Report + one-click "Add to expenses" (no auto-import) |
| Review logic | LLM judgment grounded in app context (income, recurring bills, 3-month category baseline) |
| Persistence | None — report is ephemeral JSON; re-run anytime |

## Architecture

New package `api/statement_review/` — small modules, each testable alone:

```
PDF upload (multipart)
  → parser.py      pypdf → raw text                     [local]
  → redactor.py    scrub PII → redacted text            [local, default ON]
  → extractor.py   OpenAI structured output → txns      [LLM call 1]
  → reviewer.py    OpenAI + app context → flags         [LLM call 2]
  → crosscheck.py  fuzzy match vs Supabase expenses     [local, no LLM]
  → report JSON returned to frontend
```

Only redacted text ever leaves the machine. pypdf text extraction is fully
local, so "parse before redact" involves no network.

### parser.py
- pypdf text extraction, all pages concatenated.
- Image-only/scanned PDFs (no text layer) → typed error `PDF_UNREADABLE`
  with a clear message. OCR is out of scope for v1.

### redactor.py
- Deterministic regex masking. No LLM, no network.
- Masks: account numbers, IBANs, card numbers (including partial forms like
  `**** 1234`), account-holder name, addresses, phone numbers, running
  balances.
- Preserves transaction lines: date, merchant/description, amount.
- Returns redacted text plus `masked_counts` per PII type for the
  `redaction_preview` in the response.
- Toggleable per upload (`redact` form field); default ON.

### extractor.py
- OpenAI structured-output mode against pydantic models
  (`Transaction`: date, description, amount, category, direction).
- Validation after each call: output parses, dates fall within the statement
  period, and when the statement carries its own totals the extracted amounts
  reconcile within ±1% or ±1.00 (whichever is larger).
- On validation failure: retry up to 2 times, feeding the validation error
  back into the prompt. After retries → `EXTRACTION_FAILED`.

### reviewer.py
- Builds a compact context block from Supabase: monthly income, known
  recurring expenses/subscriptions, and a 3-month per-category spend baseline
  from the user's expenses table.
- Prompt constrains flags to four types: `duplicate_subscription`,
  `fee_or_charge`, `above_baseline`, `impulse` — each with a one-sentence
  reason, severity, and an estimated monthly saving.
- Same validate-and-retry pattern as extractor.py.

### crosscheck.py
- Pure Python, no LLM.
- Compares only debit/expense transactions against the user's expenses table
  (credits/income are extracted but excluded from the cross-check in v1).
- Match rule: amount within ±0.01 AND date within ±3 days; merchant-name
  similarity as tie-breaker when several candidates match.
- Outputs: `missing_in_app`, `missing_on_statement`, `amount_mismatch`
  (with `statement_tx`, `app_expense`, `delta`).

## API

New router `api/routers/statements.py`, mounted under the existing `/api`
prefix, protected by the existing `get_current_user_id` dependency.

`POST /api/statements/review` — multipart form:
- `file`: PDF
- `redact`: bool, default `true`
- `statement_type`: `bank` | `credit_card`

Response:

```json
{
  "transactions": [{ "date": "", "description": "", "amount": 0, "category": "", "direction": "" }],
  "flags": [{ "transaction": {}, "reason": "", "severity": "", "monthly_saving_estimate": 0 }],
  "crosscheck": {
    "missing_in_app": [],
    "missing_on_statement": [],
    "amount_mismatch": [{ "statement_tx": {}, "app_expense": {}, "delta": 0 }]
  },
  "redaction_preview": { "masked_counts": { "iban": 2, "card": 1, "name": 4 } },
  "totals": { "statement_spend": 0, "flagged_spend": 0, "coverage_pct": 0 }
}
```

Typed error codes: `PDF_UNREADABLE`, `EXTRACTION_FAILED`, `LLM_UNAVAILABLE`,
`NO_TRANSACTIONS_FOUND`.

## Frontend

"Review statement" card on the expenses view, following the existing
dark-theme card patterns:
- Inputs: file picker, redaction toggle (default on), statement-type select.
- Results, three blocks mirroring the report:
  1. Flagged expenses — severity-sorted, reason shown, total potential
     saving.
  2. Cross-check discrepancies — each `missing_in_app` transaction has an
     **Add to expenses** button calling the existing `POST /api/expenses/`
     with the extracted category.
  3. Redaction summary from `redaction_preview`.

## Configuration

- `OPENAI_API_KEY` — required for the two LLM stages.
- `OPENAI_MODEL` — model name, swappable without code changes.

## Testing

No-network unit tests:
- **redactor** (most important): synthetic statement text → asserts PII gone
  and transaction lines intact.
- **crosscheck**: ±3-day boundary, duplicate amounts, amount mismatches.
- **extractor/reviewer**: validation-retry logic with a mocked OpenAI client.

One integration test: endpoint with a small synthetic PDF and mocked LLM.

## Out of scope (v1)

- OCR for scanned statements.
- Persisting reports / report history.
- Auto-import of missing transactions.
- Email or folder-based ingestion.
