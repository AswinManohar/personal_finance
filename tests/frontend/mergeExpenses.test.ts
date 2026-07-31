import { describe, it, expect } from 'vitest';
import { mergePulledExpenses } from '../../utils/mergeExpenses';
import { Expense, ExpenseCategory } from '../../types';

/**
 * The pull-side twin of the push-side data-loss tests in expenseSyncSafety.
 *
 * App.tsx used to do `if (data.expenses) setExpenses(data.expenses)`, and an
 * empty array is truthy — so a pull that returned nothing replaced everything
 * held locally.
 */

const e = (id: string, name: string, date = '2026-07-01'): Expense => ({
  id,
  name,
  amount: 10,
  category: ExpenseCategory.FOOD,
  isRecurring: false,
  date,
});

describe('mergePulledExpenses', () => {
  it('does not wipe local expenses when the cloud returns nothing', () => {
    const local = [e('1', 'Coffee'), e('2', 'Bus')];
    expect(mergePulledExpenses(local, [], [])).toHaveLength(2);
  });

  it('keeps a locally-added expense the cloud has never seen', () => {
    const local = [e('local-only', 'Just added')];
    const cloud = [e('cloud-1', 'From another device')];

    const merged = mergePulledExpenses(local, cloud, []);

    expect(merged.map(x => x.id).sort()).toEqual(['cloud-1', 'local-only']);
  });

  it('drops a local expense the cloud has tombstoned', () => {
    // Deleted on another device: it comes back as a tombstone, not as silence,
    // which is what makes this distinguishable from "never pushed".
    const local = [e('gone', 'Deleted elsewhere'), e('stays', 'Still here')];

    const merged = mergePulledExpenses(local, [], ['gone']);

    expect(merged.map(x => x.id)).toEqual(['stays']);
  });

  it('prefers the cloud copy of an expense held in both', () => {
    const local = [{ ...e('1', 'Stale name'), amount: 10 }];
    const cloud = [{ ...e('1', 'Updated name'), amount: 99 }];

    const merged = mergePulledExpenses(local, cloud, []);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Updated name');
    expect(merged[0].amount).toBe(99);
  });

  it('never emits an expense twice', () => {
    const local = [e('1', 'A'), e('2', 'B')];
    const cloud = [e('1', 'A'), e('3', 'C')];

    const ids = mergePulledExpenses(local, cloud, []).map(x => x.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns newest first', () => {
    const local = [e('old', 'Old', '2026-01-01')];
    const cloud = [e('new', 'New', '2026-07-20'), e('mid', 'Mid', '2026-04-10')];

    expect(mergePulledExpenses(local, cloud, []).map(x => x.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
  });

  it('a tombstone wins even when the cloud still lists the row as active', () => {
    // Defensive: the two lists disagreeing means something is wrong upstream,
    // and honouring the delete is the safer of the two readings.
    const merged = mergePulledExpenses([], [e('1', 'Contested')], ['1']);
    expect(merged.map(x => x.id)).toEqual([]);
  });
});
