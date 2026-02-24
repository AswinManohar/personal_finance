import React, { useMemo } from 'react';
import { FIREState } from '../types';
import { Card } from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Flame, TrendingUp, Calculator } from 'lucide-react';

interface FIRECalculatorProps {
  state: FIREState;
  setState: React.Dispatch<React.SetStateAction<FIREState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const FIRECalculator: React.FC<FIRECalculatorProps> = ({ state, setState, onSync }) => {
  const handleChange = (field: keyof FIREState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...state,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setState(newState);
    if (onSync) {
      onSync({ fire: newState });
    }
  };

  const { fireNumber, projection, yearsToFire, ageAtFire } = useMemo(() => {
    const fireNumber = state.annualExpenses / (state.withdrawalRate / 100);
    const projection = [];

    let currentBalance = state.currentNetWorth;
    let age = state.currentAge;
    let year = new Date().getFullYear();
    let yearsPassed = 0;
    let reached = false;

    while (yearsPassed < 60) {
      projection.push({
        year,
        age,
        balance: Math.round(currentBalance),
        fireNumber: Math.round(fireNumber),
        isReached: currentBalance >= fireNumber
      });

      if (currentBalance >= fireNumber && !reached) {
        reached = true;
      }

      const growth = currentBalance * (state.annualReturn / 100);
      currentBalance = currentBalance + growth + state.annualSavings;

      age++;
      year++;
      yearsPassed++;
    }

    const reachedIndex = projection.findIndex(p => p.isReached);
    const yearsToFire = reachedIndex !== -1 ? reachedIndex : '> 60';
    const ageAtFire = reachedIndex !== -1 ? state.currentAge + reachedIndex : 'N/A';

    return { fireNumber, projection, yearsToFire, ageAtFire };
  }, [state]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6 lg:col-span-1">
          <div className="flex items-center gap-2 mb-8 border-b border-zinc-200 dark:border-zinc-900 pb-4">
            <Flame className="text-black dark:text-white" size={16} />
            <h3 className="font-bold text-[10px] text-zinc-500 uppercase tracking-widest">FIRE Summary</h3>
          </div>

          <div className="space-y-8">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Target FIRE Number</p>
              <p className="text-4xl font-bold text-black dark:text-white tracking-tighter">€{fireNumber.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mt-2 border border-zinc-200 dark:border-zinc-900 inline-block px-2 py-1">
                {(state.withdrawalRate).toFixed(1)}% withdrawal rate
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 border-t border-zinc-200 dark:border-zinc-900 pt-6">
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Years to FI</p>
                <p className="text-2xl font-bold text-black dark:text-white tracking-tighter">{yearsToFire}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Age at FI</p>
                <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300 tracking-tighter">{ageAtFire}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Input Parameters" className="lg:col-span-2 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Current Age</label>
              <input
                type="number"
                value={state.currentAge}
                onChange={(e) => handleChange('currentAge', e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
              />
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Annual Expenses (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={state.annualExpenses}
                  onChange={(e) => handleChange('annualExpenses', e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Current Net Worth (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={state.currentNetWorth}
                  onChange={(e) => handleChange('currentNetWorth', e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Annual Savings (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={state.annualSavings}
                  onChange={(e) => handleChange('annualSavings', e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Annual Return (%)</label>
              <input
                type="number"
                value={state.annualReturn}
                onChange={(e) => handleChange('annualReturn', e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
              />
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Withdrawal Rate (%)</label>
              <input
                type="number"
                value={state.withdrawalRate}
                step="0.1"
                onChange={(e) => handleChange('withdrawalRate', e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm"
              />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Net Worth Projection" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
        <div className="h-[400px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="age" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fill: '#71717a', fontSize: 10, textAnchor: 'middle' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(value) => `€${(value / 1000000).toFixed(1)}M`} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <Tooltip
                formatter={(value: number) => [`€${value.toLocaleString()}`, 'Net Worth']}
                labelFormatter={(label) => `Age ${label}`}
                contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                cursor={{ stroke: '#52525b', strokeWidth: 1 }}
              />
              <ReferenceLine y={fireNumber} stroke="#71717a" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="balance" stroke="var(--chart-line)" strokeWidth={2} fillOpacity={0.05} fill="var(--chart-line)" name="Net Worth" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Detailed Flow (Spreadsheet View)" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-metric-gradient">
              <tr className="border-b border-zinc-200 dark:border-zinc-900">
                <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-metric-gradient">Year</th>
                <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-metric-gradient">Age</th>
                <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-metric-gradient text-right">Net Worth</th>
                <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-metric-gradient text-right">Growth (approx)</th>
                <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-metric-gradient text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {projection.map((row) => {
                return (
                  <tr key={row.year} className={`group hover:bg-zinc-100 dark:bg-zinc-900/30 transition-colors`}>
                    <td className="py-4 text-zinc-500 text-sm font-bold tracking-tighter">{row.year}</td>
                    <td className="py-4 text-black dark:text-white font-bold tracking-tighter text-sm">{row.age}</td>
                    <td className="py-4 text-black dark:text-white font-bold tracking-tighter text-sm text-right">€{row.balance.toLocaleString()}</td>
                    <td className="py-4 text-zinc-600 dark:text-zinc-400 font-bold tracking-tighter text-sm text-right">
                      {row.age === state.currentAge ? '-' : `+€${(row.balance - (row.balance - state.annualSavings) / (1 + state.annualReturn / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    </td>
                    <td className="py-4 text-right">
                      {row.isReached ? (
                        <span className="inline-block px-2 py-1 text-[9px] font-bold uppercase tracking-widest bg-black dark:bg-white text-white dark:text-black">
                          Target Met
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[9px] font-bold uppercase tracking-widest">Accumulating</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};