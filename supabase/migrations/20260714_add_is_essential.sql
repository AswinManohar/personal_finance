-- Run in the Supabase SQL editor BEFORE deploying the is_essential sync code.
alter table public.user_expenses
  add column if not exists is_essential boolean not null default false;
