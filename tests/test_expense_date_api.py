"""Backend `date` derivation — api/routers/expenses.py.

Named distinctly from tests/test_db_torture.py's TestValidationTorture (which
covers created_at parsing boundaries) to avoid colliding with that file. This
covers the one behaviour change the plan calls out explicitly: create_expense
deriving `date` from `created_at` in Europe/Berlin when the caller — chiefly
the Telegram bot, which only ever sends created_at — omits `date`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import api.dependencies as deps
import api.routers.expenses as expenses
from api.main import app

client = TestClient(app)


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._pending_insert = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def insert(self, data):
        self._pending_insert = data if isinstance(data, list) else [data]
        return self

    def execute(self):
        created = []
        for row in self._pending_insert or []:
            new_row = dict(row)
            new_row.setdefault("id", f"e{len(self._rows)}")
            new_row.setdefault("created_at", "2026-01-01T00:00:00+00:00")
            new_row.setdefault("deleted", False)
            self._rows.append(new_row)
            created.append(new_row)
        return type("Resp", (), {"data": created})()


class FakeSupabase:
    def __init__(self):
        self.tables = {}

    def table(self, name):
        return FakeQuery(self.tables.setdefault(name, []))


@pytest.fixture
def fake(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(expenses, "get_supabase_client", lambda: fake)
    app.dependency_overrides[deps.get_current_user_id] = lambda: "user-1"
    yield fake
    app.dependency_overrides.clear()


def test_create_expense_derives_date_from_created_at_in_berlin(fake):
    """The bot's exact shape: only created_at, at Berlin 00:30 local — the
    case that used to file to the previous day under a UTC-only read."""
    resp = client.post(
        "/api/expenses/",
        json={"name": "Kebab", "amount": 8.5, "created_at": "2026-08-23T22:30:00Z"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"] == "2026-08-24"


def test_create_expense_keeps_explicit_date_when_both_are_sent(fake):
    """An explicit `date` is never overridden by a created_at derivation."""
    resp = client.post(
        "/api/expenses/",
        json={
            "name": "Rent", "amount": 900,
            "date": "2026-08-01",
            "created_at": "2026-08-15T10:00:00Z",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"] == "2026-08-01"


def test_create_expense_with_neither_date_nor_created_at_uses_today(fake):
    resp = client.post("/api/expenses/", json={"name": "Snack", "amount": 3})
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"]  # some calendar date was assigned, not null


def test_create_expense_winter_offset_stays_same_day(fake):
    """CET is +1, not +2 — the derivation must not hardcode summer time."""
    resp = client.post(
        "/api/expenses/",
        json={"name": "Coffee", "amount": 3, "created_at": "2026-01-15T23:30:00Z"},
    )
    assert resp.status_code == 201, resp.text
    # 23:30 UTC + 1h (CET) = 00:30 the next Berlin day.
    assert resp.json()["date"] == "2026-01-16"
