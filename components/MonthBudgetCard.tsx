import React, { useMemo } from 'react';
import { ActiveTab, EmergencyFundState, Expense, IncomeState } from '../types';
import { fmtEuro, fundContributedInMonth, monthBudget, num } from '../utils/finance';
import { monthSpend } from '../utils/expenseSummary';
import { Card, Dot, EmptyState, PrimaryButton, SectionLabel, StackedBar } from './ui';
import { useToday } from './useToday';

/**
 * The month in progress, at the top of the Savings Hub.
 *
 * One bar of this month's income in three parts: what has been spent (every
 * one-off dated this month plus every recurring row at its monthly
 * equivalent), what has been moved into the emergency fund, and what is
 * still free. Money put in the fund is as gone as money spent, which is why
 * it comes off "left" rather than sitting beside it.
 *
 * Income is the two salaries typed on the Expenses screen; without them the
 * card has nothing to divide and says so instead of showing a bar of zeros.
 */

const SPENT = '#F26B6B';
const TO_FUND = '#eec060';
const LEFT = '#3DD68C';

export interface MonthBudgetCardProps {
  income: IncomeState;
  expenses: Expense[];
  emergencyFund?: EmergencyFundState;
  onNavigate?: (tab: ActiveTab) => void;
}

export const MonthBudgetCard: React.FC<MonthBudgetCardProps> = ({
  income,
  expenses,
  emergencyFund,
  onNavigate,
}) => {
  const today = useToday();
  const monthIncome = num(income.salaryMe) + num(income.salaryPartner);

  const budget = useMemo(
    () => monthBudget({
      income: monthIncome,
      spent: monthSpend(expenses, today),
      // `?? []` rather than trusting the prop: a phone that installed the app
      // before the log existed hands over its cached two-field fund verbatim.
      toFund: fundContributedInMonth(emergencyFund?.contributions ?? [], today),
    }),
    [monthIncome, expenses, emergencyFund, today]
  );

  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  // Segments are the euro amounts themselves; StackedBar normalises by their
  // sum, and when nothing has been spent yet the whole bar is simply green.
  const segments = [
    { label: 'Spent', value: budget.spent, color: SPENT },
    { label: 'To fund', value: budget.toFund, color: TO_FUND },
    { label: 'Left', value: budget.left, color: LEFT },
  ];

  return (
    <section data-testid="month-budget-card">
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>This Month</SectionLabel>
          <span className="text-label font-bold tracking-[.08em] uppercase text-primary">
            {monthName}
          </span>
        </div>

        {monthIncome <= 0 ? (
          <>
            <EmptyState icon="payments">
              Set your monthly income to see where this month&apos;s money goes.
            </EmptyState>
            <PrimaryButton size="md" className="w-full" onClick={() => onNavigate?.('expenses')}>
              Set income
            </PrimaryButton>
          </>
        ) : (
          <>
            <StackedBar segments={segments} height={20} className="mb-3" />
            <div className="flex justify-between text-label gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-secondary"><Dot color={SPENT} />Spent</p>
                <p className="mt-1 font-bold tabular-nums">{fmtEuro(budget.spent)}</p>
              </div>
              <div className="text-center">
                <p className="flex items-center justify-center gap-1.5 text-secondary"><Dot color={TO_FUND} />To fund</p>
                <p className="mt-1 font-bold tabular-nums">{fmtEuro(budget.toFund)}</p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1.5 text-secondary"><Dot color={LEFT} />Left</p>
                {/* Two whole class strings, never a tone interpolated into one. */}
                {budget.over > 0 ? (
                  <p className="mt-1 font-bold tabular-nums text-negative">Over by {fmtEuro(budget.over)}</p>
                ) : (
                  <p className="mt-1 font-bold tabular-nums text-positive">{fmtEuro(budget.left)}</p>
                )}
              </div>
            </div>
            <p className="mt-2 text-label text-secondary opacity-70 tabular-nums">
              of {fmtEuro(budget.income)} income
            </p>
          </>
        )}
      </Card>
    </section>
  );
};
