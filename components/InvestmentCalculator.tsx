import React, { useMemo } from 'react';
import { InvestmentState, CalculationResult } from '../types';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InvestmentCalculatorProps {
  investment: InvestmentState;
  setInvestment: React.Dispatch<React.SetStateAction<InvestmentState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const InvestmentCalculator: React.FC<InvestmentCalculatorProps> = ({
  investment,
  setInvestment,
  onSync,
}) => {
  const handleChange = (field: keyof InvestmentState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...investment,
      [field]: isNaN(numValue) ? 0 : numValue,
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
          invested: parseFloat(totalInvested.toFixed(2)),
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

  const inputCls =
    'w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg p-3 text-on-surface outline-none transition-all text-sm';
  const labelCls = 'block text-xs font-bold tracking-widest uppercase text-secondary mb-1.5';

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-on-surface tracking-tight">Investment Calculator</h1>
        <p className="text-secondary text-sm mt-1">
          Project compounded growth over time with a principal and recurring contributions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Inputs (35%) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
            <h2 className="text-xs font-bold tracking-widest uppercase text-secondary mb-5">
              Investment Parameters
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Initial Principal (€)</label>
                <input
                  type="number"
                  value={investment.initialPrincipal}
                  onChange={(e) => handleChange('initialPrincipal', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Monthly Contribution (€)</label>
                <input
                  type="number"
                  value={investment.monthlyContribution}
                  onChange={(e) => handleChange('monthlyContribution', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Annual Interest Rate (%)</label>
                <input
                  type="number"
                  value={investment.annualInterestRate}
                  onChange={(e) => handleChange('annualInterestRate', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Growth Period — <span className="text-primary">{investment.yearsToGrow} yrs</span>
                </label>
                <input
                  type="number"
                  value={investment.yearsToGrow}
                  onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                  className={`${inputCls} mb-2`}
                />
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={investment.yearsToGrow}
                  onChange={(e) => handleChange('yearsToGrow', e.target.value)}
                  className="w-full accent-primary mt-1"
                />
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
              <p className="text-xs font-bold tracking-widest uppercase text-secondary mb-1">Final Value</p>
              <p className="text-3xl font-bold text-on-surface tabular-nums tracking-tighter">
                €{finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
                <p className="text-xs font-bold tracking-widest uppercase text-secondary mb-1">Total Contributed</p>
                <p className="text-xl font-bold text-on-surface tabular-nums">
                  €{totalPrincipal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
                <p className="text-xs font-bold tracking-widest uppercase text-secondary mb-1">Interest Earned</p>
                <p className="text-xl font-bold text-[#3DD68C] tabular-nums">
                  +€{totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chart (65%) */}
        <div className="lg:col-span-3">
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 h-full min-h-[480px] flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp size={16} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-on-surface">Growth Projection</h2>
                <p className="text-xs text-secondary">Compound interest over {investment.yearsToGrow} years</p>
              </div>
              <div className="ml-auto flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-primary inline-block rounded" />
                  <span className="text-secondary">Total Value</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-outline-variant inline-block rounded" />
                  <span className="text-secondary">Invested</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="calcValueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c1c1ff" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#c1c1ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="calcInvestedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#464554" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#464554" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    label={{ value: 'Years', position: 'insideBottomRight', offset: -5, fill: '#ccc5c0', fontSize: 11 }}
                    tick={{ fill: '#ccc5c0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#ccc5c0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#464554"
                    strokeOpacity={0.15}
                    vertical={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1f1f24', border: '1px solid #464554', borderRadius: 8 }}
                    labelStyle={{ color: '#c7c4d7', fontSize: 11 }}
                    itemStyle={{ color: '#e3e2e7' }}
                    formatter={(value: number) => [`€${value.toLocaleString()}`, '']}
                    labelFormatter={(l) => `Year ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="invested"
                    stroke="#464554"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#calcInvestedGrad)"
                    name="Principal Invested"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#c1c1ff"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#calcValueGrad)"
                    name="Total Value"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
