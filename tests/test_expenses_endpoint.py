"""GET/PUT /api/expenses/ must not leak or edit soft-deleted (tombstoned)
rows. DELETE is intentionally untouched — see api/routers/expenses.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

import api.routers.expenses as expenses
from api.dependencies import get_current_user_id
from api.main import app

client = TestClient(app)


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows  # shared list reference; update() mutates rows in place
        self._filters = []
        self._update_data = None
        self._limit = None

    def select(self, *_a, **_k): return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def update(self, data):
        self._update_data = data
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _matches(self, row):
        for key, value in self._filters:
            if key == "deleted":
                if bool(row.get("deleted", False)) != value:
                    return False
            elif row.get(key) != value:
                return False
        return True

    def execute(self):
        matched = [r for r in self._rows if self._matches(r)]
        if self._update_data is not None:
            for r in matched:
                r.update(self._update_data)
        if self._limit is not None:
            matched = matched[: self._limit]
        return type("Resp", (), {"data": matched})()


class FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return FakeQuery(self._rows)


def _install_fake(monkeypatch, rows):
    fake = FakeSupabase(rows)
    monkeypatch.setattr(expenses, "get_supabase_client", lambda: fake)
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    return fake


def teardown_function():
    app.dependency_overrides.clear()


LIVE_ROW = {"id": "e1", "user_key": "user-1", "name": "Groceries", "amount": 30.0,
            "category": "Food", "vendor": None, "is_recurring": False,
            "recurring_frequency": None, "created_at": "2026-06-01T00:00:00+00:00",
            "deleted": False}
TOMBSTONE_ROW = {"id": "e2", "user_key": "user-1", "name": "Ghost", "amount": 99.0,
                  "category": "Other", "vendor": None, "is_recurring": False,
                  "recurring_frequency": None, "created_at": "2026-05-01T00:00:00+00:00",
                  "deleted": True}
# Pre-tombstone-column row: no "deleted" key at all. Must still read as live.
LEGACY_ROW = {"id": "e3", "user_key": "user-1", "name": "Legacy", "amount": 12.0,
              "category": "Other", "vendor": None, "is_recurring": False,
              "recurring_frequency": None, "created_at": "2026-04-01T00:00:00+00:00"}


def test_get_expenses_excludes_tombstoned_rows(monkeypatch):
    _install_fake(monkeypatch, [dict(LIVE_ROW), dict(TOMBSTONE_ROW)])
    resp = client.get("/api/expenses/")
    assert resp.status_code == 200, resp.text
    ids = [e["id"] for e in resp.json()]
    assert ids == ["e1"]


def test_get_expenses_treats_rows_without_deleted_key_as_live(monkeypatch):
    _install_fake(monkeypatch, [dict(LEGACY_ROW)])
    resp = client.get("/api/expenses/")
    assert resp.status_code == 200, resp.text
    assert [e["id"] for e in resp.json()] == ["e3"]


def test_put_on_live_expense_updates_it(monkeypatch):
    _install_fake(monkeypatch, [dict(LIVE_ROW)])
    resp = client.put("/api/expenses/e1", json={"name": "Weekly Groceries"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Weekly Groceries"


def test_put_on_tombstoned_expense_returns_404(monkeypatch):
    _install_fake(monkeypatch, [dict(TOMBSTONE_ROW)])
    resp = client.put("/api/expenses/e2", json={"name": "Resurrected"})
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Expense not found"


def test_put_on_missing_expense_returns_404(monkeypatch):
    _install_fake(monkeypatch, [dict(LIVE_ROW)])
    resp = client.put("/api/expenses/does-not-exist", json={"name": "Nope"})
    assert resp.status_code == 404, resp.text
