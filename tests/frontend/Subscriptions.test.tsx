import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { Expense, ExpenseCategory, NetWorthState } from '../../types';

const noopSync = async () => {};

const expenses: Expense[] = [
  { id: '1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: '2', name: 'Netflix', amount: 15, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01' },
  { id: '3', name: 'Spotify', amount: 10, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01' },
  { id: '4', name: 'Gym', amount: 10, category: ExpenseCategory.OTHER, isRecurring: true, recurringFrequency: 'weekly', date: '2026-07-01' },
  { id: '5', name: 'Laptop', amount: 900, category: ExpenseCategory.OTHER, isRecurring: false, date: '2026-07-01' },
];

const renderHub = (exp: Expense[] = expenses) =>
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={{ accumulatedSavings: 0, monthlyRecurringSavings: 0 } as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
      expenses={exp}
    />
  );

describe('Active subscriptions card', () => {
  it('lists only recurring expenses, sorted by monthly cost descending', () => {
    renderHub();
    const rows = screen.getAllByTestId('subscription-row');
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('Rent');   // €1,500/mo
    expect(rows[1].textContent).toContain('Gym');    // €10/week ≈ €43/mo > Netflix €15
    expect(screen.queryByText('Laptop')).toBeNull(); // one-time excluded
  });

  it('normalizes non-monthly frequencies to a monthly figure', () => {
    renderHub();
    // Gym: €10 weekly × 52/12 ≈ €43
    expect(document.body.textContent).toContain('€43');
  });

  it('shows the monthly total across all subscriptions', () => {
    renderHub();
    // 1500 + 43.33 + 15 + 10 = 1568.33 → €1,568
    expect(document.body.textContent).toContain('€1,568');
    expect(document.body.textContent).toContain('4 active');
  });

  it('marks essential subscriptions with a badge', () => {
    renderHub();
    const rows = screen.getAllByTestId('subscription-row');
    expect(rows[0].textContent).toContain('Essential');     // Rent
    expect(rows[2].textContent).not.toContain('Essential'); // Netflix
  });

  it('shows an empty state when there are no recurring expenses', () => {
    renderHub([]);
    expect(screen.getByText(/No active subscriptions/)).toBeTruthy();
  });
});
