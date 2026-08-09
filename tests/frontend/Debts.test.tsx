import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Debts } from '../../components/Debts';
import { Loan, NetWorthState, Expense, ExpenseCategory, EmergencyFundState } from '../../types';

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
    // Balance is no longer an input — it comes out of the schedule.
    fireEvent.change(screen.getByPlaceholderText('e.g. Car Loan'), { target: { value: 'Car Loan' } });
    fireEvent.change(screen.getByLabelText(/annual rate/i), { target: { value: '4.9' } });
    fireEvent.change(screen.getByLabelText(/monthly installment/i), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText(/total installments/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/installments paid/i), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Add Loan'));
    expect(setLoans).toHaveBeenCalledTimes(1);
    expect(setLoans.mock.calls[0][0][0]).toMatchObject({
      name: 'Car Loan', interestRate: 4.9, monthlyPayment: 250,
      termMonths: 36, installmentsPaid: 0,
    });
    // 36 × €250 at 4.9% discounts to roughly €8.3k of principal.
    expect(setLoans.mock.calls[0][0][0].balance).toBeCloseTo(8352, -2);
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

describe('Payoff simulator with an emergency fund reserved', () => {
  // The fund is a carve-out of accumulatedSavings, so cash the simulator may
  // spend is €38,000 − €3,000 = €35,000.
  const fund: EmergencyFundState = { currentAmount: 3000, targetAmount: 10000 };

  const setup = () => {
    render(
      <Debts
        loans={loans} setLoans={() => {}} netWorthData={nw}
        expenses={essentials} emergencyFund={fund}
      />
    );
    fireEvent.change(screen.getByTestId('payoff-loan-select'), { target: { value: 'l1' } });
  };

  it('shows liquid cash net of the fund, and says how much is reserved', () => {
    setup();
    expect(document.body.textContent).toContain('Liquid cash: €35,000');
    expect(document.body.textContent).toContain('€3,000 reserved for the emergency fund');
  });

  it('warns on a payoff that is safe only if the fund is spent', () => {
    setup();
    // €33,000 clears the buffer against the full €38,000 (see above) but not
    // against the €35,000 that is actually free: €2,000 < €2,245 essentials.
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '33000' } });
    expect(screen.getByText(/Leaves less than one month of essentials/)).toBeTruthy();
    expect(document.body.textContent).toContain('€32,755'); // max safe payoff, fund reserved
  });

  it('leaves the fund untouched in the cash-after figure', () => {
    setup();
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '30000' } });
    expect(screen.queryByText(/Leaves less than one month/)).toBeNull();
    expect(document.body.textContent).toContain('€5,000'); // 35,000 − 30,000
  });

  it('reserves nothing when the fund is empty', () => {
    render(
      <Debts
        loans={loans} setLoans={() => {}} netWorthData={nw}
        expenses={essentials} emergencyFund={{ currentAmount: 0, targetAmount: 0 }}
      />
    );
    expect(document.body.textContent).toContain('Liquid cash: €38,000');
    expect(document.body.textContent).not.toContain('reserved for the emergency fund');
  });

  it('floors liquid cash at zero when the fund exceeds tracked cash', () => {
    render(
      <Debts
        loans={loans} setLoans={() => {}} netWorthData={{ accumulatedSavings: 1000 } as NetWorthState}
        expenses={essentials} emergencyFund={{ currentAmount: 4000, targetAmount: 10000 }}
      />
    );
    expect(document.body.textContent).toContain('Liquid cash: €0');
  });
});

describe('Adding a loan from its schedule', () => {
  // "I want the loan to be calculated just with interest, timespan and monthly
  // contribution without the balance as well. Right now I am unable to add loan."
  // Both halves were the same defect: balance was mandatory, and every failed
  // validation was a bare `return` with no message.
  const Harness = () => {
    const [loans, setLoans] = React.useState<Loan[]>([]);
    return (
      <Debts
        loans={loans}
        setLoans={setLoans}
        netWorthData={{ accumulatedSavings: 5000 } as NetWorthState}
        expenses={[]}
      />
    );
  };

  const fill = async (user: ReturnType<typeof userEvent.setup>, vals: Record<string, string>) => {
    for (const [label, value] of Object.entries(vals)) {
      const field = screen.getByLabelText(new RegExp(label, 'i'));
      await user.clear(field);
      await user.type(field, value);
    }
  };

  it('adds a loan with no balance entered, deriving it from the schedule', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText(/car loan/i), 'Car Loan');
    await fill(user, {
      'annual rate': '5',
      'monthly installment': '188.71',
      'total installments': '60',
      'installments paid': '0',
    });
    await user.click(screen.getByRole('button', { name: /add loan/i }));

    // €10,000 principal, derived — never typed.
    const row = await screen.findByTestId('loan-row');
    expect(row).toHaveTextContent('Car Loan');
    expect(row.textContent).toMatch(/10,0\d\d/);
  });

  it('shows the outstanding balance falling as installments are recorded', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fill(user, {
      'annual rate': '5',
      'monthly installment': '188.71',
      'total installments': '60',
      'installments paid': '30',
    });

    // Roughly half repaid: well under the €10,000 original.
    const preview = screen.getByText(/outstanding balance/i).closest('div')!;
    expect(preview.textContent).toMatch(/€5,\d\d\d/);
  });

  it('explains itself instead of doing nothing when a field is missing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /add loan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);

    await user.type(screen.getByPlaceholderText(/car loan/i), 'Car Loan');
    await user.click(screen.getByRole('button', { name: /add loan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/interest rate/i);
  });

  it('rejects paying more installments than the loan has', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText(/car loan/i), 'Car Loan');
    await fill(user, {
      'annual rate': '5',
      'monthly installment': '200',
      'total installments': '12',
      'installments paid': '20',
    });
    await user.click(screen.getByRole('button', { name: /add loan/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/between 0 and 12/i);
    expect(screen.queryByTestId('loan-row')).not.toBeInTheDocument();
  });
});
