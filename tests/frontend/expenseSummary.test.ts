import { describe, it, expect } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';
import {
  oneOffExpenses, spanBounds, withinSpan, weeklyTotals, categoryTotals, groupByDay,
  isSubscription, recurringIcon, recurringSublabel, recurringBills, subscriptionExpenses,
  monthlyTotal, monthSpend,
} from '../../utils/expenseSummary';

const mk = (over: Partial<Expense> & { date: string; amount: number }): Expense => ({
  id: over.date + ':' + over.amount,
  name: 'thing',
  category: ExpenseCategory.FOOD,
  isRecurring: false,
  ...over,
});

const MONDAY = new Date(2026, 7, 24, 18, 31); // Mon 2026-08-24, late in the day

describe('oneOffExpenses', () => {
  it('drops recurring rows', () => {
    const rows = [
      mk({ date: '2026-08-24', amount: 10 }),
      mk({ date: '2026-08-24', amount: 900, isRecurring: true }),
    ];
    expect(oneOffExpenses(rows).map(e => e.amount)).toEqual([10]);
  });
});

describe('spanBounds', () => {
  it('7d is the seven calendar days ending today, inclusive', () => {
    expect(spanBounds('7d', MONDAY)).toEqual({ lo: '2026-08-18', hi: '2026-08-24' });
  });

  it('30d and 90d likewise end today', () => {
    expect(spanBounds('30d', MONDAY)).toEqual({ lo: '2026-07-26', hi: '2026-08-24' });
    expect(spanBounds('90d', MONDAY)).toEqual({ lo: '2026-05-27', hi: '2026-08-24' });
  });

  it('all is unbounded', () => {
    expect(spanBounds('all', MONDAY)).toBeNull();
  });
});

describe('withinSpan', () => {
  const rows = [
    mk({ date: '2026-08-24', amount: 1 }),  // today
    mk({ date: '2026-08-18', amount: 2 }),  // first day of the 7d window
    mk({ date: '2026-08-17', amount: 4 }),  // just outside it
  ];

  it('includes the first day of the window — the shipped filter dropped it', () => {
    expect(withinSpan(rows, '7d', MONDAY).map(e => e.amount).sort()).toEqual([1, 2]);
  });

  it('returns everything for `all`', () => {
    expect(withinSpan(rows, 'all', MONDAY)).toHaveLength(3);
  });
});

describe('weeklyTotals', () => {
  it('on a Monday, this week holds only today — not the previous six days', () => {
    const rows = [
      mk({ date: '2026-08-24', amount: 132 }), // Mon, this week
      mk({ date: '2026-08-23', amount: 500 }), // Sun, LAST week
      mk({ date: '2026-08-19', amount: 200 }), // Wed, last week
    ];
    const weeks = weeklyTotals(rows, MONDAY, 4);
    const current = weeks[weeks.length - 1];
    expect(current.start).toBe('2026-08-24');
    expect(current.amount).toBe(132);
    expect(weeks[2].amount).toBe(700); // Aug 17-23 gets both of the others
  });

  it('counts an expense on the first day of a week', () => {
    // The regression: weekStart carried a time-of-day, so day one fell out.
    const weeks = weeklyTotals([mk({ date: '2026-08-17', amount: 50 })], MONDAY, 4);
    expect(weeks[2].amount).toBe(50);
  });

  it('excludes recurring rows from the weekly bar', () => {
    const rows = [
      mk({ date: '2026-08-24', amount: 12 }),
      mk({ date: '2026-08-24', amount: 900, isRecurring: true }),
    ];
    expect(weeklyTotals(rows, MONDAY, 4).at(-1)!.amount).toBe(12);
  });

  it('carries how many transactions made each bar', () => {
    // The "This week so far" line used to render the chip-filtered list's
    // length, so with the chip on ALL it reported every one-off expense ever
    // (255) under a label that says "this week".
    const rows = [
      mk({ date: '2026-08-24', amount: 12.54 }),
      mk({ date: '2026-08-24', amount: 5.29 }),
      mk({ date: '2026-08-23', amount: 500 }),   // last week
      mk({ date: '2026-08-24', amount: 900, isRecurring: true }), // never counted
    ];
    const weeks = weeklyTotals(rows, MONDAY, 4);
    expect(weeks.at(-1)!.count).toBe(2);
    expect(weeks[2].count).toBe(1);
  });

  it('counts zero for a week with nothing in it', () => {
    expect(weeklyTotals([], MONDAY, 4).map(w => w.count)).toEqual([0, 0, 0, 0]);
  });

  it('is not clipped by the chip period — all four weeks can be non-zero', () => {
    const rows = [
      mk({ date: '2026-08-24', amount: 1 }),
      mk({ date: '2026-08-17', amount: 2 }),
      mk({ date: '2026-08-10', amount: 3 }),
      mk({ date: '2026-08-03', amount: 4 }),
    ];
    expect(weeklyTotals(rows, MONDAY, 4).map(w => w.amount)).toEqual([4, 3, 2, 1]);
  });
});

describe('categoryTotals', () => {
  it('sums per category and drops empty ones', () => {
    const rows = [
      mk({ date: '2026-08-24', amount: 10, category: ExpenseCategory.FOOD }),
      mk({ date: '2026-08-24', amount: 5, category: ExpenseCategory.FOOD }),
      mk({ date: '2026-08-24', amount: 20, category: ExpenseCategory.TRANSPORT }),
    ];
    expect(categoryTotals(rows)).toEqual([
      { name: ExpenseCategory.FOOD, value: 15 },
      { name: ExpenseCategory.TRANSPORT, value: 20 },
    ]);
  });
});

describe('groupByDay', () => {
  it('groups newest first with a per-day subtotal', () => {
    const rows = [
      mk({ date: '2026-08-22', amount: 29.1 }),
      mk({ date: '2026-08-24', amount: 12.4 }),
      mk({ date: '2026-08-22', amount: 6.7 }),
    ];
    const days = groupByDay(rows);
    expect(days.map(d => d.date)).toEqual(['2026-08-24', '2026-08-22']);
    expect(days[0].total).toBeCloseTo(12.4);
    expect(days[1].total).toBeCloseTo(35.8);
    expect(days[1].items).toHaveLength(2);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('isSubscription — explicit flag', () => {
  const rec = (over: Partial<Expense>): Expense =>
    mk({ date: '2026-08-24', amount: 10, isRecurring: true, ...over });

  it('an explicit true wins over every heuristic', () => {
    // Essential + Housing + monthly is as un-subscription-like as the heuristic
    // gets. Saying so must still win.
    expect(isSubscription(rec({
      name: 'House rent', category: ExpenseCategory.HOUSING,
      isEssential: true, isSubscription: true,
    }))).toBe(true);
  });

  it('an explicit false wins over the name regex', () => {
    // "Internet subscription" is a bill that the regex claims for Subscriptions.
    expect(isSubscription(rec({ name: 'Internet subscription', isSubscription: false }))).toBe(false);
    expect(isSubscription(rec({ name: 'Netflix', isSubscription: false }))).toBe(false);
  });

  it('makes a weekly subscription possible at all', () => {
    // The heuristic branch requires isMonthly, so without an explicit flag a
    // weekly row could only be a subscription by name coincidence.
    const weekly = rec({
      name: 'Veg box', category: ExpenseCategory.FOOD, recurringFrequency: 'weekly',
    });
    expect(isSubscription(weekly)).toBe(false);
    expect(isSubscription({ ...weekly, isSubscription: true })).toBe(true);
  });

  it('falls back to inference when the flag is absent', () => {
    // Undefined is a real state: rows written before the column existed. They
    // must keep rendering exactly where they render today.
    expect(isSubscription(rec({ name: 'Netflix' }))).toBe(true);
    expect(isSubscription(rec({ name: 'House rent', category: ExpenseCategory.HOUSING }))).toBe(false);
  });
});

describe('subscriptionExpenses / recurringBills — explicit flag', () => {
  it('routes each row to the card its flag names', () => {
    const rows: Expense[] = [
      mk({ date: '2026-08-24', amount: 63, name: 'DB ticket', isRecurring: true,
           category: ExpenseCategory.TRANSPORT, isSubscription: false }),
      mk({ date: '2026-08-24', amount: 21, name: 'Anthropic', isRecurring: true,
           category: ExpenseCategory.OTHER, isSubscription: true }),
    ];
    expect(subscriptionExpenses(rows).map(e => e.name)).toEqual(['Anthropic']);
    expect(recurringBills(rows).map(e => e.name)).toEqual(['DB ticket']);
  });
});

describe('isSubscription', () => {
  it('matches a subscription-shaped name regardless of category or cadence', () => {
    expect(isSubscription(mk({ date: 'd', amount: 1, name: 'Netflix', isRecurring: true, category: ExpenseCategory.OTHER, recurringFrequency: 'yearly' }))).toBe(true);
    expect(isSubscription(mk({ date: 'd', amount: 1, name: 'Spotify Premium', isRecurring: true, category: ExpenseCategory.ENTERTAINMENT }))).toBe(true);
    expect(isSubscription(mk({ date: 'd', amount: 1, name: 'iCloud+', isRecurring: true, category: ExpenseCategory.OTHER }))).toBe(true);
  });

  it('is case-insensitive on the name match', () => {
    expect(isSubscription(mk({ date: 'd', amount: 1, name: 'NETFLIX', isRecurring: true, category: ExpenseCategory.OTHER }))).toBe(true);
  });

  it('falls back to non-essential + monthly + Entertainment/Other', () => {
    const cinema = mk({ date: 'd', amount: 12, name: 'Cinema Pass', isRecurring: true, recurringFrequency: 'monthly', isEssential: false, category: ExpenseCategory.ENTERTAINMENT });
    expect(isSubscription(cinema)).toBe(true);

    const other = mk({ date: 'd', amount: 12, name: 'Storage locker', isRecurring: true, recurringFrequency: 'monthly', isEssential: false, category: ExpenseCategory.OTHER });
    expect(isSubscription(other)).toBe(true);
  });

  it('is a bill when essential, even if the category/cadence otherwise matches', () => {
    const essential = mk({ date: 'd', amount: 12, name: 'Cinema Pass', isRecurring: true, recurringFrequency: 'monthly', isEssential: true, category: ExpenseCategory.ENTERTAINMENT });
    expect(isSubscription(essential)).toBe(false);
  });

  it('is a bill when non-monthly, even in Entertainment/Other', () => {
    const yearly = mk({ date: 'd', amount: 12, name: 'Season Pass', isRecurring: true, recurringFrequency: 'yearly', isEssential: false, category: ExpenseCategory.ENTERTAINMENT });
    expect(isSubscription(yearly)).toBe(false);
  });

  it('is a bill outside Entertainment/Other with no name match', () => {
    const rent = mk({ date: 'd', amount: 1200, name: 'Rent', isRecurring: true, recurringFrequency: 'monthly', category: ExpenseCategory.HOUSING });
    expect(isSubscription(rent)).toBe(false);
  });

  it('treats an absent cadence as monthly, matching monthlyAmount elsewhere', () => {
    const noFreq = mk({ date: 'd', amount: 12, name: 'Streaming Bundle', isRecurring: true, isEssential: false, category: ExpenseCategory.ENTERTAINMENT });
    expect(noFreq.recurringFrequency).toBeUndefined();
    expect(isSubscription(noFreq)).toBe(true);
  });
});

describe('recurringIcon', () => {
  it('resolves by name before falling back to category', () => {
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Netflix', category: ExpenseCategory.OTHER }))).toBe('smart_display');
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Spotify', category: ExpenseCategory.OTHER }))).toBe('music_note');
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Planet Fitness', category: ExpenseCategory.OTHER }))).toBe('fitness_center');
  });

  it('falls back to the category glyph when no name matches', () => {
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Something', category: ExpenseCategory.HOUSING }))).toBe('home');
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Something', category: ExpenseCategory.TRANSPORT }))).toBe('directions_bus');
    expect(recurringIcon(mk({ date: 'd', amount: 1, name: 'Something', category: ExpenseCategory.ENTERTAINMENT }))).toBe('movie');
  });
});

describe('recurringSublabel', () => {
  it('reads "Monthly · <category>" for monthly items, without restating the amount', () => {
    const e = mk({ date: 'd', amount: 1200, name: 'Rent', isRecurring: true, recurringFrequency: 'monthly', category: ExpenseCategory.HOUSING });
    expect(recurringSublabel(e)).toBe('Monthly · Housing');
  });

  it('reads native frequency and native amount for a non-monthly item', () => {
    const e = mk({ date: 'd', amount: 95.20, name: 'Cleaning', isRecurring: true, recurringFrequency: 'weekly', category: ExpenseCategory.FOOD });
    expect(recurringSublabel(e)).toBe('Weekly · €95.20 · Food');
  });

  it('treats an absent cadence as monthly', () => {
    const e = mk({ date: 'd', amount: 50, name: 'Thing', isRecurring: true, category: ExpenseCategory.OTHER });
    expect(recurringSublabel(e)).toBe('Monthly · Other');
  });
});

describe('recurringBills / subscriptionExpenses / monthlyTotal', () => {
  it('partitions recurring rows into bills and subscriptions and excludes one-off rows entirely', () => {
    const rows = [
      mk({ date: 'd', amount: 1200, name: 'Rent', isRecurring: true, recurringFrequency: 'monthly', category: ExpenseCategory.HOUSING }),
      mk({ date: 'd', amount: 15, name: 'Netflix', isRecurring: true, recurringFrequency: 'monthly', category: ExpenseCategory.ENTERTAINMENT }),
      mk({ date: 'd', amount: 30, name: 'Lunch', isRecurring: false, category: ExpenseCategory.FOOD }),
    ];
    expect(recurringBills(rows).map(e => e.name)).toEqual(['Rent']);
    expect(subscriptionExpenses(rows).map(e => e.name)).toEqual(['Netflix']);
  });

  it('sums monthly-equivalent totals across mixed cadences', () => {
    const rows = [
      mk({ date: 'd', amount: 1200, name: 'Rent', isRecurring: true, recurringFrequency: 'monthly', category: ExpenseCategory.HOUSING }),
      mk({ date: 'd', amount: 600, name: 'Insurance', isRecurring: true, recurringFrequency: 'yearly', isEssential: true, category: ExpenseCategory.OTHER }),
    ];
    expect(monthlyTotal(recurringBills(rows))).toBeCloseTo(1250);
  });
});

describe('monthSpend', () => {
  const NOW = new Date(2026, 8, 15, 12); // 2026-09-15

  it('counts one-offs dated this month and ignores neighbouring months', () => {
    const rows = [
      mk({ date: '2026-09-01', amount: 100 }),
      mk({ date: '2026-09-30', amount: 50 }),
      mk({ date: '2026-08-31', amount: 500 }),
      mk({ date: '2026-10-01', amount: 700 }),
    ];
    expect(monthSpend(rows, NOW)).toBe(150);
  });

  it('adds every recurring row at its monthly equivalent, whatever its date', () => {
    const rows = [
      mk({ date: '2026-09-10', amount: 100 }),
      mk({ date: '2025-01-01', amount: 1100, isRecurring: true, recurringFrequency: 'monthly' }),
      mk({ date: '2026-03-01', amount: 120, isRecurring: true, recurringFrequency: 'yearly' }),
    ];
    expect(monthSpend(rows, NOW)).toBe(1210);
  });

  it('is zero for no expenses', () => {
    expect(monthSpend([], NOW)).toBe(0);
  });
});
