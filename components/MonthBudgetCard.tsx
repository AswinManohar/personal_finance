import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ActiveTab, EmergencyFundContribution, EmergencyFundState, Expense, IncomeState } from '../types';
import { fmtEuro, fundContributedInMonth, monthBudget, num } from '../utils/finance';
import { monthSpend } from '../utils/expenseSummary';
import { inRange, localYmd, monthBounds, todayYmd } from '../utils/expenseDate';
import { newId } from '../utils/id';
import {
  Card, Dot, EmptyState, Field, FieldLabel, FormError, Input, ListRow, PrimaryButton, SectionLabel, StackedBar,
} from './ui';
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
  /** Set-and-sync, owned by the hub so the fund has one write path. */
  onFundChange?: (next: EmergencyFundState) => void;
  onNavigate?: (tab: ActiveTab) => void;
}

/** A contribution's day, the way the Recent list words it. */
const dayLabel = (ymd: string): string => {
  if (ymd === todayYmd()) return 'Today';
  if (ymd === localYmd(new Date(Date.now() - 86400000))) return 'Yesterday';
  // 'T00:00:00' with no zone parses as local midnight; a bare YMD would be UTC.
  return new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const MonthBudgetCard: React.FC<MonthBudgetCardProps> = ({
  income,
  expenses,
  emergencyFund,
  onFundChange,
  onNavigate,
}) => {
  const today = useToday();
  const [addAmount, setAddAmount] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
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

  // The log this month, newest first. Older months are not shown: the card is
  // about the month in progress, and the fund's total already carries them.
  const thisMonthLog = useMemo(() => {
    const { lo, hi } = monthBounds(today);
    return (emergencyFund?.contributions ?? [])
      .filter(c => inRange(c.date, lo, hi))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [emergencyFund, today]);

  const commit = (next: EmergencyFundState) => onFundChange?.(next);

  const handleAdd = () => {
    const amount = parseFloat(addAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setAddError('Enter an amount greater than zero.');
      return;
    }
    setAddError(null);
    setAddAmount('');
    commit({
      targetAmount: num(emergencyFund?.targetAmount),
      currentAmount: num(emergencyFund?.currentAmount) + amount,
      contributions: [
        ...(emergencyFund?.contributions ?? []),
        { id: newId(), date: todayYmd(), amount },
      ],
    });
  };

  const handleRemove = (entry: EmergencyFundContribution) => {
    commit({
      targetAmount: num(emergencyFund?.targetAmount),
      // Floored: the current amount may have been edited by hand below what
      // the log says went in, and a negative fund is not a thing.
      currentAmount: Math.max(0, num(emergencyFund?.currentAmount) - num(entry.amount)),
      contributions: (emergencyFund?.contributions ?? []).filter(c => c.id !== entry.id),
    });
  };

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

            <div className="mt-4 pt-4 border-t border-outline-variant/12">
              <div className="flex gap-3 items-end">
                <Field label="Add to fund" htmlFor="fund-add" className="flex-1">
                  <Input
                    id="fund-add"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    prefix="€"
                    value={addAmount}
                    onChange={e => setAddAmount(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="0"
                  />
                </Field>
                <PrimaryButton size="md" onClick={handleAdd}>Add</PrimaryButton>
              </div>
              <FormError className="mt-2">{addError}</FormError>

              {thisMonthLog.length > 0 && (
                <div className="mt-3 flex flex-col">
                  <FieldLabel className="mb-1">Moved to the fund this month</FieldLabel>
                  {thisMonthLog.map((entry, i) => (
                    <ListRow key={entry.id} divider={i < thisMonthLog.length - 1} className="min-h-11 py-1">
                      <span className="text-body text-secondary">{dayLabel(entry.date)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-body font-bold tabular-nums text-tertiary">{fmtEuro(entry.amount)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemove(entry)}
                          aria-label={`Remove contribution of ${fmtEuro(entry.amount)}`}
                          className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </ListRow>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </section>
  );
};
