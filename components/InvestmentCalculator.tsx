import React, { useMemo } from 'react';
import { InvestmentState, CalculationResult } from '../types';
import { Card } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InvestmentCalculatorProps {
  investment: InvestmentState;
  setInvestment: React.Dispatch<React.SetStateAction<InvestmentState>>;
}

export const InvestmentCalculator: React.FC<InvestmentCalculatorProps> = ({ investment, setInvestment }) => {
  
  const handleChange = (field: keyof InvestmentState, value: string) => {
    const numValue = parseFloat(value);
    setInvestment(prev => ({
      ...prev,
      [field]: isNaN(numValue) ? 0 : numValue
    }));
  };

  const data: CalculationResult[] = useMemo(() => {
    const results: CalculationResult[] = [];
    const months = investment.yearsToGrow * 12;
    const monthlyRate = investment.annualInterestRate / 100 / 12;

    let currentValue = investment.initialPrincipal;
    let totalInvested = investment.initialPrincipal;

    for (let i = 0; i <= months; i++) {
      if (i % 12 === 0) { // Push data point every year
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
        <Card title="Investment Parameters">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Initial Principal (€)</label>
              <input
                type="number"
                value={investment.initialPrincipal}
                onChange={(e) => handleChange('initialPrincipal', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Contribution (€)</label>
              <input
                type="number"
                value={investment.monthlyContribution}
                onChange={(e) => handleChange('monthlyContribution', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Annual Interest Rate (%)</label>
              <input
                type="number"
                value={investment.annualInterestRate}
                onChange={(e) => handleChange('annualInterestRate', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Growth Period (Years)</label>
              <input
                type="number"
                value={investment.yearsToGrow}
                onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <input 
                type="range" 
                min="1" 
                max="50" 
                value={investment.yearsToGrow}
                onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                className="w-full mt-2 accent-primary-600"
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="text-center p-2">
            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Projected Total</p>
            <p className="text-3xl font-bold text-white mb-4">€{finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            
            <div className="flex justify-between text-xs text-slate-300 border-t border-slate-700 pt-4">
              <div>
                <p>Principal</p>
                <p className="font-semibold text-white">€{totalPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="text-right">
                <p>Interest</p>
                <p className="font-semibold text-emerald-400">+€{totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="Growth Projection" className="h-full min-h-[400px]">
          <div className="h-[400px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" label={{ value: 'Years', position: 'insideBottomRight', offset: -5 }} />
                <YAxis tickFormatter={(value) => `€${value / 1000}k`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <Tooltip 
                  formatter={(value: number) => [`€${value.toLocaleString()}`, 'Amount']}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Area type="monotone" dataKey="value" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorValue)" name="Total Value" />
                <Area type="monotone" dataKey="invested" stroke="#94a3b8" fillOpacity={1} fill="url(#colorInvested)" name="Principal Invested" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};