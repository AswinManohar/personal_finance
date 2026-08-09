import { supabase } from './supabaseService';
import { apiUrl } from './apiBase';
import { Expense } from '../types';
import { newId } from '../utils/id';

export interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  direction: 'debit' | 'credit';
}

export interface ReviewFlag {
  transaction: StatementTransaction;
  flag_type: 'duplicate_subscription' | 'fee_or_charge' | 'above_baseline' | 'impulse';
  reason: string;
  severity: 'low' | 'medium' | 'high';
  monthly_saving_estimate: number;
}

export interface ReviewReport {
  transactions: StatementTransaction[];
  flags: ReviewFlag[];
  crosscheck: {
    missing_in_app: StatementTransaction[];
    missing_on_statement: Record<string, unknown>[];
    amount_mismatch: {
      statement_tx: StatementTransaction;
      app_expense: Record<string, unknown>;
      delta: number;
    }[];
  };
  redaction_preview: { masked_counts: Record<string, number> };
  totals: { statement_spend: number; flagged_spend: number; coverage_pct: number };
}

const VALID_CATEGORIES = ['Housing', 'Food', 'Transport', 'Utilities', 'Entertainment', 'Other'];

const authHeader = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return { Authorization: `Bearer ${session.access_token}` };
};

// The account holder's own name in the statement text must never reach the
// LLM. The server also masks names from its REDACT_NAMES env list, but that
// can't know the signed-in user's name — only the client does, via the
// Supabase session (same source App.tsx reads for user_metadata.avatar_url).
const signedInUserFullName = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.user_metadata?.full_name || '';
};

const errorMessage = async (res: Response): Promise<string> => {
  const body = await res.json().catch(() => null);
  return body?.detail?.message || body?.detail || `Request failed (${res.status})`;
};

export const reviewStatement = async (
  file: File,
  redact: boolean,
  statementType: 'bank' | 'credit_card',
): Promise<ReviewReport> => {
  const form = new FormData();
  form.append('file', file);
  form.append('redact', String(redact));
  form.append('statement_type', statementType);
  if (redact) {
    const fullName = await signedInUserFullName();
    if (fullName) form.append('redact_names', fullName);
  }
  const res = await fetch(apiUrl('/api/statements/review'), {
    method: 'POST',
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
};

export const importTransaction = async (tx: StatementTransaction): Promise<Expense> => {
  const res = await fetch(apiUrl('/api/expenses/'), {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tx.description,
      amount: tx.amount,
      category: VALID_CATEGORIES.includes(tx.category) ? tx.category : 'Other',
      created_at: tx.date,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const row = await res.json();
  // Mirrors the user_expenses -> Expense mapping in pullFromCloud
  // (services/supabaseService.ts) so an imported row looks identical to one
  // that came back from a cloud pull.
  return {
    id: row.id || newId(),
    name: row.name,
    amount: parseFloat(row.amount) || 0,
    category: row.category,
    vendor: row.vendor || undefined,
    isRecurring: !!row.is_recurring,
    recurringFrequency: row.recurring_frequency || undefined,
    isEssential: !!row.is_essential,
    date: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : tx.date,
  };
};
