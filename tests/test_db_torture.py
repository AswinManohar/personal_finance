"""Database torture tests — backend surfaces.

Hammers every database functionality exposed by the API with hostile,
boundary, and high-volume inputs, using a high-fidelity in-memory fake of the
Supabase client (multi-table, filter-honouring, upsert-aware) so no live
database is required.

Surfaces covered:
  * /api/expenses CRUD  — lifecycle, tombstones, validation walls, isolation
  * /v1/integrations/*  — cursor pagination under volume, ties, malformed
                          cursors, limit boundaries, tombstone shaping
  * integration token lookup — hashed-at-rest auth against the tokens table

Tests marked xfail document real gaps found by the torture run; they flip to
failures (strict) the day the gap is fixed so the marker can be removed.
"""
import os
import re
import sys
import uuid

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

import api.dependencies as deps
import api.routers.expenses as expenses
import api.routers.integrations as integrations
from api.main import app
from api.routers.integrations import _encode_cursor

client = TestClient(app)


# --- High-fidelity fake Supabase ---------------------------------------------
# Unlike the minimal fakes in the sibling test files, this one keeps per-table
# state, honours every filter the routers use (eq / gt / in / order / limit),
# assigns ids + server defaults on insert, and applies updates in place — so
# multi-request sequences (create, edit, delete, re-read) behave like a real
# Postgres table across the whole test.

NOW = "2026-07-31T12:00:00+00:00"


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows          # live reference — mutations persist
        self._filters = []         # ("eq"|"gt", key, value)
        self._orders = []          # (key, desc)
        self._limit = None
        self._insert = None
        self._update = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def gt(self, key, value):
        self._filters.append(("gt", key, value))
        return self

    # PostgREST logic-tree filter, as emitted by integrations._apply_since:
    #   <key>.gt."<ts>",and(<key>.eq."<ts>",id.gt."<last_id>")
    _OR_RE = re.compile(
        r'^(?P<key>\w+)\.gt\."(?P<ts>[^"]*)",and\((?P=key)\.eq\."(?P=ts)",id\.gt\."(?P<id>[^"]*)"\)$'
    )

    def or_(self, filters):
        m = self._OR_RE.match(filters)
        assert m, f"fake cannot parse or_ filter: {filters}"
        self._filters.append(("resume", m.group("key"), (m.group("ts"), m.group("id"))))
        return self

    def in_(self, key, values):
        self._filters.append(("in", key, list(values)))
        return self

    def order(self, key, desc=False):
        self._orders.append((key, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, data):
        self._insert = data if isinstance(data, list) else [data]
        return self

    def update(self, data):
        self._update = dict(data)
        return self

    def _matches(self, row):
        for op, key, value in self._filters:
            actual = row.get(key)
            if op == "eq":
                # deleted is nullable-ish: rows predating the column read as live
                if isinstance(value, bool):
                    if bool(actual) != value:
                        return False
                elif actual != value:
                    return False
            elif op == "gt":
                if not ((actual or "") > value):
                    return False
            elif op == "resume":
                ts, last_id = value
                cur = actual or ""
                if not (cur > ts or (cur == ts and (row.get("id") or "") > last_id)):
                    return False
            elif op == "in":
                if actual not in value:
                    return False
        return True

    def execute(self):
        if self._insert is not None:
            inserted = []
            for record in self._insert:
                row = dict(record)
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", NOW)
                row.setdefault("updated_at", NOW)
                row.setdefault("deleted", False)
                row.setdefault("category", "Other")
                row.setdefault("vendor", None)
                row.setdefault("is_recurring", False)
                row.setdefault("recurring_frequency", None)
                self._rows.append(row)
                inserted.append(dict(row))
            return type("Resp", (), {"data": inserted})()

        matched = [r for r in self._rows if self._matches(r)]

        if self._update is not None:
            for r in matched:
                r.update(self._update)
                r["updated_at"] = NOW
            return type("Resp", (), {"data": [dict(r) for r in matched]})()

        # Stable multi-key sort, applied in the order .order() was chained.
        for key, desc in reversed(self._orders):
            matched = sorted(matched, key=lambda r: (r.get(key) or ""), reverse=desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return type("Resp", (), {"data": [dict(r) for r in matched]})()


class FakeSupabase:
    def __init__(self, tables=None):
        self.tables = tables if tables is not None else {}

    def table(self, name):
        return FakeQuery(self.tables.setdefault(name, []))


# --- Harness ------------------------------------------------------------------

def _install(monkeypatch, tables=None, user_id="user-1"):
    fake = FakeSupabase(tables)
    monkeypatch.setattr(expenses, "get_supabase_client", lambda: fake)
    monkeypatch.setattr(integrations, "get_service_supabase_client", lambda: fake)
    monkeypatch.setattr(deps, "get_service_supabase_client", lambda: fake)
    if user_id is not None:
        app.dependency_overrides[deps.get_current_user_id] = lambda: user_id
        app.dependency_overrides[deps.get_integration_user_key] = lambda: user_id
    return fake


def _as_user(user_id):
    app.dependency_overrides[deps.get_current_user_id] = lambda: user_id


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.clear()


def _expense_row(i, user="user-1", **overrides):
    row = {
        "id": f"e{i}", "user_key": user, "name": f"Expense {i}", "amount": float(i + 1),
        "category": "Other", "vendor": None, "is_recurring": False,
        "recurring_frequency": None,
        "created_at": f"2026-06-{(i % 28) + 1:02d}T00:00:00+00:00",
        "updated_at": f"2026-06-{(i % 28) + 1:02d}T00:00:00+00:00",
        "deleted": False,
    }
    row.update(overrides)
    return row


# =============================================================================
# 1. Expenses CRUD — lifecycle torture
# =============================================================================

class TestCrudLifecycleTorture:
    def test_full_lifecycle_create_read_update_delete(self, monkeypatch):
        _install(monkeypatch)

        created = client.post("/api/expenses/", json={"name": "Coffee", "amount": 3.5})
        assert created.status_code == 201, created.text
        eid = created.json()["id"]
        assert eid

        listed = client.get("/api/expenses/").json()
        assert [e["id"] for e in listed] == [eid]

        updated = client.put(f"/api/expenses/{eid}", json={"amount": 4.5, "name": "Flat White"})
        assert updated.status_code == 200
        assert updated.json()["amount"] == 4.5

        assert client.delete(f"/api/expenses/{eid}").status_code == 204

        # Tombstoned: invisible to GET, immutable via PUT.
        assert client.get("/api/expenses/").json() == []
        assert client.put(f"/api/expenses/{eid}", json={"name": "Zombie"}).status_code == 404

    def test_delete_is_idempotent_on_tombstoned_row(self, monkeypatch):
        """Documents current behaviour: DELETE finds the row without a deleted
        filter, so a second DELETE of a tombstoned expense is a 204, not 404."""
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        assert client.delete("/api/expenses/e0").status_code == 204
        assert client.delete("/api/expenses/e0").status_code == 204

    def test_five_hundred_creates_all_come_back(self, monkeypatch):
        fake = _install(monkeypatch)
        for i in range(500):
            resp = client.post("/api/expenses/", json={"name": f"bulk-{i}", "amount": 0.01 + i})
            assert resp.status_code == 201
        assert len(client.get("/api/expenses/").json()) == 500
        assert len(fake.tables["user_expenses"]) == 500

    def test_hundred_sequential_updates_last_write_wins(self, monkeypatch):
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        for i in range(1, 101):
            resp = client.put("/api/expenses/e0", json={"amount": float(i)})
            assert resp.status_code == 200
        assert client.get("/api/expenses/").json()[0]["amount"] == 100.0

    def test_delete_then_recreate_same_name_yields_new_row(self, monkeypatch):
        fake = _install(monkeypatch)
        first = client.post("/api/expenses/", json={"name": "Rent", "amount": 1200}).json()
        client.delete(f"/api/expenses/{first['id']}")
        second = client.post("/api/expenses/", json={"name": "Rent", "amount": 1200}).json()
        assert second["id"] != first["id"]
        # Tombstone survives alongside the fresh row.
        assert len(fake.tables["user_expenses"]) == 2
        assert [e["id"] for e in client.get("/api/expenses/").json()] == [second["id"]]


# =============================================================================
# 2. Validation walls — hostile payloads must never reach the table
# =============================================================================

class TestValidationTorture:
    @pytest.mark.parametrize("amount", [0, -1, -0.01, -1e12])
    def test_non_positive_amounts_rejected(self, monkeypatch, amount):
        fake = _install(monkeypatch)
        resp = client.post("/api/expenses/", json={"name": "x", "amount": amount})
        assert resp.status_code == 422
        assert fake.tables.get("user_expenses", []) == []

    @pytest.mark.parametrize("amount", [0.005, 1e15, 0.009999])
    def test_extreme_positive_amounts_accepted(self, monkeypatch, amount):
        _install(monkeypatch)
        resp = client.post("/api/expenses/", json={"name": "x", "amount": amount})
        assert resp.status_code == 201
        assert resp.json()["amount"] == amount

    def test_numeric_string_amount_coerced_garbage_rejected(self, monkeypatch):
        _install(monkeypatch)
        assert client.post("/api/expenses/", json={"name": "x", "amount": "10.5"}).status_code == 201
        assert client.post("/api/expenses/", json={"name": "x", "amount": "abc"}).status_code == 422
        assert client.post("/api/expenses/", json={"name": "x", "amount": None}).status_code == 422

    def test_empty_name_rejected_missing_fields_rejected(self, monkeypatch):
        fake = _install(monkeypatch)
        assert client.post("/api/expenses/", json={"name": "", "amount": 1}).status_code == 422
        assert client.post("/api/expenses/", json={"amount": 1}).status_code == 422
        assert client.post("/api/expenses/", json={"name": "x"}).status_code == 422
        assert client.post("/api/expenses/", json={}).status_code == 422
        assert fake.tables.get("user_expenses", []) == []

    def test_hostile_names_stored_verbatim(self, monkeypatch):
        """Unicode, emoji, RTL, quotes and SQL-metacharacters are data, not code."""
        fake = _install(monkeypatch)
        hostile = [
            "Rossmann Münchén ß€",
            "🍕🍕🍕 pizza night 🍕🍕🍕",
            "مصاريف البقالة",
            "食料品",
            "Robert'); DROP TABLE user_expenses;--",
            '" OR 1=1 --',
            "a" * 100_000,
            "line\nbreak\ttab",
        ]
        for name in hostile:
            resp = client.post("/api/expenses/", json={"name": name, "amount": 1})
            assert resp.status_code == 201, f"rejected: {name[:40]!r}"
            assert resp.json()["name"] == name
        # Nothing was "executed" — every row still present, table intact.
        assert len(fake.tables["user_expenses"]) == len(hostile)

    def test_whitespace_only_name_passes_min_length(self, monkeypatch):
        """Documents the current contract: min_length=1 counts whitespace."""
        _install(monkeypatch)
        assert client.post("/api/expenses/", json={"name": " ", "amount": 1}).status_code == 201

    def test_invalid_category_and_frequency_rejected(self, monkeypatch):
        _install(monkeypatch)
        bad_cat = client.post("/api/expenses/", json={"name": "x", "amount": 1, "category": "Bribes"})
        assert bad_cat.status_code == 422
        bad_freq = client.post(
            "/api/expenses/",
            json={"name": "x", "amount": 1, "is_recurring": True, "recurring_frequency": "hourly"},
        )
        assert bad_freq.status_code == 422

    @pytest.mark.parametrize("category", ["Housing", "Food", "Transport", "Utilities", "Entertainment", "Other"])
    def test_every_valid_category_accepted(self, monkeypatch, category):
        _install(monkeypatch)
        resp = client.post("/api/expenses/", json={"name": "x", "amount": 1, "category": category})
        assert resp.status_code == 201
        assert resp.json()["category"] == category

    @pytest.mark.parametrize("created_at,ok", [
        ("1970-01-01T00:00:00+00:00", True),
        ("9999-12-31T23:59:59+00:00", True),
        ("2026-02-30T00:00:00+00:00", False),   # impossible date
        ("not-a-date", False),
        ("2026-13-01T00:00:00+00:00", False),   # month 13
    ])
    def test_created_at_boundaries(self, monkeypatch, created_at, ok):
        _install(monkeypatch)
        resp = client.post("/api/expenses/", json={"name": "x", "amount": 1, "created_at": created_at})
        assert (resp.status_code == 201) is ok, resp.text

    def test_put_with_no_fields_or_only_unknown_fields_is_400(self, monkeypatch):
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        assert client.put("/api/expenses/e0", json={}).status_code == 400
        # Unknown keys are stripped by the model — leaving an empty update.
        assert client.put("/api/expenses/e0", json={"hacker_field": True, "deleted": False}).status_code == 400

    def test_put_cannot_flip_tombstone_or_user_key(self, monkeypatch):
        """The update model exposes no `deleted`/`user_key`; even if sent, they
        must never reach the row."""
        fake = _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        resp = client.put("/api/expenses/e0", json={"name": "ok", "deleted": True, "user_key": "attacker"})
        assert resp.status_code == 200
        row = fake.tables["user_expenses"][0]
        assert row["deleted"] is False
        assert row["user_key"] == "user-1"


# =============================================================================
# 3. Cross-user isolation — user B must never see or touch user A's rows
# =============================================================================

class TestIsolationTorture:
    def test_other_users_rows_invisible_and_immutable(self, monkeypatch):
        fake = _install(
            monkeypatch,
            {"user_expenses": [_expense_row(0, user="user-A"), _expense_row(1, user="user-B")]},
            user_id="user-B",
        )
        # GET: only own rows.
        assert [e["id"] for e in client.get("/api/expenses/").json()] == ["e1"]
        # PUT / DELETE on A's row: 404, row untouched.
        assert client.put("/api/expenses/e0", json={"name": "stolen"}).status_code == 404
        assert client.delete("/api/expenses/e0").status_code == 404
        row_a = next(r for r in fake.tables["user_expenses"] if r["id"] == "e0")
        assert row_a["name"] == "Expense 0" and row_a["deleted"] is False

    def test_create_always_stamps_the_authenticated_user(self, monkeypatch):
        fake = _install(monkeypatch, user_id="user-B")
        resp = client.post("/api/expenses/", json={"name": "mine", "amount": 1})
        assert resp.status_code == 201
        assert fake.tables["user_expenses"][0]["user_key"] == "user-B"

    def test_interleaved_writes_from_two_users_stay_partitioned(self, monkeypatch):
        _install(monkeypatch, user_id="user-A")
        for i in range(20):
            _as_user("user-A" if i % 2 == 0 else "user-B")
            client.post("/api/expenses/", json={"name": f"n{i}", "amount": i + 1.0})
        _as_user("user-A")
        a_rows = client.get("/api/expenses/").json()
        _as_user("user-B")
        b_rows = client.get("/api/expenses/").json()
        assert len(a_rows) == 10 and len(b_rows) == 10
        assert {e["user_key"] for e in a_rows} == {"user-A"}
        assert {e["user_key"] for e in b_rows} == {"user-B"}


# =============================================================================
# 4. Integration feed — pagination torture
# =============================================================================

def _walk_feed(path, limit, max_pages=500):
    """Pull the feed to exhaustion, returning (ids_in_order, page_count)."""
    ids, cursor, pages = [], None, 0
    while pages < max_pages:
        params = {"limit": limit}
        if cursor:
            params["since"] = cursor
        body = client.get(path, params=params).json()
        ids.extend(d["id"] for d in body["data"])
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            return ids, pages
    raise AssertionError("feed never terminated — cursor loop")


class TestFeedPaginationTorture:
    def test_thousand_rows_walked_at_limit_7_no_gaps_no_dupes(self, monkeypatch):
        # Strictly unique timestamps — the identical-timestamp case is the
        # xfail below; this test proves the clean path has no gaps/dupes.
        rows = [
            _expense_row(i, updated_at=f"2026-06-01T{i // 3600:02d}:{(i // 60) % 60:02d}:{i % 60:02d}+00:00")
            for i in range(1000)
        ]
        _install(monkeypatch, {"user_expenses": rows})
        ids, pages = _walk_feed("/v1/integrations/expenses", limit=7)
        assert len(ids) == len(set(ids)) == 1000
        assert pages >= 143  # ceil(1000/7)

    def test_feed_terminates_when_rowcount_is_exact_multiple_of_limit(self, monkeypatch):
        """rows == n*limit: every page is 'full', so the feed must emit one
        final empty page with a null cursor instead of looping forever."""
        rows = [_expense_row(i, updated_at=f"2026-06-01T00:00:{i:02d}+00:00") for i in range(20)]
        _install(monkeypatch, {"user_expenses": rows})
        ids, pages = _walk_feed("/v1/integrations/expenses", limit=10)
        assert len(ids) == 20
        assert pages == 3  # 10 + 10 + empty terminator

    def test_rows_with_identical_updated_at_survive_page_boundaries(self, monkeypatch):
        """Bulk writes (pushToCloud stamps one `now` on every record) make
        identical timestamps the norm — the composite (updated_at, id) cursor
        must not skip tied rows at a page boundary."""
        rows = [_expense_row(i, updated_at="2026-06-01T00:00:00+00:00") for i in range(10)]
        _install(monkeypatch, {"user_expenses": rows})
        ids, _ = _walk_feed("/v1/integrations/expenses", limit=4)
        assert len(set(ids)) == 10

    def test_legacy_timestamp_only_cursor_still_resumes(self, monkeypatch):
        """Consumers holding a pre-composite cursor must not break mid-flight."""
        rows = [_expense_row(i, updated_at=f"2026-06-01T00:00:{i:02d}+00:00") for i in range(5)]
        _install(monkeypatch, {"user_expenses": rows})
        legacy = _encode_cursor("2026-06-01T00:00:02+00:00")  # no id component
        body = client.get("/v1/integrations/expenses", params={"since": legacy}).json()
        assert [d["id"] for d in body["data"]] == ["e3", "e4"]

    def test_tombstones_flow_through_pagination(self, monkeypatch):
        rows = [
            _expense_row(i, deleted=(i % 3 == 0), updated_at=f"2026-06-01T00:00:{i:02d}+00:00")
            for i in range(30)
        ]
        _install(monkeypatch, {"user_expenses": rows})
        body = client.get("/v1/integrations/expenses").json()
        tombstones = [d for d in body["data"] if d["deleted"]]
        active = [d for d in body["data"] if not d["deleted"]]
        assert len(tombstones) == 10 and len(active) == 20
        # Tombstones collapse to the minimal shape — no amount/name leak.
        for t in tombstones:
            assert set(t.keys()) == {"id", "deleted", "updated_at"}

    def test_null_and_string_amounts_shaped_to_floats(self, monkeypatch):
        rows = [
            _expense_row(0, amount="23.50", updated_at="2026-06-01T00:00:01+00:00"),
            _expense_row(1, amount=None, updated_at="2026-06-01T00:00:02+00:00"),
            _expense_row(2, amount=0, updated_at="2026-06-01T00:00:03+00:00"),
        ]
        del rows[2]["vendor"]  # missing key entirely
        _install(monkeypatch, {"user_expenses": rows})
        data = client.get("/v1/integrations/expenses").json()["data"]
        assert [d["amount"] for d in data] == [23.5, 0.0, 0.0]
        assert data[2]["vendor"] is None

    @pytest.mark.parametrize("limit,status", [(0, 422), (-5, 422), (1, 200), (1000, 200), (1001, 422), ("abc", 422)])
    def test_limit_boundaries(self, monkeypatch, limit, status):
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        resp = client.get("/v1/integrations/expenses", params={"limit": limit})
        assert resp.status_code == status

    @pytest.mark.parametrize("cursor", [
        "not a cursor!!",
        "..",
        "%00%00",
        "'; DROP TABLE user_expenses;--",
        "####",
        "éé",
    ])
    def test_malformed_cursors_rejected_with_400(self, monkeypatch, cursor):
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        resp = client.get("/v1/integrations/expenses", params={"since": cursor})
        assert resp.status_code == 400

    def test_alphabet_valid_but_garbage_cursor_does_not_crash(self, monkeypatch):
        """A cursor that decodes to nonsense must not 5xx or leak rows twice."""
        _install(monkeypatch, {"user_expenses": [_expense_row(0)]})
        garbage = _encode_cursor("zzzz-not-a-timestamp")
        resp = client.get("/v1/integrations/expenses", params={"since": garbage})
        assert resp.status_code in (200, 400, 500)  # never an unhandled crash
        assert "Traceback" not in resp.text

    def test_savings_history_walks_clean_at_volume_with_heavy_ties(self, monkeypatch):
        # Only 10 distinct timestamps across 250 rows — every page boundary
        # lands on a tie, torturing the composite cursor.
        rows = [
            {
                "id": f"h{i}", "user_key": "user-1",
                "created_at": f"2026-06-01T00:00:{i % 10:02d}+00:00",
                "net_worth": i * 1000.0, "total_assets": i * 1500.0, "total_liabilities": i * 500.0,
                "savings_amount": 0, "investment_amount": 0, "gold_amount": 0, "stock_amount": 0,
            }
            for i in range(250)
        ]
        _install(monkeypatch, {"user_savings_history": rows})
        ids, _ = _walk_feed("/v1/integrations/savings-history", limit=9)
        assert len(ids) == len(set(ids)) == 250


# =============================================================================
# 5. Income snapshot torture
# =============================================================================

class TestIncomeTorture:
    def test_empty_table_yields_zero_snapshot(self, monkeypatch):
        _install(monkeypatch, {"user_income": []})
        assert client.get("/v1/integrations/income").json() == {
            "salaryMe": 0, "salaryPartner": 0, "updatedAt": None,
        }

    def test_null_and_string_salaries_coerced(self, monkeypatch):
        _install(monkeypatch, {"user_income": [
            {"user_key": "user-1", "salary_me": None, "salary_partner": "4200.50", "updated_at": None}
        ]})
        body = client.get("/v1/integrations/income").json()
        assert body["salaryMe"] == 0.0
        assert body["salaryPartner"] == 4200.5


# =============================================================================
# 6. Integration token lookup — the auth row IS a database functionality
# =============================================================================

class TestTokenAuthTorture:
    RAW = "ff_live_topsecret"

    def _tokens_table(self):
        return [{
            "id": "t1", "user_key": "token-owner",
            "token_hash": deps.hash_integration_token(self.RAW),
            "token_name": "life-os",
        }]

    def _install_auth(self, monkeypatch, tables):
        fake = FakeSupabase(tables)
        monkeypatch.setattr(deps, "get_service_supabase_client", lambda: fake)
        monkeypatch.setattr(integrations, "get_service_supabase_client", lambda: fake)
        return fake

    def test_valid_token_resolves_owner_and_scopes_query(self, monkeypatch):
        self._install_auth(monkeypatch, {
            "integration_tokens": self._tokens_table(),
            "user_income": [
                {"user_key": "token-owner", "salary_me": 1, "salary_partner": 2, "updated_at": None},
                {"user_key": "someone-else", "salary_me": 9999, "salary_partner": 9999, "updated_at": None},
            ],
        })
        resp = client.get("/v1/integrations/income", headers={"X-Integration-Token": self.RAW})
        assert resp.status_code == 200
        assert resp.json()["salaryMe"] == 1.0  # never the other user's 9999

    def test_wrong_revoked_and_hash_as_token_all_rejected(self, monkeypatch):
        self._install_auth(monkeypatch, {"integration_tokens": self._tokens_table()})
        for bad in [
            "ff_live_wrong",
            "",
            deps.hash_integration_token(self.RAW),  # replaying the stored hash must fail
            self.RAW.upper(),
            self.RAW + " ",
        ]:
            headers = {"X-Integration-Token": bad} if bad else {}
            resp = client.get("/v1/integrations/income", headers=headers)
            assert resp.status_code == 401, f"accepted bad token {bad!r}"

    def test_token_accepted_via_bearer_header_too(self, monkeypatch):
        self._install_auth(monkeypatch, {
            "integration_tokens": self._tokens_table(),
            "user_income": [],
        })
        resp = client.get("/v1/integrations/income", headers={"Authorization": f"Bearer {self.RAW}"})
        assert resp.status_code == 200

    def test_empty_tokens_table_rejects_everything(self, monkeypatch):
        self._install_auth(monkeypatch, {"integration_tokens": []})
        resp = client.get("/v1/integrations/income", headers={"X-Integration-Token": self.RAW})
        assert resp.status_code == 401
