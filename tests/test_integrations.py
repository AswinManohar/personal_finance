"""Tests for the read-only Life OS integration feeds.

Uses a fake Supabase service client so no live database is required. Validates
auth rejection, tombstone shaping, recurring fields, and the incremental cursor.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import api.routers.integrations as integrations
import api.dependencies as deps
from api.main import app


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._since = None
        self._limit = None
        self._order_key = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def gt(self, key, value):
        self._since = (key, value)
        return self

    def order(self, key, desc=False):
        self._order_key = key
        self._rows = sorted(self._rows, key=lambda r: r.get(key) or "", reverse=desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        rows = self._rows
        if self._since:
            key, value = self._since
            rows = [r for r in rows if (r.get(key) or "") > value]
        if self._limit is not None:
            rows = rows[: self._limit]
        return type("Resp", (), {"data": rows})()


class FakeSupabase:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return FakeQuery(list(self._tables.get(name, [])))


EXPENSE_ROWS = [
    {
        "id": "a1", "name": "Lieferando", "amount": "23.50", "category": "Food",
        "vendor": "Lieferando", "is_recurring": False, "recurring_frequency": None,
        "created_at": "2026-06-01T12:00:00+00:00", "updated_at": "2026-06-01T12:00:00+00:00",
        "deleted": False,
    },
    {
        "id": "a2", "name": "Rent", "amount": "1200", "category": "Housing",
        "vendor": None, "is_recurring": True, "recurring_frequency": "monthly",
        "created_at": "2026-06-02T08:00:00+00:00", "updated_at": "2026-06-02T08:00:00+00:00",
        "deleted": False,
    },
    {
        "id": "a3", "name": "Old", "amount": "5", "category": "Other",
        "vendor": None, "is_recurring": False, "recurring_frequency": None,
        "created_at": "2026-05-01T08:00:00+00:00", "updated_at": "2026-06-03T09:00:00+00:00",
        "deleted": True,
    },
]


def _install_fake(monkeypatch, tables):
    fake = FakeSupabase(tables)
    monkeypatch.setattr(integrations, "get_service_supabase_client", lambda: fake)
    app.dependency_overrides[deps.get_integration_user_key] = lambda: "user-123"


def teardown_function():
    app.dependency_overrides.clear()


def test_expenses_requires_token():
    client = TestClient(app)
    resp = client.get("/v1/integrations/expenses")
    assert resp.status_code == 401


def test_expenses_feed_shapes_rows(monkeypatch):
    _install_fake(monkeypatch, {"user_expenses": EXPENSE_ROWS})
    client = TestClient(app)
    resp = client.get("/v1/integrations/expenses")
    assert resp.status_code == 200
    body = resp.json()
    data = body["data"]
    assert len(data) == 3

    # Ordered by updated_at ascending.
    assert [d["id"] for d in data] == ["a1", "a2", "a3"]

    # Active row keeps full shape incl. vendor + recurring frequency.
    rent = next(d for d in data if d["id"] == "a2")
    assert rent["isRecurring"] is True
    assert rent["recurringFrequency"] == "monthly"
    assert rent["amount"] == 1200.0
    assert rent["deleted"] is False

    # Deleted row collapses to a tombstone.
    ghost = next(d for d in data if d["id"] == "a3")
    assert ghost == {"id": "a3", "deleted": True, "updated_at": "2026-06-03T09:00:00+00:00"}

    # Cursor is the last (max) updated_at.
    assert body["next_cursor"] == "2026-06-03T09:00:00+00:00"


def test_expenses_feed_since_cursor(monkeypatch):
    _install_fake(monkeypatch, {"user_expenses": EXPENSE_ROWS})
    client = TestClient(app)
    resp = client.get("/v1/integrations/expenses", params={"since": "2026-06-01T12:00:00+00:00"})
    ids = [d["id"] for d in resp.json()["data"]]
    assert ids == ["a2", "a3"]  # a1 excluded; later updates resurface


def test_income_snapshot(monkeypatch):
    _install_fake(monkeypatch, {"user_income": [
        {"salary_me": "5000", "salary_partner": "4000", "updated_at": "2026-06-10T00:00:00+00:00"}
    ]})
    client = TestClient(app)
    resp = client.get("/v1/integrations/income")
    assert resp.json() == {"salaryMe": 5000.0, "salaryPartner": 4000.0, "updatedAt": "2026-06-10T00:00:00+00:00"}


def test_hash_is_stable_and_hex():
    h = deps.hash_integration_token("ff_live_abc")
    assert h == deps.hash_integration_token("ff_live_abc")
    assert len(h) == 64 and all(c in "0123456789abcdef" for c in h)
