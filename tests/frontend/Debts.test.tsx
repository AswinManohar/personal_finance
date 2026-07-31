import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Debts } from '../../components/Debts';
import { Loan, NetWorthState, Expense, ExpenseCategory } from '../../types';

const loans: Loan[] = [
  { id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 },
  { id: 'l2', name: 'Dispo', balance: 1200, interestRate: 11, monthlyPayment: 50 },
];

const nw = { accumulatedSavings: 38000 } as NetWorthState;

describe('Debts tab', () => {
  it('orders loans by interest rate (avalanche) and marks the top one', () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} />);
    const rows = screen.getAllByTestId('loan-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Dispo');
    // Written in sentence case and uppercased by CSS, so screen readers get
    // "Pay First" rather than a spelled-out acronym.
    expect(rows[0].textContent).toContain('Pay First');
    expect(rows[1].textContent).toContain('Sparkasse Loan');
  });

  it('shows per-loan monthly interest and totals', () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} />);
    expect(document.body.textContent).toContain('€225'); // 36k @ 7.5%
    expect(document.body.textContent).toContain('€11');  // 1.2k @ 11%
    expect(document.body.textContent).toContain('€37,200'); // total balance
  });

  it('adds a loan through the form', () => {
    const setLoans = vi.fn();
    render(<Debts loans={[]} setLoans={setLoans} netWorthData={nw} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Car Loan'), { target: { value: 'Car Loan' } });
    fireEvent.change(screen.getByPlaceholderText('Remaining balance'), { target: { value: '8000' } });
    fireEvent.change(screen.getByPlaceholderText('Annual rate %'), { target: { value: '4.9' } });
    fireEvent.change(screen.getByPlaceholderText('Monthly payment'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Add Loan'));
    expect(setLoans).toHaveBeenCalledTimes(1);
    expect(setLoans.mock.calls[0][0][0]).toMatchObject({ name: 'Car Loan', balance: 8000, interestRate: 4.9, monthlyPayment: 250 });
  });

  it('shows an empty state with no loans', () => {
    render(<Debts loans={[]} setLoans={() => {}} netWorthData={nw} />);
    expect(screen.getByText(/No loans tracked yet/)).toBeTruthy();
  });
});

const essentials: Expense[] = [
  { id: 'e1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: 'e2', name: 'Home loans', amount: 745, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
];

describe('Payoff simulator', () => {
  const setup = () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} expenses={essentials} />);
    fireEvent.change(screen.getByTestId('payoff-loan-select'), { target: { value: 'l1' } });
  };

  it('warns when a payoff would leave less than one month of essentials', () => {
    setup();
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '36000' } });
    // €38,000 − €36,000 = €2,000 < €2,245 essentials
    expect(screen.getByText(/Leaves less than one month of essentials/)).toBeTruthy();
    expect(document.body.textContent).toContain('€35,755'); // max safe payoff
  });

  it('shows savings and new runway for a buffer-safe payoff', () => {
    setup();
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '33000' } });
    expect(screen.queryByText(/Leaves less than one month/)).toBeNull();
    expect(document.body.textContent).toContain('€206');    // interest saved / month
    expect(document.body.textContent).toContain('€5,000');  // cash after payoff
    expect(document.body.textContent).toContain('2.2 months'); // new runway
  });
});
