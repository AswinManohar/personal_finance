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
    def eq(self, key, value):
        # Only "deleted" is really filtered; rows missing the key are treated
        # as live (deleted=false) — mirrors the "no deleted=true means live"
        # convention. Other columns stay unfiltered since existing fixtures
        # don't set them (single-user fixtures throughout this module).
        if key == "deleted":
            self._rows = [r for r in self._rows if r.get("deleted", False) == value]
        return self
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


# --- Additional status-code coverage: 502, 503, 413, and the credits doubt ---

class FakeResponsesBadExtraction:
    """Always returns an extraction whose total_debits can never reconcile,
    so every retry is rejected by validate_extraction() and extract_transactions
    exhausts its retries and raises ExtractionFailedError."""
    def __init__(self): self.calls = []
    def parse(self, **kw):
        self.calls.append(kw)
        if kw["text_format"] is ExtractionResult:
            bad = ExtractionResult(
                transactions=[StatementTransaction(date="2026-06-01", description="X",
                                                    amount=10.0, category="Other",
                                                    direction="debit")],
                total_debits=99999.99,
            )
            return FakeParsed(bad)
        return FakeParsed(FlagList(flags=[]))
class FakeOpenAIBadExtraction:
    def __init__(self): self.responses = FakeResponsesBadExtraction()


class FakeResponsesConnectionError:
    def parse(self, **kw):
        raise ConnectionError("boom")
class FakeOpenAIConnectionError:
    def __init__(self): self.responses = FakeResponsesConnectionError()


def test_extraction_failure_maps_to_502():
    bad_llm = FakeOpenAIBadExtraction()
    app.dependency_overrides[statements.get_openai_client] = lambda: bad_llm
    try:
        resp = _post(redact="true", statement_type="bank")
        assert resp.status_code == 502, resp.text
        assert resp.json()["detail"]["code"] == "EXTRACTION_FAILED"
    finally:
        app.dependency_overrides[statements.get_openai_client] = lambda: statements._fake_llm_for_tests


def test_llm_connection_error_maps_to_503():
    down_llm = FakeOpenAIConnectionError()
    app.dependency_overrides[statements.get_openai_client] = lambda: down_llm
    try:
        resp = _post(redact="true", statement_type="bank")
        assert resp.status_code == 503, resp.text
        assert resp.json()["detail"]["code"] == "LLM_UNAVAILABLE"
    finally:
        app.dependency_overrides[statements.get_openai_client] = lambda: statements._fake_llm_for_tests


def test_oversize_pdf_maps_to_413():
    files = {"file": ("big.pdf", b"x" * (10 * 1024 * 1024 + 1), "application/pdf")}
    resp = client.post("/api/statements/review", files=files, data={"redact": "true"})
    assert resp.status_code == 413, resp.text


TXS_WITH_CREDIT = TXS + [
    StatementTransaction(date="2026-06-10", description="SALARY", amount=3000.0,
                         category="Income", direction="credit"),
]


class FakeResponsesWithCredit:
    def __init__(self): self.calls = []
    def parse(self, **kw):
        self.calls.append(kw)
        if kw["text_format"] is ExtractionResult:
            return FakeParsed(ExtractionResult(transactions=TXS_WITH_CREDIT))
        return FakeParsed(FlagList(flags=[]))
class FakeOpenAIWithCredit:
    def __init__(self): self.responses = FakeResponsesWithCredit()


def test_credit_transaction_excluded_from_debit_totals_and_crosscheck():
    credit_llm = FakeOpenAIWithCredit()
    app.dependency_overrides[statements.get_openai_client] = lambda: credit_llm
    try:
        resp = _post(redact="true", statement_type="bank")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # the credit (SALARY) is included in the raw extraction...
        assert len(body["transactions"]) == 3
        # ...but crosscheck() filters to debits internally, so it never shows
        # up as "missing" spend, and the debit-only totals are unaffected.
        missing = body["crosscheck"]["missing_in_app"]
        assert [m["description"] for m in missing] == ["Netflix"]
        assert body["totals"]["statement_spend"] == 67.29
        assert body["totals"]["coverage_pct"] == 50.0
    finally:
        app.dependency_overrides[statements.get_openai_client] = lambda: statements._fake_llm_for_tests


# --- Soft-deleted (tombstoned) user_expenses rows must not corrupt the review ---

class FakeSupabaseWithTombstone:
    """Same fixture as FakeSupabase, plus a soft-deleted row that would match
    the Netflix statement transaction (same amount + date) if the tombstone
    filter were missing — it would then wrongly count as matched, inflating
    coverage_pct and dropping Netflix from missing_in_app."""
    def table(self, name):
        if name == "user_income":
            return FakeTable([{"salary_me": 3000, "salary_partner": 0}])
        return FakeTable([
            {"id": "e1", "name": "Groceries", "amount": 54.30, "vendor": "REWE",
             "category": "Food", "is_recurring": False,
             "created_at": "2026-06-01T00:00:00+00:00", "deleted": False},
            {"id": "e2", "name": "Netflix", "amount": 12.99, "vendor": None,
             "category": "Entertainment", "is_recurring": False,
             "created_at": "2026-06-15T00:00:00+00:00", "deleted": True},
        ])


def test_tombstoned_expense_excluded_from_crosscheck_and_coverage():
    tombstone_supabase = FakeSupabaseWithTombstone()
    real_get_supabase = statements.get_supabase_for_review
    statements.get_supabase_for_review = lambda: tombstone_supabase
    try:
        resp = _post(redact="true", statement_type="bank")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        missing = [m["description"] for m in body["crosscheck"]["missing_in_app"]]
        # Netflix must still be reported missing — the tombstoned e2 row must
        # not be allowed to "match" it.
        assert "Netflix" in missing
        assert body["totals"]["coverage_pct"] == 50.0
    finally:
        statements.get_supabase_for_review = real_get_supabase


# --- redact_names form field: merges with env REDACT_NAMES, dedupes, masks ---

NAME_PDF = make_pdf(["Statement June 2026", "Account holder: Jane Doe",
                     "01.06.2026 REWE -54.30", "15.06.2026 Netflix -12.99"])


def _post_name_pdf(**form):
    files = {"file": ("stmt.pdf", NAME_PDF, "application/pdf")}
    return client.post("/api/statements/review", files=files, data=form)


def test_redact_names_field_masks_the_passed_name_before_llm(monkeypatch):
    monkeypatch.delenv("REDACT_NAMES", raising=False)
    resp = _post_name_pdf(redact="true", statement_type="bank", redact_names="Jane Doe")
    assert resp.status_code == 200, resp.text
    llm_input = str(statements._fake_llm_for_tests.responses.calls[-1]["input"])
    assert "Jane Doe" not in llm_input
    assert resp.json()["redaction_preview"]["masked_counts"].get("name") == 1


def test_env_redact_names_still_works_without_the_form_field(monkeypatch):
    monkeypatch.setenv("REDACT_NAMES", "Jane Doe")
    resp = _post_name_pdf(redact="true", statement_type="bank")
    assert resp.status_code == 200, resp.text
    llm_input = str(statements._fake_llm_for_tests.responses.calls[-1]["input"])
    assert "Jane Doe" not in llm_input
    assert resp.json()["redaction_preview"]["masked_counts"].get("name") == 1


def test_env_and_form_redact_names_both_get_applied(monkeypatch):
    # Merge/dedupe of the two name lists is unit-tested directly in
    # tests/test_statement_pipeline.py; this just checks the form field and
    # the env var both reach the redaction step through the live endpoint.
    monkeypatch.setenv("REDACT_NAMES", "Jane Doe")
    resp = _post_name_pdf(redact="true", statement_type="bank", redact_names="Jane Doe, John Smith")
    assert resp.status_code == 200, resp.text
    assert resp.json()["redaction_preview"]["masked_counts"].get("name") == 1
