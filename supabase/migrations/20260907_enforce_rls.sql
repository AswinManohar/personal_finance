-- ============================================================================
-- Enforce Row Level Security on every table. Idempotent; run it whole.
--
-- Found on 2026-09-07: with only the public anon key (the one compiled into
-- the web bundle and the APK), `GET /rest/v1/user_expenses` returned every
-- user's rows and `POST` inserted one. SUPABASE_SECURITY.sql describes the
-- intended policies, but they were not in force on the project — and it never
-- had an UPDATE policy on user_expenses, which the client's tombstone write and
-- upsert both need.
--
-- BEFORE running: the backend on Railway must be querying with the
-- service-role key (SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_KEY holding the
-- service-role key). api/dependencies.py logs a WARNING at startup if it is
-- not. With the anon key the API returns nothing once this is applied.
--
-- AFTER running, verify from a shell with the anon key from
-- services/supabaseService.ts — both must come back as `[]`:
--
--   curl "$URL/rest/v1/user_expenses?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   curl "$URL/rest/v1/user_finances?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- Rows whose user_key is not a Supabase auth uid (the pre-Google "Sync ID"
-- era, e.g. FF-XXXXXXXX) become unreachable by any client. That is intended;
-- nothing can sign in as them.
-- ============================================================================

-- integration_tokens did not exist on the project as of 2026-09-07.
CREATE TABLE IF NOT EXISTS public.integration_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_key text NOT NULL,
    token_name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_finances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_income          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_savings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_tokens   ENABLE ROW LEVEL SECURITY;

-- `(select auth.uid())` rather than `auth.uid()`: evaluated once per query
-- instead of once per row, per Supabase's RLS performance guidance.

-- user_finances: one JSON blob per user; the client updates it in place.
DROP POLICY IF EXISTS "Users can view their own finances"   ON public.user_finances;
DROP POLICY IF EXISTS "Users can insert their own finances" ON public.user_finances;
DROP POLICY IF EXISTS "Users can update their own finances" ON public.user_finances;
CREATE POLICY "Users can view their own finances"   ON public.user_finances FOR SELECT USING ((select auth.uid())::text = user_key);
CREATE POLICY "Users can insert their own finances" ON public.user_finances FOR INSERT WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can update their own finances" ON public.user_finances FOR UPDATE USING ((select auth.uid())::text = user_key) WITH CHECK ((select auth.uid())::text = user_key);

-- user_income
DROP POLICY IF EXISTS "Users can view their own income"   ON public.user_income;
DROP POLICY IF EXISTS "Users can insert their own income" ON public.user_income;
DROP POLICY IF EXISTS "Users can update their own income" ON public.user_income;
CREATE POLICY "Users can view their own income"   ON public.user_income FOR SELECT USING ((select auth.uid())::text = user_key);
CREATE POLICY "Users can insert their own income" ON public.user_income FOR INSERT WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can update their own income" ON public.user_income FOR UPDATE USING ((select auth.uid())::text = user_key) WITH CHECK ((select auth.uid())::text = user_key);

-- user_expenses: the client upserts (INSERT + UPDATE) and soft-deletes by
-- UPDATE, so all four are needed. WITH CHECK on UPDATE stops a row being
-- re-keyed to another user.
DROP POLICY IF EXISTS "Users can view their own expenses"   ON public.user_expenses;
DROP POLICY IF EXISTS "Users can insert their own expenses" ON public.user_expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.user_expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.user_expenses;
CREATE POLICY "Users can view their own expenses"   ON public.user_expenses FOR SELECT USING ((select auth.uid())::text = user_key);
CREATE POLICY "Users can insert their own expenses" ON public.user_expenses FOR INSERT WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can update their own expenses" ON public.user_expenses FOR UPDATE USING ((select auth.uid())::text = user_key) WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can delete their own expenses" ON public.user_expenses FOR DELETE USING ((select auth.uid())::text = user_key);

-- user_savings_history: append-only from the client, plus delete of a record.
DROP POLICY IF EXISTS "Users can view their own history"   ON public.user_savings_history;
DROP POLICY IF EXISTS "Users can insert their own history" ON public.user_savings_history;
DROP POLICY IF EXISTS "Users can delete their own history" ON public.user_savings_history;
CREATE POLICY "Users can view their own history"   ON public.user_savings_history FOR SELECT USING ((select auth.uid())::text = user_key);
CREATE POLICY "Users can insert their own history" ON public.user_savings_history FOR INSERT WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can delete their own history" ON public.user_savings_history FOR DELETE USING ((select auth.uid())::text = user_key);

-- integration_tokens: the owner manages them in the Data screen; the backend
-- validates them through the service-role client, which bypasses RLS.
DROP POLICY IF EXISTS "Users can view their own tokens"   ON public.integration_tokens;
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.integration_tokens;
DROP POLICY IF EXISTS "Users can delete their own tokens" ON public.integration_tokens;
CREATE POLICY "Users can view their own tokens"   ON public.integration_tokens FOR SELECT USING ((select auth.uid())::text = user_key);
CREATE POLICY "Users can insert their own tokens" ON public.integration_tokens FOR INSERT WITH CHECK ((select auth.uid())::text = user_key);
CREATE POLICY "Users can delete their own tokens" ON public.integration_tokens FOR DELETE USING ((select auth.uid())::text = user_key);

-- Check: every row should read `t` in the second column.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('user_finances','user_income','user_expenses','user_savings_history','integration_tokens');
