-- Enable Row Level Security (RLS) on all tables
-- This ensures that even if someone triggers an API call manually, 
-- custom SQL rules on the server will block access unless they are the owner.

-- 1. Enable RLS
ALTER TABLE user_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_savings_history ENABLE ROW LEVEL SECURITY;

-- 2. Create Policies for 'user_finances'
-- Allow users to SEE only their own data
CREATE POLICY "Users can view their own finances" 
ON user_finances FOR SELECT 
USING (auth.uid()::text = user_key);

-- Allow users to INSERT data only if it belongs to them
CREATE POLICY "Users can insert their own finances" 
ON user_finances FOR INSERT 
WITH CHECK (auth.uid()::text = user_key);

-- Allow users to UPDATE only their own data
CREATE POLICY "Users can update their own finances" 
ON user_finances FOR UPDATE 
USING (auth.uid()::text = user_key);

-- 3. Create Policies for 'user_income'
CREATE POLICY "Users can view their own income" ON user_income FOR SELECT USING (auth.uid()::text = user_key);
CREATE POLICY "Users can insert their own income" ON user_income FOR INSERT WITH CHECK (auth.uid()::text = user_key);
CREATE POLICY "Users can update their own income" ON user_income FOR UPDATE USING (auth.uid()::text = user_key);

-- 4. Create Policies for 'user_expenses'
CREATE POLICY "Users can view their own expenses" ON user_expenses FOR SELECT USING (auth.uid()::text = user_key);
CREATE POLICY "Users can insert their own expenses" ON user_expenses FOR INSERT WITH CHECK (auth.uid()::text = user_key);
CREATE POLICY "Users can delete their own expenses" ON user_expenses FOR DELETE USING (auth.uid()::text = user_key);

-- 5. Create Policies for 'user_savings_history'
CREATE POLICY "Users can view their own history" ON user_savings_history FOR SELECT USING (auth.uid()::text = user_key);
CREATE POLICY "Users can insert their own history" ON user_savings_history FOR INSERT WITH CHECK (auth.uid()::text = user_key);
CREATE POLICY "Users can delete their own history" ON user_savings_history FOR DELETE USING (auth.uid()::text = user_key);

-- =========================================================================
-- MIGRATION: V2 - Integrations and Incremental Sync (Life OS Integration)
-- Run this in Supabase Studio -> SQL Editor
-- =========================================================================

-- 6. Add incremental sync fields to user_expenses
-- Check if 'id' exists. If not, you may need to recreate the table or add it.
-- Assuming user_expenses has no primary key yet:
ALTER TABLE user_expenses ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE user_expenses ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE user_expenses ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
ALTER TABLE user_expenses ADD COLUMN IF NOT EXISTS vendor text;
-- recurring_frequency lets Life OS expand a recurring expense to daily amounts
-- without double-counting. Values: weekly | bi-weekly | monthly | quarterly | yearly.
ALTER TABLE user_expenses ADD COLUMN IF NOT EXISTS recurring_frequency text;

-- Index powering the incremental cursor feed (ordered by updated_at per user).
CREATE INDEX IF NOT EXISTS idx_user_expenses_user_updated
ON user_expenses (user_key, updated_at);

-- Add updated_at trigger for user_expenses
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_expenses_updated_at ON user_expenses;
CREATE TRIGGER update_user_expenses_updated_at
BEFORE UPDATE ON user_expenses
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 7. Integration Tokens for Service-to-Service auth (e.g. Life OS).
-- token_hash stores a SHA-256 hex digest of the raw token, NOT the token itself.
-- The raw `ff_live_...` token is shown to the user exactly once at generation
-- time and never persisted, so a leaked DB row cannot be replayed.
CREATE TABLE IF NOT EXISTS integration_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_key text NOT NULL,
    token_name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own tokens" ON integration_tokens FOR SELECT USING (auth.uid()::text = user_key);
CREATE POLICY "Users can insert their own tokens" ON integration_tokens FOR INSERT WITH CHECK (auth.uid()::text = user_key);
CREATE POLICY "Users can delete their own tokens" ON integration_tokens FOR DELETE USING (auth.uid()::text = user_key);
