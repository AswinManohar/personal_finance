import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Expenses } from '../../components/Expenses';

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
