import React, { useMemo } from 'react';
import { InvestmentState, CalculationResult } from '../types';
import { Card } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InvestmentCalculatorProps {
  investment: InvestmentState;
  setInvestment: React.Dispatch<React.SetStateAction<InvestmentState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const InvestmentCalculator: React.FC<InvestmentCalculatorProps> = ({ investment, setInvestment, onSync }) => {

  const handleChange = (field: keyof InvestmentState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...investment,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setInvestment(newState);
    if (onSync) {
      onSync({ investment: newState });
    }
  };

  const data: CalculationResult[] = useMemo(() => {
    const results: CalculationResult[] = [];
    const months = investment.yearsToGrow * 12;
    const monthlyRate = investment.annualInterestRate / 100 / 12;

    let currentValue = investment.initialPrincipal;
    let totalInvested = investment.initialPrincipal;

    for (let i = 0; i <= months; i++) {
      if (i % 12 === 0) {
        results.push({
          month: i / 12,
          value: parseFloat(currentValue.toFixed(2)),
          invested: parseFloat(totalInvested.toFixed(2))
        });
      }

      if (i < months) {
        currentValue = (currentValue + investment.monthlyContribution) * (1 + monthlyRate);
        totalInvested += investment.monthlyContribution;
      }
    }
    return results;
  }, [investment]);

  const finalAmount = data[data.length - 1].value;
  const totalPrincipal = data[data.length - 1].invested;
  const totalInterest = finalAmount - totalPrincipal;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Card title="Investment Parameters" className="border border-zinc-200 dark:border-zinc-900 p-6">
          <div className="space-y-6">
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Initial Principal (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={investment.initialPrincipal}
                  onChange={(e) => handleChange('initialPrincipal', e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Monthly Contribution (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={investment.monthlyContribution}
                  onChange={(e) => handleChange('monthlyContribution', e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Annual Interest Rate (%)</label>
              <input
                type="number"
                value={investment.annualInterestRate}
                onChange={(e) => handleChange('annualInterestRate', e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
              />
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors pb-4">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Growth Period (Years)</label>
              <div className="flex items-center justify-between mt-2">
                <input
                  type="number"
                  value={investment.yearsToGrow}
                  min="1"
                  max="50"
                  onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                  className="w-16 py-1 bg-transparent text-black dark:text-white font-bold outline-none border border-zinc-200 dark:border-zinc-900 text-center text-sm"
                />
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={investment.yearsToGrow}
                  onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                  className="flex-1 ml-4 accent-white h-1 bg-zinc-800 appearance-none"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="text-center">
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Projected Total</p>
            <p className="text-4xl font-bold text-black dark:text-white mb-6 tracking-tighter">€{finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>

            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest border-t border-zinc-200 dark:border-zinc-900 pt-4">
              <div className="text-left">
                <p className="text-zinc-600 mb-1">Principal</p>
                <p className="text-black dark:text-white">€{totalPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-600 mb-1">Interest</p>
                <p className="text-zinc-700 dark:text-zinc-300 tracking-tighter text-xs">+€{totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="Growth Projection" className="h-full border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} label={{ value: 'Years', position: 'insideBottomRight', offset: -5, fill: '#71717a', fontSize: 10, textAnchor: 'middle' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(value) => `€${value / 1000}k`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <Tooltip
                  formatter={(value: number) => [`€${value.toLocaleString()}`, 'Amount']}
                  labelFormatter={(label) => `Year ${label}`}
                  contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--chart-line)" strokeWidth={2} fillOpacity={0.05} fill="var(--chart-line)" name="Total Value" />
                <Area type="monotone" dataKey="invested" stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" fillOpacity={0} name="Principal Invested" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};