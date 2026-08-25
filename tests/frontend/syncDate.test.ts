/**
 * Sync-layer date handling — services/supabaseService.ts.
 *
 * Companion to dbTorture.test.ts (kept separate to avoid colliding with the
 * agent editing Expenses.tsx/expenseSummary.ts). Covers the three things this
 * change adds to the pull/push path: `date` winning over a conflicting
 * `created_at`, the Berlin-derivation fallback for legacy rows, and the
 * `42703` self-heal retry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';

type Row = Record<string, any>;

const db = {
  tables: new Map<string, Row[]>(),
  failures: new Map<string, string>(),
  log: [] as { table: string; op: string; values?: any; filters: any[]; selectArg?: string }[],
};

const tableRows = (name: string): Row[] => {
  if (!db.tables.has(name)) db.tables.set(name, []);
  return db.tables.get(name)!;
};

class FakeBuilder {
  private op = 'select';
  private values: any;
  private filters: { kind: 'eq' | 'in'; col: string; val: any }[] = [];
  private orderBy?: { col: string; ascending: boolean };
  private limitN?: number;
  private selectArg?: string;

  constructor(private table: string) {}

  select(arg?: string) { this.selectArg = arg; return this; }
  eq(col: string, val: any) { this.filters.push({ kind: 'eq', col, val }); return this; }
  in(col: string, val: any[]) { this.filters.push({ kind: 'in', col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, ascending: opts?.ascending ?? true }; return this; }
  limit(n: number) { this.limitN = n; return this; }
  insert(rows: any) { this.op = 'insert'; this.values = rows; return this; }
  update(values: any) { this.op = 'update'; this.values = values; return this; }
  upsert(rows: any, _opts?: any) { this.op = 'upsert'; this.values = rows; return this; }
  delete() { this.op = 'delete'; return this; }

  private matches(row: Row): boolean {
    return this.filters.every(f => {
      const actual = row[f.col];
      if (f.kind === 'in') return (f.val as any[]).includes(actual);
      if (typeof f.val === 'boolean') return Boolean(actual) === f.val;
      return actual === f.val;
    });
  }

  private result(): { data: any; error: any } {
    db.log.push({ table: this.table, op: this.op, values: this.values, filters: this.filters, selectArg: this.selectArg });

    const key = `${this.table}.${this.op}`;
    const failure = db.failures.get(key);
    if (failure) {
      // Consumed on first hit so a retry with a different (legacy) column
      // list can succeed — mirrors the one-shot self-heal in supabaseService.
      db.failures.delete(key);
      return { data: null, error: { code: '42703', message: failure } };
    }

    const rows = tableRows(this.table);

    if (this.op === 'insert') {
      const toInsert = (Array.isArray(this.values) ? this.values : [this.values]).map((r: Row) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...r,
      }));
      rows.push(...toInsert.map(r => ({ ...r })));
      return { data: toInsert, error: null };
    }

    if (this.op === 'upsert') {
      const batch = Array.isArray(this.values) ? this.values : [this.values];
      for (const rec of batch) {
        const existing = rows.find(r => r.id === rec.id);
        if (existing) Object.assign(existing, rec);
        else rows.push({ ...rec });
      }
      return { data: batch, error: null };
    }

    if (this.op === 'update') {
      const matched = rows.filter(r => this.matches(r));
      matched.forEach(r => Object.assign(r, this.values));
      return { data: matched.map(r => ({ ...r })), error: null };
    }

    // select
    let matched = rows.filter(r => this.matches(r)).map(r => ({ ...r }));
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      matched = matched.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (ascending ? 1 : -1));
    }
    if (this.limitN !== undefined) matched = matched.slice(0, this.limitN);
    return { data: matched, error: null };
  }

  then(resolve: (v: any) => void) { resolve(this.result()); }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => new FakeBuilder(table),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

const { pushToCloud, pullFromCloud } = await import('../../services/supabaseService');

const USER = 'sync-date-user';

const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id, name: `e-${id}`, amount: 10, category: ExpenseCategory.OTHER,
  isRecurring: false, date: '2026-07-01', ...over,
});

const cloudExpenseRows = () => tableRows('user_expenses');

beforeEach(() => {
  db.tables = new Map();
  db.failures = new Map();
  db.log = [];
  vi.stubGlobal('alert', vi.fn());
});

describe('date resolution on pull', () => {
  const cloudRow = (id: string, over: Row = {}): Row => ({
    id, user_key: USER, name: `e-${id}`, amount: 12.5, category: 'Other',
    vendor: null, is_recurring: false, recurring_frequency: null, is_essential: false,
    created_at: '2026-08-23T22:30:00+00:00', deleted: false, ...over,
  });

  it('`date` wins verbatim over a conflicting `created_at`', async () => {
    // created_at above is Berlin 00:30 the NEXT day; if the row's own `date`
    // is ignored, a UTC-style derivation would disagree with it.
    tableRows('user_expenses').push(cloudRow('conflict', { date: '2026-08-20' }));
    const { data } = await pullFromCloud(USER);
    expect(data.expenses[0].date).toBe('2026-08-20');
  });

  it('a missing `date` derives the LATER Berlin day from a 00:30-local created_at', async () => {
    // 2026-08-23T22:30:00Z is 2026-08-24T00:30 in Europe/Berlin (CEST, +2) —
    // the exact case that used to file a day early under toISOString().
    tableRows('user_expenses').push(cloudRow('no-date', { date: null }));
    const { data } = await pullFromCloud(USER);
    expect(data.expenses[0].date).toBe('2026-08-24');
  });

  it('a 42703 on select retries with the legacy column list and still returns expenses', async () => {
    tableRows('user_expenses').push(cloudRow('legacy', { date: null }));
    db.failures.set('user_expenses.select', 'column "date" does not exist');
    const { data } = await pullFromCloud(USER);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].id).toBe('legacy');
    // Falls back to the Berlin-derived date since the legacy select never
    // named the `date` column at all.
    expect(data.expenses[0].date).toBe('2026-08-24');
  });
});

describe('date on push', () => {
  it('writes `date` verbatim alongside a UTC-midnight `created_at` derived from it', async () => {
    await pushToCloud(USER, { expenses: [expense('a', { date: '2026-08-24' })] });
    const row = cloudExpenseRows()[0];
    expect(row.date).toBe('2026-08-24');
    expect(row.created_at).toBe('2026-08-24T00:00:00.000Z');
  });

  it('a 42703 on upsert retries once without `date` and still saves the row', async () => {
    db.failures.set('user_expenses.upsert', 'schema cache');
    await pushToCloud(USER, { expenses: [expense('a', { date: '2026-08-24' })] });
    const row = cloudExpenseRows()[0];
    expect(row.name).toBe('e-a');
    expect(row.date).toBeUndefined();
  });
});
