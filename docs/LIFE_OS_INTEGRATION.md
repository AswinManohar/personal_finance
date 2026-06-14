# FinanceFlow → Life OS Integration API

Read-only, service-to-service feeds that let Life OS mirror FinanceFlow data on a
schedule and on demand. FinanceFlow stays the source of truth; Life OS keeps a
derived rollup. These endpoints never write and never expose other users' data.

All endpoints are served by the main app (`api.main:app`) under `/v1/integrations/*`.

## 1. Authentication — per-user service token

Each household member generates a token in **Settings → API Integrations**
("Generate New Token"), which returns a `ff_live_…` secret **shown exactly once**.
Only its SHA-256 hash is stored (`integration_tokens.token_hash`), so a leaked DB
row cannot be replayed. Tokens are revocable from the same screen.

A token grants **read-only** access scoped to that one user. Write endpoints
(`POST/PUT/DELETE /api/expenses`) do **not** accept integration tokens.

Pass the token either way:

```
Authorization: Bearer ff_live_xxxxxxxx
# or
X-Integration-Token: ff_live_xxxxxxxx
```

Responses: `401` for missing/invalid/revoked token.

## 2. Incremental expenses feed

```
GET /v1/integrations/expenses?since=<cursor>&limit=500
```

- Ordered by `updated_at` ascending, so edited rows resurface.
- `limit`: 1–1000 (default 500).
- `since`: opaque cursor; omit for a full backfill.
- `id` is the dedup key — re-pulls are idempotent.

**Active record:**
```json
{
  "id": "uuid",
  "name": "Lieferando",
  "amount": 23.5,
  "category": "Food",
  "vendor": "Lieferando",
  "isRecurring": false,
  "recurringFrequency": null,
  "date": "2026-06-01T12:00:00+00:00",
  "updated_at": "2026-06-01T12:00:00+00:00",
  "deleted": false
}
```

**Deleted record (tombstone)** — un-mirror these:
```json
{ "id": "uuid", "deleted": true, "updated_at": "2026-06-03T09:00:00+00:00" }
```

**Envelope:**
```json
{ "data": [ ... ], "next_cursor": "2026-06-03T09:00:00+00:00" }
```
Pass `next_cursor` as the next `?since=`. `null` means caught up. Keep paging
while `data` length equals `limit`.

### §3a — Food granularity: vendor field

`category` keeps the coarse `Food` bucket, but every expense can carry an optional
`vendor`/merchant string (e.g. `"REWE"`, `"Lieferando"`). Life OS classifies
groceries vs. dining-out from `vendor`. (We chose the vendor field over splitting
the category enum so existing data and the UI stay stable.)

### §3b — Recurring expenses: stored as state, expand client-side

A recurring expense is **one row**, not materialized per occurrence:

- `isRecurring: true`
- `recurringFrequency`: `weekly` | `bi-weekly` | `monthly` | `quarterly` | `yearly`
- `date`: the anchor / first occurrence (timezone-aware ISO 8601)

**Life OS must expand occurrences itself** and must **not** add the full amount on
every day. A monthly €1,200 Housing charge contributes €1,200 once per month from
its anchor date — not €1,200/day.

## 3. Savings / net-worth history

```
GET /v1/integrations/savings-history?since=<cursor>&limit=500
```
Time-series ordered by `created_at` ascending. Fields: `id`, `created_at`,
`net_worth`, `total_assets`, `total_liabilities`, `savings_amount`,
`investment_amount`, `gold_amount`, `stock_amount`. Same `{data, next_cursor}`
envelope (cursor = `created_at`).

## 4. Income (current monthly state)

```
GET /v1/integrations/income
```
```json
{ "salaryMe": 5000.0, "salaryPartner": 4000.0, "updatedAt": "2026-06-10T00:00:00+00:00" }
```
Monthly state, not transactional — no cursor.

## 5. Server setup (FinanceFlow side)

1. Run `SUPABASE_SECURITY.sql` in Supabase (adds `recurring_frequency`, the
   `idx_user_expenses_user_updated` index, and the `integration_tokens` table).
   **Until this runs, token validation returns 500.**
2. Set `SUPABASE_SERVICE_ROLE_KEY` in the backend env. It bypasses RLS so the
   service can validate tokens and read across household users. Falls back to
   `SUPABASE_KEY` if that is already a service-role key. Never ship this key to
   the browser.

## 6. Requirements traceability

| Spec | Requirement | Implementation | Verified by |
|------|-------------|----------------|-------------|
| §1 | Non-interactive, revocable per-user token, read-only | `integration_tokens` (hashed) + `get_integration_user_key`; tokens never wired to write routes | `test_*_requires_token`, `test_hash_is_stable_and_hex` |
| §2 | `since` cursor + `limit`, ordered by `updated_at` asc | `expenses_feed` | `test_expenses_feed_shapes_rows`, `test_expenses_feed_since_cursor` |
| §2 | `updated_at` on records | column + trigger (migration); shaped in feed | `test_expenses_feed_shapes_rows` |
| §2 | Delete tombstones `{id,deleted,updated_at}` | `_shape_expense` collapse | `test_expenses_feed_shapes_rows` |
| §2 | Opaque `next_cursor`, idempotent re-pulls | base64 `_encode_cursor`; `id` dedup key; null when caught up | `test_expenses_feed_paging_emits_opaque_cursor`, `test_expenses_feed_rejects_malformed_cursor` |
| §3a | Groceries vs dining split | **Decision: optional `vendor` field** (keeps category enum + data stable) | `test_expenses_feed_shapes_rows` (vendor present) |
| §3b | Recurring expansion clarity | **Decision: one row of state** (`isRecurring`+`recurringFrequency`+`date` anchor); consumer expands | module docstring + this doc §2 |
| §4 | savings-history `since` feed | `savings_history_feed` | (shares cursor codec; live-verified) |
| §5 | Income read | `income_snapshot` | `test_income_snapshot` |
| §6 | Versioned `/v1/` path | `APIRouter(prefix="/v1/integrations")` | route registration check |
| §6 | Read-only scope | GET-only router; write endpoints reject integration tokens | design (separate auth deps) |
| §7 | No writes / no GraphQL / plain REST | REST GET feeds only | — |

**Decisions on the two ⚠️ CLARIFY items (§3a, §3b)** are recorded above and in
`api/routers/integrations.py`. Both were chosen to avoid destabilising existing
data: a `vendor` string instead of an enum migration, and recurring-as-state so
daily rollups never double-count a monthly charge.
