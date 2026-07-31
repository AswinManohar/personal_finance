import React, { useState, useEffect } from 'react';
import { SavingsGoal as SavingsGoalType } from '../types';
import {
  AxisLabels, Card, ColumnChart, FieldLabel, Input, PrimaryButton, ProgressBar, ScreenTitle,
} from './ui';

interface SavingsGoalProps {
  goal: SavingsGoalType;
  setGoal: React.Dispatch<React.SetStateAction<SavingsGoalType>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const SavingsGoal: React.FC<SavingsGoalProps> = ({ goal, setGoal, onSync }) => {
  const [result, setResult] = useState<{ monthly: number; monthsLeft: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const targetDateObj = new Date(goal.targetDate);
      const today = new Date();

      let months = (targetDateObj.getFullYear() - today.getFullYear()) * 12;
      months -= today.getMonth();
      months += targetDateObj.getMonth();

      if (months <= 0) {
        setResult({ monthly: 0, monthsLeft: 0 });
        return;
      }

      const remainingAmount = goal.targetAmount - goal.currentSavings;
      const monthlyNeeded = remainingAmount > 0 ? remainingAmount / months : 0;

      setResult({ monthly: monthlyNeeded, monthsLeft: months });
    };

    if (goal.targetDate && goal.targetAmount > 0) {
      calculate();
    }
  }, [goal]);

  const handleChange = (field: keyof SavingsGoalType, value: string | number) => {
    const newState = { ...goal, [field]: value };
    setGoal(newState);
    if (onSync) {
      onSync({ goal: newState });
    }
  };

  const progressPct = goal.targetAmount > 0
    ? Math.min(100, (goal.currentSavings / goal.targetAmount) * 100)
    : 0;

  const remaining = Math.max(0, goal.targetAmount - goal.currentSavings);

  const deadlineLabel = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '—';

  // Mini chart: 12 fixed bar heights that animate toward goal
  const miniBarHeights = [40, 45, 55, 50, 65, 70, 60, 75, 80, 85, 90, 40];

  const fmt = (v: number, dec = 2) =>
    '€' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const currentMonth = new Date().getMonth();

  return (
    <>
      <ScreenTitle
        eyebrow={{ icon: 'flag', text: 'Savings Goals' }}
        title={goal.targetAmount > 0 ? `${fmt(goal.targetAmount, 0)} target` : 'Set a target'}
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
              {isEditing ? (
                <Input
                  type="number"
                  aria-label="Saved so far"
                  className="mt-1 !w-[110px] !h-9 !text-body !text-primary"
                  value={goal.currentSavings || ''}
                  onChange={e => handleChange('currentSavings', parseFloat(e.target.value) || 0)}
                />
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="mt-1 block text-primary font-bold tabular-nums hover:underline"
                >
                  {fmt(goal.currentSavings)}
                </button>
              )}
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

        {/* Monthly needed */}
        <div className="flex items-center justify-between gap-3 p-4 rounded-field bg-surface-container-highest/40 border border-outline-variant/12">
          <div>
            <FieldLabel className="!text-micro">Monthly needed</FieldLabel>
            <p className="mt-0.5 text-label text-secondary">
              {result && result.monthsLeft > 0
                ? `to reach goal in ${result.monthsLeft} months`
                : 'deadline has passed'}
            </p>
          </div>
          <span className="text-num-sm font-bold text-primary tabular-nums flex-none">
            {result ? fmt(result.monthly, 0) : '—'}
          </span>
        </div>

        {/* 12-month accumulation */}
        <div>
          <div className="flex justify-between mb-3">
            <FieldLabel className="!text-micro">12-Month Accumulation</FieldLabel>
            <span className="text-micro font-bold tracking-[.08em] uppercase text-primary-container">
              — Monthly Target
            </span>
          </div>
          <ColumnChart
            height={88}
            columns={miniBarHeights.map((h, i) => ({
              label: '',
              value: h,
              highlight: i === currentMonth,
            }))}
          />
          <AxisLabels labels={['Jan', 'Jun', 'Dec']} className="mt-2" />
        </div>

        <PrimaryButton onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Save Goal' : 'Edit Goal'}
        </PrimaryButton>
      </Card>
    </>
  );
};
