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
