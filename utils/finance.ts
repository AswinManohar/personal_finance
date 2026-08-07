import { Expense, GoalSource, Loan, NetWorthState, PortfolioAsset, RecurringFrequency, Stock } from '../types';

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

/** Interest a loan accrues per month at its current balance. */
/**
 * What a loan currently owes.
 *
 * Prefers the amortisation schedule when the loan carries one, so the figure
 * falls on its own as installments are recorded. Falls back to the stored
 * `balance` for loans entered before the schedule existed.
 */
export const currentBalance = (loan: Loan): number => {
  const derived = remainingBalance(
    num(loan.monthlyPayment),
    num(loan.interestRate),
    num(loan.termMonths),
    num(loan.installmentsPaid)
  );
  return derived === null ? num(loan.balance) : derived;
};

export const monthlyInterest = (loan: Loan): number =>
  currentBalance(loan) * (num(loan.interestRate) / 100) / 12;

export const totalLoanBalance = (loans: Loan[]): number =>
  loans.reduce((sum, l) => sum + currentBalance(l), 0);

/** Highest interest rate first — the order they should be paid off in. */
export const sortByAvalanche = (loans: Loan[]): Loan[] =>
  [...loans].sort((a, b) => num(b.interestRate) - num(a.interestRate));

export interface PayoffSimulation {
  amountApplied: number;
  newBalance: number;
  newLiquidCash: number;
  monthlyInterestSaved: number;
  newRunwayMonths: number | null;
  breachesBuffer: boolean; // payoff would leave < 1 month of essentials in cash
  safeAmount: number;      // largest payment that keeps a 1-month buffer
}

export const simulatePayoff = (
  loan: Loan, amount: number, liquidCash: number, essentialsPerMonth: number,
): PayoffSimulation => {
  const owed = currentBalance(loan);
  const amountApplied = Math.min(num(amount), owed);
  const newLiquidCash = num(liquidCash) - amountApplied;
  const newRunway = runwayMonths(newLiquidCash, num(essentialsPerMonth));
  return {
    amountApplied,
    newBalance: owed - amountApplied,
    newLiquidCash,
    monthlyInterestSaved: amountApplied * (num(loan.interestRate) / 100) / 12,
    newRunwayMonths: newRunway,
    breachesBuffer: newRunway !== null && newRunway < 1,
    safeAmount: Math.max(0, Math.min(owed, num(liquidCash) - num(essentialsPerMonth))),
  };
};

/**
 * Outstanding balance of an amortising loan after `installmentsPaid` payments.
 *
 * Lets a loan be entered the way people actually hold it in their head — "€250
 * a month at 5% for 5 years, I've paid 14" — rather than demanding a current
 * balance nobody has to hand. The balance is the present value of the payments
 * still to come:
 *
 *   remaining = PMT × (1 − (1 + r)^−m) / r      (r = monthly rate, m = months left)
 *
 * Returns null when it cannot be computed, so callers can tell "not enough
 * information" apart from a genuine zero.
 */
export const remainingBalance = (
  monthlyPayment: number,
  annualRatePercent: number,
  termMonths: number,
  installmentsPaid: number = 0
): number | null => {
  const pmt = num(monthlyPayment);
  const rate = num(annualRatePercent);
  const term = Math.floor(num(termMonths));
  const paid = Math.floor(num(installmentsPaid));

  if (pmt <= 0 || term <= 0 || rate < 0 || paid < 0) return null;

  const left = term - paid;
  if (left <= 0) return 0; // fully repaid

  const r = rate / 100 / 12;
  // A 0% loan is plain division, and the annuity formula divides by r.
  if (r === 0) return pmt * left;

  return pmt * ((1 - Math.pow(1 + r, -left)) / r);
};

/**
 * What you own, one slice per tracked asset line.
 *
 * The single definition of the asset side in this app. Net Worth and the Savings
 * Hub each used to sum this themselves, and they disagreed: the Hub read cash
 * from `accumulatedSavings` while Net Worth read it from `goal.currentSavings`.
 */
export interface AssetBreakdown {
  cash: number;
  stocks: number;
  mutualFunds: number;
  gold: number;
  other: number;
}

/** Canonical order — display order and the meaning of an absent `sources`. */
export const ALL_GOAL_SOURCES: GoalSource[] = ['cash', 'stocks', 'mutualFunds', 'gold', 'other'];

export const assetBreakdown = (
  netWorthData?: Partial<NetWorthState>,
  stocks: Stock[] = [],
  portfolio: PortfolioAsset[] = []
): AssetBreakdown => ({
  cash: num(netWorthData?.accumulatedSavings),
  // `||` not `??`: a currentPrice of 0 means "never fetched", not "worthless".
  stocks: stocks.reduce((s, x) => s + num(x.quantity) * num(x.currentPrice || x.buyPrice), 0),
  mutualFunds: portfolio.reduce((s, p) => s + num(p.currentValue), 0),
  gold: num(netWorthData?.goldInvestment),
  other: num(netWorthData?.otherAssets),
});

export const totalAssets = (b: AssetBreakdown): number =>
  b.cash + b.stocks + b.mutualFunds + b.gold + b.other;

/**
 * Saved-so-far for a goal: the slices it counts.
 *
 * An absent `sources` means all of them, so a goal synced from a device that
 * predates the field reads as "everything" without a migration.
 */
export const goalSavings = (b: AssetBreakdown, sources?: GoalSource[]): number =>
  (sources ?? ALL_GOAL_SOURCES).reduce((sum, k) => sum + b[k], 0);
