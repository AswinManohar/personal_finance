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
