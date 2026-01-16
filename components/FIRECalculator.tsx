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
        <Card className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white lg:col-span-1">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Flame className="text-orange-400" size={24} />
            </div>
            <h3 className="font-semibold text-lg">FIRE Summary</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <p className="text-indigo-200 text-sm font-medium uppercase tracking-wide">Target FIRE Number</p>
              <p className="text-3xl font-bold text-white mt-1">€{fireNumber.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-indigo-300 mt-1">
                Based on {(state.withdrawalRate).toFixed(1)}% withdrawal rate
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-indigo-500/30 pt-4">
              <div>
                <p className="text-indigo-200 text-sm">Years to FI</p>
                <p className="text-2xl font-bold text-white">{yearsToFire}</p>
              </div>
              <div>
                <p className="text-indigo-200 text-sm">Age at FI</p>
                <p className="text-2xl font-bold text-emerald-400">{ageAtFire}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Input Parameters" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current Age</label>
              <input
                type="number"
                value={state.currentAge}
                onChange={(e) => handleChange('currentAge', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Annual Expenses (€)</label>
              <input
                type="number"
                value={state.annualExpenses}
                onChange={(e) => handleChange('annualExpenses', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current Net Worth (€)</label>
              <input
                type="number"
                value={state.currentNetWorth}
                onChange={(e) => handleChange('currentNetWorth', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Annual Savings (€)</label>
              <input
                type="number"
                value={state.annualSavings}
                onChange={(e) => handleChange('annualSavings', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Annual Return (%)</label>
              <input
                type="number"
                value={state.annualReturn}
                onChange={(e) => handleChange('annualReturn', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Withdrawal Rate (%)</label>
              <input
                type="number"
                value={state.withdrawalRate}
                step="0.1"
                onChange={(e) => handleChange('withdrawalRate', e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Net Worth Projection">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="age" label={{ value: 'Age', position: 'insideBottomRight', offset: -5 }} />
              <YAxis tickFormatter={(value) => `€${(value / 1000000).toFixed(1)}M`} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <Tooltip 
                formatter={(value: number) => [`€${value.toLocaleString()}`, 'Net Worth']}
                labelFormatter={(label) => `Age ${label}`}
              />
              <ReferenceLine y={fireNumber} label="FIRE Target" stroke="#ef4444" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="balance" stroke="#6366f1" fillOpacity={1} fill="url(#colorBalance)" name="Net Worth" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Detailed Projection (Spreadsheet View)">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700">Year</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Age</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Net Worth</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Growth (approx)</th>
                <th className="px-6 py-3 font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projection.map((row) => {
                return (
                  <tr key={row.year} className={`hover:bg-slate-50 transition-colors ${row.isReached ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-6 py-3 text-slate-600">{row.year}</td>
                    <td className="px-6 py-3 text-slate-900 font-medium">{row.age}</td>
                    <td className="px-6 py-3 text-slate-900 font-medium">€{row.balance.toLocaleString()}</td>
                    <td className="px-6 py-3 text-slate-500">
                       {row.age === state.currentAge ? '-' : `+€${(row.balance - (row.balance - state.annualSavings) / (1 + state.annualReturn/100)).toLocaleString(undefined, {maximumFractionDigits: 0})}`}
                    </td>
                    <td className="px-6 py-3">
                      {row.isReached ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          FIRE Achieved
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Accumulating</span>
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