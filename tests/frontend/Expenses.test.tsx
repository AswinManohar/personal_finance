import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Expenses } from '../../components/Expenses';
import { Expense, ExpenseCategory, IncomeState } from '../../types';

// YYYY-MM-DD for `n` days ago (the form/filter use local date strings).
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

/** Controlled harness mirroring how App.tsx owns expense + income state. */
function Harness({ initial = [], initialIncome = { salaryMe: 0, salaryPartner: 0 } }:
  { initial?: Expense[]; initialIncome?: IncomeState }) {
  const [expenses, setExpenses] = useState<Expense[]>(initial);
  const [income, setIncome] = useState<IncomeState>(initialIncome);
  return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} />;
}

const totalSpentText = () =>
  screen.getByText('Total Spent').parentElement?.textContent ?? '';

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

  it('30d view shows only expenses within the last month', () => {
    render(<Harness initial={data} />);
    // default timeSpan is 30d -> only the 10-day-old €100 counts
    expect(totalSpentText()).toContain('€100');
    expect(screen.getByText('1 transactions')).toBeInTheDocument();
  });

  it('ALL view includes the whole history', async () => {
    const user = userEvent.setup();
    render(<Harness initial={data} />);
    await user.click(screen.getByRole('button', { name: 'ALL' }));
    expect(totalSpentText()).toContain('€600'); // 100 + 500
    expect(screen.getByText('2 transactions')).toBeInTheDocument();
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

  it('recurring "monthly commitment" sums only monthly-cadence items', () => {
    const data: Expense[] = [
      { id: '1', name: 'Rent', amount: 1200, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: daysAgo(1) },
      { id: '2', name: 'Insurance', amount: 600, category: ExpenseCategory.OTHER, isRecurring: true, recurringFrequency: 'yearly', date: daysAgo(1) },
    ];
    render(<Harness initial={data} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
    // Target the commitment box specifically (the rent line item also shows €1200.00).
    const commitment = screen.getByText('Monthly commitment').parentElement;
    expect(commitment).toHaveTextContent('€1200.00'); // yearly 600 excluded (not €1800.00)
  });

  it('total monthly income sums both salaries', () => {
    render(<Harness initialIncome={{ salaryMe: 5000, salaryPartner: 4000 }} />);
    expect(screen.getByText('€9,000.00')).toBeInTheDocument();
  });
});
