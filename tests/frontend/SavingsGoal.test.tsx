import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavingsGoal } from '../../components/SavingsGoal';
import { SavingsGoal as SavingsGoalType } from '../../types';
import { AssetBreakdown } from '../../utils/finance';

const breakdown: AssetBreakdown = {
  cash: 12000, stocks: 8300, mutualFunds: 15000, gold: 5000, other: 2000,
};

const baseGoal: SavingsGoalType = {
  targetAmount: 25000,
  targetDate: '2027-08-01',
};

const renderGoal = (over: Partial<SavingsGoalType> = {}, monthlySavings = 0) => {
  const setGoal = vi.fn();
  const onSync = vi.fn(async () => {});
  render(
    <SavingsGoal
      goal={{ ...baseGoal, ...over }}
      setGoal={setGoal}
      breakdown={breakdown}
      monthlySavings={monthlySavings}
      onSync={onSync}
      onNavigate={() => {}}
    />
  );
  return { setGoal, onSync };
};

describe('Saved so far is derived from tracked assets', () => {
  it('counts every asset when no sources are stored', () => {
    renderGoal();
    expect(document.body.textContent).toContain('€42,300');
    expect(document.body.textContent).toContain('from all tracked assets');
  });

  it('counts only the ticked sources', () => {
    renderGoal({ sources: ['cash', 'gold'] });
    expect(document.body.textContent).toContain('€17,000');
    expect(document.body.textContent).toContain('from Cash, Gold');
  });

  it('reads zero, not NaN, when nothing is ticked', () => {
    renderGoal({ sources: [] });
    expect(document.body.textContent).toContain('no assets selected');
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('offers no input for the figure — it is owned elsewhere', () => {
    renderGoal();
    expect(screen.queryByLabelText('Saved so far')).toBeNull();
  });

  it('shows progress against the target from the derived figure', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] });
    // 12,000 / 50,000
    expect(document.body.textContent).toContain('24.0%');
  });
});

describe('Choosing which assets count', () => {
  it('lists every source with its current value', () => {
    renderGoal();
    expect((screen.getByLabelText('Cash') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Mutual funds') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain('€15,000');
  });

  it('unticking a source writes the remaining list and syncs it', () => {
    const { setGoal, onSync } = renderGoal({ sources: ['cash', 'gold'] });
    fireEvent.click(screen.getByLabelText('Gold'));
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, sources: ['cash'] });
    expect(onSync).toHaveBeenCalledWith({ goal: { ...baseGoal, sources: ['cash'] } });
  });

  it('ticking a source keeps the canonical order, not click order', () => {
    const { setGoal } = renderGoal({ sources: ['gold'] });
    fireEvent.click(screen.getByLabelText('Cash'));
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, sources: ['cash', 'gold'] });
  });

  it('materialises the full list when unticking one of an absent sources field', () => {
    const { setGoal } = renderGoal();
    fireEvent.click(screen.getByLabelText('Stocks'));
    expect(setGoal).toHaveBeenCalledWith({
      ...baseGoal, sources: ['cash', 'mutualFunds', 'gold', 'other'],
    });
  });
});

describe('Target and deadline are still editable', () => {
  it('syncs a new target amount', () => {
    const { setGoal, onSync } = renderGoal();
    fireEvent.click(screen.getByText('Edit Goal'));
    fireEvent.change(screen.getByLabelText('Target amount'), { target: { value: '30000' } });
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, targetAmount: 30000 });
    expect(onSync).toHaveBeenCalledWith({ goal: { ...baseGoal, targetAmount: 30000 } });
  });

  it('syncs a new deadline', () => {
    const { setGoal } = renderGoal();
    fireEvent.click(screen.getByText('Edit Goal'));
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2028-01-01' } });
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, targetDate: '2028-01-01' });
  });
});
