import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { Expense, ExpenseCategory, NetWorthState } from '../../types';

const noopSync = async () => {};

const essentialExpenses: Expense[] = [
  { id: '1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: '2', name: 'Home loans', amount: 745, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: '3', name: 'Streaming', amount: 30, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01' },
];

const renderHub = (expenses: Expense[] = essentialExpenses) =>
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={{ accumulatedSavings: 2192, monthlyRecurringSavings: 2900 } as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
      expenses={expenses}
      emergencyFund={{ targetMonths: 3 }}
      setEmergencyFund={() => {}}
    />
  );

describe('Emergency fund & runway card', () => {
  it('shows runway in weeks and a critical warning when below one month', () => {
    renderHub();
    // €2,192 / €2,245 ≈ 0.98 months → ~4 weeks
    expect(screen.getByText('~4 weeks')).toBeTruthy();
    expect(screen.getByText(/Critical: less than one month/)).toBeTruthy();
  });

  it('computes the target from essential expenses only (3 × €2,245 = €6,735)', () => {
    renderHub();
    expect(document.body.textContent).toContain('€6,735');
  });

  it('projects the funded ETA from the monthly savings target', () => {
    renderHub();
    // ceil((6,735 − 2,192) / 2,900) = 2
    expect(document.body.textContent).toContain('~2 months');
  });

  it('shows guidance instead of NaN when no essentials are marked', () => {
    renderHub([]);
    expect(screen.getByText(/Mark your recurring expenses/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('still renders for legacy callers without the new props', () => {
    render(
      <SavingsDashboard
        portfolio={[]} stocks={[]}
        netWorthData={{ accumulatedSavings: 300 } as NetWorthState}
        setNetWorthData={() => {}} onSync={noopSync}
      />
    );
    expect(document.body.textContent).not.toContain('NaN');
  });
});
