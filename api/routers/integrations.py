"""
Read-only, service-to-service integration endpoints (v1).

Consumed by external aggregators such as Life OS, which pull on a schedule and
on-demand. Every endpoint:

  * is authenticated by a per-user integration token (see get_integration_user_key),
  * is scoped to that single token-owner's data,
  * is read-only (GET only — no create/update/delete here),
  * supports incremental sync via an opaque `since` cursor where applicable.

Recurring-expense semantics (documented for consumers):
  A recurring expense is stored as ONE row of state, not materialized per
  occurrence. The row carries `isRecurring`, `recurringFrequency`
  (weekly | bi-weekly | monthly | quarterly | yearly) and `date` (the anchor /
  first occurrence). Consumers must expand occurrences themselves and must NOT
  count the full amount on every day — otherwise a monthly rent charge would be
  double-counted in a daily rollup.
"""

import base64
import binascii
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from api.dependencies import get_integration_user_key, get_service_supabase_client
from api.models import ExpensesFeed, SavingsHistoryFeed, IncomeSnapshot

router = APIRouter(
    prefix="/v1/integrations",
    tags=["integrations"],
    responses={401: {"description": "Invalid or missing integration token"}},
)


def _require_service_client():
    supabase = get_service_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Integration backend is not configured (service-role key missing)",
        )
    return supabase


def _to_iso(value) -> Optional[str]:
    if value is None:
        return None
    return str(value)


# --- Opaque cursor codec ------------------------------------------------------
# The contract promises an *opaque* cursor (consumers must not parse it). We
# base64url-encode the sort key (a timestamp) so the wire format can evolve
# without breaking clients. `id` remains the dedup key, so re-pulling the
# boundary row is idempotent.

def _encode_cursor(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return base64.urlsafe_b64encode(str(value).encode("utf-8")).decode("ascii")


_CURSOR_RE = re.compile(r"^[A-Za-z0-9_=-]+$")


def _decode_cursor(cursor: Optional[str]) -> Optional[str]:
    if not cursor:
        return None
    # urlsafe_b64decode silently drops out-of-alphabet bytes, so validate first
    # to reject obviously bogus cursors instead of querying on garbage.
    if not _CURSOR_RE.match(cursor):
        raise HTTPException(status_code=400, detail="Malformed `since` cursor")
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Malformed `since` cursor")


def _shape_expense(row: dict) -> dict:
    """Map a user_expenses row to the integration contract.

    Deleted rows collapse to a tombstone {id, deleted, updated_at}.
    """
    if row.get("deleted"):
        return {
            "id": row.get("id"),
            "deleted": True,
            "updated_at": _to_iso(row.get("updated_at")),
        }
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "amount": float(row.get("amount") or 0),
        "category": row.get("category"),
        "vendor": row.get("vendor") or None,
        "isRecurring": bool(row.get("is_recurring")),
        "recurringFrequency": row.get("recurring_frequency") or None,
        "date": _to_iso(row.get("created_at")),
        "updated_at": _to_iso(row.get("updated_at")),
        "deleted": False,
    }


@router.get("/expenses", response_model=ExpensesFeed, operation_id="integration_expenses_feed")
def expenses_feed(
    since: Optional[str] = Query(
        default=None, description="Opaque cursor from a previous next_cursor; omit for a full backfill"
    ),
    limit: int = Query(default=500, ge=1, le=1000, description="Max records per page"),
    user_key: str = Depends(get_integration_user_key),
):
    """Incremental change feed of expenses, including deletes (tombstones).

    Ordered by `updated_at` ascending so edited and deleted rows resurface.
    `id` is the dedup key — re-pulls are idempotent. `next_cursor` is null once
    the consumer is caught up (a short page), so steady-state polling stops
    cleanly instead of re-fetching the boundary row forever.
    """
    supabase = _require_service_client()
    since_value = _decode_cursor(since)

    query = (
        supabase.table("user_expenses")
        .select("id, name, amount, category, vendor, is_recurring, recurring_frequency, created_at, updated_at, deleted")
        .eq("user_key", user_key)
    )
    if since_value:
        query = query.gt("updated_at", since_value)

    try:
        # Secondary sort on id keeps paging deterministic for equal timestamps.
        response = (
            query.order("updated_at", desc=False).order("id", desc=False).limit(limit).execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    rows = response.data or []
    data = [_shape_expense(r) for r in rows]
    next_cursor = _encode_cursor(rows[-1]["updated_at"]) if len(rows) == limit else None
    return {"data": data, "next_cursor": next_cursor}


@router.get("/savings-history", response_model=SavingsHistoryFeed, operation_id="integration_savings_history")
def savings_history_feed(
    since: Optional[str] = Query(default=None, description="Opaque cursor (created_at) from a previous pull"),
    limit: int = Query(default=500, ge=1, le=1000),
    user_key: str = Depends(get_integration_user_key),
):
    """Net-worth / savings time-series, ordered by `created_at` ascending."""
    supabase = _require_service_client()
    since_value = _decode_cursor(since)

    query = (
        supabase.table("user_savings_history")
        .select(
            "id, created_at, net_worth, total_assets, total_liabilities, "
            "savings_amount, investment_amount, gold_amount, stock_amount"
        )
        .eq("user_key", user_key)
    )
    if since_value:
        query = query.gt("created_at", since_value)

    try:
        response = (
            query.order("created_at", desc=False).order("id", desc=False).limit(limit).execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    rows = response.data or []
    next_cursor = _encode_cursor(rows[-1]["created_at"]) if len(rows) == limit else None
    return {"data": rows, "next_cursor": next_cursor}


@router.get("/income", response_model=IncomeSnapshot, operation_id="integration_income")
def income_snapshot(user_key: str = Depends(get_integration_user_key)):
    """Current monthly income state for the token owner (not transactional)."""
    supabase = _require_service_client()

    try:
        response = (
            supabase.table("user_income")
            .select("salary_me, salary_partner, updated_at")
            .eq("user_key", user_key)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not response.data:
        return {"salaryMe": 0, "salaryPartner": 0, "updatedAt": None}

    row = response.data[0]
    return {
        "salaryMe": float(row.get("salary_me") or 0),
        "salaryPartner": float(row.get("salary_partner") or 0),
        "updatedAt": _to_iso(row.get("updated_at")),
    }
