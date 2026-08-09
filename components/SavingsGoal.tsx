import React, { useMemo, useState } from 'react';
import { ActiveTab, GoalSource, SavingsGoal as SavingsGoalType } from '../types';
import {
  ALL_GOAL_SOURCES, AssetBreakdown, goalSavings, num,
} from '../utils/finance';
import {
  AreaChart, AxisLabels, Card, FieldLabel, Input, PrimaryButton, ProgressBar, ScreenTitle,
} from './ui';

interface SavingsGoalProps {
  goal: SavingsGoalType;
  setGoal: React.Dispatch<React.SetStateAction<SavingsGoalType>>;
  /** What you own, per asset line. The goal counts the slices it is pointed at. */
  breakdown: AssetBreakdown;
  /** netWorthData.monthlyRecurringSavings — what you actually put aside. */
  monthlySavings: number;
  /** Saved-so-far links out to where the underlying figures are edited. */
  onNavigate?: (tab: ActiveTab) => void;
  onSync?: (overrides?: any) => Promise<void>;
}

const SOURCE_LABELS: Record<GoalSource, string> = {
  cash: 'Cash',
  stocks: 'Stocks',
  mutualFunds: 'Mutual funds',
  gold: 'Gold',
  other: 'Other assets',
};

export const SavingsGoal: React.FC<SavingsGoalProps> = ({
  goal, setGoal, breakdown, monthlySavings, onNavigate, onSync,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const activeSources = goal.sources ?? ALL_GOAL_SOURCES;
  const saved = goalSavings(breakdown, goal.sources);

  // Months from today to the deadline. Floored at zero: a passed deadline is
  // handled by its own verdict, not by a negative month count.
  const monthsLeft = useMemo(() => {
    if (!goal.targetDate) return 0;
    const target = new Date(goal.targetDate);
    const today = new Date();
    let months = (target.getFullYear() - today.getFullYear()) * 12;
    months -= today.getMonth();
    months += target.getMonth();
    return Math.max(0, months);
  }, [goal.targetDate]);

  const targetAmount = num(goal.targetAmount);
  const remaining = Math.max(0, targetAmount - saved);
  const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : 0;

  const handleChange = (field: 'targetAmount' | 'targetDate', value: string | number) => {
    const newState = { ...goal, [field]: value };
    setGoal(newState);
    if (onSync) {
      onSync({ goal: newState });
    }
  };

  const toggleSource = (key: GoalSource) => {
    // Rebuilt from ALL_GOAL_SOURCES so the stored list keeps display order
    // rather than the order the boxes happened to be clicked in.
    const next = ALL_GOAL_SOURCES.filter(k =>
      k === key ? !activeSources.includes(k) : activeSources.includes(k)
    );
    const newState = { ...goal, sources: next };
    setGoal(newState);
    if (onSync) {
      onSync({ goal: newState });
    }
  };

  const sourceCaption =
    activeSources.length === 0
      ? 'no assets selected'
      : activeSources.length === ALL_GOAL_SOURCES.length
        ? 'from all tracked assets'
        : `from ${activeSources.map(k => SOURCE_LABELS[k]).join(', ')}`;

  const progressPct = targetAmount > 0 ? Math.min(100, (saved / targetAmount) * 100) : 0;

  const fmt = (v: number, dec = 2) =>
    '€' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const actualMonthly = num(monthlySavings);
  const gap = monthlyNeeded - actualMonthly;

  // Months to the target at the rate you actually save. Null past 50 years:
  // at €5/month against €38,000, a year like 2438 is noise, not information.
  const monthsAtCurrentRate =
    actualMonthly > 0 && remaining > 0 ? Math.ceil(remaining / actualMonthly) : null;
  const reachDate =
    monthsAtCurrentRate !== null && monthsAtCurrentRate <= 600
      ? new Date(new Date().setMonth(new Date().getMonth() + monthsAtCurrentRate))
      : null;
  const reachLabel = reachDate
    ? reachDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  // Exactly one of these renders, in this order. The monthsLeft check is
  // load-bearing: a passed deadline forces monthlyNeeded to 0, which would
  // otherwise make gap negative and read as "On track" while you sit short.
  const verdict: { tone: 'positive' | 'warn' | 'neutral'; headline: string; detail: string } =
    remaining === 0
      ? { tone: 'positive', headline: 'Goal reached', detail: `${fmt(saved, 0)} against a ${fmt(targetAmount, 0)} target` }
      : monthsLeft === 0
        ? { tone: 'warn', headline: 'Deadline passed', detail: `${fmt(remaining, 0)} still to go` }
        : actualMonthly === 0
          ? { tone: 'neutral', headline: 'No monthly savings set', detail: 'Add what you put aside each month on the Savings Hub' }
          : gap <= 0
            ? { tone: 'positive', headline: 'On track', detail: `${fmt(-gap, 0)} a month spare` }
            : {
                tone: 'warn',
                headline: `Short ${fmt(gap, 0)} a month`,
                detail: reachLabel
                  ? `At ${fmt(actualMonthly, 0)} a month you reach ${fmt(targetAmount, 0)} in ${reachLabel}`
                  : `At ${fmt(actualMonthly, 0)} a month you do not reach ${fmt(targetAmount, 0)} within 50 years`,
              };

  // Same shape as the Hub's outlookSeries, so the two screens project alike.
  const projectionPoints = Array.from({ length: 13 }, (_, i) => saved + actualMonthly * i);
  const projectionLabels = [0, 6, 12].map(offset =>
    new Date(new Date().setMonth(new Date().getMonth() + offset))
      .toLocaleDateString(undefined, { month: 'short' })
  );

  const deadlineLabel = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—';

  return (
    <>
      <ScreenTitle
        eyebrow={{ icon: 'flag', text: 'Savings Goals' }}
        title={targetAmount > 0 ? `${fmt(targetAmount, 0)} target` : 'Set a target'}
        subtitle="Automated tracking for your primary milestone."
      />

      <Card className="flex flex-col gap-5">
        {/* Target + deadline */}
        <div className="flex justify-between items-start gap-3">
          <div>
            <FieldLabel>Target Amount</FieldLabel>
            {isEditing ? (
              <Input
                type="number"
                aria-label="Target amount"
                className="mt-1.5 !w-[150px] !text-stat !font-bold"
                value={goal.targetAmount || ''}
                onChange={e => handleChange('targetAmount', parseFloat(e.target.value) || 0)}
              />
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="mt-1 block text-num font-bold tabular-nums hover:text-primary transition-colors"
              >
                {fmt(goal.targetAmount, 0)}
              </button>
            )}
          </div>
          <div className="text-right">
            <FieldLabel>Deadline</FieldLabel>
            {isEditing ? (
              <Input
                type="date"
                aria-label="Target date"
                className="mt-1.5 !w-[170px]"
                value={goal.targetDate}
                onChange={e => handleChange('targetDate', e.target.value)}
              />
            ) : (
              <p className="mt-1.5 text-body font-semibold tabular-nums">{deadlineLabel}</p>
            )}
          </div>
        </div>

        {/* Progress */}
        <div>
          <ProgressBar percent={progressPct} tone="neutral" className="mb-3" />
          <div className="flex justify-between text-label gap-2">
            <div>
              <p className="text-secondary">Saved so far</p>
              <button
                onClick={() => onNavigate?.('savings')}
                className="mt-1 flex items-center gap-1 text-primary font-bold tabular-nums hover:underline"
              >
                {fmt(saved, 0)}
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
              <p className="mt-0.5 text-micro text-secondary">{sourceCaption}</p>
            </div>
            <div className="text-center">
              <p className="text-secondary">Progress</p>
              <p className="mt-1 font-bold tabular-nums">{progressPct.toFixed(1)}%</p>
            </div>
            <div className="text-right">
              <p className="text-secondary">Remaining</p>
              <p className="mt-1 text-secondary font-semibold tabular-nums">{fmt(remaining)}</p>
            </div>
          </div>
        </div>

        {/* Which assets count */}
        <div>
          <FieldLabel className="!text-micro mb-2">Counts toward this goal</FieldLabel>
          <div className="flex flex-col">
            {ALL_GOAL_SOURCES.map(key => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 py-2"
              >
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeSources.includes(key)}
                    onChange={() => toggleSource(key)}
                    className="w-4 h-4 accent-[#8183ff] cursor-pointer"
                  />
                  <span className="text-label font-semibold">{SOURCE_LABELS[key]}</span>
                </label>
                <span className="text-label text-secondary tabular-nums">
                  {fmt(breakdown[key], 0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly needed vs. what you actually save */}
        <div className="p-4 rounded-field bg-surface-container-highest/40 border border-outline-variant/12">
          <div className="flex items-center justify-between gap-3">
            <div>
              <FieldLabel className="!text-micro">Monthly needed</FieldLabel>
              <p className="mt-0.5 text-label text-secondary">
                {monthsLeft > 0 ? `to reach goal in ${monthsLeft} months` : 'deadline has passed'}
              </p>
            </div>
            <span className="text-num-sm font-bold text-primary tabular-nums flex-none">
              {fmt(monthlyNeeded, 0)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <FieldLabel className="!text-micro">You save</FieldLabel>
            <button
              onClick={() => onNavigate?.('savings')}
              className="text-body font-bold tabular-nums hover:underline"
            >
              {fmt(actualMonthly, 0)}
            </button>
          </div>

          <p
            className={`mt-3 pt-3 border-t border-outline-variant/12 text-label font-bold ${
              verdict.tone === 'positive'
                ? 'text-positive'
                : verdict.tone === 'warn'
                  ? 'text-tertiary'
                  : 'text-secondary'
            }`}
          >
            {verdict.headline}
          </p>
          <p className="mt-0.5 text-label text-secondary">{verdict.detail}</p>
        </div>

        {/* 12-month projection at your current rate */}
        <div>
          <div className="flex justify-between mb-3">
            <FieldLabel className="!text-micro">12-Month Projection</FieldLabel>
            <span className="text-micro font-bold tracking-[.08em] uppercase text-primary-container">
              ╌ {fmt(targetAmount, 0)} target
            </span>
          </div>
          <div className="h-[120px]">
            <AreaChart
              points={projectionPoints}
              baseline={new Array(13).fill(targetAmount)}
              label="12-month projection against target"
            />
          </div>
          <AxisLabels labels={projectionLabels} className="mt-2" />
        </div>

        <PrimaryButton onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Save Goal' : 'Edit Goal'}
        </PrimaryButton>
      </Card>
    </>
  );
};
