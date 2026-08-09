# CSV import replaces all state instead of merging

Type: grilling
Status: open
Blocked by: —

## Question

Found while researching "Data export and import inside the app shell". Independent of Android —
this is broken on the desktop web app today.

`handleImport` in `components/DataManagement.tsx` (lines 183-238) parses the chosen CSV and then
calls `setExpenses(parsed)` / `setPortfolio(parsed)` / `setStocks(parsed)` — **a full replace, not a
merge**. Importing a 3-row CSV silently destroys every other expense the user has.

Combined with the sync push, the blast radius is larger than one device: the replaced state then
propagates to Supabase on the next sync, and — via the set-difference bug in "Make expense push
non-destructive to externally-created rows" — tombstones every row that was not in the CSV,
including everything the Telegram bot ever wrote. Life OS then sees them all deleted.

Decide:

- Should import merge or replace? If replace is ever legitimate, it needs an explicit,
  clearly-worded confirmation naming how many records will be destroyed.
- If merge: what is the identity key for deduplication? Imported CSV rows have no stable id — the
  export writes no id column, so a re-import of an unmodified export would duplicate everything.
  Does export need to start emitting ids?
- What happens to rows present locally but absent from the CSV?

Relates closely to "Make expense push non-destructive to externally-created rows" — both are
answers to "when is it legitimate for this app to destroy data it did not just create". Worth
resolving that one first, then applying the same principle here.

Add regression coverage; the frontend suite is `npm test` (vitest), with existing component tests
under `tests/frontend/`.
