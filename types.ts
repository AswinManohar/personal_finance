export type RecurringFrequency = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  isRecurring: boolean;
  recurringFrequency?: RecurringFrequency;
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
  currentSavings: number;
}

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
  balance: number;
  interestRate: number; // annual nominal %, e.g. 7.5
  monthlyPayment: number;
  lender?: string;
}

export interface EmergencyFundState {
  targetMonths: number; // 3–6 months of essential costs
}

export type ActiveTab = 'expenses' | 'savings' | 'investment' | 'networth' | 'fire' | 'portfolio' | 'stocks' | 'data' | 'goal' | 'debts';