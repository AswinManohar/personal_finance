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
    expect(card().getByText('€300')).toBeInTheDocument();
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
