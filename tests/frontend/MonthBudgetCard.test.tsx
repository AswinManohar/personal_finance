import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { EmergencyFundState, Expense, ExpenseCategory, IncomeState, NetWorthState } from '../../types';
import { localYmd } from '../../utils/expenseDate';

/**
 * The "This Month" card at the top of the Savings Hub: this month's income
 * split into spent, moved to the emergency fund, and left.
 *
 * Rendered through SavingsDashboard so the prop plumbing is exercised too.
 * Every euro figure is scoped to the card, because €300 or €0 appear on
 * other cards of the hub as well.
 */

// The clock is pinned to 15 September 2026; fixtures are built from local
// calendar parts so the test does not care which zone it runs in.
const NOW = new Date(2026, 8, 15, 12, 0, 0);
const thisMonth = (day: number) => localYmd(new Date(2026, 8, day));
const lastMonth = (day: number) => localYmd(new Date(2026, 7, day));

const expense = (over: Partial<Expense> & { date: string; amount: number }): Expense => ({
  id: over.date + ':' + over.amount, name: 'thing', category: ExpenseCategory.FOOD,
  isRecurring: false, ...over,
});

const renderHub = (over: {
  income?: IncomeState;
  expenses?: Expense[];
  emergencyFund?: EmergencyFundState;
} = {}) => {
  const setEmergencyFund = vi.fn();
  const onSync = vi.fn(async () => {});
  const onNavigate = vi.fn();
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={{ accumulatedSavings: 5000 } as NetWorthState}
      setNetWorthData={() => {}}
      onSync={onSync}
      income={over.income}
      expenses={over.expenses ?? []}
      emergencyFund={over.emergencyFund}
      setEmergencyFund={setEmergencyFund}
      onNavigate={onNavigate}
    />
  );
  const card = () => within(screen.getByTestId('month-budget-card'));
  return { card, setEmergencyFund, onSync, onNavigate };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('This Month card', () => {
  it('splits income into spent, moved to the fund, and left', () => {
    const { card } = renderHub({
      income: { salaryMe: 2000, salaryPartner: 1000 },
      expenses: [
        expense({ date: thisMonth(3), amount: 100 }),
        expense({ date: lastMonth(28), amount: 500 }),
        expense({ date: localYmd(new Date(2025, 0, 1)), amount: 1100, isRecurring: true, recurringFrequency: 'monthly' }),
      ],
      emergencyFund: {
        targetAmount: 6000, currentAmount: 2500,
        contributions: [
          { id: 'c1', date: thisMonth(2), amount: 300 },
          { id: 'c0', date: lastMonth(30), amount: 200 },
        ],
      },
    });
    expect(card().getByText('€1,200')).toBeInTheDocument();
    // The contribution list shows €300 too, so read the To fund column itself.
    expect(card().getByText('To fund').parentElement?.textContent).toContain('€300');
    expect(card().getByText('€1,500')).toBeInTheDocument();
    expect(card().queryByText('€500')).not.toBeInTheDocument();
    expect(card().queryByText('€200')).not.toBeInTheDocument();
  });

  it('says how far over income the month is, in the negative tone', () => {
    const { card } = renderHub({
      income: { salaryMe: 1000, salaryPartner: 0 },
      expenses: [
        expense({ date: thisMonth(3), amount: 900 }),
        expense({ date: thisMonth(1), amount: 300, isRecurring: true, recurringFrequency: 'monthly' }),
      ],
    });
    const over = card().getByText('Over by €200');
    expect(over).toBeInTheDocument();
    expect(over.className).toContain('text-negative');
  });

  it('asks for a monthly income when there is none, and hands off to Expenses', () => {
    const { card, onNavigate } = renderHub({ expenses: [expense({ date: thisMonth(3), amount: 100 })] });
    expect(card().getByText(/set your monthly income/i)).toBeInTheDocument();
    fireEvent.click(card().getByRole('button', { name: /set income/i }));
    expect(onNavigate).toHaveBeenCalledWith('expenses');
    expect(screen.getByTestId('month-budget-card').textContent).not.toContain('NaN');
  });

  it('renders a legacy fund with no contribution log as nothing moved to the fund', () => {
    const { card } = renderHub({
      income: { salaryMe: 3000, salaryPartner: 0 },
      emergencyFund: { targetAmount: 6735, currentAmount: 2192 },
    });
    // "Spent" is €0 too, so read the figure from the To fund column itself.
    expect(card().getByText('To fund').parentElement?.textContent).toContain('€0');
    expect(card().getByText('€3,000')).toBeInTheDocument();
    expect(screen.getByTestId('month-budget-card').textContent).not.toContain('NaN');
  });
});

describe('Add to fund', () => {
  const fund: EmergencyFundState = { targetAmount: 6735, currentAmount: 2192, contributions: [] };
  const income = { salaryMe: 3000, salaryPartner: 0 };

  it('logs a dated contribution, raises the fund, and syncs it', () => {
    const { card, setEmergencyFund, onSync } = renderHub({ income, emergencyFund: fund });
    const input = card().getByLabelText('Add to fund');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.click(card().getByRole('button', { name: /^add$/i }));

    expect(setEmergencyFund).toHaveBeenCalledTimes(1);
    const written = setEmergencyFund.mock.calls[0][0];
    expect(written).toMatchObject({ targetAmount: 6735, currentAmount: 2442 });
    expect(written.contributions).toHaveLength(1);
    expect(written.contributions[0]).toMatchObject({ date: thisMonth(15), amount: 250 });
    expect(typeof written.contributions[0].id).toBe('string');
    expect(onSync).toHaveBeenCalledWith({ emergencyFund: written });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('refuses an empty or non-positive amount and writes nothing', () => {
    const { card, setEmergencyFund, onSync } = renderHub({ income, emergencyFund: fund });
    fireEvent.click(card().getByRole('button', { name: /^add$/i }));
    expect(card().getByRole('alert').textContent).toMatch(/greater than zero/i);
    fireEvent.change(card().getByLabelText('Add to fund'), { target: { value: '-5' } });
    fireEvent.click(card().getByRole('button', { name: /^add$/i }));
    expect(setEmergencyFund).not.toHaveBeenCalled();
    expect(onSync).not.toHaveBeenCalled();
  });

  it('lists only this month\'s contributions, newest first', () => {
    const { card } = renderHub({
      income,
      emergencyFund: {
        ...fund,
        contributions: [
          { id: 'a', date: thisMonth(3), amount: 300 },
          { id: 'b', date: thisMonth(10), amount: 100 },
          { id: 'z', date: lastMonth(20), amount: 999 },
        ],
      },
    });
    const rows = card().getAllByRole('button', { name: /remove contribution/i });
    expect(rows.map(r => r.getAttribute('aria-label'))).toEqual([
      'Remove contribution of €100',
      'Remove contribution of €300',
    ]);
  });

  it('removes an entry and takes its amount back out of the fund', () => {
    const { card, setEmergencyFund, onSync } = renderHub({
      income,
      emergencyFund: {
        ...fund, currentAmount: 350,
        contributions: [
          { id: 'a', date: thisMonth(3), amount: 300 },
          { id: 'b', date: thisMonth(10), amount: 50 },
        ],
      },
    });
    fireEvent.click(card().getByRole('button', { name: 'Remove contribution of €300' }));
    const written = setEmergencyFund.mock.calls[0][0];
    expect(written).toEqual({
      targetAmount: 6735, currentAmount: 50,
      contributions: [{ id: 'b', date: thisMonth(10), amount: 50 }],
    });
    expect(onSync).toHaveBeenCalledWith({ emergencyFund: written });
  });

  it('never drives the fund below zero on removal', () => {
    // The current amount was edited by hand below the logged contribution.
    const { card, setEmergencyFund } = renderHub({
      income,
      emergencyFund: { ...fund, currentAmount: 100, contributions: [{ id: 'a', date: thisMonth(3), amount: 300 }] },
    });
    fireEvent.click(card().getByRole('button', { name: 'Remove contribution of €300' }));
    expect(setEmergencyFund.mock.calls[0][0].currentAmount).toBe(0);
  });
});
