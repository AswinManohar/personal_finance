import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

describe('Monthly needed against what you actually save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('says the goal is reached when the assets already cover it', () => {
    renderGoal({ targetAmount: 10000, sources: ['cash'] }, 400);
    expect(screen.getByText(/Goal reached/)).toBeTruthy();
  });

  it('says the deadline passed rather than congratulating you', () => {
    // Target 50,000, cash 12,000, deadline already gone.
    renderGoal({ targetAmount: 50000, targetDate: '2026-01-01', sources: ['cash'] }, 400);
    expect(screen.getByText(/Deadline passed/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('On track');
  });

  it('asks for a monthly figure when none is set', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] }, 0);
    expect(screen.getByText(/No monthly savings set/)).toBeTruthy();
  });

  it('says on track when you save more than you need', () => {
    // 50,000 − 12,000 = 38,000 over 12 months → 3,167/month needed.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 4000);
    expect(screen.getByText(/On track/)).toBeTruthy();
  });

  it('names the shortfall and the date you would actually get there', () => {
    // 38,000 remaining at 400/month = 95 months → Jul 2034.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 400);
    expect(screen.getByText(/Short/)).toBeTruthy();
    expect(document.body.textContent).toContain('2034');
  });

  it('refuses to print a year in the far future', () => {
    // 38,000 remaining at 5/month = 7,600 months — an arrival year of 2660.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 5);
    expect(screen.getByText(/within 50 years/).textContent).toContain('do not reach');
    // 2026 and 2027 are legitimately on screen; anything past 2099 is not.
    expect(document.body.textContent).not.toMatch(/2[1-9][0-9]{2}/);
  });
});

describe('The projection chart', () => {
  const projectionPath = () =>
    screen
      .getByLabelText('12-month projection against target')
      .querySelector('path')
      ?.getAttribute('d') ?? '';

  it('projects from today at the monthly rate, against the target', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] }, 1000);
    expect(document.body.textContent).toContain('€50,000 target');
    const rising = projectionPath();

    // The same goal with nothing saved monthly draws a flat line. If the two
    // paths match, the chart is ignoring the rate and is decorative again.
    cleanup();
    renderGoal({ targetAmount: 50000, sources: ['cash'] }, 0);
    expect(projectionPath()).not.toBe(rising);
  });

  it('no longer renders the twelve hardcoded bars', () => {
    renderGoal();
    expect(screen.queryByText('12-Month Accumulation')).toBeNull();
  });
});
