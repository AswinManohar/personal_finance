export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
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

export interface FIREState {
  currentAge: number;
  annualExpenses: number;
  currentNetWorth: number;
  annualSavings: number;
  annualReturn: number;
  withdrawalRate: number;
}

export type AssetType = 'MUTUAL_FUND_INDIA' | 'ETF_GLOBAL' | 'OTHER';

export interface PortfolioAsset {
  id: string;
  name: string;
  type: AssetType;
  currentValue: number;
  monthlyInvestment: number;
  expectedReturn: number; // %
  expenseRatio: number; // % TER
  taxRate: number; // % on gains
}

export interface Stock {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice?: number;
}

export interface CalculationResult {
  month: number;
  invested: number;
  value: number;
}

export type ActiveTab = 'expenses' | 'investment' | 'savings' | 'fire' | 'portfolio' | 'stocks' | 'advisor';