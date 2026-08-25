"""Regression guard for the Telegram -> API -> Life OS expense pipeline.

`tests/test_integrations.py` already covers expense feed shaping, the opaque
cursor and the income snapshot. This file closes the gaps that matter before the
client-side sync logic is rewritten for the Android app:

  * the **write** half of the pipeline (POST /api/expenses/ under
    X-Personal-Token automation auth) — previously untested end to end,
  * a bot-written expense actually surfacing in the Life OS feed,
  * integration-token scoping to exactly one user_key, and rejection of revoked
    tokens (previously bypassed via dependency_overrides),
  * the savings-history feed, previously untested entirely,
  * cursor re-pull idempotency and the `id` tiebreak on equal timestamps,
  * `date` deriving from created_at, and recurring rows surfacing exactly once
    rather than being materialized per occurrence.

These are characterization tests: they pin behaviour as it exists today so that
changing sync cannot silently break the integration.

The fake Supabase client below honours eq/gt/order/limit/insert, unlike the
simpler fake in test_integrations.py, because token scoping and multi-key
ordering cannot be exercised without it.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import api.dependencies as deps
import api.routers.expenses as expenses_router
import api.routers.integrations as integrations
from api.dependencies import hash_integration_token
from api.main import app
from api.routers.integrations import _encode_cursor


# --- Fake Supabase -----------------------------------------------------------

class FakeQuery:
    """Honours the subset of PostgREST chaining the routers actually use."""

    def __init__(self, table_name, tables):
        self._name = table_name
        self._tables = tables
        self._rows = list(tables.get(table_name, []))
        self._filters = []   # (op, key, value)
        self._orders = []    # (key, desc)
        self._limit = None
        self._pending_insert = None
        self._pending_update = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def gt(self, key, value):
        self._filters.append(("gt", key, value))
        return self

    def order(self, key, desc=False):
        self._orders.append((key, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, data):
        self._pending_insert = data if isinstance(data, list) else [data]
        return self

    def update(self, values):
        self._pending_update = values
        return self

    def _matches(self, row):
        for op, key, value in self._filters:
            if op == "eq" and row.get(key) != value:
                return False
            if op == "gt" and not ((row.get(key) or "") > value):
                return False
        return True

    def execute(self):
        if self._pending_update is not None:
            touched = []
            for row in self._tables.get(self._name, []):
                if self._matches(row):
                    row.update(self._pending_update)
                    # Mirror the DB's update_updated_at trigger, without which a
                    # tombstone would never resurface in the change feed.
                    row["updated_at"] = "2026-07-02T00:00:00+00:00"
                    touched.append(row)
            return type("Resp", (), {"data": touched})()

        if self._pending_insert is not None:
            created = []
            for row in self._pending_insert:
                new_row = dict(row)
                new_row.setdefault("id", str(uuid.uuid4()))
                new_row.setdefault("created_at", "2026-07-01T00:00:00+00:00")
                new_row.setdefault("updated_at", "2026-07-01T00:00:00+00:00")
                new_row.setdefault("deleted", False)
                self._tables.setdefault(self._name, []).append(new_row)
                created.append(new_row)
            return type("Resp", (), {"data": created})()

        rows = self._rows
        for op, key, value in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(key) == value]
            elif op == "gt":
                rows = [r for r in rows if (r.get(key) or "") > value]

        # Apply orders as one composite sort so `id` genuinely breaks ties on
        # equal `updated_at`, the way ORDER BY updated_at, id does.
        if self._orders:
            if any(desc for _, desc in self._orders):
                for key, desc in reversed(self._orders):
                    rows = sorted(rows, key=lambda r: r.get(key) or "", reverse=desc)
            else:
                keys = [k for k, _ in self._orders]
                rows = sorted(rows, key=lambda r: tuple(r.get(k) or "" for k in keys))

        if self._limit is not None:
            rows = rows[: self._limit]
        return type("Resp", (), {"data": rows})()


class FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return FakeQuery(name, self.tables)


BOT_TOKEN = "personal-secret-token"
BOT_USER = "user-123"
OTHER_USER = "user-999"
INTEGRATION_TOKEN = "ff_live_lifeos"


@pytest.fixture
def tables():
    return {
        "integration_tokens": [
            {"user_key": BOT_USER, "token_hash": hash_integration_token(INTEGRATION_TOKEN)},
        ],
        "user_expenses": [],
        "user_savings_history": [],
        "user_income": [],
    }


@pytest.fixture
def client(monkeypatch, tables):
    """Wires the fake into every place the routers reach for a client.

    Note both `api.dependencies` and `api.routers.integrations` hold their own
    reference to get_service_supabase_client, so both need patching.
    """
    fake = FakeSupabase(tables)
    monkeypatch.setattr(deps, "get_service_supabase_client", lambda: fake)
    monkeypatch.setattr(integrations, "get_service_supabase_client", lambda: fake)
    monkeypatch.setattr(expenses_router, "get_supabase_client", lambda: fake)
    monkeypatch.setattr(deps, "PERSONAL_API_TOKEN", BOT_TOKEN)
    monkeypatch.setattr(deps, "PERSONAL_USER_ID", BOT_USER)
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _feed(client, **params):
    return client.get(
        "/v1/integrations/expenses",
        headers={"X-Integration-Token": INTEGRATION_TOKEN},
        params=params,
    )


# --- The write half: Telegram bot -> API -------------------------------------

def test_bot_creates_expense_with_personal_token(client, tables):
    """The automation path the Telegram bot uses to log an expense from a bill."""
    resp = client.post(
        "/api/expenses/",
        headers={"X-Personal-Token": BOT_TOKEN},
        json={"name": "REWE", "amount": 42.5, "category": "Food", "vendor": "REWE"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "REWE"
    assert body["amount"] == 42.5
    # Server assigns ownership from the token, never from the request body.
    assert body["user_key"] == BOT_USER
    assert len(tables["user_expenses"]) == 1


def test_bot_write_rejected_without_token(client):
    resp = client.post("/api/expenses/", json={"name": "REWE", "amount": 42.5})
    assert resp.status_code == 401


def test_bot_write_rejected_with_wrong_token(client):
    resp = client.post(
        "/api/expenses/",
        headers={"X-Personal-Token": "not-the-token"},
        json={"name": "REWE", "amount": 42.5},
    )
    assert resp.status_code == 401


def test_bot_cannot_forge_ownership(client, tables):
    """A user_key in the payload must not override the token's identity."""
    client.post(
        "/api/expenses/",
        headers={"X-Personal-Token": BOT_TOKEN},
        json={"name": "REWE", "amount": 10, "category": "Food", "user_key": OTHER_USER},
    )
    assert tables["user_expenses"][0]["user_key"] == BOT_USER


# --- The full pipeline: bot write -> Life OS read ----------------------------

def test_bot_written_expense_surfaces_in_life_os_feed(client):
    """End-to-end guard: what the bot writes is what Life OS pulls."""
    client.post(
        "/api/expenses/",
        headers={"X-Personal-Token": BOT_TOKEN},
        json={"name": "Lieferando", "amount": 23.5, "category": "Food", "vendor": "Lieferando"},
    )

    body = _feed(client).json()
    assert len(body["data"]) == 1
    row = body["data"][0]
    assert row["name"] == "Lieferando"
    assert row["amount"] == 23.5
    assert row["category"] == "Food"
    assert row["vendor"] == "Lieferando"
    assert row["deleted"] is False
    assert row["isRecurring"] is False


# --- Integration token scoping ------------------------------------------------

def test_integration_token_scopes_to_its_owner(client, tables):
    """A token must expose only its owner's rows, never another user's."""
    tables["user_expenses"].extend([
        {"id": "mine", "user_key": BOT_USER, "name": "Mine", "amount": "1",
         "category": "Other", "is_recurring": False,
         "created_at": "2026-06-01T00:00:00+00:00", "updated_at": "2026-06-01T00:00:00+00:00",
         "deleted": False},
        {"id": "theirs", "user_key": OTHER_USER, "name": "Theirs", "amount": "2",
         "category": "Other", "is_recurring": False,
         "created_at": "2026-06-01T00:00:00+00:00", "updated_at": "2026-06-01T00:00:00+00:00",
         "deleted": False},
    ])

    ids = [r["id"] for r in _feed(client).json()["data"]]
    assert ids == ["mine"]


def test_revoked_integration_token_is_rejected(client):
    resp = client.get(
        "/v1/integrations/expenses",
        headers={"X-Integration-Token": "ff_live_revoked"},
    )
    assert resp.status_code == 401


def test_integration_token_accepted_as_bearer(client):
    """Both header styles are part of the contract."""
    resp = client.get(
        "/v1/integrations/expenses",
        headers={"Authorization": f"Bearer {INTEGRATION_TOKEN}"},
    )
    assert resp.status_code == 200


# --- Feed semantics Life OS depends on ---------------------------------------

def _expense(id_, updated_at, **over):
    row = {
        "id": id_, "user_key": BOT_USER, "name": f"E{id_}", "amount": "10",
        "category": "Other", "vendor": None, "is_recurring": False,
        "recurring_frequency": None, "created_at": "2026-06-01T00:00:00+00:00",
        "updated_at": updated_at, "deleted": False,
    }
    row.update(over)
    return row


def test_ordering_tiebreaks_on_id_for_equal_timestamps(client, tables):
    """Equal updated_at must page deterministically, or rows can be skipped."""
    same = "2026-06-05T00:00:00+00:00"
    tables["user_expenses"].extend([
        _expense("c", same), _expense("a", same), _expense("b", same),
    ])
    ids = [r["id"] for r in _feed(client).json()["data"]]
    assert ids == ["a", "b", "c"]


def test_repulling_boundary_cursor_is_idempotent(client, tables):
    """Re-pulling from a cursor must not redeliver rows already consumed."""
    tables["user_expenses"].extend([
        _expense("a", "2026-06-01T00:00:00+00:00"),
        _expense("b", "2026-06-02T00:00:00+00:00"),
    ])
    cursor = _encode_cursor("2026-06-02T00:00:00+00:00")

    first = [r["id"] for r in _feed(client, since=cursor).json()["data"]]
    second = [r["id"] for r in _feed(client, since=cursor).json()["data"]]
    assert first == second == []


def test_date_derives_from_created_at(client, tables):
    """`date` is the Europe/Berlin calendar day derived from created_at when
    the row itself has no `date` column value (pre-migration / legacy rows).
    created_at is still emitted alongside it for a consumer that wants the
    instant, not just the day."""
    tables["user_expenses"].append(
        _expense("a", "2026-06-09T00:00:00+00:00", created_at="2026-06-01T07:30:00+00:00")
    )
    row = _feed(client).json()["data"][0]
    assert row["date"] == "2026-06-01"
    assert row["created_at"] == "2026-06-01T07:30:00+00:00"
    assert row["updated_at"] == "2026-06-09T00:00:00+00:00"


def test_recurring_expense_is_one_row_not_materialized(client, tables):
    """Rent must surface once carrying its cadence, never expanded per month.

    The module docstring warns that materializing occurrences would double-count
    a monthly charge in a daily rollup.
    """
    tables["user_expenses"].append(
        _expense("rent", "2026-06-01T00:00:00+00:00", name="Rent", amount="1200",
                 category="Housing", is_recurring=True, recurring_frequency="monthly",
                 created_at="2026-01-01T00:00:00+00:00")
    )
    data = _feed(client).json()["data"]
    assert len(data) == 1
    assert data[0]["isRecurring"] is True
    assert data[0]["recurringFrequency"] == "monthly"
    assert data[0]["date"] == "2026-01-01"


def test_tombstone_carries_no_payload(client, tables):
    """Deleted rows must collapse — leaking name/amount would undo the delete."""
    tables["user_expenses"].append(
        _expense("gone", "2026-06-08T00:00:00+00:00", name="Secret", deleted=True)
    )
    row = _feed(client).json()["data"][0]
    assert row == {"id": "gone", "deleted": True, "updated_at": "2026-06-08T00:00:00+00:00"}


# --- Savings history feed (previously untested) -------------------------------

def test_savings_history_requires_token(client):
    resp = client.get("/v1/integrations/savings-history")
    assert resp.status_code == 401


def test_savings_history_feed_shape_and_scoping(client, tables):
    tables["user_savings_history"].extend([
        {"id": "s1", "user_key": BOT_USER, "created_at": "2026-06-01T00:00:00+00:00",
         "net_worth": 100000, "total_assets": 120000, "total_liabilities": 20000,
         "savings_amount": 5000, "investment_amount": 60000, "gold_amount": 3000,
         "stock_amount": 52000},
        {"id": "s2", "user_key": OTHER_USER, "created_at": "2026-06-02T00:00:00+00:00",
         "net_worth": 1, "total_assets": 1, "total_liabilities": 0,
         "savings_amount": 0, "investment_amount": 0, "gold_amount": 0, "stock_amount": 0},
    ])

    body = client.get(
        "/v1/integrations/savings-history",
        headers={"X-Integration-Token": INTEGRATION_TOKEN},
    ).json()

    assert [r["id"] for r in body["data"]] == ["s1"]
    assert body["data"][0]["net_worth"] == 100000
    assert body["next_cursor"] is None


def test_savings_history_since_cursor(client, tables):
    tables["user_savings_history"].extend([
        {"id": "s1", "user_key": BOT_USER, "created_at": "2026-06-01T00:00:00+00:00"},
        {"id": "s2", "user_key": BOT_USER, "created_at": "2026-06-03T00:00:00+00:00"},
    ])
    cursor = _encode_cursor("2026-06-01T00:00:00+00:00")
    body = client.get(
        "/v1/integrations/savings-history",
        headers={"X-Integration-Token": INTEGRATION_TOKEN},
        params={"since": cursor},
    ).json()
    assert [r["id"] for r in body["data"]] == ["s2"]


def test_income_scoped_to_token_owner(client, tables):
    tables["user_income"].extend([
        {"user_key": OTHER_USER, "salary_me": "1", "salary_partner": "1",
         "updated_at": "2026-06-01T00:00:00+00:00"},
        {"user_key": BOT_USER, "salary_me": "5000", "salary_partner": "4000",
         "updated_at": "2026-06-10T00:00:00+00:00"},
    ])
    body = client.get(
        "/v1/integrations/income",
        headers={"X-Integration-Token": INTEGRATION_TOKEN},
    ).json()
    assert body == {"salaryMe": 5000.0, "salaryPartner": 4000.0,
                    "updatedAt": "2026-06-10T00:00:00+00:00"}


# --- Deletion must be observable downstream ----------------------------------

def test_delete_soft_deletes_so_life_os_sees_a_tombstone(client, tables):
    """A hard delete would vanish from the table, so the feed could never report
    it and Life OS would hold the expense forever."""
    created = client.post(
        "/api/expenses/",
        headers={"X-Personal-Token": BOT_TOKEN},
        json={"name": "Wrong entry", "amount": 9.99, "category": "Food"},
    ).json()
    expense_id = created["id"]

    resp = client.delete(f"/api/expenses/{expense_id}", headers={"X-Personal-Token": BOT_TOKEN})
    assert resp.status_code == 204

    # The row survives, flagged deleted — not removed.
    assert len(tables["user_expenses"]) == 1
    assert tables["user_expenses"][0]["deleted"] is True

    # And it reaches the consumer as a tombstone carrying no payload.
    data = _feed(client).json()["data"]
    assert len(data) == 1
    assert data[0]["deleted"] is True
    assert data[0]["id"] == expense_id
    assert "name" not in data[0]


def test_delete_scoped_to_owner(client, tables):
    tables["user_expenses"].append(_expense("theirs", "2026-06-01T00:00:00+00:00",
                                            user_key=OTHER_USER))
    resp = client.delete("/api/expenses/theirs", headers={"X-Personal-Token": BOT_TOKEN})
    assert resp.status_code == 404
    assert tables["user_expenses"][0]["deleted"] is False
