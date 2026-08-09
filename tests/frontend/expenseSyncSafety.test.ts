/**
 * Guards the expense sync push against destroying rows it did not create.
 *
 * The Telegram bot writes expenses straight into `user_expenses` via the API.
 * Those rows are invisible to any app client that has not pulled since. The
 * push must therefore never infer deletion from "absent from my localStorage" —
 * absence is equally consistent with "created elsewhere since my last pull".
 *
 * Deletions are instead carried explicitly as `deletedExpenseIds`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';

// --- Fake Supabase ------------------------------------------------------------

type Recorded = { table: string; op: string; values?: any; inIds?: string[] };

const state = {
  existingExpenses: [] as { id: string }[],
  existingFinances: [{ id: 'f1' }],
  existingIncome: [{ id: 'i1' }],
  recorded: [] as Recorded[],
};

class FakeBuilder {
  private op = 'select';
  private values: any;
  private inIds?: string[];

  constructor(private table: string) {}

  select() { return this; }
  eq() { return this; }
  limit() { return this; }
  in(_col: string, ids: string[]) { this.inIds = ids; return this; }
  update(values: any) { this.op = 'update'; this.values = values; return this; }
  insert(rows: any) { this.op = 'insert'; this.values = rows; return this; }
  upsert(rows: any) { this.op = 'upsert'; this.values = rows; return this; }
  delete() { this.op = 'delete'; return this; }

  private result() {
    if (this.op !== 'select') {
      state.recorded.push({ table: this.table, op: this.op, values: this.values, inIds: this.inIds });
      return { data: this.values, error: null };
    }
    if (this.table === 'user_expenses') return { data: state.existingExpenses, error: null };
    if (this.table === 'user_finances') return { data: state.existingFinances, error: null };
    if (this.table === 'user_income') return { data: state.existingIncome, error: null };
    return { data: [], error: null };
  }

  // Supabase query builders are thenable; awaiting one runs it.
  then(resolve: (v: any) => void) { resolve(this.result()); }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => new FakeBuilder(table),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

const { pushToCloud } = await import('../../services/supabaseService');

const expense = (id: string): Expense => ({
  id, name: `e-${id}`, amount: 10, category: ExpenseCategory.OTHER,
  isRecurring: false, date: '2026-07-01',
});

/** ids the push marked `deleted: true` */
const tombstoned = () =>
  state.recorded
    .filter(r => r.table === 'user_expenses' && r.op === 'update' && r.values?.deleted === true)
    .flatMap(r => r.inIds ?? []);

const upserted = () =>
  state.recorded
    .filter(r => r.table === 'user_expenses' && r.op === 'upsert')
    .flatMap(r => (r.values ?? []).map((v: any) => v.id));

beforeEach(() => {
  state.existingExpenses = [];
  state.recorded = [];
});

describe('pushToCloud — expenses the client did not create', () => {
  it('does not tombstone a bot-written expense the client has never seen', async () => {
    // The bot logged an expense from a bill; this client pulled before that.
    state.existingExpenses = [{ id: 'local-1' }, { id: 'bot-1' }];

    await pushToCloud('user-123', { expenses: [expense('local-1')] });

    expect(tombstoned()).not.toContain('bot-1');
    expect(tombstoned()).toEqual([]);
  });

  it('does not wipe the cloud when local state is empty', async () => {
    // "Clear all transactions from local browser cache" promises it does NOT
    // delete cloud data. A set-difference push breaks that promise outright.
    state.existingExpenses = [{ id: 'a' }, { id: 'b' }];

    await pushToCloud('user-123', { expenses: [] });

    expect(tombstoned()).toEqual([]);
  });

  it('still upserts the expenses it does hold', async () => {
    state.existingExpenses = [{ id: 'bot-1' }];

    await pushToCloud('user-123', { expenses: [expense('local-1')] });

    expect(upserted()).toEqual(['local-1']);
  });
});

describe('pushToCloud — explicit deletions', () => {
  it('tombstones exactly the ids the user deleted', async () => {
    state.existingExpenses = [{ id: 'keep' }, { id: 'gone' }, { id: 'bot-1' }];

    await pushToCloud('user-123', {
      expenses: [expense('keep')],
      deletedExpenseIds: ['gone'],
    });

    expect(tombstoned()).toEqual(['gone']);
  });

  it('does not issue a tombstone update when nothing was deleted', async () => {
    state.existingExpenses = [{ id: 'keep' }];

    await pushToCloud('user-123', { expenses: [expense('keep')], deletedExpenseIds: [] });

    expect(state.recorded.filter(r => r.table === 'user_expenses' && r.op === 'update')).toHaveLength(0);
  });

  it('honours deletions even on a push that carries no expense list', async () => {
    await pushToCloud('user-123', { deletedExpenseIds: ['gone'] });

    expect(tombstoned()).toEqual(['gone']);
  });

  it('never writes deletedExpenseIds into the state blob', async () => {
    await pushToCloud('user-123', { expenses: [], deletedExpenseIds: ['gone'], goal: { targetAmount: 1 } });

    const blob = state.recorded.find(r => r.table === 'user_finances')?.values?.data;
    expect(blob).toBeDefined();
    expect(blob).not.toHaveProperty('deletedExpenseIds');
  });
});

describe('pushToCloud — deletion beats a stale local copy', () => {
  it('does not resurrect an expense that has a pending tombstone', async () => {
    // Deleted while offline, then a pull restored the row into local state.
    // Upserting it would write deleted:false and undo the tombstone.
    await pushToCloud('user-123', {
      expenses: [expense('gone'), expense('keep')],
      deletedExpenseIds: ['gone'],
    });

    expect(tombstoned()).toEqual(['gone']);
    expect(upserted()).toEqual(['keep']);
  });

  it('skips the upsert entirely when every expense is pending deletion', async () => {
    await pushToCloud('user-123', {
      expenses: [expense('gone')],
      deletedExpenseIds: ['gone'],
    });

    expect(upserted()).toEqual([]);
    expect(tombstoned()).toEqual(['gone']);
  });
});
