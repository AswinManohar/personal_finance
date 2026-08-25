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
  // A string fails once (the common case: one stale column, one retry). The
  // object form fails `times` in a row, which is what an upsert needs when two
  // columns from two different migrations are both missing and the self-heal
  // has to shed them one at a time.
  failures: new Map<string, string | { message: string; times: number }>(),
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
      // Consumed as it is spent so a retry with a different (legacy) column
      // list can succeed — mirrors the self-heal ladder in supabaseService.
      if (typeof failure === 'string') {
        db.failures.delete(key);
        return { data: null, error: { code: '42703', message: failure } };
      }
      if (failure.times <= 1) db.failures.delete(key);
      else db.failures.set(key, { ...failure, times: failure.times - 1 });
      return { data: null, error: { code: '42703', message: failure.message } };
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
    //
    // Honours the requested column list. Returning whole rows regardless would
    // make every self-heal test vacuous: a fallback that drops a column would
    // still appear to return it, so a retry ladder that sheds the WRONG column
    // could not be told from one that sheds the right one.
    const project = (r: Row): Row => {
      if (!this.selectArg || this.selectArg.includes('*')) return { ...r };
      const cols = this.selectArg.split(',').map(c => c.trim());
      return Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]]));
    };
    let matched = rows.filter(r => this.matches(r)).map(project);
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

  it('a 42703 on select falls all the way back and still returns expenses', async () => {
    tableRows('user_expenses').push(cloudRow('legacy', { date: null }));
    // Two failures: the ladder sheds `is_subscription` first, then `date`.
    db.failures.set('user_expenses.select', { message: 'column "date" does not exist', times: 2 });
    const { data } = await pullFromCloud(USER);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].id).toBe('legacy');
    // Falls back to the Berlin-derived date since the legacy select never
    // named the `date` column at all.
    expect(data.expenses[0].date).toBe('2026-08-24');
  });

  it('a missing is_subscription column does not cost us the date column', async () => {
    // The live pre-migration state: `date` shipped and is correct, the newer
    // column has not landed. A single retry that dropped straight to the
    // pre-`date` list would silently re-derive every date from created_at —
    // undoing the whole reason `date` exists.
    tableRows('user_expenses').push(cloudRow('kept', { date: '2026-08-20' }));
    db.failures.set('user_expenses.select', 'column "is_subscription" does not exist');
    const { data } = await pullFromCloud(USER);
    expect(data.expenses[0].date).toBe('2026-08-20');
    expect(data.expenses[0].isSubscription).toBeUndefined();
  });
});

describe('date on push', () => {
  it('writes `date` verbatim alongside a UTC-midnight `created_at` derived from it', async () => {
    await pushToCloud(USER, { expenses: [expense('a', { date: '2026-08-24' })] });
    const row = cloudExpenseRows()[0];
    expect(row.date).toBe('2026-08-24');
    expect(row.created_at).toBe('2026-08-24T00:00:00.000Z');
  });

  it('a 42703 on upsert sheds `date` too and still saves the row', async () => {
    // Two failures, because the self-heal now sheds one column per retry:
    // `is_subscription` first, then `date`. A schema missing both is the
    // genuinely old one this fallback exists for.
    db.failures.set('user_expenses.upsert', { message: 'schema cache', times: 2 });
    await pushToCloud(USER, { expenses: [expense('a', { date: '2026-08-24' })] });
    const row = cloudExpenseRows()[0];
    expect(row.name).toBe('e-a');
    expect(row.date).toBeUndefined();
    expect(row.is_subscription).toBeUndefined();
  });

  it('a single stale-column failure keeps a date that is already correct', async () => {
    // The regression this ladder prevents: one retry that dropped both columns
    // discarded a migrated, correct `date` merely because the newer column had
    // not landed yet.
    db.failures.set('user_expenses.upsert', 'column "is_subscription" does not exist');
    await pushToCloud(USER, { expenses: [expense('a', { date: '2026-08-24' })] });
    expect(cloudExpenseRows()[0].date).toBe('2026-08-24');
  });
});

describe('is_subscription round-trip', () => {
  const cloudRow = (id: string, over: Row = {}): Row => ({
    id, user_key: USER, name: `e-${id}`, amount: 21, category: 'Other',
    vendor: null, is_recurring: true, recurring_frequency: 'monthly', is_essential: false,
    created_at: '2026-08-01T00:00:00+00:00', date: '2026-08-01', deleted: false, ...over,
  });

  it('pulls an explicit flag through as a boolean', async () => {
    tableRows('user_expenses').push(cloudRow('sub', { is_subscription: true }));
    tableRows('user_expenses').push(cloudRow('bill', { is_subscription: false }));
    const { data } = await pullFromCloud(USER);
    const byId = Object.fromEntries(data.expenses.map((e: Expense) => [e.id, e.isSubscription]));
    expect(byId.sub).toBe(true);
    expect(byId.bill).toBe(false);
  });

  it('leaves the flag undefined when the column is null, so inference still applies', async () => {
    // NULL means "nobody has said". Reading it as `false` would silently move
    // every pre-migration Netflix off the Subscriptions card.
    tableRows('user_expenses').push(cloudRow('legacy', { is_subscription: null }));
    const { data } = await pullFromCloud(USER);
    expect(data.expenses[0].isSubscription).toBeUndefined();
  });

  it('pushes an explicit false rather than dropping it', async () => {
    // `false` is a decision, not an absence — a truthiness check here would
    // discard it and hand the row back to the regex.
    await pushToCloud(USER, { expenses: [
      expense('a', { isRecurring: true, isSubscription: false }),
    ] });
    expect(cloudExpenseRows()[0].is_subscription).toBe(false);
  });

  it('writes null for a one-off expense', async () => {
    await pushToCloud(USER, { expenses: [expense('a')] });
    expect(cloudExpenseRows()[0].is_subscription).toBeNull();
  });

  it('a 42703 on upsert drops is_subscription but keeps date', async () => {
    // The pre-migration state for THIS change: `date` exists, the new column
    // does not. Dropping both would regress dates that are already correct.
    db.failures.set('user_expenses.upsert', 'column "is_subscription" does not exist');
    await pushToCloud(USER, { expenses: [
      expense('a', { date: '2026-08-24', isRecurring: true, isSubscription: true }),
    ] });
    const row = cloudExpenseRows()[0];
    expect(row.name).toBe('e-a');
    expect(row.is_subscription).toBeUndefined();
    expect(row.date).toBe('2026-08-24');
  });
});
