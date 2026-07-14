import { Expense, Loan, RecurringFrequency } from '../types';

/** Coerce any value to a finite number; invalid input becomes 0. */
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MONTHLY_FACTORS: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,
  'bi-weekly': 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Monthly-normalized cost of a recurring expense; 0 for one-time expenses. */
export const monthlyAmount = (e: Expense): number => {
  if (!e.isRecurring) return 0;
  const factor = MONTHLY_FACTORS[e.recurringFrequency || 'monthly'] ?? 1;
  return num(e.amount) * factor;
};

/** Sum of essential recurring expenses per month. */
export const monthlyEssentials = (expenses: Expense[]): number =>
  expenses.filter(e => e.isEssential).reduce((sum, e) => sum + monthlyAmount(e), 0);

/** Months of essential costs covered by liquid cash; null when essentials are unknown. */
export const runwayMonths = (liquidCash: number, essentialsPerMonth: number): number | null =>
  essentialsPerMonth > 0 ? num(liquidCash) / essentialsPerMonth : null;

export const emergencyFundTarget = (essentialsPerMonth: number, targetMonths: number): number =>
  num(essentialsPerMonth) * num(targetMonths);

/** Whole months until target at the given contribution; 0 if funded, null if no contribution. */
export const monthsToTarget = (current: number, target: number, monthlyContribution: number): number | null => {
  const gap = num(target) - num(current);
  if (gap <= 0) return 0;
  if (num(monthlyContribution) <= 0) return null;
  return Math.ceil(gap / num(monthlyContribution));
};
