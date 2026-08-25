-- A real transaction date for user_expenses.
--
-- Until now the schema had no `date` column and the app overloaded `created_at`
-- as the day money was spent. Both halves of that round-trip went through UTC:
-- the client wrote `new Date('2026-08-24').toISOString()` (UTC midnight) and read
-- it back with `.toISOString().split('T')[0]` (the UTC date). In Europe/Berlin
-- that files everything spent between 00:00 and 02:00 local to the PREVIOUS day —
-- and on a Monday, into the previous week. That is the bug this column fixes.
--
-- Run this in the Supabase SQL editor BEFORE deploying the client that reads the
-- column. See the note at the bottom about why that ordering is not optional.

-- 1. The column. Nullable on purpose, and with NO DEFAULT on purpose.
--
-- A DEFAULT would fire on every insert that omits the column, so the trigger
-- below could never tell "producer omitted it" from "producer meant it", and a
-- back-dated expense from an older client would silently become today. A DEFAULT
-- also does not apply to UPDATEs. The trigger covers both cases; a DEFAULT would
-- only get in its way. Do not add one.
ALTER TABLE public.user_expenses
  ADD COLUMN IF NOT EXISTS date date;

-- 2. Backfill.
--
-- One expression is correct for both shapes of existing row, and the reason is
-- load-bearing: Europe/Berlin's UTC offset is ALWAYS positive (+01:00 CET /
-- +02:00 CEST). So a legacy UTC-midnight row maps to 01:00-02:00 on the SAME
-- calendar day and never slides backwards, while a real instant written by the
-- API or the Telegram bot gets its true Berlin day.
--
--   2026-08-24T00:00:00Z  (legacy frontend, summer) -> 2026-08-24 02:00 -> 2026-08-24
--   2026-01-15T00:00:00Z  (legacy frontend, winter) -> 2026-01-15 01:00 -> 2026-01-15
--   2026-08-23T22:30:00Z  (bot, Berlin 00:30)       -> 2026-08-24 00:30 -> 2026-08-24
--
-- Had the timezone been west of UTC this would shift every legacy row back a
-- day and would need to branch on producer. It does not. Do not "simplify" this
-- to ::date without the AT TIME ZONE — that is the original bug.
--
-- Guarded on IS NULL so re-running this file is idempotent and cannot overwrite
-- a date somebody has since corrected by hand.
UPDATE public.user_expenses
   SET date = (created_at AT TIME ZONE 'Europe/Berlin')::date
 WHERE date IS NULL
   AND created_at IS NOT NULL;

-- Rows with no created_at at all. The client read path already tolerates these
-- (an unparseable date must not poison a whole pull), so give them today rather
-- than leaving a NULL that blocks the NOT NULL contract later.
UPDATE public.user_expenses
   SET date = (now() AT TIME ZONE 'Europe/Berlin')::date
 WHERE date IS NULL;

-- 3. Fill `date` for producers that do not set it.
--
-- This exists for the Telegram bot, which lives outside this repo, sends only
-- created_at, and will never be updated in lockstep with a migration here.
-- Without it that bot writes NULLs forever and `date` can never become NOT NULL.
--
-- INSERT only. An earlier draft also had an UPDATE arm that followed created_at
-- when created_at changed but date did not, to cover an older client editing an
-- expense's date. That was cut: it needs a stale client editing an EXISTING
-- expense's date, and this app has one phone and one browser that move together.
-- The residual risk, stated plainly: edit an expense's date on a not-yet-updated
-- client after this migration and the edit will not reach `date`. Update the
-- clients first and it cannot happen.
--
-- Why an old client's ordinary sync cannot corrupt `date` even so:
-- pushExpensesOnly (services/supabaseService.ts) re-upserts the ENTIRE local
-- expense list on every push rather than a diff, and PostgREST's ON CONFLICT DO
-- UPDATE only assigns columns present in the payload. `date` is not in an old
-- client's payload, so it is left untouched. If pushes ever become diff-based,
-- revisit this comment and this trigger together.
CREATE OR REPLACE FUNCTION public.user_expenses_fill_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date IS NULL THEN
    NEW.date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Europe/Berlin')::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_expenses_fill_date ON public.user_expenses;
CREATE TRIGGER user_expenses_fill_date
BEFORE INSERT ON public.user_expenses
FOR EACH ROW EXECUTE FUNCTION public.user_expenses_fill_date();

-- 4. Index for the week/month range scans this column exists to serve.
-- Partial on deleted = false because every read path in the app and the API
-- already carries that predicate. The only pre-existing index is on updated_at.
CREATE INDEX IF NOT EXISTS idx_user_expenses_user_date
  ON public.user_expenses (user_key, date DESC)
  WHERE deleted = false;

-- 5. PostgREST serves from a cached schema and will keep returning PGRST204 /
-- 42703 for the new column until it reloads. That failure looks IDENTICAL to
-- "the migration was never run", which is exactly the confusion that made the
-- is_essential incident so expensive to diagnose. Force the reload.
NOTIFY pgrst, 'reload schema';

-- Caveat worth recording: the backfill assumes the expenses were logged while in
-- Europe/Berlin. No per-row timezone was ever stored, so rows logged while
-- travelling may land a day out. That information is not recoverable; such rows
-- are individually editable if you spot one.
--
-- Ordering, and why it matters here specifically:
-- migrations/2026-07-31-user-expenses-is-essential.sql records what happens when
-- client code ships ahead of the schema — sync broke in BOTH directions with
-- 42703, localStorage masked it on web, and a fresh Android install showed EUR 0
-- while silently dropping every expense added. Run this file, verify the column
-- is visible through PostgREST (not just information_schema), and only then ship
-- the client.
