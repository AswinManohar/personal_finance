-- The Essential flag (emergency-fund feature) shipped in the app without this
-- migration ever running in production. The client's pull SELECTs the column
-- and its push writes it, so expense sync failed in BOTH directions with
--   42703: column user_expenses.is_essential does not exist
-- On the web, localStorage masked it completely; a fresh Android install
-- showed €0 and quietly dropped every added expense on logout.
--
-- Run in the Supabase SQL editor. Default false matches the app's
-- `is_essential: !!e.isEssential` for rows created by the Telegram bot,
-- which does not set the flag.
ALTER TABLE public.user_expenses
  ADD COLUMN IF NOT EXISTS is_essential boolean NOT NULL DEFAULT false;
