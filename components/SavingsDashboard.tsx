
import React, { useMemo, useState } from 'react';
import { NetWorthState, PortfolioAsset, Stock } from '../types';
import { Card } from './ui/Card';
import { ArrowUpRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SavingsDashboardProps {
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  onSync: (overrides?: any) => Promise<void>;
}

const COLORS = ['#FFFFFF', '#A1A1AA', '#52525B', '#27272A'];

export const SavingsDashboard: React.FC<SavingsDashboardProps> = ({
  portfolio, stocks, netWorthData, setNetWorthData, onSync
}) => {
  const [addAmount, setAddAmount] = useState('');

  const stockValue = useMemo(() => stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0), [stocks]);
  const portfolioValue = useMemo(() => portfolio.reduce((sum, p) => sum + p.currentValue, 0), [portfolio]);

  // Total Money Saved = Mutual Funds + Stocks + Gold + Accumulated Monthly Savings
  const totalMoneySaved = portfolioValue + stockValue + netWorthData.goldInvestment + netWorthData.accumulatedSavings;

  const handleSavingsUpdate = (field: 'monthlyRecurringSavings' | 'accumulatedSavings', value: string) => {
    const numValue = parseFloat(value) || 0;
    const newData = { ...netWorthData, [field]: numValue };
    setNetWorthData(newData);
    onSync({ netWorthData: newData });
  };

  const handleQuickAdd = () => {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newData = {
      ...netWorthData,
      accumulatedSavings: netWorthData.accumulatedSavings + amount
    };
    setNetWorthData(newData);
    onSync({ netWorthData: newData });
    setAddAmount('');
  };

  const chartData = [
    { name: 'Mutual Funds', value: portfolioValue },
    { name: 'Stocks', value: stockValue },
    { name: 'Gold Holdings', value: netWorthData.goldInvestment },
    { name: 'Cash Savings', value: netWorthData.accumulatedSavings },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-widest uppercase">Savings Hub</h2>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-2 bg-metric-gradient inline-block px-2 py-1 border border-zinc-200 dark:border-zinc-900">Holistic tracking of all capital and liquid assets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Total Savings Card */}
        <Card className="lg:col-span-2">
          <div className="flex flex-col h-full justify-center">
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">Total Money Saved</p>
            <h3 className="text-5xl md:text-6xl font-bold tracking-tighter">€{totalMoneySaved.toLocaleString()}</h3>

            <div className="grid grid-cols-2 gap-6 pt-8 mt-8 border-t border-zinc-200 dark:border-zinc-900">
              <div>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Market Equity</p>
                <p className="text-xl font-bold">€{(portfolioValue + stockValue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Liquid Assets</p>
                <p className="text-xl font-bold">€{(netWorthData.goldInvestment + netWorthData.accumulatedSavings).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Wealth Distribution Chart */}
        <Card title="Distribution Mix" className="lg:col-span-2">
          <div className="h-[240px] w-full flex items-center">
            <div className="flex-1 h-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => `€${val.toLocaleString()}`}
                      contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0px', color: 'var(--chart-text)' }}
                      itemStyle={{ color: 'var(--chart-text)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-[10px] uppercase tracking-widest">No data recorded</div>
              )}
            </div>
            <div className="w-1/2 space-y-3">
              {chartData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span className="font-bold text-zinc-600 dark:text-zinc-400">{item.name}</span>
                  </div>
                  <span>€{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Savings Management */}
        <Card title="Manage Liquid Cash" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Monthly Recurring Savings</label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-500">€</span>
                  <input
                    type="number"
                    value={netWorthData.monthlyRecurringSavings || ''}
                    onChange={(e) => handleSavingsUpdate('monthlyRecurringSavings', e.target.value)}
                    placeholder="Set target..."
                    className="w-full pl-6 pr-0 py-2 bg-transparent border-b border-zinc-300 dark:border-zinc-800 focus:border-black dark:border-white outline-none font-bold text-lg transition-colors placeholder:text-zinc-800"
                  />
                </div>
                <p className="mt-3 text-[10px] text-zinc-600 uppercase tracking-widest leading-relaxed border border-zinc-200 dark:border-zinc-900 p-2">General cash savings target separate from investments.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Total Accumulated Cash</label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-500">€</span>
                  <input
                    type="number"
                    value={netWorthData.accumulatedSavings || ''}
                    onChange={(e) => handleSavingsUpdate('accumulatedSavings', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-6 pr-0 py-2 bg-transparent border-b border-zinc-300 dark:border-zinc-800 focus:border-black dark:border-white outline-none font-bold text-lg transition-colors placeholder:text-zinc-800"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="border border-zinc-200 dark:border-zinc-900 p-6 flex flex-col justify-center">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-6">Manual Savings Entry</h4>
                <div className="flex gap-4">
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="AMOUNT"
                    className="flex-1 w-full bg-transparent border-b border-zinc-300 dark:border-zinc-800 focus:border-black dark:border-white outline-none font-bold placeholder:text-zinc-800"
                  />
                  <button
                    onClick={handleQuickAdd}
                    className="bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest px-6 py-3 hover:bg-zinc-200 transition-colors shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="border border-zinc-200 dark:border-zinc-900 p-6 flex flex-col justify-center bg-metric-gradient">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-6">12-Month Outlook</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs uppercase tracking-widest">
                    <span className="text-zinc-600">Projected Balance</span>
                    <span className="font-bold">€{(netWorthData.accumulatedSavings + (netWorthData.monthlyRecurringSavings * 12)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs uppercase tracking-widest">
                    <span className="text-zinc-600">Net Growth</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">+€{(netWorthData.monthlyRecurringSavings * 12).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Wealth Breakdown Quick List */}
        <div className="space-y-4">
          <div className="p-6 border border-zinc-200 dark:border-zinc-900 flex items-center justify-between group hover:border-black dark:border-white transition-all cursor-pointer bg-metric-gradient">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-tight mb-2">Mutual Funds</p>
              <p className="text-xl font-bold">€{portfolioValue.toLocaleString()}</p>
            </div>
            <ArrowUpRight strokeWidth={1} className="text-zinc-700 group-hover:text-black dark:hover:text-black dark:text-white transition-colors" />
          </div>

          <div className="p-6 border border-zinc-200 dark:border-zinc-900 flex items-center justify-between group hover:border-black dark:border-white transition-all cursor-pointer bg-metric-gradient">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-tight mb-2">Stock Equity</p>
              <p className="text-xl font-bold">€{stockValue.toLocaleString()}</p>
            </div>
            <ArrowUpRight strokeWidth={1} className="text-zinc-700 group-hover:text-black dark:hover:text-black dark:text-white transition-colors" />
          </div>

          <div className="p-6 border border-zinc-200 dark:border-zinc-900 flex items-center justify-between group hover:border-black dark:border-white transition-all cursor-pointer bg-metric-gradient">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-tight mb-2">Gold Holdings</p>
              <p className="text-xl font-bold">€{netWorthData.goldInvestment.toLocaleString()}</p>
            </div>
            <ArrowUpRight strokeWidth={1} className="text-zinc-700 group-hover:text-black dark:hover:text-black dark:text-white transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
};
