"""Tests for the read-only Life OS integration feeds.

Uses a fake Supabase service client so no live database is required. Validates
auth rejection, tombstone shaping, recurring fields, and the incremental cursor.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import api.routers.integrations as integrations
import api.dependencies as deps
from api.routers.integrations import _encode_cursor, _decode_cursor
from api.main import app


class FakeQuery:
    _OR_RE = re.compile(
        r'^(?P<key>\w+)\.gt\."(?P<ts>[^"]*)",and\((?P=key)\.eq\."(?P=ts)",id\.gt\."(?P<id>[^"]*)"\)$'
    )

    def __init__(self, rows):
        self._rows = rows
        self._since = None
        self._resume = None
        self._limit = None
        self._order_key = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def gt(self, key, value):
        self._since = (key, value)
        return self

    def or_(self, filters):
        # Composite-cursor resume filter emitted by integrations._apply_since.
        m = self._OR_RE.match(filters)
        assert m, f"fake cannot parse or_ filter: {filters}"
        self._resume = (m.group("key"), m.group("ts"), m.group("id"))
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
        if self._resume:
            key, ts, last_id = self._resume
            rows = [
                r for r in rows
                if (r.get(key) or "") > ts
                or ((r.get(key) or "") == ts and (r.get("id") or "") > last_id)
            ]
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

    # Short page (3 < default limit) => caught up => null cursor.
    assert body["next_cursor"] is None


def test_expenses_feed_since_cursor(monkeypatch):
    _install_fake(monkeypatch, {"user_expenses": EXPENSE_ROWS})
    client = TestClient(app)
    cursor = _encode_cursor("2026-06-01T12:00:00+00:00")
    resp = client.get("/v1/integrations/expenses", params={"since": cursor})
    ids = [d["id"] for d in resp.json()["data"]]
    assert ids == ["a2", "a3"]  # a1 excluded; later updates resurface


def test_expenses_feed_paging_emits_opaque_cursor(monkeypatch):
    _install_fake(monkeypatch, {"user_expenses": EXPENSE_ROWS})
    client = TestClient(app)
    # Full page (limit == returned) => opaque cursor that resumes correctly.
    page1 = client.get("/v1/integrations/expenses", params={"limit": 2}).json()
    assert [d["id"] for d in page1["data"]] == ["a1", "a2"]
    assert page1["next_cursor"] is not None
    # Composite (timestamp, boundary-row id) cursor — tie-safe resume.
    assert _decode_cursor(page1["next_cursor"]) == ("2026-06-02T08:00:00+00:00", "a2")

    page2 = client.get(
        "/v1/integrations/expenses", params={"limit": 2, "since": page1["next_cursor"]}
    ).json()
    assert [d["id"] for d in page2["data"]] == ["a3"]
    assert page2["next_cursor"] is None  # caught up


def test_expenses_feed_rejects_malformed_cursor(monkeypatch):
    _install_fake(monkeypatch, {"user_expenses": EXPENSE_ROWS})
    client = TestClient(app)
    resp = client.get("/v1/integrations/expenses", params={"since": "not a cursor!!"})
    assert resp.status_code == 400


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
