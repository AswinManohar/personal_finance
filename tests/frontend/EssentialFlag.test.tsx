import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Expenses } from '../../components/Expenses';
import { Expense, ExpenseCategory } from '../../types';

const baseIncome = { salaryMe: 0, salaryPartner: 0 };

const renderForm = (setExpenses = vi.fn()) => {
  render(
    <Expenses expenses={[]} setExpenses={setExpenses} income={baseIncome} setIncome={() => {}} />
  );
  return setExpenses;
};

// The first "0.00" input in the DOM is the Log Expense amount field
// (the salary inputs share the placeholder but render later).
const amountInput = () => screen.getAllByPlaceholderText('0.00')[0];

describe('Essential expense flag', () => {
  it('adds an expense with isEssential=true when the toggle is on', () => {
    const setExpenses = renderForm();
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly Groceries'), { target: { value: 'Rent' } });
    fireEvent.click(screen.getByText('Non-essential'));
    expect(screen.getByText('Essential')).toBeTruthy();
    fireEvent.click(screen.getByText('Add Expense'));
    expect(setExpenses).toHaveBeenCalledTimes(1);
    const added = setExpenses.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: 'Rent', amount: 1500, isEssential: true });
  });

  it('defaults to non-essential', () => {
    const setExpenses = renderForm();
    fireEvent.change(amountInput(), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly Groceries'), { target: { value: 'Netflix' } });
    fireEvent.click(screen.getByText('Add Expense'));
    expect(setExpenses.mock.calls[0][0][0].isEssential).toBe(false);
  });
});

describe('Essential badge on recurring rows', () => {
  // The badge used to live only on the Savings Hub's subscriptions card. That
  // card listed every recurring row under a "subscriptions" heading and has
  // been removed; the Expenses cards, which split bills from subscriptions
  // properly, carry the badge now so nothing was lost with it.
  const rows: Expense[] = [
    { id: 'b1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-09-01', isEssential: true, isSubscription: false },
    { id: 'b2', name: 'Lawyer insurance', amount: 32.82, category: ExpenseCategory.OTHER, isRecurring: true, recurringFrequency: 'monthly', date: '2026-09-01', isSubscription: false },
    { id: 's1', name: 'Internet subscription', amount: 49, category: ExpenseCategory.UTILITIES, isRecurring: true, recurringFrequency: 'monthly', date: '2026-09-01', isEssential: true, isSubscription: true },
  ];

  const renderRows = () => {
    render(
      <Expenses expenses={rows} setExpenses={() => {}} income={baseIncome} setIncome={() => {}} />
    );
    // Scoped to the recurring cards: every row's name also appears in Recent.
    return (name: string) =>
      screen.getAllByTestId('recurring-row').find(r => r.textContent?.includes(name));
  };

  it('marks an essential bill', () => {
    const row = renderRows();
    expect(row('Rent')?.textContent).toContain('Essential');
  });

  it('marks an essential subscription', () => {
    const row = renderRows();
    expect(row('Internet subscription')?.textContent).toContain('Essential');
  });

  it('leaves a non-essential row unbadged', () => {
    const row = renderRows();
    expect(row('Lawyer insurance')).toBeTruthy();
    expect(row('Lawyer insurance')?.textContent).not.toContain('Essential');
  });
});
