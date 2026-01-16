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
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="bg-gradient-to-r from-slate-900 via-primary-900 to-indigo-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Landmark size={150} /></div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="max-w-xl">
              <p className="text-primary-200 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><ShieldCheck size={16} /> Wealth Dashboard</p>
              <h2 className="text-5xl md:text-7xl font-black mb-4 tracking-tight">€{netWorth.toLocaleString()}</h2>
              <div className="flex flex-wrap gap-3">
                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                   <div><p className="text-[10px] text-primary-200 font-bold uppercase">Total Assets</p><p className="text-lg font-bold leading-none">€{totalAssets.toLocaleString()}</p></div>
                </div>
                <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-red-400"></div>
                   <div><p className="text-[10px] text-red-200 font-bold uppercase">Liabilities</p><p className="text-lg font-bold leading-none">€{netWorthData.remainingLoan.toLocaleString()}</p></div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto">
               <button onClick={handleRecordSnapshot} disabled={isRecording} className={`flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95 ${showSuccess ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900 hover:bg-primary-50'}`}>
                  {isRecording ? <RefreshCw size={20} className="animate-spin" /> : showSuccess ? <Check size={20} /> : <Camera size={20} />}
                  {showSuccess ? 'Progress Saved!' : 'Track Progress Now'}
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card title="Wealth Inputs">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Coins size={16} className="text-yellow-500" /> Physical Gold Value (€)</label>
                <input type="number" value={netWorthData.goldInvestment || ''} onChange={(e) => handleValueChange('goldInvestment', e.target.value)} placeholder="e.g. 5000" className="w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Landmark size={16} className="text-red-500" /> Remaining Loan Amount (€)</label>
                <input type="number" value={netWorthData.remainingLoan || ''} onChange={(e) => handleValueChange('remainingLoan', e.target.value)} placeholder="e.g. 15000" className="w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all" />
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                <div className="flex justify-between items-center mb-2"><span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Debt-to-Asset Ratio</span><span className={`text-xs font-black ${debtRatio > 40 ? 'text-red-600' : 'text-emerald-600'}`}>{debtRatio.toFixed(1)}%</span></div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div className={`h-full transition-all duration-700 ${debtRatio > 40 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, debtRatio)}%` }}></div></div>
              </div>
            </div>
          </Card>
        </div>
        <div className="lg:col-span-2 space-y-8">
          {timelineData.length > 1 ? (
            <Card title="Growth History">
               <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} formatter={(val: number) => [`€${val.toLocaleString()}`, 'Value']} />
                      <Area type="monotone" dataKey="netWorth" stroke="#0ea5e9" strokeWidth={4} fill="#0ea5e9" fillOpacity={0.1} name="Net Worth" />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </Card>
          ) : (
            <Card title="Growth History"><div className="py-12 flex flex-col items-center justify-center text-center"><div className="p-4 bg-primary-50 text-primary-400 rounded-full mb-4"><History size={32} /></div><h4 className="font-bold text-slate-800">Start Your Timeline</h4><p className="text-slate-500 text-sm max-w-xs mt-2">Record your current status to see how your wealth grows.</p></div></Card>
          )}
        </div>
      </div>
    </div>
  );
};