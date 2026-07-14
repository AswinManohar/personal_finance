import { describe, it, expect } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';
import {
  monthlyAmount, monthlyEssentials, runwayMonths,
  emergencyFundTarget, monthsToTarget,
} from '../../utils/finance';

const exp = (over: Partial<Expense>): Expense => ({
  id: 'x', name: 'e', amount: 0, category: ExpenseCategory.OTHER,
  isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01',
  ...over,
});

describe('monthlyAmount', () => {
  it('normalizes each frequency to a monthly figure', () => {
    expect(monthlyAmount(exp({ amount: 100, recurringFrequency: 'weekly' }))).toBeCloseTo(433.33, 1);
    expect(monthlyAmount(exp({ amount: 100, recurringFrequency: 'bi-weekly' }))).toBeCloseTo(216.67, 1);
    expect(monthlyAmount(exp({ amount: 1500, recurringFrequency: 'monthly' }))).toBe(1500);
    expect(monthlyAmount(exp({ amount: 300, recurringFrequency: 'quarterly' }))).toBeCloseTo(100, 5);
    expect(monthlyAmount(exp({ amount: 1200, recurringFrequency: 'yearly' }))).toBeCloseTo(100, 5);
  });
  it('returns 0 for one-time expenses', () => {
    expect(monthlyAmount(exp({ amount: 500, isRecurring: false }))).toBe(0);
  });
  it('treats a recurring expense without frequency as monthly', () => {
    expect(monthlyAmount(exp({ amount: 50, recurringFrequency: undefined }))).toBe(50);
  });
  it('is NaN-safe', () => {
    expect(monthlyAmount(exp({ amount: undefined as any }))).toBe(0);
  });
});

describe('monthlyEssentials', () => {
  it('sums only essential expenses, normalized to monthly', () => {
    const expenses = [
      exp({ amount: 1500, isEssential: true }),               // rent
      exp({ amount: 745, isEssential: true }),                // home loans
      exp({ amount: 30 }),                                    // streaming, not essential
      exp({ amount: 999, isEssential: true, isRecurring: false }), // one-off, ignored
    ];
    expect(monthlyEssentials(expenses)).toBe(2245);
  });
  it('returns 0 for empty input', () => {
    expect(monthlyEssentials([])).toBe(0);
  });
});

describe('runwayMonths', () => {
  it('divides liquid cash by monthly essentials (€2,192 / €2,245 ≈ 0.98)', () => {
    expect(runwayMonths(2192, 2245)).toBeCloseTo(0.976, 2);
  });
  it('returns null when essentials are unknown/zero', () => {
    expect(runwayMonths(2192, 0)).toBeNull();
  });
});

describe('emergencyFundTarget', () => {
  it('multiplies essentials by target months (6 × €2,245 = €13,470)', () => {
    expect(emergencyFundTarget(2245, 6)).toBe(13470);
  });
});

describe('monthsToTarget', () => {
  it('rounds up the months needed at the given contribution', () => {
    // (13470 - 2192) / 2900 = 3.89 → 4 months, matching the advisory conversation
    expect(monthsToTarget(2192, 13470, 2900)).toBe(4);
  });
  it('returns 0 when already funded', () => {
    expect(monthsToTarget(15000, 13470, 2900)).toBe(0);
  });
  it('returns null when there is no contribution', () => {
    expect(monthsToTarget(2192, 13470, 0)).toBeNull();
  });
});
