import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // The visible label is the accessible name, so these queries pin the
    // WCAG 2.5.3 pairing as well as the values.
    const current = screen.getByLabelText('Current in fund') as HTMLInputElement;
    const target = screen.getByLabelText('Target') as HTMLInputElement;
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
    // The removed copy, not the word "Essential" — that still appears as a pill
    // on essential subscriptions elsewhere on this screen.
    expect(document.body.textContent).not.toContain('Mark your recurring expenses');
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

describe('Editing the two amounts', () => {
  const renderEditable = (
    emergencyFund: EmergencyFundState = { currentAmount: 2192, targetAmount: 6735 }
  ) => {
    const setEmergencyFund = vi.fn();
    const onSync = vi.fn(async () => {});
    render(
      <SavingsDashboard
        portfolio={[]}
        stocks={[]}
        netWorthData={{ accumulatedSavings: 5000 } as NetWorthState}
        setNetWorthData={() => {}}
        onSync={onSync}
        expenses={[]}
        emergencyFund={emergencyFund}
        setEmergencyFund={setEmergencyFund}
      />
    );
    return { setEmergencyFund, onSync };
  };

  it('keeps the target when the current amount is edited', () => {
    const { setEmergencyFund } = renderEditable();
    fireEvent.change(screen.getByLabelText('Current in fund'), { target: { value: '3000' } });
    expect(setEmergencyFund).toHaveBeenCalledWith({ currentAmount: 3000, targetAmount: 6735 });
  });

  it('keeps the current amount when the target is edited', () => {
    const { setEmergencyFund } = renderEditable();
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '9000' } });
    expect(setEmergencyFund).toHaveBeenCalledWith({ currentAmount: 2192, targetAmount: 9000 });
  });

  it('keeps the contribution log when the target is edited', () => {
    const log = [{ id: 'c1', date: '2026-09-02', amount: 200 }];
    const { setEmergencyFund } = renderEditable({ currentAmount: 2192, targetAmount: 6735, contributions: log });
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '9000' } });
    expect(setEmergencyFund).toHaveBeenCalledWith({
      currentAmount: 2192, targetAmount: 9000, contributions: log,
    });
  });

  it('syncs the new object under the emergencyFund key', () => {
    const { onSync } = renderEditable();
    fireEvent.change(screen.getByLabelText('Current in fund'), { target: { value: '3000' } });
    expect(onSync).toHaveBeenCalledWith({
      emergencyFund: { currentAmount: 3000, targetAmount: 6735 },
    });
  });

  it('writes a clean object over legacy { targetMonths } state, carrying nothing forward', () => {
    // The write half of the no-migration claim: editing legacy state must not
    // preserve targetMonths, nor convert it into an amount.
    const { setEmergencyFund, onSync } = renderEditable(
      { targetMonths: 3 } as unknown as EmergencyFundState
    );

    fireEvent.change(screen.getByLabelText('Current in fund'), { target: { value: '1500' } });
    const written = setEmergencyFund.mock.calls[0][0];
    expect(written).toEqual({ currentAmount: 1500, targetAmount: 0 });
    expect(Object.keys(written)).not.toContain('targetMonths');
    expect(onSync).toHaveBeenCalledWith({ emergencyFund: written });

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '4000' } });
    const written2 = setEmergencyFund.mock.calls[1][0];
    expect(written2).toEqual({ currentAmount: 0, targetAmount: 4000 });
    expect(Object.keys(written2)).not.toContain('targetMonths');
  });

  it('refuses a negative amount instead of rendering a nonsense carve-out', () => {
    const { setEmergencyFund } = renderEditable();
    fireEvent.change(screen.getByLabelText('Current in fund'), { target: { value: '-500' } });
    expect(setEmergencyFund).toHaveBeenCalledWith({ currentAmount: 0, targetAmount: 6735 });
    // And the control itself says so, so the browser blocks the spinner too.
    expect(screen.getByLabelText('Current in fund')).toHaveAttribute('min', '0');
    expect(screen.getByLabelText('Target')).toHaveAttribute('min', '0');
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
