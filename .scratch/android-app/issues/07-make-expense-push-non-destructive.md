# Make expense push non-destructive to externally-created rows

Type: grilling
Status: resolved
Blocked by: 06

## Question

**This is the ticket standing between the phone and "the Telegram pipeline does not break."**

`pushToCloud` reconciles expenses destructively (`services/supabaseService.ts:143-151`):

```ts
const { data: existingExpenses } = await supabase.from('user_expenses')
  .select('id').eq('user_key', userKey).eq('deleted', false);
const existingIds = new Set((existingExpenses || []).map(e => e.id));
const incomingIds = new Set(expenses.map((e: Expense) => e.id));
const idsToDelete = [...existingIds].filter(id => !incomingIds.has(id));
if (idsToDelete.length > 0) {
  await supabase.from('user_expenses').update({ deleted: true, updated_at: now }).in('id', idsToDelete);
}
```

Absence from the pushing client's `localStorage` is treated as proof of deletion. It is not — it
is equally consistent with "created elsewhere since my last pull".

The live failure: the Telegram bot inserts an expense via `POST /api/expenses/`. Any client that
has not pulled since does not have that id. Its next sync tombstones the expense, and the
tombstone propagates to Life OS through the integration feed, which correctly reports a delete.
The data loss is silent and it looks like an upstream bug.

This exists today with one client. A phone doubles the stale-state windows.

Decide and implement a reconciliation that can distinguish deletion from ignorance. Options to
grill:

- Track deletions explicitly client-side (a tombstone log) and send only known-deleted ids —
  never a set-difference.
- Scope deletion to ids the client actually observed in its last pull, recorded at pull time.
- Move deletes to an explicit API call at the moment the user deletes, rather than inferring at
  sync time.

Also settle what happens to expenses created offline on the phone, and how ids are generated so
phone-created and bot-created rows cannot collide.

## Second divergence, found while locking the contract

**`DELETE /api/expenses/{id}` hard-deletes; it does not tombstone.** `api/routers/expenses.py:105-111`
issues `.delete().eq("id", ...)`, while the client sync path marks `deleted: true`
(`services/supabaseService.ts:150`). A hard-deleted row vanishes from `user_expenses` entirely, so
it never surfaces in the integration feed as a tombstone — **Life OS can never learn that expense
was deleted and will hold it forever.**

So deletion is inconsistent in two directions at once: the app deletes things it should not (the
set-difference bug above), and the API deletes things in a way nobody downstream can observe. Both
need resolving together, since both are answers to "what does deletion mean here". Pick one
representation — almost certainly soft-delete everywhere — and make every writer honour it.

The tests from "Lock the integration contract with regression tests" deliberately do not cover
`PUT`/`DELETE /api/expenses/{id}`; add that coverage as part of this ticket.

Must not regress the tests from "Lock the integration contract with regression tests". Use
`superpowers:test-driven-development` — this is a data-loss path.

## Answer

Decisions were delegated rather than grilled ("just fix it"), so they are stated here explicitly.

**Chosen: an explicit client-side deletion log.** Deletions are carried as `deletedExpenseIds` and
the push tombstones exactly those ids. Set-difference is gone entirely. Rejected the alternative of
"scope deletion to ids observed in the last pull" — it still infers intent from observation, so a
delete racing a pull could be mis-ordered; an explicit log states intent directly.

### Changes

**`services/supabaseService.ts` — `pushToCloud`**
- Destructures `deletedExpenseIds` out of the payload, so it never leaks into the state blob.
- Step 3a tombstones only the supplied ids (`.in('id', ids).eq('user_key', userKey)` — the
  `user_key` filter is defence in depth on top of RLS). Skipped entirely when nothing was deleted.
- Step 3b upserts the rows this client holds and leaves everything else untouched.
- **Resurrection guard**: rows with a pending tombstone are filtered out of the upsert. Without
  this, deleting while offline and then pulling restores the row locally, and the upsert would
  write `deleted:false` and undo the tombstone from 3a.

**`App.tsx`**
- New persisted `deleted_expense_ids` log, so a deletion survives a reload before the next sync.
- Included in every push payload.
- Cleared **only after the server accepts the push**, so a failed or offline sync retries the
  deletion rather than dropping it.
- `recordExpenseDeletion(id)` returns the resulting log synchronously, so the caller can pass it
  into `onSync` without waiting on a state update.

**`components/Expenses.tsx`** — `handleDelete` records the deletion and sends it with the push.

**`api/routers/expenses.py`** — `DELETE /api/expenses/{id}` now soft-deletes
(`.update({"deleted": True})`) instead of hard-deleting, so the row resurfaces in
`/v1/integrations/expenses` as a tombstone. The `update_updated_at` trigger advances the cursor.
Previously a hard-deleted row simply vanished and **Life OS could never learn of the delete**.

### Fixed as a side effect

"Clear all transactions from local browser cache" (`Expenses.tsx:77`) promises *"This does NOT
delete data from the cloud."* That promise was false: the dialog cleared local state, and the next
sync set-differenced the empty list and tombstoned **every expense in the cloud**. The dialog now
tells the truth.

### Tests

- `tests/frontend/expenseSyncSafety.test.ts` — 9 new tests. Written first; **5 of 7 failed against
  the old code**, reproducing the bug before the fix. Covers: a bot-written expense the client has
  never seen is not tombstoned; an empty local list does not wipe the cloud; only explicitly deleted
  ids are tombstoned; deletions survive a push carrying no expense list; `deletedExpenseIds` never
  reaches the state blob; and the two resurrection cases.
- `tests/test_telegram_pipeline_contract.py` — 2 new tests for soft-delete: the row survives flagged
  `deleted`, reaches the feed as a payload-free tombstone, and delete is scoped to the owner (404
  for another user's row, left untouched).

Full suite green: **60 frontend / 26 backend**, `tsc --noEmit` clean, production build succeeds.
None of the pre-existing integration-contract tests from
"Lock the integration contract with regression tests" regressed.

### Left open

- **`deletedExpenseIds` grows unbounded** if pushes keep failing. Bounded in practice by successful
  syncs clearing it; a cap or age-out is worth considering later.
- **Losing localStorage loses pending deletions.** Deliberate: failing to propagate a delete is far
  better than destroying data.
- **ID collision** between phone-created and bot-created rows is not addressed. Both use UUIDs
  (`crypto.randomUUID` client-side, `gen_random_uuid()` server-side), so collision risk is
  negligible and no change was made.
- **CSV import still replaces all state** — see "CSV import replaces all state instead of merging".
  It is now the only remaining path that destroys expenses wholesale.
