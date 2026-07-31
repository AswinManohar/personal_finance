import { createClient } from '@supabase/supabase-js';
import { Expense, SavingsHistoryRecord, IncomeState, PortfolioAsset, Stock } from '../types';

// Supabase Configuration
// Project ID: ognusjgoyvhihypbtgvl
const SUPABASE_URL = 'https://ognusjgoyvhihypbtgvl.supabase.co';

/**
 * ANON KEY: 
 * Validated to match project ref: ognusjgoyvhihypbtgvl
 */
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbnVzamdveXZoaWh5cGJ0Z3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzY3MzMsImV4cCI6MjA4NDE1MjczM30.G4Ic-Ozv7VWo-xFoMsEWCs1GwnKD-L_amEbEPefi8A8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  const msg = (error.message || String(error)).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('connection') ||
    msg.includes('load failed') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    (error.name === 'TypeError' && msg.includes('fetch'))
  );
};

const logError = (context: string, error: any) => {
  console.error(`[FinanceFlow] Supabase ${context} Error:`, error);
};

export const recordSavingsHistory = async (userKey: string, record: Omit<SavingsHistoryRecord, 'id' | 'created_at'>) => {
  if (!userKey) return false;
  try {
    const { error } = await supabase.from('user_savings_history').insert([{
      user_key: userKey,
      total_assets: record.total_assets || 0,
      total_liabilities: record.total_liabilities || 0,
      net_worth: record.net_worth || 0,
      savings_amount: record.savings_amount || 0,
      investment_amount: record.investment_amount || 0,
      gold_amount: record.gold_amount || 0,
      stock_amount: record.stock_amount || 0
    }]);
    if (error) throw error;
    return true;
  } catch (e) {
    logError("recordSavingsHistory", e);
    return false;
  }
};

export const getSavingsHistory = async (userKey: string): Promise<SavingsHistoryRecord[]> => {
  if (!userKey) return [];
  try {
    const { data, error } = await supabase
      .from('user_savings_history')
      .select('*')
      .eq('user_key', userKey)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    logError("getSavingsHistory", err);
    return [];
  }
};

export const deleteHistoryRecord = async (id: string) => {
  try {
    const { error } = await supabase.from('user_savings_history').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    logError("deleteHistoryRecord", e);
  }
};

/**
 * Pushes all local state to the cloud.
 * Expenses are saved ONLY to the 'user_expenses' table.
 */
export const pushToCloud = async (userKey: string, payload: any) => {
  if (!userKey) throw new Error("Missing Unique Sync ID");

  const now = new Date().toISOString();
  const { expenses, income, deletedExpenseIds, ...restOfData } = payload;

  // Dual-save strategy: We forcefully include income in the main JSON blob 
  // just in case the dedicated relational 'user_income' table encounters an RLS block.
  const blobToSave = { ...restOfData, income: income || { salaryMe: 0, salaryPartner: 0 } };

  // 1. Sync Primary Data Blob (user_finances)
  try {
    const { data: existing } = await supabase.from('user_finances').select('id').eq('user_key', userKey).limit(1);
    if (existing && existing.length > 0) {
      const { error } = await supabase.from('user_finances').update({ data: blobToSave, updated_at: now }).eq('user_key', userKey);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('user_finances').insert([{ user_key: userKey, data: blobToSave, updated_at: now }]);
      if (error) throw error;
    }
  } catch (err) {
    logError("pushMainData", err);
    throw err;
  }

  // 2. Sync Income
  if (income) {
    try {
      const { data: existingIncome } = await supabase.from('user_income').select('id').eq('user_key', userKey).limit(1);

      const incomePayload = {
        user_key: userKey,
        salary_me: income.salaryMe || 0,
        salary_partner: income.salaryPartner || 0,
        updated_at: now
      };

      if (existingIncome && existingIncome.length > 0) {
        const { error } = await supabase.from('user_income').update(incomePayload).eq('user_key', userKey);
        if (error) { alert("Server Error (Income Update): " + error.message); throw error; }
      } else {
        const { error } = await supabase.from('user_income').insert([incomePayload]);
        if (error) { alert("Server Error (Income Insert): " + error.message); throw error; }
      }
    } catch (err: any) {
      alert("Local Error logic: " + err?.message);
      logError("pushIncome", err);
    }
  }

  // 3a. Tombstone ONLY the expenses the user actually deleted.
  //
  // Deletions are carried explicitly by the caller. They must never be inferred
  // from "absent from this client's expenses array": the Telegram bot (and any
  // second device) writes rows straight into user_expenses that this client has
  // not pulled yet. The previous set-difference treated those as deletions and
  // silently tombstoned them — propagating the delete onward to Life OS via
  // /v1/integrations/expenses, which faithfully reports it.
  if (Array.isArray(deletedExpenseIds) && deletedExpenseIds.length > 0) {
    try {
      const { error } = await supabase
        .from('user_expenses')
        .update({ deleted: true, updated_at: now })
        .in('id', deletedExpenseIds)
        .eq('user_key', userKey);
      if (error) throw error;
    } catch (err) {
      logError("pushExpenseTombstones", err);
      throw err;
    }
  }

  // 3b. Upsert the expenses this client holds. Rows it does not hold are left
  // untouched — they belong to someone else's write, not to a deletion.
  if (expenses !== undefined) {
    try {
      // A pull can restore a row whose tombstone has not been pushed yet (deleted
      // while offline). Upserting it would write deleted:false and resurrect the
      // expense, undoing 3a — so drop anything with a pending deletion.
      const pendingDeletions = new Set<string>(deletedExpenseIds || []);
      const toUpsert = expenses.filter((e: Expense) => !pendingDeletions.has(e.id));

      if (toUpsert.length > 0) {
        const records = toUpsert.map((e: Expense) => {
          let isoDate = new Date().toISOString();
          if (e.date) {
            const parsed = new Date(e.date);
            if (!isNaN(parsed.getTime())) {
              isoDate = parsed.toISOString();
            }
          }
          return {
            id: e.id,
            user_key: userKey,
            name: e.name || 'Expense',
            amount: e.amount || 0,
            category: e.category || 'Other',
            vendor: e.vendor || null,
            is_recurring: !!e.isRecurring,
            recurring_frequency: e.isRecurring ? (e.recurringFrequency || 'monthly') : null,
            is_essential: !!e.isEssential,
            created_at: isoDate,
            updated_at: now,
            deleted: false
          };
        });
        const { error: upsertError } = await supabase.from('user_expenses').upsert(records, { onConflict: 'id' });
        if (upsertError) throw upsertError;
      }
    } catch (err) {
      logError("pushExpensesOnly", err);
      throw err;
    }
  }

  return true;
};

/**
 * Pulls data from the cloud.
 */
export const pullFromCloud = async (userKey: string) => {
  if (!userKey) throw new Error("Sync ID missing");

  try {
    const [financesRes, expensesRes, incomeRes, historyData] = await Promise.all([
      supabase.from('user_finances').select('data, updated_at').eq('user_key', userKey).limit(1),
      // MATCHING SCHEMA: id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at
      supabase.from('user_expenses').select('id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at').eq('user_key', userKey).eq('deleted', false),
      supabase.from('user_income').select('salary_me, salary_partner').eq('user_key', userKey).limit(1),
      getSavingsHistory(userKey)
    ]);

    if (financesRes.error) throw financesRes.error;
    // A failed expenses read must NOT masquerade as "user has no expenses" —
    // returning [] here could let the caller sync an empty list back over
    // real data. Throw so the app falls back to local state instead.
    if (expensesRes.error) throw expensesRes.error;

    const mainBlob = financesRes.data?.[0]?.data || {};
    const updatedAt = financesRes.data?.[0]?.updated_at;

    const todayIso = new Date().toISOString().split('T')[0];

    // Transform expenses from user_expenses table back to internal Expense type
    // Since the schema lacks a 'date' column, we use 'created_at' as the source for 'date'
    const expenses: Expense[] = (expensesRes.data || []).map(e => {
      // An unparseable created_at must not poison the whole pull:
      // new Date(garbage).toISOString() throws, so validate per row and fall
      // back to today for just that row.
      let date = todayIso;
      if (e.created_at) {
        const parsed = new Date(e.created_at);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString().split('T')[0];
        }
      }
      return {
        id: e.id || crypto.randomUUID(),
        name: e.name,
        amount: parseFloat(e.amount) || 0,
        category: e.category,
        vendor: e.vendor || undefined,
        isRecurring: !!e.is_recurring,
        recurringFrequency: e.recurring_frequency || undefined,
        isEssential: !!e.is_essential,
        date
      };
    });

    // Reconstruct income state
    let income: IncomeState = { salaryMe: 0, salaryPartner: 0 };
    if (incomeRes.data?.[0] && (parseFloat(incomeRes.data[0].salary_me) > 0 || parseFloat(incomeRes.data[0].salary_partner) > 0)) {
      income = {
        salaryMe: parseFloat(incomeRes.data[0].salary_me) || 0,
        salaryPartner: parseFloat(incomeRes.data[0].salary_partner) || 0
      };
    } else if (mainBlob.income) {
      income = mainBlob.income;
    }

    return {
      data: {
        ...mainBlob,
        expenses,
        income,
        history: historyData
      },
      updatedAt: updatedAt || new Date().toISOString()
    };
  } catch (err) {
    logError("pullFromCloud", err);
    throw err;
  }
};

export const signInWithGoogle = async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    logError("signInWithGoogle", err);
    return { error: err };
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (err) {
    logError("signOut", err);
    return { error: err };
  }
};

/** SHA-256 hex digest — must match the backend's hash_integration_token(). */
const sha256Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const generateIntegrationToken = async (userKey: string, tokenName: string) => {
  if (!userKey) throw new Error("Sync ID missing");
  // The raw token is returned to the user once and never stored; only its hash
  // is persisted, so a leaked DB row cannot be replayed as a live credential.
  const rawToken = 'ff_live_' + crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(rawToken);
  const { error } = await supabase.from('integration_tokens').insert([{
    user_key: userKey,
    token_name: tokenName,
    token_hash: tokenHash,
  }]);
  if (error) throw error;
  return rawToken;
};

export const getIntegrationTokens = async (userKey: string) => {
  if (!userKey) return [];
  const { data, error } = await supabase.from('integration_tokens').select('id, token_name, created_at').eq('user_key', userKey);
  if (error) throw error;
  return data || [];
};

export const revokeIntegrationToken = async (tokenId: string) => {
  const { error } = await supabase.from('integration_tokens').delete().eq('id', tokenId);
  if (error) throw error;
};