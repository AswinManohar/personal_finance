import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { NetWorthState, PortfolioAsset, Stock } from '../../types';

const noopSync = async () => {};

const renderHub = (netWorth: Partial<NetWorthState>, portfolio: any[] = [], stocks: any[] = []) =>
  render(
    <SavingsDashboard
      portfolio={portfolio as PortfolioAsset[]}
      stocks={stocks as Stock[]}
      netWorthData={netWorth as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
    />
  );

describe('Savings hub — Total Tracked Assets', () => {
  it('never renders NaN when netWorth fields are missing (the reported bug)', () => {
    // Partial state: goldInvestment / otherAssets / monthlyRecurringSavings undefined
    renderHub({ accumulatedSavings: 300 } as any);
    expect(document.body.textContent).not.toContain('NaN');
    // Only the defined field counts -> €300
    expect(screen.getAllByText('€300').length).toBeGreaterThanOrEqual(1);
  });

  it('sums all asset sources correctly', () => {
    const netWorth: NetWorthState = {
      goldInvestment: 200,
      otherAssets: 50,
      remainingLoan: 0,
      monthlyRecurringSavings: 100,
      accumulatedSavings: 300,
    };
    const portfolio = [{ currentValue: 1000 }];
    const stocks = [{ quantity: 2, buyPrice: 50 }]; // 2 * 50 = 100
    renderHub(netWorth, portfolio, stocks);
    // 1000 + 100 + 200 + 300 + 50 = 1650
    expect(screen.getAllByText('€1,650').length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('tolerates malformed rows (missing price/qty) without NaN', () => {
    renderHub(
      { goldInvestment: 0, otherAssets: 0, accumulatedSavings: 0, monthlyRecurringSavings: 0 } as any,
      [{ currentValue: undefined }],
      [{ quantity: undefined, buyPrice: undefined }]
    );
    expect(document.body.textContent).not.toContain('NaN');
    expect(screen.getAllByText('€0').length).toBeGreaterThanOrEqual(1);
  });
});
