import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from api.statement_review.extractor import extract_transactions, validate_extraction
from api.statement_review.models import ExtractionResult, StatementTransaction
from api.statement_review.errors import (
    ExtractionFailedError,
    LlmUnavailableError,
    NoTransactionsFoundError,
)

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


class RaisingResponses:
    def __init__(self, exc):
        self._exc = exc
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        raise self._exc


class RaisingClient:
    def __init__(self, exc):
        self.responses = RaisingResponses(exc)


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
    # the retry prompt must carry the validation error back to the model,
    # including the escape hatch: a misidentified statement total (e.g. a
    # fee-summary line) should be dropped, not fought over for 3 rounds
    retry_input = str(client.responses.calls[1]["input"])
    assert "reconcile" in retry_input
    assert "null" in retry_input


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


def test_connection_error_raises_llm_unavailable():
    client = RaisingClient(ConnectionError("boom"))
    with pytest.raises(LlmUnavailableError) as exc_info:
        extract_transactions("text", "bank", client, model="test-model")
    assert "boom" in str(exc_info.value)


def test_connection_error_does_not_retry():
    client = RaisingClient(ConnectionError("boom"))
    with pytest.raises(LlmUnavailableError):
        extract_transactions("text", "bank", client, model="test-model", max_retries=2)
    assert len(client.responses.calls) == 1


def test_none_parsed_result_retries_then_succeeds():
    good = ExtractionResult(transactions=[TX], total_debits=54.30)
    client = FakeClient([None, good])
    result = extract_transactions("text", "bank", client, model="test-model")
    assert result.total_debits == 54.30
    assert len(client.responses.calls) == 2


def test_validate_rejects_negative_amounts():
    # Statements print money out as negative (e.g. "-1.500,00" or trailing
    # "9,00-"), but the pipeline contract is: amount is always the positive
    # absolute value, direction carries the sign. A negative amount would
    # corrupt statement_spend and never match app expenses in crosscheck.
    neg = StatementTransaction(date="2026-06-01", description="rent", amount=-1500.0,
                               category="Housing", direction="debit")
    problems = validate_extraction(ExtractionResult(transactions=[neg]))
    assert any("positive" in p for p in problems)


def test_negative_amount_is_retried_with_feedback():
    neg = StatementTransaction(date="2026-06-01", description="rent", amount=-1500.0,
                               category="Housing", direction="debit")
    bad = ExtractionResult(transactions=[neg])
    good = ExtractionResult(transactions=[TX], total_debits=54.30)
    client = FakeClient([bad, good])
    result = extract_transactions("text", "bank", client, model="test-model")
    assert result.transactions[0].amount == 54.30
    retry_input = str(client.responses.calls[1]["input"])
    assert "positive" in retry_input


def test_system_prompt_teaches_statement_sign_convention():
    good = ExtractionResult(transactions=[TX], total_debits=54.30)
    client = FakeClient([good])
    extract_transactions("text", "bank", client, model="test-model")
    system = str(client.responses.calls[0]["input"][0]["content"])
    assert "negative" in system          # statement-side convention explained
    assert "absolute value" in system    # output-side contract explained
    assert "direction=debit" in system
    # total_debits must be the grand total of money out — fee summaries and
    # attachment totals ("Abrechnung 9,00-") must not be mistaken for it
    assert "grand total" in system
    assert "fee" in system


def test_validate_flags_bad_dates_and_reconciliation():
    bad_date = StatementTransaction(date="junk", description="x", amount=1,
                                    category="Other", direction="debit")
    problems = validate_extraction(ExtractionResult(transactions=[bad_date]))
    assert any("date" in p for p in problems)
    off_problems = validate_extraction(ExtractionResult(transactions=[TX], total_debits=500.0))
    assert any("reconcile" in p for p in off_problems)
