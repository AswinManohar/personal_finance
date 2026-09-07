-- ============================================================================
-- RUNBOOK: add a real `date` column to user_expenses
--
-- Fixes: expense dates were derived from `created_at` via toISOString(), i.e.
-- the UTC date. In Europe/Berlin that files anything spent between 00:00 and
-- 02:00 onto the PREVIOUS day — and on a Monday, into the previous week. That
-- is why "this week" read ~132 EUR when it should have been today only.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/ognusjgoyvhihypbtgvl/sql/new
--
-- Run BLOCK BY BLOCK, not all at once. Each block says what to check before
-- moving on. The client code that reads this column is written and tested but
-- NOT yet deployed — that ordering is deliberate, and nothing breaks if you
-- pause partway.
-- ============================================================================


-- ============================================================================
-- BLOCK 1 — PREFLIGHT (read-only, changes nothing)
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_expenses'
 ORDER BY ordinal_position;

SELECT count(*) AS total,
       count(*) FILTER (WHERE created_at IS NULL) AS null_created_at,
       count(*) FILTER (WHERE deleted IS NULL)    AS null_deleted,
       min(created_at)::date AS oldest,
       max(created_at)::date AS newest
  FROM public.user_expenses;

-- STOP AND CHECK BOTH:
--   * `is_essential` MUST appear in the column list. If it is missing, the
--     previous migration never ran and you must not stack this one on top —
--     that combination is what produced the EUR 0 / silent-data-loss incident.
--   * `date` must NOT already exist. If it does, stop.


-- ============================================================================
-- BLOCK 2 — SNAPSHOT (cheap insurance; drop it once the app is confirmed good)
-- ============================================================================
CREATE TABLE user_expenses_backup_20260824 AS
SELECT * FROM public.user_expenses;


-- ============================================================================
-- BLOCK 3 — THE MIGRATION
-- (identical to supabase/migrations/20260824_user_expenses_date.sql)
-- ============================================================================
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


-- ============================================================================
-- BLOCK 4 — VERIFY
-- ============================================================================

-- 4a. The column exists, nullable, no default.
--     EXPECT exactly one row:  date | date | YES | NULL
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='user_expenses' AND column_name='date';

-- 4b. Backfill completeness, and how much damage the old code was doing.
--     EXPECT unbackfilled = 0.
--     `shifted` = rows the old UTC read path was filing to the WRONG DAY.
--     A non-zero number here is the bug, quantified. Any of those that land on
--     a Sunday were being counted in the wrong WEEK.
SELECT count(*) AS total,
       count(*) FILTER (WHERE date IS NULL) AS unbackfilled,
       count(*) FILTER (WHERE date <> (created_at AT TIME ZONE 'Europe/Berlin')::date) AS shifted
  FROM public.user_expenses;

-- 4c. Trigger and index present.
--     EXPECT: update_user_expenses_updated_at AND user_expenses_fill_date
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.user_expenses'::regclass AND NOT tgisinternal;
--     EXPECT to see: idx_user_expenses_user_date
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='user_expenses';

-- 4d. The whole bug, asserted in one statement.
--     22:30 UTC on the 23rd is 00:30 Berlin on the 24th.
--     EXPECT 2026-08-24. If it returns 2026-08-23, STOP — the timezone
--     conversion is wrong and nothing else in this migration can be trusted.
BEGIN;
INSERT INTO public.user_expenses (user_key, name, amount, category, created_at)
VALUES ('migration-probe', 'probe', 1, 'Other', '2026-08-23T22:30:00Z')
RETURNING date;
ROLLBACK;


-- ============================================================================
-- BLOCK 5 — PROVE POSTGREST CAN SEE IT
--
-- information_schema is NOT sufficient. PostgREST serves from a cached schema,
-- and a stale cache throws the SAME 42703 as a migration that never ran — that
-- ambiguity is what made the last incident expensive to diagnose.
--
-- Run this in your terminal (not the SQL editor). Want HTTP 200:
--
--   set -a; . ./.env; set +a
--   curl -s -o /dev/null -w "HTTP %{http_code}\n" \
--     "$SUPABASE_URL/rest/v1/user_expenses?select=id,date&limit=1" \
--     -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
--
-- If it returns 400, re-run this in the SQL editor and retry:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================


-- ============================================================================
-- ROLLBACK — safe and complete while the client is not yet deployed.
-- After the client ships, roll back the CLIENT instead, never this column:
-- the client dual-writes created_at in the old format precisely so an older
-- build keeps working.
-- ============================================================================
-- DROP TRIGGER IF EXISTS user_expenses_fill_date ON public.user_expenses;
-- DROP FUNCTION IF EXISTS public.user_expenses_fill_date();
-- DROP INDEX IF EXISTS idx_user_expenses_user_date;
-- ALTER TABLE public.user_expenses DROP COLUMN IF EXISTS date;
-- NOTIFY pgrst, 'reload schema';
