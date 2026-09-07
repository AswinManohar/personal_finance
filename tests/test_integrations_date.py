"""The expenses feed carries the stored `date` and the subscription flag.

The feed's select list was written before either column existed, so
`_shape_expense`'s `row.get("date") or _berlin_date(created_at)` always took
the fallback: an explicitly back-dated row (a statement import, an edited
date, the migration backfill) reached Life OS under its created_at day. The
fake in tests/test_integrations.py ignores the column list, which is why it
could not see this; this one records it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

import api.dependencies as deps
import api.routers.integrations as integrations
from api.main import app

client = TestClient(app)


class FakeQuery:
    def __init__(self, rows, log):
        self._rows, self._log = rows, log

    def select(self, columns, *_a, **_k):
        self._log.append(columns)
        cols = [c.strip() for c in columns.split(",")]
        self._rows = [{k: v for k, v in r.items() if k in cols} for r in self._rows]
        return self

    def eq(self, *_a, **_k): return self
    def gt(self, *_a, **_k): return self
    def or_(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self

    def execute(self):
        return type("Resp", (), {"data": self._rows})()


class FakeSupabase:
    def __init__(self, rows):
        self.rows, self.selects = rows, []

    def table(self, _name):
        return FakeQuery(list(self.rows), self.selects)


def _install(monkeypatch, rows):
    fake = FakeSupabase(rows)
    monkeypatch.setattr(integrations, "get_service_supabase_client", lambda: fake)
    app.dependency_overrides[deps.get_integration_user_key] = lambda: "user-123"
    return fake


def teardown_function():
    app.dependency_overrides.clear()


BACKDATED = {
    "id": "a1", "name": "Statement import", "amount": "23.50", "category": "Food",
    "vendor": None, "is_recurring": True, "recurring_frequency": "monthly",
    "is_subscription": True, "date": "2026-08-01",
    "created_at": "2026-08-15T10:00:00+00:00", "updated_at": "2026-08-15T10:00:00+00:00",
    "deleted": False,
}


def test_feed_reports_the_stored_date_not_the_created_at_day(monkeypatch):
    _install(monkeypatch, [BACKDATED])
    r = client.get("/v1/integrations/expenses")
    assert r.status_code == 200
    assert r.json()["data"][0]["date"] == "2026-08-01"


def test_feed_carries_the_subscription_flag(monkeypatch):
    _install(monkeypatch, [BACKDATED])
    r = client.get("/v1/integrations/expenses")
    assert r.json()["data"][0]["isSubscription"] is True


def test_feed_tolerates_a_created_at_at_the_edge_of_time(monkeypatch):
    # POST /api/expenses/ accepts this timestamp (tests/test_db_torture.py), and
    # shifting it into Berlin's positive offset overflows datetime. One such
    # row must not 500 the whole feed.
    row = {**BACKDATED, "id": "a2", "date": None, "created_at": "9999-12-31T23:59:59+00:00"}
    _install(monkeypatch, [row])
    r = client.get("/v1/integrations/expenses")
    assert r.status_code == 200
    assert r.json()["data"][0]["date"] == "9999-12-31"
