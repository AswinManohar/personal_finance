import { createClient } from '@supabase/supabase-js';
import { Expense, SavingsHistoryRecord, IncomeState, PortfolioAsset, Stock } from '../types';
import { newId } from '../utils/id';
import { resolveExpenseDate, todayYmd } from '../utils/expenseDate';
// SHA-256 with a software fallback: crypto.subtle is secure-context-only, so
// token generation threw over a plain-HTTP origin.
import { sha256Hex } from '../utils/sha256';

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

// The columns read from user_expenses once `date` exists.
const EXPENSE_SELECT_COLUMNS =
  'id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at, date';
// Pre-migration fallback: the exact list this file used before the `date`
// column existed. Kept verbatim so the self-heal below can drop back to
// "the old app" behaviour rather than guessing at a second schema.
const EXPENSE_SELECT_COLUMNS_LEGACY =
  'id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at';

/**
 * True for the specific failure mode PostgREST produces when a column named in
 * a query does not exist (`42703`) or its schema cache has not caught up with a
 * migration yet (`PGRST204`, or a message mentioning "schema cache"). Both look
 * identical to "the migration was never run" — see
 * migrations/2026-07-31-user-expenses-is-essential.sql for what happens when
 * nothing catches this: sync breaks in both directions and a fresh install
 * silently drops every expense.
 */
const isMissingColumnError = (error: any): boolean => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('schema cache') || message.includes("column") && message.includes("does not exist");
};

/**
 * Pulls expenses with the current column list, and — only if that fails with a
 * missing-column error — retries once against the pre-`date` legacy list. This
 * is the one defence that does not depend on anyone remembering to run the
 * migration's `NOTIFY pgrst, 'reload schema'` first.
 */
const selectExpenses = async (userKey: string) => {
  const res = await supabase.from('user_expenses').select(EXPENSE_SELECT_COLUMNS).eq('user_key', userKey).eq('deleted', false);
  if (res.error && isMissingColumnError(res.error)) {
    return supabase.from('user_expenses').select(EXPENSE_SELECT_COLUMNS_LEGACY).eq('user_key', userKey).eq('deleted', false);
  }
  return res;
};

/**
 * Upserts expense records, retrying once without `date` if the column is
 * missing/uncached. Same rationale as `selectExpenses`: a schema that lags the
 * client must degrade to "date is derived from created_at again", not to
 * "every push fails and the user loses their edits".
 */
const upsertExpenseRecords = async (records: Record<string, any>[]) => {
  const res = await supabase.from('user_expenses').upsert(records, { onConflict: 'id' });
  if (res.error && isMissingColumnError(res.error)) {
    const legacyRecords = records.map(({ date: _date, ...rest }) => rest);
    return supabase.from('user_expenses').upsert(legacyRecords, { onConflict: 'id' });
  }
  return res;
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
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_income').insert([incomePayload]);
        if (error) throw error;
      }
    } catch (err: any) {
      // Deliberately non-fatal, and deliberately NOT an alert() — this used to
      // pop three blocking dialogs, which freeze the Capacitor WebView outright.
      //
      // Swallowing is safe here only because income is dual-written: the
      // authoritative copy goes into the user_finances blob above, and this
      // relational table is a convenience for the integration feed. If that ever
      // stops being true, this must start throwing.
      logError("pushIncome (non-fatal; blob copy is authoritative)", err);
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
          // created_at keeps being derived as UTC midnight of the chosen date —
          // byte-identical to the old behaviour — so an old client (or a
          // rollback) reading only created_at still sees the right day. `date`
          // is the new, authoritative field; the two are written together so
          // neither can drift from the other.
          let isoDate = new Date().toISOString();
          let dateStr = todayYmd();
          if (e.date) {
            const parsed = new Date(e.date);
            if (!isNaN(parsed.getTime())) {
              isoDate = parsed.toISOString();
              dateStr = e.date;
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
            date: dateStr,
            updated_at: now,
            deleted: false
          };
        });
        const { error: upsertError } = await upsertExpenseRecords(records);
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
    const [financesRes, expensesRes, deletedRes, incomeRes, historyData] = await Promise.all([
      supabase.from('user_finances').select('data, updated_at').eq('user_key', userKey).limit(1),
      // MATCHING SCHEMA: id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at, date
      selectExpenses(userKey),
      // Tombstones, so the caller can tell "deleted upstream" from "never
      // pushed from here". Without them a row missing from the active set is
      // ambiguous, and treating it as a delete loses unsynced local work.
      supabase.from('user_expenses').select('id').eq('user_key', userKey).eq('deleted', true),
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

    // Transform expenses from user_expenses table back to internal Expense type.
    // `date` wins verbatim when present — no `new Date()` round-trip, which is
    // what filed Berlin-midnight expenses onto the previous day. `created_at`
    // is only consulted for rows written before the column existed, or from a
    // producer that never sets it (the Telegram bot). One bad row must not
    // poison the whole pull, so resolveExpenseDate degrades to today per-row.
    const expenses: Expense[] = (expensesRes.data || []).map(e => {
      const date = resolveExpenseDate(e);
      return {
        id: e.id || newId(),
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

    // A failed tombstone read is not fatal: the caller merges conservatively and
    // simply keeps more rows than it strictly should, rather than dropping any.
    const deletedExpenseIds: string[] = (deletedRes.data || []).map((r: any) => r.id);

    return {
      data: {
        ...mainBlob,
        expenses,
        income,
        history: historyData
      },
      deletedExpenseIds,
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

export const generateIntegrationToken = async (userKey: string, tokenName: string) => {
  if (!userKey) throw new Error("Sync ID missing");
  // The raw token is returned to the user once and never stored; only its hash
  // is persisted, so a leaked DB row cannot be replayed as a live credential.
  const rawToken = 'ff_live_' + newId().replace(/-/g, '');
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