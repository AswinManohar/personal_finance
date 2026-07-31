"""Unit tests for api.statement_review.pipeline.run_review: tombstone
filtering on the crosscheck query, and extra_names merging with the
server-side REDACT_NAMES env list."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review import pipeline
from api.statement_review.models import ExtractionResult, FlagList, StatementTransaction


class FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k): return self

    def eq(self, key, value):
        # Only "deleted" is really filtered; missing key == live (deleted=false).
        if key == "deleted":
            self._rows = [r for r in self._rows if r.get("deleted", False) == value]
        return self

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


TX = StatementTransaction(date="2026-06-01", description="REWE", amount=54.30,
                          category="Food", direction="debit")


class FakeParsed:
    def __init__(self, r): self.output_parsed = r


class FakeResponses:
    def __init__(self): self.calls = []

    def parse(self, **kw):
        self.calls.append(kw)
        if kw["text_format"] is ExtractionResult:
            return FakeParsed(ExtractionResult(transactions=[TX]))
        return FakeParsed(FlagList(flags=[]))


class FakeClient:
    def __init__(self): self.responses = FakeResponses()


def _run(monkeypatch, expense_rows, *, extra_names=None, redact_enabled=False):
    monkeypatch.setattr(pipeline, "extract_text", lambda _pdf_bytes: "01.06.2026 REWE -54.30")
    supabase = FakeSupabase([{"salary_me": 0, "salary_partner": 0}], expense_rows)
    return pipeline.run_review(
        b"irrelevant", redact_enabled=redact_enabled, statement_type="bank", user_id="u1",
        supabase=supabase, client=FakeClient(), model="m", extra_names=extra_names,
    )


def test_crosscheck_query_excludes_soft_deleted_rows(monkeypatch):
    rows = [
        {"id": "e1", "name": "REWE", "amount": 54.30, "vendor": "REWE",
         "created_at": "2026-06-01T00:00:00+00:00", "deleted": True},
    ]
    report = _run(monkeypatch, rows)
    # The tombstoned row would otherwise exact-match the REWE transaction and
    # hide it from missing_in_app while inflating coverage_pct.
    assert [t.description for t in report.crosscheck.missing_in_app] == ["REWE"]
    assert report.totals.coverage_pct == 0.0


def test_crosscheck_query_still_matches_live_rows(monkeypatch):
    rows = [
        {"id": "e1", "name": "REWE", "amount": 54.30, "vendor": "REWE",
         "created_at": "2026-06-01T00:00:00+00:00", "deleted": False},
    ]
    report = _run(monkeypatch, rows)
    assert report.crosscheck.missing_in_app == []
    assert report.totals.coverage_pct == 100.0


def test_run_review_merges_env_and_form_names_deduped(monkeypatch):
    monkeypatch.setenv("REDACT_NAMES", "Jane Doe,")
    captured = {}
    real_redact = pipeline.redact

    def spy_redact(text, extra_names=None):
        captured["extra_names"] = extra_names
        return real_redact(text, extra_names=extra_names)

    monkeypatch.setattr(pipeline, "redact", spy_redact)
    _run(monkeypatch, [], extra_names=["Jane Doe", "John Smith"], redact_enabled=True)
    # env's "Jane Doe" and the passed-through "Jane Doe" collapse to one
    # entry; blanks from the env list are stripped.
    assert captured["extra_names"] == ["Jane Doe", "John Smith"]


def test_run_review_env_only_still_works_without_extra_names(monkeypatch):
    monkeypatch.setenv("REDACT_NAMES", "Jane Doe")
    captured = {}
    real_redact = pipeline.redact

    def spy_redact(text, extra_names=None):
        captured["extra_names"] = extra_names
        return real_redact(text, extra_names=extra_names)

    monkeypatch.setattr(pipeline, "redact", spy_redact)
    _run(monkeypatch, [], extra_names=None, redact_enabled=True)
    assert captured["extra_names"] == ["Jane Doe"]
