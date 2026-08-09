import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NetWorth } from '../../components/NetWorth';
import { NetWorthState, Stock } from '../../types';

const base: NetWorthState = {
  goldInvestment: 0, otherAssets: 0, remainingLoan: 0,
  monthlyRecurringSavings: 0, accumulatedSavings: 0,
};

const renderNetWorth = (over: Partial<NetWorthState> = {}, stocks: Stock[] = []) =>
  render(
    <NetWorth
      netWorthData={{ ...base, ...over }} setNetWorthData={() => {}}
      stocks={stocks} portfolio={[]}
      history={[]} setHistory={() => {}} loans={[]}
    />
  );

describe('Net worth asset side', () => {
  it('takes cash from accumulatedSavings', () => {
    renderNetWorth({ accumulatedSavings: 12000 });
    expect(document.body.textContent).toContain('12,000');
  });

  it('sums every tracked asset line', () => {
    renderNetWorth(
      { accumulatedSavings: 12000, goldInvestment: 5000, otherAssets: 2000 },
      [{ id: 's', symbol: 'X', quantity: 10, buyPrice: 100, currentPrice: 830, frequency: 'One-time' }]
    );
    // 12,000 + 5,000 + 2,000 + 8,300
    expect(document.body.textContent).toContain('27,300');
  });

  it('renders no NaN when the cloud hands back a partial netWorthData', () => {
    render(
      <NetWorth
        netWorthData={{ accumulatedSavings: 500 } as NetWorthState} setNetWorthData={() => {}}
        stocks={[]} portfolio={[]}
        history={[]} setHistory={() => {}} loans={[]}
      />
    );
    expect(document.body.textContent).not.toContain('NaN');
  });
});
