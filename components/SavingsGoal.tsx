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
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Reach Your Goals</h2>
        <p className="text-slate-500">Calculate exactly how much you need to save to achieve your dreams.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card title="Goal Details">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Amount (€)</label>
              <div className="relative">
                <Target className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="number"
                  value={goal.targetAmount}
                  onChange={(e) => handleChange('targetAmount', parseFloat(e.target.value) || 0)}
                  className="w-full pl-10 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Already Saved (€)</label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="number"
                  value={goal.currentSavings}
                  onChange={(e) => handleChange('currentSavings', parseFloat(e.target.value) || 0)}
                  className="w-full pl-10 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="date"
                  value={goal.targetDate}
                  onChange={(e) => handleChange('targetDate', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-primary-50 border-primary-100 flex flex-col justify-center items-center text-center p-8">
          {result && result.monthsLeft > 0 ? (
            <>
              <p className="text-slate-600 font-medium mb-2">To reach your goal in {result.monthsLeft} months</p>
              <div className="text-5xl font-bold text-primary-600 mb-2">
                €{result.monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-slate-500 text-sm">per month</p>
              
              <div className="mt-8 w-full bg-white rounded-lg p-4 shadow-sm border border-primary-100">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Progress</span>
                  <span className="font-semibold text-primary-700">
                    {Math.min(100, (goal.currentSavings / goal.targetAmount) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div 
                    className="bg-primary-500 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (goal.currentSavings / goal.targetAmount) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </>
          ) : (
             <div className="text-slate-400">
               <p>Enter your goal details to calculate your savings plan.</p>
             </div>
          )}
        </Card>
      </div>
    </div>
  );
};