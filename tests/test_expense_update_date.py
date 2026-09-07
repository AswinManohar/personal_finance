"""PUT /api/expenses/{id} keeps `date` in step with a changed `created_at`, and
the REST API carries `is_subscription` in both directions.

The fill trigger in supabase/migrations/20260824_user_expenses_date.sql is
BEFORE INSERT only, so an update that moves created_at without sending date
left the row dated by its old timestamp. The Telegram bot is REST-only and
never sees the supabase-js path, so a flag missing from the pydantic models is
a flag it cannot set.
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
    def __init__(self, store):
        self._store = store
        self._payload = None
        self._op = None

    def select(self, *_a, **_k): return self
    def eq(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self

    def insert(self, data):
        self._op, self._payload = "insert", data
        return self

    def update(self, data):
        self._op, self._payload = "update", data
        return self

    def execute(self):
        if self._op:
            self._store.append((self._op, self._payload))
            row = {"id": "e1", "user_key": "user-1", "name": "x", "amount": 1.0,
                   "category": "Other", "created_at": "2026-01-01T00:00:00+00:00",
                   **self._payload}
            return type("Resp", (), {"data": [row]})()
        return type("Resp", (), {"data": [{"id": "e1"}]})()


class FakeSupabase:
    def __init__(self): self.writes = []
    def table(self, _name): return FakeQuery(self.writes)


@pytest.fixture
def fake(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(expenses, "get_supabase_client", lambda: fake)
    app.dependency_overrides[deps.get_current_user_id] = lambda: "user-1"
    yield fake
    app.dependency_overrides.clear()


def test_update_with_only_created_at_rederives_date_in_berlin(fake):
    r = client.put("/api/expenses/e1", json={"created_at": "2026-08-23T22:30:00Z"})
    assert r.status_code == 200, r.text
    op, payload = fake.writes[-1]
    assert op == "update"
    assert payload["date"] == "2026-08-24"


def test_update_with_both_keeps_the_explicit_date(fake):
    r = client.put("/api/expenses/e1", json={"created_at": "2026-08-23T22:30:00Z", "date": "2026-08-01"})
    assert r.status_code == 200, r.text
    assert fake.writes[-1][1]["date"] == "2026-08-01"


def test_update_without_created_at_leaves_date_alone(fake):
    r = client.put("/api/expenses/e1", json={"name": "Renamed"})
    assert r.status_code == 200, r.text
    assert "date" not in fake.writes[-1][1]


def test_create_accepts_and_returns_is_subscription(fake):
    r = client.post("/api/expenses/", json={
        "name": "Netflix", "amount": 12.99, "is_recurring": True,
        "recurring_frequency": "monthly", "is_subscription": True,
    })
    assert r.status_code == 201, r.text
    assert fake.writes[-1][1]["is_subscription"] is True
    assert r.json()["is_subscription"] is True


def test_update_accepts_is_subscription(fake):
    r = client.put("/api/expenses/e1", json={"is_subscription": False})
    assert r.status_code == 200, r.text
    assert fake.writes[-1][1] == {"is_subscription": False}
