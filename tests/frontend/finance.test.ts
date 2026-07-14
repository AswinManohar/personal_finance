import { describe, it, expect } from 'vitest';
import { Expense, ExpenseCategory, Loan } from '../../types';
import {
  monthlyAmount, monthlyEssentials, runwayMonths,
  emergencyFundTarget, monthsToTarget,
  monthlyInterest, totalLoanBalance, sortByAvalanche, simulatePayoff,
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

const sparkasse: Loan = { id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 };
const dispo: Loan = { id: 'l2', name: 'Dispo', balance: 1200, interestRate: 11, monthlyPayment: 50 };

describe('loan math', () => {
  it('computes monthly interest (€36k @ 7.5% → €225/month)', () => {
    expect(monthlyInterest(sparkasse)).toBeCloseTo(225, 5);
  });
  it('sums balances', () => {
    expect(totalLoanBalance([sparkasse, dispo])).toBe(37200);
  });
  it('avalanche-sorts by rate descending without mutating input', () => {
    const input = [sparkasse, dispo];
    const sorted = sortByAvalanche(input);
    expect(sorted.map(l => l.id)).toEqual(['l2', 'l1']);
    expect(input.map(l => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('simulatePayoff', () => {
  it('flags a payoff that leaves less than one month of essentials', () => {
    // cash €38,000, essentials €2,245/month, pay full €36,000 → €2,000 left
    const sim = simulatePayoff(sparkasse, 36000, 38000, 2245);
    expect(sim.amountApplied).toBe(36000);
    expect(sim.newLiquidCash).toBe(2000);
    expect(sim.monthlyInterestSaved).toBeCloseTo(225, 5);
    expect(sim.breachesBuffer).toBe(true);
    expect(sim.safeAmount).toBe(35755); // 38,000 − 2,245
  });
  it('accepts a partial payoff that preserves the buffer', () => {
    const sim = simulatePayoff(sparkasse, 33000, 38000, 2245);
    expect(sim.newBalance).toBe(3000);
    expect(sim.newLiquidCash).toBe(5000);
    expect(sim.monthlyInterestSaved).toBeCloseTo(206.25, 2);
    expect(sim.breachesBuffer).toBe(false);
  });
  it('caps the payment at the loan balance', () => {
    const sim = simulatePayoff(dispo, 5000, 38000, 2245);
    expect(sim.amountApplied).toBe(1200);
    expect(sim.newBalance).toBe(0);
  });
  it('never flags a breach when essentials are unknown', () => {
    const sim = simulatePayoff(sparkasse, 36000, 38000, 0);
    expect(sim.breachesBuffer).toBe(false);
    expect(sim.newRunwayMonths).toBeNull();
  });
});
