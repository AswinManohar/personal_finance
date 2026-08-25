-- An explicit subscription flag for user_expenses.
--
-- Until now, whether a recurring row was a "Subscription" or a "Recurring
-- Expense" was inferred at render time by utils/expenseSummary.ts: a name regex
-- (netflix|spotify|...|subscription|...) or "non-essential + monthly +
-- Entertainment/Other". That reading is arbitrary in practice. Two identical
-- EUR 63 Transport commitments land on opposite cards purely because one is
-- named "DB ticket" and the other "Subscription"; "Internet subscription" is
-- filed as a subscription because of its name while plain "Internet" is a bill.
--
-- It also made a WEEKLY subscription unrepresentable: the heuristic branch
-- requires isMonthly, so anything weekly could only ever be a bill unless its
-- name happened to match the regex.
--
-- Run this in the Supabase SQL editor BEFORE deploying the client that selects
-- the column. See the note at the bottom about why that ordering is not
-- optional.

-- 1. The column. Nullable on purpose, and with NO DEFAULT on purpose.
--
-- NULL is a real, distinct state here: "nobody has said". The client reads it
-- as "fall back to the old inference", so every existing row keeps rendering
-- exactly where it renders today and this migration changes no behaviour on its
-- own. A DEFAULT of false would instead silently reclassify every current
-- subscription as a bill the moment it ran.
ALTER TABLE public.user_expenses
  ADD COLUMN IF NOT EXISTS is_subscription boolean;

-- 2. No backfill, deliberately.
--
-- The inference is arbitrary, so freezing its current output into the column
-- would just make arbitrary permanent. Rows adopt an explicit value when a
-- human sets one. If you later want to bulk-correct your existing rows, do it
-- by hand and by name — the commented block at the bottom is a starting point.

-- 3. PostgREST serves from a cached schema and will keep returning PGRST204 /
-- 42703 for the new column until it reloads. That failure looks IDENTICAL to
-- "the migration was never run", which is what made the is_essential incident
-- expensive to diagnose. Force the reload.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

-- The column exists, nullable, no default.
-- EXPECT exactly one row:  is_subscription | boolean | YES | NULL
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='user_expenses'
--    AND column_name='is_subscription';

-- Nothing was reclassified behind your back. EXPECT set = 0.
-- SELECT count(*) AS total, count(is_subscription) AS "set"
--   FROM public.user_expenses;

-- PostgREST can see it. Run in a terminal, NOT the SQL editor. Want HTTP 200:
--   set -a; . ./.env; set +a
--   curl -s -o /dev/null -w "HTTP %{http_code}\n" \
--     "$SUPABASE_URL/rest/v1/user_expenses?select=id,is_subscription&limit=1" \
--     -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
-- A 400 means the schema cache is stale: re-run the NOTIFY above and retry.

-- ============================================================================
-- OPTIONAL — correct the existing rows by hand.
--
-- Left commented and un-run. Uncomment only the lines you agree with; the point
-- of this column is that YOU decide, not a regex.
-- ============================================================================
-- UPDATE public.user_expenses SET is_subscription = true
--  WHERE user_key = '<your-user-key>' AND name IN ('Anthropic subscription', 'Movie download');
-- UPDATE public.user_expenses SET is_subscription = false
--  WHERE user_key = '<your-user-key>' AND name IN ('Internet subscription', 'Subscription');

-- ============================================================================
-- ORDERING — why the client ships second.
--
-- migrations/2026-07-31-user-expenses-is-essential.sql records what happens when
-- client code ships ahead of the schema: sync broke in BOTH directions with
-- 42703, localStorage masked it on web, and a fresh Android install showed EUR 0
-- while silently dropping every expense added. Run this file, prove the column
-- is visible THROUGH POSTGREST (not just information_schema), then ship.
--
-- ROLLBACK — safe while the client is not yet deployed:
--   ALTER TABLE public.user_expenses DROP COLUMN IF EXISTS is_subscription;
--   NOTIFY pgrst, 'reload schema';
-- After the client ships, roll back the CLIENT instead: it treats a missing
-- flag as "infer", so an older build reading rows that have one is unaffected.
-- ============================================================================
