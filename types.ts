export type RecurringFrequency = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  isRecurring: boolean;
  recurringFrequency?: RecurringFrequency;
  /**
   * Whether this commitment is a subscription rather than a bill, as stated by
   * the person who entered it. `undefined` means nobody has said, and the split
   * falls back to inference — see `isSubscription` in utils/expenseSummary.ts.
   * Only meaningful when `isRecurring` is true.
   */
  isSubscription?: boolean;
  date: string; // ISO date string
  vendor?: string;
  isEssential?: boolean; // counts toward runway / emergency-fund target
}

export enum ExpenseCategory {
  HOUSING = 'Housing',
  FOOD = 'Food',
  TRANSPORT = 'Transport',
  UTILITIES = 'Utilities',
  ENTERTAINMENT = 'Entertainment',
  OTHER = 'Other'
}

export interface IncomeState {
  salaryMe: number;
  salaryPartner: number;
}

export interface InvestmentState {
  initialPrincipal: number;
  monthlyContribution: number;
  annualInterestRate: number;
  yearsToGrow: number;
}

export interface SavingsGoal {
  targetAmount: number;
  targetDate: string; // ISO date string
  /**
   * Which tracked assets count toward this goal. Absent means all of them, so a
   * goal synced from a device that predates this field needs no migration.
   */
  sources?: GoalSource[];
  /**
   * @deprecated Was the hand-typed "saved so far". Read once by the migration in
   * App.tsx, then cleared. Never displayed.
   */
  currentSavings?: number;
}

/** A tracked asset line that a savings goal can count toward its progress. */
export type GoalSource = 'cash' | 'stocks' | 'mutualFunds' | 'gold' | 'other';

export interface NetWorthState {
  goldInvestment: number;
  otherAssets: number;
  remainingLoan: number;
  monthlyRecurringSavings: number;
  accumulatedSavings: number;
}

export interface SavingsHistoryRecord {
  id: string;
  created_at: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  savings_amount: number;
  investment_amount: number;
  gold_amount: number;
  stock_amount: number;
}

export interface FIREState {
  currentAge: number;
  annualExpenses: number;
  currentNetWorth: number;
  annualSavings: number;
  annualReturn: number;
  withdrawalRate: number;
}

export type AssetType = 'MUTUAL_FUND_INDIA' | 'ETF_GLOBAL' | 'OTHER';
export type InvestmentFrequency = 'One-time' | 'Monthly' | 'Bi-monthly';

export interface PortfolioAsset {
  id: string;
  name: string;
  type: AssetType;
  currentValue: number;
  monthlyInvestment: number;
  expectedReturn: number; // %
  expenseRatio: number; // % TER
  taxRate: number; // % on gains
  frequency: InvestmentFrequency;
}

export interface Stock {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice?: number;
  frequency: InvestmentFrequency;
}

export interface CalculationResult {
  month: number;
  invested: number;
  value: number;
}

export interface SupabaseSyncState {
  syncKey: string;
  lastSynced?: string;
}

export interface Loan {
  id: string;
  name: string;
  /**
   * Outstanding amount. Derived from the amortisation schedule below whenever
   * one is present — see currentBalance() — and only authoritative for loans
   * entered before the schedule fields existed.
   */
  balance: number;
  interestRate: number; // annual nominal %, e.g. 7.5
  monthlyPayment: number;
  /** Total number of installments over the life of the loan. */
  termMonths?: number;
  /** How many of those have been paid so far. */
  installmentsPaid?: number;
  lender?: string;
}

/** One transfer into the emergency fund, logged from the Savings Hub. */
export interface EmergencyFundContribution {
  id: string;
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  /** Always positive. */
  amount: number;
}

export interface EmergencyFundState {
  /** What the fund should hold, in €. Entered by hand. */
  targetAmount: number;
  /** What the fund holds today, in €. Entered by hand; a slice of accumulatedSavings. */
  currentAmount: number;
  /**
   * Money moved into the fund, oldest first. Optional: payloads written
   * before it existed omit it, and readers treat absence as an empty log.
   */
  contributions?: EmergencyFundContribution[];
}

// 'stmt' is Statement Review. It used to render inside the Expenses screen; the
// mobile design promotes it to a destination of its own, reached from the More
// sheet, so it needs a tab id like everything else.
export type ActiveTab = 'expenses' | 'savings' | 'investment' | 'networth' | 'fire' | 'portfolio' | 'stocks' | 'data' | 'goal' | 'debts' | 'stmt';