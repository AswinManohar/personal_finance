import React, { useState } from 'react';
import { NetWorthState, Stock, PortfolioAsset, SavingsHistoryRecord } from '../types';
import { Card } from './ui/Card';
import { Wallet, TrendingUp, Landmark, Coins, ArrowRight, ShieldCheck, Info, History, Camera, Check, RefreshCw, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { recordSavingsHistory, getSavingsHistory, deleteHistoryRecord } from '../services/supabaseService';

interface NetWorthProps {
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  currentSavings: number;
  stocks: Stock[];
  portfolio: PortfolioAsset[];
  syncKey?: string;
  history: SavingsHistoryRecord[];
  setHistory: React.Dispatch<React.SetStateAction<SavingsHistoryRecord[]>>;
  onSync?: (overrides?: any) => Promise<void>;
}

const COLORS = ['#0ea5e9', '#6366f1', '#f59e0b', '#10b981', '#ef4444'];

export const NetWorth: React.FC<NetWorthProps> = ({
  netWorthData, setNetWorthData, currentSavings, stocks, portfolio, syncKey, history, setHistory, onSync
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const stockValue = stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0);
  const portfolioValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);

  const totalAssets = currentSavings + stockValue + portfolioValue + netWorthData.goldInvestment;
  const netWorth = totalAssets - netWorthData.remainingLoan;

  const handleValueChange = (field: keyof NetWorthState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...netWorthData,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setNetWorthData(newState);
    if (onSync) {
      onSync({ netWorthData: newState });
    }
  };

  const handleRecordSnapshot = async () => {
    if (!syncKey) return;
    setIsRecording(true);
    try {
      await recordSavingsHistory(syncKey, {
        total_assets: totalAssets,
        total_liabilities: netWorthData.remainingLoan,
        net_worth: netWorth,
        savings_amount: currentSavings,
        investment_amount: portfolioValue,
        gold_amount: netWorthData.goldInvestment,
        stock_amount: stockValue
      });
      const updatedHistory = await getSavingsHistory(syncKey);
      setHistory(updatedHistory);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Failed to record snapshot.");
    } finally {
      setIsRecording(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm("Delete this historical record?")) return;
    try {
      await deleteHistoryRecord(id);
      setHistory(history.filter(h => h.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const debtRatio = totalAssets > 0 ? (netWorthData.remainingLoan / totalAssets) * 100 : 0;
  const timelineData = history.map(h => ({
    date: new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    netWorth: h.net_worth,
    assets: h.total_assets
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><Landmark size={150} /></div>
        <div className="relative z-10 w-full flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="max-w-xl">
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><ShieldCheck size={14} /> Wealth Dashboard</p>
            <h2 className="text-5xl md:text-7xl font-bold mb-6 tracking-tighter text-black dark:text-white">€{netWorth.toLocaleString()}</h2>
            <div className="flex flex-wrap gap-4">
              <div className="border border-zinc-200 dark:border-zinc-900 px-4 py-3 flex items-center gap-3 bg-white dark:bg-black">
                <div className="w-1.5 h-1.5 bg-black dark:bg-white"></div>
                <div><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Total Assets</p><p className="text-lg font-bold leading-none text-black dark:text-white">€{totalAssets.toLocaleString()}</p></div>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-900 px-4 py-3 flex items-center gap-3 bg-white dark:bg-black">
                <div className="w-1.5 h-1.5 bg-red-500"></div>
                <div><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Liabilities</p><p className="text-lg font-bold leading-none text-black dark:text-white">€{netWorthData.remainingLoan.toLocaleString()}</p></div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
            <button onClick={handleRecordSnapshot} disabled={isRecording} className={`flex items-center justify-center gap-3 px-8 py-4 text-[10px] uppercase tracking-widest font-bold transition-all ${showSuccess ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-transparent border border-black dark:border-white text-black dark:text-white hover:bg-black dark:bg-white hover:text-black dark:hover:text-white dark:text-black'}`}>
              {isRecording ? <RefreshCw size={16} className="animate-spin" /> : showSuccess ? <Check size={16} /> : <Camera size={16} />}
              {showSuccess ? 'Progress Saved!' : 'Track Progress Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card title="Wealth Inputs">
            <div className="space-y-6">
              <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Coins size={14} /> Physical Gold (€)</label>
                <input type="number" value={netWorthData.goldInvestment || ''} onChange={(e) => handleValueChange('goldInvestment', e.target.value)} placeholder="0.00" className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-lg placeholder:text-zinc-800" />
              </div>
              <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Landmark size={14} /> Loan Amount (€)</label>
                <input type="number" value={netWorthData.remainingLoan || ''} onChange={(e) => handleValueChange('remainingLoan', e.target.value)} placeholder="0.00" className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-lg placeholder:text-zinc-800" />
              </div>
              <div className="p-4 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient mt-8">
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Debt-to-Asset Ratio</span><span className={`text-[10px] font-bold tracking-widest ${debtRatio > 40 ? 'text-red-500' : 'text-black dark:text-white'}`}>{debtRatio.toFixed(1)}%</span></div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-900 h-1"><div className={`h-full transition-all duration-700 ${debtRatio > 40 ? 'bg-red-500' : 'bg-black dark:bg-white'}`} style={{ width: `${Math.min(100, debtRatio)}%` }}></div></div>
              </div>
            </div>
          </Card>
        </div>
        <div className="lg:col-span-2">
          {timelineData.length > 1 ? (
            <Card title="Growth History" className="h-full">
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      formatter={(val: number) => [`€${val.toLocaleString()}`, 'Value']}
                      cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                    />
                    <Area type="monotone" dataKey="netWorth" stroke="var(--chart-line)" strokeWidth={2} fill="var(--chart-line)" fillOpacity={0.05} name="Net Worth" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card title="Growth History" className="h-full"><div className="py-12 h-full flex flex-col items-center justify-center text-center border border-dashed border-zinc-200 dark:border-zinc-900 bg-metric-gradient"><div className="p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 text-zinc-500 mb-4"><History size={24} /></div><p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest max-w-xs mt-2">Record current snapshot to visualize baseline.</p></div></Card>
          )}
        </div>
      </div>
    </div>
  );
};