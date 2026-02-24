import React, { useState, useEffect } from 'react';
import { SavingsGoal as SavingsGoalType } from '../types';
import { Card } from './ui/Card';
import { Target, Calendar, TrendingUp } from 'lucide-react';

interface SavingsGoalProps {
  goal: SavingsGoalType;
  setGoal: React.Dispatch<React.SetStateAction<SavingsGoalType>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const SavingsGoal: React.FC<SavingsGoalProps> = ({ goal, setGoal, onSync }) => {
  const [result, setResult] = useState<{ monthly: number, monthsLeft: number } | null>(null);

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

      setResult({
        monthly: monthlyNeeded,
        monthsLeft: months
      });
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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-8 border-b border-zinc-200 dark:border-zinc-900 pb-8">
        <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-widest">Reach Your Goals</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">Calculate savings required to achieve targets.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card title="Goal Details">
          <div className="space-y-6">
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">Target Amount (€)</label>
              <div className="relative">
                <Target className="absolute left-0 top-2.5 text-zinc-600" size={14} />
                <input
                  type="number"
                  value={goal.targetAmount}
                  onChange={(e) => handleChange('targetAmount', parseFloat(e.target.value) || 0)}
                  className="w-full pl-6 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800"
                />
              </div>
            </div>

            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">Already Saved (€)</label>
              <div className="relative">
                <TrendingUp className="absolute left-0 top-2.5 text-zinc-600" size={14} />
                <input
                  type="number"
                  value={goal.currentSavings}
                  onChange={(e) => handleChange('currentSavings', parseFloat(e.target.value) || 0)}
                  className="w-full pl-6 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800"
                />
              </div>
            </div>

            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">Target Date</label>
              <div className="relative">
                <Calendar className="absolute left-0 top-2.5 text-zinc-600" size={14} />
                <input
                  type="date"
                  value={goal.targetDate}
                  onChange={(e) => handleChange('targetDate', e.target.value)}
                  className="w-full pl-6 pr-0 py-2 bg-transparent text-zinc-700 dark:text-zinc-300 font-bold outline-none uppercase tracking-widest text-xs"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-center items-center text-center p-8 min-h-[300px]">
          {result && result.monthsLeft > 0 ? (
            <>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">To reach your goal in {result.monthsLeft} months</p>
              <div className="text-5xl font-bold text-black dark:text-white mb-2 tracking-tighter">
                €{result.monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">per month</p>

              <div className="mt-8 w-full border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Progress</span>
                  <span className="text-[10px] font-bold text-black dark:text-white tracking-widest">
                    {Math.min(100, (goal.currentSavings / goal.targetAmount) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-900 h-1">
                  <div
                    className="bg-black dark:bg-white h-1 transition-all duration-500"
                    style={{ width: `${Math.min(100, (goal.currentSavings / goal.targetAmount) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-zinc-600 flex flex-col items-center">
              <Target size={32} className="opacity-20 mb-4" />
              <p className="text-[10px] font-bold uppercase tracking-widest max-w-[200px]">Enter goal details to calculate savings plan.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};