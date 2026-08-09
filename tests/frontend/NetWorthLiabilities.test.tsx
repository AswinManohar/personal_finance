import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetWorth } from '../../components/NetWorth';
import { Loan, NetWorthState } from '../../types';

const nw: NetWorthState = { goldInvestment: 0, otherAssets: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 0 };
const loans: Loan[] = [{ id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 }];

const renderNetWorth = (loanList: Loan[] = loans) =>
  render(
    <NetWorth
      netWorthData={nw} setNetWorthData={() => {}}
      currentSavings={1000} stocks={[]} portfolio={[]}
      history={[]} setHistory={() => {}}
      loans={loanList}
    />
  );

describe('Net worth liabilities from loans', () => {
  it('uses the sum of tracked loans as total liabilities', () => {
    renderNetWorth();
    expect(document.body.textContent).toContain('36,000');
    // assets €1,000 − liabilities €36,000 → negative
    expect(screen.getByText('Liabilities exceed assets')).toBeTruthy();
  });

  it('falls back to remainingLoan when no loans are tracked', () => {
    render(
      <NetWorth
        netWorthData={{ ...nw, remainingLoan: 500 }} setNetWorthData={() => {}}
        currentSavings={1000} stocks={[]} portfolio={[]}
        history={[]} setHistory={() => {}}
        loans={[]}
      />
    );
    expect(screen.getByText('Assets exceed liabilities')).toBeTruthy();
  });
});
