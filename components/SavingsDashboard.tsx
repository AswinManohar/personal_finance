
import React, { useMemo, useState } from 'react';
import { NetWorthState, PortfolioAsset, Stock } from '../types';
import { Card } from './ui/Card';
import { Coins, TrendingUp, Briefcase, BarChart4, Wallet, ArrowUpRight, Calculator, PiggyBank, Plus, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SavingsDashboardProps {
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  onSync: (overrides?: any) => Promise<void>;
}

const COLORS = ['#0ea5e9', '#6366f1', '#f59e0b', '#10b981'];

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Savings Hub</h2>
          <p className="text-slate-500 font-medium">Holistic tracking of all capital and liquid assets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Total Savings Card */}
        <Card className="lg:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-8 relative overflow-hidden border-none shadow-2xl shadow-indigo-200">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none rotate-12">
            <PiggyBank size={140} />
          </div>
          <div className="relative z-10">
            <p className="text-indigo-100 text-sm font-bold uppercase tracking-widest mb-2">Total Money Saved</p>
            <h3 className="text-5xl md:text-6xl font-black mb-6">€{totalMoneySaved.toLocaleString()}</h3>
            
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/10">
              <div>
                <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">Market Equity</p>
                <p className="text-xl font-bold">€{(portfolioValue + stockValue).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">Liquid Assets</p>
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
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: number) => `€${val.toLocaleString()}`}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-300 italic text-sm">No data recorded</div>
              )}
            </div>
            <div className="w-1/2 space-y-2">
              {chartData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span className="font-bold text-slate-600">{item.name}</span>
                  </div>
                  <span className="font-mono text-slate-900">€{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Savings Management */}
        <Card title="Manage Liquid Cash" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={18} /></div>
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">Monthly Recurring Savings</label>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">€</span>
                  <input
                    type="number"
                    value={netWorthData.monthlyRecurringSavings || ''}
                    onChange={(e) => handleSavingsUpdate('monthlyRecurringSavings', e.target.value)}
                    placeholder="Set monthly target..."
                    className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-2xl"
                  />
                </div>
                <p className="mt-2 text-[10px] text-slate-400 font-medium tracking-tight">General cash savings target separate from investments.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Coins size={18} /></div>
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">Total Accumulated Cash</label>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">€</span>
                  <input
                    type="number"
                    value={netWorthData.accumulatedSavings || ''}
                    onChange={(e) => handleSavingsUpdate('accumulatedSavings', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-black text-2xl"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 shadow-inner overflow-hidden">
                <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Plus size={18} className="text-indigo-600" /> Manual Savings Entry
                </h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Amt"
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                  <button 
                    onClick={handleQuickAdd}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-bold shadow-md transition-all active:scale-95 shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="bg-primary-50 rounded-2xl p-6 border border-primary-100 flex flex-col justify-center">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm"><Calculator className="text-primary-600" /></div>
                    <h4 className="font-bold text-slate-900">12-Month Outlook</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Projected Balance</span>
                      <span className="font-bold text-slate-900">€{(netWorthData.accumulatedSavings + (netWorthData.monthlyRecurringSavings * 12)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Net Growth</span>
                      <span className="font-bold text-emerald-600">+€{(netWorthData.monthlyRecurringSavings * 12).toLocaleString()}</span>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Wealth Breakdown Quick List */}
        <div className="space-y-4">
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-300 transition-all">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-100 transition-colors"><Briefcase size={20} /></div>
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Mutual Funds</p>
                    <p className="text-xl font-black text-slate-900">€{portfolioValue.toLocaleString()}</p>
                 </div>
              </div>
              <ArrowUpRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
           </div>
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-100 transition-colors"><BarChart4 size={20} /></div>
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Stock Equity</p>
                    <p className="text-xl font-black text-slate-900">€{stockValue.toLocaleString()}</p>
                 </div>
              </div>
              <ArrowUpRight className="text-slate-300 group-hover:text-blue-500 transition-colors" />
           </div>
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-yellow-400 transition-all">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl group-hover:bg-yellow-100 transition-colors"><Coins size={20} /></div>
                 <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Gold Holdings</p>
                    <p className="text-xl font-black text-slate-900">€{netWorthData.goldInvestment.toLocaleString()}</p>
                 </div>
              </div>
              <ArrowUpRight className="text-slate-300 group-hover:text-yellow-600 transition-colors" />
           </div>
        </div>
      </div>
    </div>
  );
};
