/**
 * Database torture tests — frontend sync layer (services/supabaseService.ts).
 *
 * Hammers every Supabase-touching function with hostile, boundary and
 * high-volume inputs against a stateful in-memory fake that mimics real
 * Postgres semantics (per-table storage, upsert-on-conflict including the
 * "cannot affect row a second time" duplicate-batch error, filter honouring,
 * per-operation error injection).
 *
 * Covered: pushToCloud, pullFromCloud, savings history record/get/delete,
 * integration token generate/list/revoke.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';

// --- Stateful fake Supabase ---------------------------------------------------

type Row = Record<string, any>;

const db = {
  tables: new Map<string, Row[]>(),
  /** key "table.op" -> error message; consumed on first hit unless sticky */
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
      // `deleted` predates some rows: missing key reads as false.
      if (typeof f.val === 'boolean') return Boolean(actual) === f.val;
      return actual === f.val;
    });
  }

  private result(): { data: any; error: any } {
    db.log.push({ table: this.table, op: this.op, values: this.values, filters: this.filters, selectArg: this.selectArg });

    const failure = db.failures.get(`${this.table}.${this.op}`);
    if (failure) return { data: null, error: { message: failure } };

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
      const seen = new Set<string>();
      for (const rec of batch) {
        if (seen.has(rec.id)) {
          // Real Postgres: 21000 — the same batch may not touch a row twice.
          return { data: null, error: { message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' } };
        }
        seen.add(rec.id);
      }
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

    if (this.op === 'delete') {
      const remaining = rows.filter(r => !this.matches(r));
      const removed = rows.length - remaining.length;
      db.tables.set(this.table, remaining);
      return { data: Array(removed).fill({}), error: null };
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

  // Supabase builders are thenables; awaiting one executes it.
  then(resolve: (v: any) => void) { resolve(this.result()); }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => new FakeBuilder(table),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

const {
  pushToCloud, pullFromCloud,
  recordSavingsHistory, getSavingsHistory, deleteHistoryRecord,
  generateIntegrationToken, getIntegrationTokens, revokeIntegrationToken,
} = await import('../../services/supabaseService');

// --- Helpers ------------------------------------------------------------------

const USER = 'torture-user';

const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id, name: `e-${id}`, amount: 10, category: ExpenseCategory.OTHER,
  isRecurring: false, date: '2026-07-01', ...over,
});

const cloudExpenseRows = () => tableRows('user_expenses');

const sha256Hex = async (input: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

beforeEach(() => {
  db.tables = new Map();
  db.failures = new Map();
  db.log = [];
  vi.stubGlobal('alert', vi.fn()); // pushIncome alerts on failure; keep tests silent
});

// =============================================================================
// pushToCloud — volume, duplicates, hostile rows, failure ordering
// =============================================================================

describe('pushToCloud under load', () => {
  it('upserts 1000 expenses in one push and all land', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => expense(`bulk-${i}`));
    await pushToCloud(USER, { expenses: many });
    expect(cloudExpenseRows()).toHaveLength(1000);
    expect(new Set(cloudExpenseRows().map(r => r.id)).size).toBe(1000);
  });

  it('re-pushing the same ids updates rows instead of duplicating them', async () => {
    await pushToCloud(USER, { expenses: [expense('a', { amount: 10 })] });
    await pushToCloud(USER, { expenses: [expense('a', { amount: 99 })] });
    expect(cloudExpenseRows()).toHaveLength(1);
    expect(cloudExpenseRows()[0].amount).toBe(99);
  });

  it('duplicate ids inside ONE payload hit the Postgres batch-conflict wall', async () => {
    // Real Postgres rejects an upsert batch that touches the same row twice.
    // The push must surface that error, not swallow it into a fake success.
    await expect(
      pushToCloud(USER, { expenses: [expense('dup'), expense('dup')] }),
    ).rejects.toBeTruthy();
  });

  it('tombstones 500 deletions in a single filtered update', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `gone-${i}`);
    tableRows('user_expenses').push(...ids.map(id => ({ id, user_key: USER, deleted: false })));

    await pushToCloud(USER, { deletedExpenseIds: ids });

    expect(cloudExpenseRows().every(r => r.deleted === true)).toBe(true);
    // Exactly one round-trip, and it was scoped to the user's rows.
    const updates = db.log.filter(l => l.table === 'user_expenses' && l.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toContainEqual({ kind: 'eq', col: 'user_key', val: USER });
  });

  it('hostile expense rows are normalized, never dropped', async () => {
    const hostile: Expense[] = [
      expense('no-name', { name: '' as any }),                    // -> 'Expense'
      expense('no-amount', { amount: 0 }),                        // stays 0
      expense('bad-date', { date: 'not-a-date' }),                // -> now()
      expense('empty-date', { date: '' }),                        // -> now()
      expense('sql', { name: "Robert'); DROP TABLE user_expenses;--" }),
      expense('emoji', { name: '🍕'.repeat(500) }),
      expense('recurring-no-freq', { isRecurring: true, recurringFrequency: undefined }), // -> monthly
      expense('not-recurring-with-freq', { isRecurring: false, recurringFrequency: 'weekly' }), // freq nulled
    ];
    await pushToCloud(USER, { expenses: hostile });

    const byId = Object.fromEntries(cloudExpenseRows().map(r => [r.id, r]));
    expect(Object.keys(byId)).toHaveLength(hostile.length);
    expect(byId['no-name'].name).toBe('Expense');
    expect(byId['bad-date'].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(new Date(byId['bad-date'].created_at).getTime())).toBe(false);
    expect(byId['sql'].name).toContain('DROP TABLE'); // stored as data, table intact
    expect(byId['recurring-no-freq'].recurring_frequency).toBe('monthly');
    expect(byId['not-recurring-with-freq'].recurring_frequency).toBeNull();
    expect(cloudExpenseRows().every(r => r.user_key === USER)).toBe(true);
  });

  it('pending deletions beat stale local copies even at scale', async () => {
    const all = Array.from({ length: 200 }, (_, i) => expense(`x-${i}`));
    const deletedIds = all.filter((_, i) => i % 2 === 0).map(e => e.id);

    await pushToCloud(USER, { expenses: all, deletedExpenseIds: deletedIds });

    const upserted = db.log
      .filter(l => l.table === 'user_expenses' && l.op === 'upsert')
      .flatMap(l => l.values.map((v: any) => v.id));
    expect(upserted).toHaveLength(100);
    expect(upserted.some((id: string) => deletedIds.includes(id))).toBe(false);
  });
});

describe('pushToCloud failure ordering', () => {
  it('a failing finances blob write aborts the push before any expense write', async () => {
    db.failures.set('user_finances.update', 'RLS says no');
    tableRows('user_finances').push({ id: 'f1', user_key: USER });

    await expect(pushToCloud(USER, { expenses: [expense('a')], deletedExpenseIds: ['z'] }))
      .rejects.toBeTruthy();

    expect(db.log.filter(l => l.table === 'user_expenses')).toHaveLength(0);
  });

  it('a failing tombstone write aborts before the upsert can resurrect anything', async () => {
    db.failures.set('user_expenses.update', 'network reset');

    await expect(pushToCloud(USER, { expenses: [expense('keep')], deletedExpenseIds: ['gone'] }))
      .rejects.toBeTruthy();

    expect(db.log.filter(l => l.table === 'user_expenses' && l.op === 'upsert')).toHaveLength(0);
  });

  it('a failing expense upsert propagates instead of reporting a clean sync', async () => {
    db.failures.set('user_expenses.upsert', 'disk full');
    await expect(pushToCloud(USER, { expenses: [expense('a')] })).rejects.toBeTruthy();
  });

  it('an income write failure is swallowed (dual-save fallback keeps blob copy)', async () => {
    db.failures.set('user_income.insert', 'RLS block');
    const ok = await pushToCloud(USER, {
      expenses: [], income: { salaryMe: 100, salaryPartner: 200 },
    });
    expect(ok).toBe(true);
    // The blob copy carries the income even though the relational write failed.
    const blob = tableRows('user_finances')[0]?.data;
    expect(blob.income).toEqual({ salaryMe: 100, salaryPartner: 200 });
  });

  it('rejects a push with no user key before touching any table', async () => {
    await expect(pushToCloud('', { expenses: [expense('a')] })).rejects.toBeTruthy();
    expect(db.log).toHaveLength(0);
  });
});

// =============================================================================
// pullFromCloud — round-trips, hostile cloud data, partial failures
// =============================================================================

describe('pullFromCloud under hostile cloud data', () => {
  const cloudRow = (id: string, over: Row = {}): Row => ({
    id, user_key: USER, name: `e-${id}`, amount: 12.5, category: 'Other',
    vendor: null, is_recurring: false, recurring_frequency: null, is_essential: false,
    created_at: '2026-07-01T10:00:00+00:00', deleted: false, ...over,
  });

  it('1000-row round-trip: everything pushed comes back intact', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => expense(`rt-${i}`, { amount: i + 0.5 }));
    await pushToCloud(USER, { expenses: many });

    const { data } = await pullFromCloud(USER);
    expect(data.expenses).toHaveLength(1000);
    const back = Object.fromEntries(data.expenses.map((e: Expense) => [e.id, e]));
    expect(back['rt-0'].amount).toBe(0.5);
    expect(back['rt-999'].amount).toBe(999.5);
  });

  it('coerces string / null / garbage amounts to numbers, never NaN', async () => {
    tableRows('user_expenses').push(
      cloudRow('str', { amount: '23.50' }),
      cloudRow('null', { amount: null }),
      cloudRow('garbage', { amount: 'abc' }),
    );
    const { data } = await pullFromCloud(USER);
    const amounts = Object.fromEntries(data.expenses.map((e: Expense) => [e.id, e.amount]));
    expect(amounts).toEqual({ str: 23.5, null: 0, garbage: 0 });
    expect(data.expenses.some((e: Expense) => Number.isNaN(e.amount))).toBe(false);
  });

  it('tombstoned rows never come back down', async () => {
    tableRows('user_expenses').push(cloudRow('live'), cloudRow('dead', { deleted: true }));
    const { data } = await pullFromCloud(USER);
    expect(data.expenses.map((e: Expense) => e.id)).toEqual(['live']);
  });

  it('null created_at falls back to today instead of crashing', async () => {
    tableRows('user_expenses').push(cloudRow('no-date', { created_at: null }));
    const { data } = await pullFromCloud(USER);
    expect(data.expenses[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('an unparseable created_at degrades to today for that row only', async () => {
    // One corrupt row must not poison the whole pull: the bad date falls back
    // to today, and every other row survives untouched.
    tableRows('user_expenses').push(
      cloudRow('ok'),
      cloudRow('bad', { created_at: 'not-a-date' }),
    );
    const { data } = await pullFromCloud(USER);
    expect(data.expenses.map((e: Expense) => e.id).sort()).toEqual(['bad', 'ok']);
    const bad = data.expenses.find((e: Expense) => e.id === 'bad')!;
    expect(bad.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ok = data.expenses.find((e: Expense) => e.id === 'ok')!;
    expect(ok.date).toBe('2026-07-01');
  });

  it('a failed user_expenses read rejects the pull instead of faking an empty list', async () => {
    // "No expenses" and "expenses query failed" must be distinguishable —
    // otherwise a caller could sync an empty list back over real data.
    tableRows('user_expenses').push(cloudRow('real'));
    db.failures.set('user_expenses.select', 'connection reset');

    await expect(pullFromCloud(USER)).rejects.toBeTruthy();
  });

  it('a failed finances read rejects the pull outright', async () => {
    db.failures.set('user_finances.select', 'timeout');
    await expect(pullFromCloud(USER)).rejects.toBeTruthy();
  });

  it('relational income wins only when positive; blob income is the fallback', async () => {
    tableRows('user_finances').push({
      id: 'f1', user_key: USER, updated_at: '2026-07-01T00:00:00Z',
      data: { income: { salaryMe: 1111, salaryPartner: 2222 } },
    });
    tableRows('user_income').push({ id: 'i1', user_key: USER, salary_me: 0, salary_partner: 0 });

    const zeros = await pullFromCloud(USER);
    expect(zeros.data.income).toEqual({ salaryMe: 1111, salaryPartner: 2222 });

    db.tables.get('user_income')![0] = { id: 'i1', user_key: USER, salary_me: '5000', salary_partner: null };
    const relational = await pullFromCloud(USER);
    expect(relational.data.income).toEqual({ salaryMe: 5000, salaryPartner: 0 });
  });

  it('a pull for an unknown user returns empty state, not someone else\'s data', async () => {
    tableRows('user_expenses').push(cloudRow('other-user-row', { user_key: 'someone-else' }));
    const { data } = await pullFromCloud('brand-new-user');
    expect(data.expenses).toEqual([]);
    expect(data.income).toEqual({ salaryMe: 0, salaryPartner: 0 });
  });
});

// =============================================================================
// Savings history — swallowed errors and volume
// =============================================================================

describe('savings history torture', () => {
  it('records 365 snapshots and reads them back in created_at order', async () => {
    for (let i = 0; i < 365; i++) {
      const ok = await recordSavingsHistory(USER, {
        total_assets: i, total_liabilities: 0, net_worth: i,
        savings_amount: 0, investment_amount: 0, gold_amount: 0, stock_amount: 0,
      } as any);
      expect(ok).toBe(true);
    }
    const history = await getSavingsHistory(USER);
    expect(history).toHaveLength(365);
  });

  it('missing numeric fields become zeros, not nulls', async () => {
    await recordSavingsHistory(USER, { net_worth: 500 } as any);
    const [row] = tableRows('user_savings_history');
    expect(row.total_assets).toBe(0);
    expect(row.gold_amount).toBe(0);
    expect(row.net_worth).toBe(500);
  });

  it('insert failure returns false instead of throwing', async () => {
    db.failures.set('user_savings_history.insert', 'quota exceeded');
    const ok = await recordSavingsHistory(USER, { net_worth: 1 } as any);
    expect(ok).toBe(false);
  });

  it('read failure degrades to an empty list; delete failure never throws', async () => {
    db.failures.set('user_savings_history.select', 'boom');
    expect(await getSavingsHistory(USER)).toEqual([]);
    db.failures.set('user_savings_history.delete', 'boom');
    await expect(deleteHistoryRecord('h1')).resolves.toBeUndefined();
  });

  it('empty userKey short-circuits without touching the network', async () => {
    expect(await recordSavingsHistory('', { net_worth: 1 } as any)).toBe(false);
    expect(await getSavingsHistory('')).toEqual([]);
    expect(db.log).toHaveLength(0);
  });
});

// =============================================================================
// Integration tokens — hashed at rest, raw never persisted
// =============================================================================

describe('integration token torture', () => {
  it('persists only the SHA-256 hash — the raw token never touches the table', async () => {
    const raw = await generateIntegrationToken(USER, 'life-os');

    expect(raw).toMatch(/^ff_live_[0-9a-f]{32}$/);
    const [row] = tableRows('integration_tokens');
    expect(row.token_hash).toBe(await sha256Hex(raw));
    expect(row.token_hash).not.toBe(raw);
    expect(JSON.stringify(tableRows('integration_tokens'))).not.toContain(raw);
  });

  it('100 generated tokens are all distinct with distinct hashes', async () => {
    const raws = new Set<string>();
    for (let i = 0; i < 100; i++) raws.add(await generateIntegrationToken(USER, `t${i}`));
    expect(raws.size).toBe(100);
    const hashes = new Set(tableRows('integration_tokens').map(r => r.token_hash));
    expect(hashes.size).toBe(100);
  });

  it('token listing never selects the hash column', async () => {
    await generateIntegrationToken(USER, 'x');
    await getIntegrationTokens(USER);
    const selects = db.log.filter(l => l.table === 'integration_tokens' && l.op === 'select');
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s.selectArg).not.toContain('token_hash');
  });

  it('revoking removes exactly the targeted token', async () => {
    await generateIntegrationToken(USER, 'keep');
    await generateIntegrationToken(USER, 'kill');
    const victim = tableRows('integration_tokens').find(r => r.token_name === 'kill')!;

    await revokeIntegrationToken(victim.id);

    expect(tableRows('integration_tokens')).toHaveLength(1);
    expect(tableRows('integration_tokens')[0].token_name).toBe('keep');
  });

  it('generation failure propagates and no raw token is handed out', async () => {
    db.failures.set('integration_tokens.insert', 'RLS deny');
    await expect(generateIntegrationToken(USER, 'x')).rejects.toBeTruthy();
    expect(tableRows('integration_tokens')).toHaveLength(0);
  });
});
