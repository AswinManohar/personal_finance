import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Expenses } from '../../components/Expenses';
import { Expense, ExpenseCategory, IncomeState } from '../../types';
import { localYmd } from '../../utils/expenseDate';

const { importedExpense, report } = vi.hoisted(() => {
  // 'Food' rather than ExpenseCategory.FOOD: vi.hoisted runs before this
  // file's own imports are evaluated, so referencing the imported enum here
  // would throw. The enum's value for FOOD is the literal string 'Food'.
  const importedExpense = {
    id: 'e-imported', name: 'Lieferando', amount: 28.9, category: 'Food',
    isRecurring: false, date: '2026-06-05',
  };
  const tx = { date: '2026-06-05', description: 'Lieferando', amount: 28.9,
               category: 'Food', direction: 'debit' as const };
  const report = {
    transactions: [tx],
    flags: [],
    crosscheck: { missing_in_app: [tx], missing_on_statement: [], amount_mismatch: [] },
    redaction_preview: { masked_counts: {} },
    totals: { statement_spend: 28.9, flagged_spend: 0, coverage_pct: 0 },
  };
  return { importedExpense, report };
});

// Only the "Statement import" describe block below drives StatementReview;
// other tests in this file don't touch it, so mocking the service here is
// harmless for them.
vi.mock('../../services/statementReview', () => ({
  reviewStatement: vi.fn().mockResolvedValue(report),
  importTransaction: vi.fn().mockResolvedValue(importedExpense),
}));

// YYYY-MM-DD for `n` days ago. Uses the local calendar, not toISOString():
// the latter yields the UTC date, so east of Greenwich this helper disagreed
// with the component it was testing for the first two hours of every day.
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localYmd(d);
};

/** Controlled harness mirroring how App.tsx owns expense + income state. */
function Harness({ initial = [], initialIncome = { salaryMe: 0, salaryPartner: 0 }, onSync }:
  { initial?: Expense[]; initialIncome?: IncomeState; onSync?: (overrides?: any) => Promise<void> }) {
  const [expenses, setExpenses] = useState<Expense[]>(initial);
  const [income, setIncome] = useState<IncomeState>(initialIncome);
  // Mirrors App.tsx's tombstone log, which undo has to be able to walk back.
  const [tombstones, setTombstones] = useState<string[]>([]);
  return (
    <Expenses
      expenses={expenses} setExpenses={setExpenses}
      income={income} setIncome={setIncome} onSync={onSync}
      onExpenseDeleted={id => {
        const next = tombstones.includes(id) ? tombstones : [...tombstones, id];
        setTombstones(next);
        return next;
      }}
      onExpenseRestored={id => {
        const next = tombstones.filter(t => t !== id);
        setTombstones(next);
        return next;
      }}
    />
  );
}

const totalSpentText = () =>
  screen.getByText('One-off spend').parentElement?.textContent ?? '';

describe('Expense logging', () => {
  it('logs a new expense and shows it in Recent + the period total', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();

    await user.type(screen.getAllByPlaceholderText('0.00')[0], '30'); // amount (first 0.00 input)
    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), 'Coffee');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    // Visible in Recent list
    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('-€30.00')).toBeInTheDocument();
    // Counted in the total (defaults to "today", inside the 30d window)
    expect(totalSpentText()).toContain('€30');
  });

  it('rejects invalid input (no description, or non-positive amount)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // amount only, no name -> ignored
    await user.type(screen.getAllByPlaceholderText('0.00')[0], '50');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();

    // name + zero amount -> ignored
    await user.clear(screen.getAllByPlaceholderText('0.00')[0]);
    await user.type(screen.getAllByPlaceholderText('0.00')[0], '0');
    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), 'Free sample');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });
});

describe('Monthly visibility (time filtering)', () => {
  const data: Expense[] = [
    { id: '1', name: 'This month', amount: 100, category: ExpenseCategory.FOOD, isRecurring: false, date: daysAgo(10) },
    { id: '2', name: 'Old', amount: 500, category: ExpenseCategory.FOOD, isRecurring: false, date: daysAgo(45) },
  ];

  // How many rows the chip period holds, read from the category drill-down —
  // the surface that actually reports it. These assertions used to read the
  // "This week so far" caption, which was the bug: that line is about the
  // current calendar week and must not move when the chip does.
  const openFoodDrilldown = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /^Food, €.* — show transactions$/ }));

  it('30d view shows only expenses within the last month', async () => {
    const user = userEvent.setup();
    render(<Harness initial={data} />);
    // default timeSpan is 30d -> only the 10-day-old €100 counts
    expect(totalSpentText()).toContain('€100');
    await openFoodDrilldown(user);
    expect(screen.getByText('1 transaction · last 30 days')).toBeInTheDocument();
  });

  it('ALL view includes the whole history', async () => {
    const user = userEvent.setup();
    render(<Harness initial={data} />);
    await user.click(screen.getByRole('button', { name: 'ALL' }));
    expect(totalSpentText()).toContain('€600'); // 100 + 500
    await openFoodDrilldown(user);
    expect(screen.getByText('2 transactions · all time')).toBeInTheDocument();
  });
});

describe('Calculations', () => {
  it('category distribution percentages are correct', () => {
    const data: Expense[] = [
      { id: '1', name: 'Groceries', amount: 80, category: ExpenseCategory.FOOD, isRecurring: false, date: daysAgo(2) },
      { id: '2', name: 'Bus', amount: 20, category: ExpenseCategory.TRANSPORT, isRecurring: false, date: daysAgo(2) },
    ];
    render(<Harness initial={data} />);
    expect(totalSpentText()).toContain('€100');
    expect(screen.getByText('80%')).toBeInTheDocument(); // Food 80/100
    expect(screen.getByText('20%')).toBeInTheDocument(); // Transport 20/100
  });

  it('Recurring Expenses header totals bills at their monthly equivalent', () => {
    const data: Expense[] = [
      { id: '1', name: 'Rent', amount: 1200, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
      { id: '2', name: 'Insurance', amount: 600, category: ExpenseCategory.OTHER, isRecurring: true, recurringFrequency: 'yearly', isEssential: true, date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    // Both are bills: Rent by category, Insurance because it's essential (never a
    // subscription regardless of category) — 1200 + 600/12 = 1250.
    const header = screen.getByText('Recurring Expenses').parentElement;
    expect(header).toHaveTextContent('€1250.00');
    expect(screen.getAllByText('Rent').length).toBeGreaterThan(0); // also appears in Recent
    expect(screen.getByText('Monthly · Housing')).toBeInTheDocument();
    expect(screen.getByText('Yearly · €600.00 · Other')).toBeInTheDocument();
  });

  it('total monthly income sums both salaries', () => {
    render(<Harness initialIncome={{ salaryMe: 5000, salaryPartner: 4000 }} />);
    expect(screen.getByText('€9,000.00')).toBeInTheDocument();
  });
});

// The "Statement import" case that lived here moved to AppNavigation.test.tsx.
// Statement Review is a destination of its own now, so the import crosses a
// screen boundary and can no longer be driven from inside Expenses.

describe('Add validation feedback', () => {
  // The form used to `return` silently when a field was missing: the button did
  // nothing at all, with no message and nothing in the console. On the redesigned
  // card the amount is the hero field and Description sits below it, so entering
  // only an amount is an easy mistake to make — and it looked like a broken app.
  it('explains why nothing was added when the description is missing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getAllByPlaceholderText('0.00')[0], '99.99');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/description/i);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('explains why nothing was added when the amount is missing or zero', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), 'Coffee');
    await user.type(screen.getAllByPlaceholderText('0.00')[0], '0');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/amount/i);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('clears the message once a valid expense is added', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getAllByPlaceholderText('0.00')[0], '12.34');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), 'Coffee');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(await screen.findByText('Coffee')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('This week so far', () => {
  const weekCountText = () =>
    screen.getByText('This week so far').closest('div')?.parentElement?.textContent ?? '';

  it('counts the current week, not the selected chip period', async () => {
    // The bug: this line rendered the chip-filtered list's length. On ALL that
    // is every one-off expense on record — it read "254 transactions" under a
    // label promising the current week, which really held four.
    render(<Harness initial={[
      { id: 'a', name: 'Groceries', amount: 12.54, category: ExpenseCategory.FOOD,
        isRecurring: false, date: localYmd(new Date()) },
      { id: 'b', name: 'Older', amount: 40, category: ExpenseCategory.FOOD,
        isRecurring: false, date: daysAgo(20) },
      { id: 'c', name: 'Older still', amount: 60, category: ExpenseCategory.FOOD,
        isRecurring: false, date: daysAgo(21) },
    ]} />);

    expect(weekCountText()).toContain('1 transaction');
    expect(weekCountText()).not.toContain('3 transaction');
  });

  it('does not change when the chip period changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[
      { id: 'a', name: 'Groceries', amount: 12.54, category: ExpenseCategory.FOOD,
        isRecurring: false, date: localYmd(new Date()) },
      { id: 'b', name: 'Older', amount: 40, category: ExpenseCategory.FOOD,
        isRecurring: false, date: daysAgo(20) },
    ]} />);

    expect(weekCountText()).toContain('1 transaction');
    await user.click(screen.getByRole('button', { name: 'ALL' }));
    expect(weekCountText()).toContain('1 transaction');
  });

  it('excludes recurring commitments, matching the bar above it', () => {
    render(<Harness initial={[
      { id: 'a', name: 'Groceries', amount: 12.54, category: ExpenseCategory.FOOD,
        isRecurring: false, date: localYmd(new Date()) },
      { id: 'r', name: 'House rent', amount: 1500, category: ExpenseCategory.HOUSING,
        isRecurring: true, recurringFrequency: 'monthly', date: localYmd(new Date()) },
    ]} />);

    expect(weekCountText()).toContain('1 transaction');
  });
});

describe('Adding a subscription', () => {
  const cards = () => ({
    recurring: screen.getByText('Recurring Expenses').closest('div')!.parentElement!,
    subscriptions: screen.getByText('Subscriptions').closest('div')!.parentElement!,
  });

  const fillBasics = async (user: ReturnType<typeof userEvent.setup>, name: string, amount: string) => {
    await user.type(screen.getAllByPlaceholderText('0.00')[0], amount);
    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), name);
  };

  it('offers the Bill/Subscription choice only once an expense is recurring', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('button', { name: /^(Bill|Subscription)$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'One-time' }));
    expect(screen.getByRole('button', { name: 'Bill' })).toBeInTheDocument();
  });

  it('files a new subscription under Subscriptions even when nothing about it reads as one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillBasics(user, 'Kleiderei', '29');
    await user.click(screen.getByRole('button', { name: 'One-time' }));   // -> Recurring
    await user.click(screen.getByRole('button', { name: 'Subscription' }));
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    // No name match, category Food, not Entertainment/Other — the old
    // inference would have called this a bill.
    expect(within(cards().subscriptions).getByText('Kleiderei')).toBeInTheDocument();
    expect(within(cards().recurring).queryByText('Kleiderei')).not.toBeInTheDocument();
  });

  it('supports a weekly subscription, which inference alone could never produce', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillBasics(user, 'Veg box', '18');
    await user.click(screen.getByRole('button', { name: 'One-time' }));
    await user.click(screen.getByRole('button', { name: 'Subscription' }));
    await user.selectOptions(screen.getByLabelText('Frequency'), 'weekly');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(within(cards().subscriptions).getByText('Veg box')).toBeInTheDocument();
    expect(screen.getByText('Weekly · €18.00 · Food')).toBeInTheDocument();
  });

  it('keeps a name-matched item out of Subscriptions when marked a Bill', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillBasics(user, 'Internet subscription', '49');
    await user.click(screen.getByRole('button', { name: 'One-time' }));
    await user.click(screen.getByRole('button', { name: 'Add Expense' })); // left as Bill

    expect(within(cards().recurring).getByText('Internet subscription')).toBeInTheDocument();
    expect(within(cards().subscriptions).queryByText('Internet subscription')).not.toBeInTheDocument();
  });

  it('resets the choice to Bill after an add', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillBasics(user, 'Kleiderei', '29');
    await user.click(screen.getByRole('button', { name: 'One-time' }));
    await user.click(screen.getByRole('button', { name: 'Subscription' }));
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    await user.click(screen.getByRole('button', { name: 'One-time' }));
    expect(screen.getByRole('button', { name: 'Bill' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Subscription' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends the flag to the cloud', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSync={onSync} />);

    await fillBasics(user, 'Kleiderei', '29');
    await user.click(screen.getByRole('button', { name: 'One-time' }));
    await user.click(screen.getByRole('button', { name: 'Subscription' }));
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    const pushed = onSync.mock.calls.at(-1)![0].expenses.at(-1);
    expect(pushed.isRecurring).toBe(true);
    expect(pushed.isSubscription).toBe(true);
  });

  it('leaves a one-off expense with no opinion on the matter', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSync={onSync} />);

    await fillBasics(user, 'Coffee', '4');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(onSync.mock.calls.at(-1)![0].expenses.at(-1).isSubscription).toBeUndefined();
  });
});

describe('Recurring Expenses / Subscriptions split', () => {
  it('routes a name-matched subscription to Subscriptions and an ordinary bill to Recurring Expenses', () => {
    const data: Expense[] = [
      { id: 'sub', name: 'Netflix', amount: 15, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
      { id: 'bill', name: 'Rent', amount: 1200, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);

    const recurringCard = screen.getByText('Recurring Expenses').closest('div')!.parentElement!;
    const subscriptionsCard = screen.getByText('Subscriptions').closest('div')!.parentElement!;

    expect(within(recurringCard).getByText('Rent')).toBeInTheDocument();
    expect(within(recurringCard).queryByText('Netflix')).not.toBeInTheDocument();
    expect(within(subscriptionsCard).getByText('Netflix')).toBeInTheDocument();
    expect(within(subscriptionsCard).queryByText('Rent')).not.toBeInTheDocument();
  });

  it('routes a non-essential monthly Entertainment/Other item to Subscriptions by category heuristic alone', () => {
    const data: Expense[] = [
      { id: '1', name: 'Cinema Pass', amount: 12, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', isEssential: false, date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    const subscriptionsCard = screen.getByText('Subscriptions').closest('div')!.parentElement!;
    expect(within(subscriptionsCard).getByText('Cinema Pass')).toBeInTheDocument();
  });

  it('keeps an essential monthly Entertainment item a bill, not a subscription', () => {
    const data: Expense[] = [
      { id: '1', name: 'Cinema Pass', amount: 12, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', isEssential: true, date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    const recurringCard = screen.getByText('Recurring Expenses').closest('div')!.parentElement!;
    expect(within(recurringCard).getByText('Cinema Pass')).toBeInTheDocument();
  });

  it('shows native frequency and native amount alongside the monthly-equivalent figure', () => {
    const data: Expense[] = [
      { id: '1', name: 'Cleaning', amount: 95.20, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'weekly', date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    // Native cadence + native amount in the sublabel...
    expect(screen.getByText('Weekly · €95.20 · Housing')).toBeInTheDocument();
    // ...while the headline figure is the monthly equivalent (95.20 * 52/12).
    // Appears twice with a single row: once as the row amount, once as the
    // card's header total (which, with one item, is the same figure).
    expect(screen.getAllByText('€412.53').length).toBeGreaterThan(0);
  });

  it('Subscriptions footer reports active count and annualised total', () => {
    const data: Expense[] = [
      { id: '1', name: 'Netflix', amount: 15, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
      { id: '2', name: 'Spotify', amount: 10, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    expect(screen.getByText('2 active · €300.00 per year')).toBeInTheDocument();
  });
});

describe('Per-card collapse (Breakdown, Recent)', () => {
  it('collapses Breakdown to a one-line summary and restores it on toggle', async () => {
    const user = userEvent.setup();
    const data: Expense[] = [
      { id: '1', name: 'Groceries', amount: 80, category: ExpenseCategory.FOOD, isRecurring: false, date: daysAgo(2) },
      { id: '2', name: 'Bus', amount: 20, category: ExpenseCategory.TRANSPORT, isRecurring: false, date: daysAgo(2) },
    ];
    render(<Harness initial={data} />);

    expect(screen.getByText('One-off spending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse Breakdown' }));
    expect(screen.getByText('€100 total spent · 2 categories')).toBeInTheDocument();
    expect(screen.queryByText('One-off spending')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand Breakdown' }));
    expect(screen.getByText('One-off spending')).toBeInTheDocument();
  });

  it('collapses Recent while keeping the "N in period" count visible', async () => {
    const user = userEvent.setup();
    const data: Expense[] = [
      { id: '1', name: 'Coffee', amount: 3, category: ExpenseCategory.FOOD, isRecurring: false, date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('1 in period')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse Recent' }));
    expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
    expect(screen.getByText('1 in period')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand Recent' }));
    expect(screen.getByText('Coffee')).toBeInTheDocument();
  });
});

describe('Undo', () => {
  const groceries = (): Expense => ({
    id: 'g1', name: 'Groceries', amount: 12.54, category: ExpenseCategory.FOOD,
    isRecurring: false, date: localYmd(new Date()),
  });

  it('takes back an expense that was just added', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getAllByPlaceholderText('0.00')[0], '30');
    await user.type(screen.getByPlaceholderText('e.g. Weekly Groceries'), 'Coffee');
    await user.click(screen.getByRole('button', { name: 'Add Expense' }));
    expect(screen.getByText('Coffee')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('brings back an expense that was just deleted', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[groceries()]} />);

    await user.click(screen.getByRole('button', { name: 'Delete Groceries' }));
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('lifts the tombstone when a delete is undone, or the next pull re-deletes it', async () => {
    // Deletion is a soft delete: the push sets deleted:true and the upsert
    // writes deleted:false. Restoring the row locally but leaving its id in the
    // tombstone log would have the push skip it forever — the row would come
    // back on screen and stay dead in the cloud.
    const user = userEvent.setup();
    const onSync = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={[groceries()]} onSync={onSync} />);

    await user.click(screen.getByRole('button', { name: 'Delete Groceries' }));
    expect(onSync.mock.calls.at(-1)![0].deletedExpenseIds).toEqual(['g1']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const restored = onSync.mock.calls.at(-1)![0];
    expect(restored.deletedExpenseIds).toEqual([]);
    expect(restored.expenses.map((e: Expense) => e.id)).toContain('g1');
  });

  it('restores a deleted subscription to the Subscriptions card, flag intact', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{
      id: 's1', name: 'Kleiderei', amount: 29, category: ExpenseCategory.FOOD,
      isRecurring: true, recurringFrequency: 'monthly', isSubscription: true,
      date: localYmd(new Date()),
    }]} />);

    const subscriptionsCard = () => screen.getByText('Subscriptions').closest('div')!.parentElement!;
    expect(within(subscriptionsCard()).getByText('Kleiderei')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Delete Kleiderei' })[0]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(within(subscriptionsCard()).getByText('Kleiderei')).toBeInTheDocument();
  });

  it('offers nothing to undo before anything has happened', () => {
    render(<Harness initial={[groceries()]} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('clears the offer once it has been taken', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[groceries()]} />);

    await user.click(screen.getByRole('button', { name: 'Delete Groceries' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('only ever offers the most recent action', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[groceries(), {
      id: 'g2', name: 'MEGA LIMITED', amount: 47.6, category: ExpenseCategory.OTHER,
      isRecurring: false, date: localYmd(new Date()),
    }]} />);

    await user.click(screen.getByRole('button', { name: 'Delete Groceries' }));
    await user.click(screen.getByRole('button', { name: 'Delete MEGA LIMITED' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByText('MEGA LIMITED')).toBeInTheDocument();
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
  });
});
