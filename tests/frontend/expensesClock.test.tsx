import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Expenses } from '../../components/Expenses';
import { Expense, ExpenseCategory } from '../../types';
import { localYmd } from '../../utils/expenseDate';

vi.mock('../../services/statementReview', () => ({
  reviewStatement: vi.fn(), importTransaction: vi.fn(),
}));

/**
 * The span filter and the week buckets read "now" inside useMemo without
 * depending on it. A phone left on the tab across midnight kept yesterday's
 * window until something else changed. The screen now re-reads the clock when
 * it comes back to the foreground.
 */

function Harness({ initial }: { initial: Expense[] }) {
  const [expenses, setExpenses] = useState<Expense[]>(initial);
  const [income, setIncome] = useState({ salaryMe: 0, salaryPartner: 0 });
  return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} />;
}

afterEach(() => { vi.useRealTimers(); });

describe('the period window follows the clock', () => {
  it('drops an expense out of 30D once the day has moved on and the tab is foregrounded again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    const twentyFiveDaysAgo = localYmd(new Date(2026, 4, 21));
    render(<Harness initial={[{ id: 'e1', name: 'Old coffee', amount: 10, category: ExpenseCategory.FOOD, isRecurring: false, date: twentyFiveDaysAgo }]} />);

    expect(screen.getAllByText('€10.00').length).toBeGreaterThan(0);

    // Ten days pass with the tab open, then the phone comes back to the app.
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(screen.queryByText('€10.00')).not.toBeInTheDocument();
  });
});
