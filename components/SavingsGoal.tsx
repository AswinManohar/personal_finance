import React, { useState, useEffect } from 'react';
import { SavingsGoal as SavingsGoalType } from '../types';

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
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="px-8 py-8 max-w-[1600px] mx-auto flex justify-center">
      <div className="w-full max-w-[640px] flex flex-col gap-10">

        {/* Header */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary font-medium uppercase tracking-[0.2em] text-[10px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 22v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Savings Goals
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface">
            {goal.targetAmount > 0 ? `€${goal.targetAmount.toLocaleString()} Goal` : 'Your Savings Goal'}
          </h1>
          <p className="text-secondary text-sm">Automated tracking for your primary financial milestones.</p>
        </header>

        {/* Main Goal Card */}
        <section className="bg-surface-container-low p-8 rounded-xl flex flex-col gap-8 transition-all duration-300 hover:bg-surface-container">

          {/* Target + Deadline */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-secondary text-xs font-semibold uppercase tracking-wider">Target Amount</span>
              {isEditing ? (
                <input
                  type="number"
                  value={goal.targetAmount || ''}
                  onChange={e => handleChange('targetAmount', parseFloat(e.target.value) || 0)}
                  className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-2 text-2xl font-bold tabular-nums text-on-surface focus:outline-none focus:border-primary transition-colors w-44"
                  autoFocus
                />
              ) : (
                <div
                  className="text-[32px] font-bold tracking-tight text-on-surface tabular-nums leading-none cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditing(true)}
                  title="Click to edit"
                >
                  €{goal.targetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-secondary text-[10px] font-semibold uppercase tracking-wider">Deadline</span>
              {isEditing ? (
                <input
                  type="date"
                  value={goal.targetDate}
                  onChange={e => handleChange('targetDate', e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
              ) : (
                <span
                  className="text-on-surface text-sm font-semibold tabular-nums cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditing(true)}
                  title="Click to edit"
                >
                  {deadlineLabel}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col gap-3">
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-container rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-secondary">Saved so far</span>
                {isEditing ? (
                  <input
                    type="number"
                    value={goal.currentSavings || ''}
                    onChange={e => handleChange('currentSavings', parseFloat(e.target.value) || 0)}
                    className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-1.5 text-sm font-bold tabular-nums text-primary focus:outline-none focus:border-primary transition-colors w-32"
                  />
                ) : (
                  <span
                    className="text-primary font-bold tabular-nums tracking-tight cursor-pointer hover:opacity-80"
                    onClick={() => setIsEditing(true)}
                    title="Click to edit"
                  >
                    €{goal.currentSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-secondary">Progress</span>
                <span className="text-on-surface font-bold tabular-nums tracking-tight">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-secondary">Remaining</span>
                <span className="text-secondary font-semibold tabular-nums tracking-tight">
                  €{remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly savings needed callout */}
          {result && result.monthsLeft > 0 && (
            <div className="flex items-center justify-between p-4 bg-surface-container-highest/40 rounded-lg border border-outline-variant/10">
              <div className="flex flex-col gap-0.5">
                <span className="text-secondary text-[10px] font-bold uppercase tracking-widest">Monthly needed</span>
                <span className="text-xs text-secondary">to reach goal in {result.monthsLeft} months</span>
              </div>
              <span className="text-2xl font-bold tabular-nums text-primary tracking-tight">
                €{result.monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Mini 12-Month Accumulation Chart */}
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-end">
              <span className="text-secondary text-[10px] font-bold uppercase tracking-widest">12-Month Accumulation</span>
              <span className="text-primary-container text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <span className="w-4 border-t border-dashed border-primary inline-block"></span>
                Monthly Target
              </span>
            </div>
            <div className="relative h-24 flex items-end justify-between gap-1.5 px-1">
              {/* Dashed goal line at 75% height */}
              <div className="absolute top-1/4 left-0 w-full border-t border-dashed border-primary/40 z-0 pointer-events-none"></div>
              {miniBarHeights.map((h, i) => {
                const isCurrentMonth = i === new Date().getMonth();
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm transition-all hover:bg-primary/50 ${isCurrentMonth ? 'bg-primary-container' : 'bg-surface-container-high'}`}
                    style={{ height: `${h}%` }}
                    title={monthLabels[i]}
                  ></div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-secondary/60 font-bold px-0.5 tabular-nums uppercase tracking-widest">
              <span>Jan</span>
              <span>Jun</span>
              <span>Dec</span>
            </div>
          </div>

          {/* Edit/Done toggle */}
          {isEditing && (
            <button
              onClick={() => setIsEditing(false)}
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold py-3 rounded-lg hover:opacity-90 transition-all active:scale-[0.98]"
            >
              Save Goal
            </button>
          )}
        </section>

        {/* Add New Goal Button */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setIsEditing(true)}
            className="px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-95 shadow-xl shadow-primary/10 hover:opacity-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            {isEditing ? 'Editing Goal...' : 'Edit Goal'}
          </button>
        </div>

      </div>
    </div>
  );
};
