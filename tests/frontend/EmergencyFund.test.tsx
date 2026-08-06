import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { NetWorthState, EmergencyFundState } from '../../types';

const noopSync = async () => {};

const renderHub = (
  emergencyFund: EmergencyFundState = { currentAmount: 2192, targetAmount: 6735 },
  netWorthData: Partial<NetWorthState> = { accumulatedSavings: 5000 }
) =>
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={netWorthData as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
      expenses={[]}
      emergencyFund={emergencyFund}
      setEmergencyFund={() => {}}
    />
  );

describe('Emergency fund card', () => {
  it('renders both amounts as editable fields', () => {
    renderHub();
    const current = screen.getByLabelText('Current emergency fund amount') as HTMLInputElement;
    const target = screen.getByLabelText('Emergency fund target amount') as HTMLInputElement;
    expect(current.value).toBe('2192');
    expect(target.value).toBe('6735');
  });

  it('shows progress toward the manual target (2192 / 6735 = 33%)', () => {
    renderHub();
    expect(document.body.textContent).toContain('€2,192 of €6,735');
    expect(document.body.textContent).toContain('33%');
  });

  it('no longer asks the user to tag essential expenses', () => {
    renderHub();
    expect(document.body.textContent).not.toContain('Essential');
  });

  it('shows an empty state when neither amount is set', () => {
    renderHub({ currentAmount: 0, targetAmount: 0 });
    expect(screen.getByText(/Enter what your emergency fund holds/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('does not divide by zero when only the current amount is set', () => {
    renderHub({ currentAmount: 2192, targetAmount: 0 });
    expect(document.body.textContent).not.toContain('NaN');
    expect(document.body.textContent).toContain('0%');
  });

  it('degrades to zeros on legacy { targetMonths } state without migration code', () => {
    renderHub({ targetMonths: 3 } as unknown as EmergencyFundState);
    expect(screen.getByText(/Enter what your emergency fund holds/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('still renders for legacy callers without the new props', () => {
    render(
      <SavingsDashboard
        portfolio={[]} stocks={[]}
        netWorthData={{ accumulatedSavings: 300 } as NetWorthState}
        setNetWorthData={() => {}} onSync={noopSync}
      />
    );
    expect(document.body.textContent).not.toContain('NaN');
  });
});

describe('Emergency fund as a carve-out of cash', () => {
  it('shows free cash as the remainder of tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    expect(document.body.textContent).toContain('€2,808 free cash outside the fund');
  });

  it('warns and floors free cash at zero when the fund exceeds tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 1000 });
    expect(screen.getByText(/larger than your tracked cash/)).toBeTruthy();
    expect(document.body.textContent).toContain('€1,000');
    expect(document.body.textContent).toContain('€0 free cash outside the fund');
  });

  it('stays quiet when the fund fits inside tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    expect(screen.queryByText(/larger than your tracked cash/)).toBeNull();
  });

  it('does not touch total tracked assets', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    // Cash is the only asset here, so the hero total is the cash figure itself —
    // the fund is a slice of it, never an addition to it.
    expect(document.body.textContent).toContain('€5,000');
    expect(document.body.textContent).not.toContain('€7,192');
  });
});
