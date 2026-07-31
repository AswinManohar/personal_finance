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
    def eq(self, key, value):
        # Only "deleted" is actually filtered — rows missing the key are
        # treated as live (deleted=false), matching the "no deleted=true
        # means live" convention. Other columns (e.g. user_key) stay
        # unfiltered here since existing fixtures don't set them.
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


def test_build_context_excludes_soft_deleted_rows_from_baseline_and_recurring():
    now = datetime.now(timezone.utc)
    expenses = [
        {"name": "Rent", "amount": 900, "category": "Housing", "is_recurring": True,
         "created_at": (now - timedelta(days=10)).isoformat(), "deleted": False},
        # Tombstoned row: huge amount that would blow up the baseline and
        # falsely appear as a recurring bill if not filtered out.
        {"name": "Ghost subscription", "amount": 10000, "category": "Housing",
         "is_recurring": True, "created_at": (now - timedelta(days=5)).isoformat(),
         "deleted": True},
    ]
    ctx = build_context(FakeSupabase([{"salary_me": 1000, "salary_partner": 0}], expenses), "u1")
    assert ctx.baseline["Housing"] == 300.0  # 900 / 3 months, tombstone excluded
    assert ctx.recurring == [{"name": "Rent", "amount": 900, "category": "Housing"}]


def test_build_context_handles_missing_and_none_amounts():
    now = datetime.now(timezone.utc)
    expenses = [
        {"name": "Subscription", "amount": None, "category": "Entertainment", "is_recurring": True,
         "created_at": (now - timedelta(days=5)).isoformat()},
        {"amount": 50, "category": "Food", "is_recurring": True,
         "created_at": (now - timedelta(days=5)).isoformat()},  # missing "name" key
    ]
    ctx = build_context(FakeSupabase([{"salary_me": 1000, "salary_partner": 0}], expenses), "u1")
    assert ctx.baseline["Entertainment"] == 0.0  # None amount contributes 0
    assert ctx.recurring == [
        {"name": "Subscription", "amount": 0.0, "category": "Entertainment"},
        {"name": None, "amount": 50.0, "category": "Food"},
    ]


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
