import React, { useState } from 'react';
import { Card } from './ui/Card';
import {
  Download, Upload, Database, CheckCircle, RefreshCw, AlertCircle, Cloud,
  LogOut, History, CloudOff, Key, Copy, Check, WifiOff
} from 'lucide-react';
import { Expense, PortfolioAsset, Stock, ExpenseCategory, IncomeState, InvestmentState, SavingsGoal, FIREState, NetWorthState, InvestmentFrequency, AssetType } from '../types';
import { pushToCloud, pullFromCloud, isNetworkError } from '../services/supabaseService';

interface DataManagementProps {
  expenses: Expense[];
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  income: IncomeState;
  investment: InvestmentState;
  goal: SavingsGoal;
  fire: FIREState;
  netWorthData: NetWorthState;
  uniqueSyncId: string | null;
  lastSyncedAt: string | null;
  setExpenses: (data: Expense[]) => void;
  setPortfolio: (data: PortfolioAsset[]) => void;
  setStocks: (data: Stock[]) => void;
  setIncome: (data: IncomeState) => void;
  setInvestment: (data: InvestmentState) => void;
  setGoal: (data: SavingsGoal) => void;
  setFire: (data: FIREState) => void;
  setNetWorthData: (data: NetWorthState) => void;
  onLogout: () => void;
  onRetryPull?: () => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  expenses, portfolio, stocks, income, investment, goal, fire, netWorthData,
  uniqueSyncId, lastSyncedAt,
  setExpenses, setPortfolio, setStocks, setIncome, setInvestment, setGoal, setFire, setNetWorthData,
  onLogout, onRetryPull
}) => {
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info' | 'offline', text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const activeSyncKey = uniqueSyncId;

  const handleCloudSyncPush = async () => {
    if (!activeSyncKey) return;
    setIsCloudSyncing(true);
    setStatusMsg(null);

    const payload = {
      expenses, portfolio, stocks, income, investment, goal, fire, netWorthData
    };

    try {
      await pushToCloud(activeSyncKey, payload);
      setStatusMsg({ type: 'success', text: 'Cloud backup updated successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (error: any) {
      if (isNetworkError(error)) {
        setStatusMsg({ type: 'offline', text: 'Cloud Unreachable. Check network or firewall settings.' });
      } else {
        setStatusMsg({ type: 'error', text: typeof error === 'object' ? error.message : String(error) });
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleCloudSyncPull = async () => {
    if (!activeSyncKey) return;
    setIsCloudSyncing(true);
    setStatusMsg(null);

    try {
      const { data } = await pullFromCloud(activeSyncKey);

      if (data.expenses) setExpenses(data.expenses);
      if (data.portfolio) setPortfolio(data.portfolio);
      if (data.stocks) setStocks(data.stocks);
      if (data.income) setIncome(data.income);
      if (data.investment) setInvestment(data.investment);
      if (data.goal) setGoal(data.goal);
      if (data.fire) setFire(data.fire);
      if (data.netWorthData) setNetWorthData(data.netWorthData);

      setStatusMsg({ type: 'success', text: 'Data restored from cloud!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (error: any) {
      if (isNetworkError(error)) {
        setStatusMsg({ type: 'offline', text: 'Could not connect to server. Restored from local only.' });
      } else {
        setStatusMsg({ type: 'error', text: typeof error === 'object' ? error.message : String(error) });
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const copySyncId = () => {
    if (uniqueSyncId) {
      navigator.clipboard.writeText(uniqueSyncId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportCSV = (type: 'expenses' | 'portfolio' | 'stocks') => {
    const downloadCSV = (content: string, filename: string) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (type === 'expenses') {
      const headers = ['Name,Category,Amount,Recurring'];
      const rows = expenses.map(e => `"${e.name}","${e.category}",${e.amount},${e.isRecurring}`);
      downloadCSV([headers, ...rows].join('\n'), 'expenses.csv');
    } else if (type === 'portfolio') {
      const headers = ['Name,Type,Current Value,Monthly Investment,Return %,TER %,Tax Rate %,Frequency'];
      const rows = portfolio.map(p => `"${p.name}","${p.type}",${p.currentValue},${p.monthlyInvestment},${p.expectedReturn},${p.expenseRatio},${p.taxRate},"${p.frequency}"`);
      downloadCSV([headers, ...rows].join('\n'), 'portfolio.csv');
    } else if (type === 'stocks') {
      const headers = ['Symbol,Quantity,Buy Price,Frequency'];
      const rows = stocks.map(s => `"${s.symbol}",${s.quantity},${s.buyPrice},"${s.frequency}"`);
      downloadCSV([headers, ...rows].join('\n'), 'stocks.csv');
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'expenses' | 'portfolio' | 'stocks') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split('\n');
      const dataRows = lines.slice(1).filter(line => line.trim() !== '');
      if (type === 'expenses') {
        const parsed: Expense[] = dataRows.map(row => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: crypto.randomUUID(),
            name: parts[0]?.replace(/"/g, '') || 'Imported',
            category: (parts[1]?.replace(/"/g, '') || 'Other') as ExpenseCategory,
            amount: parseFloat(parts[2]) || 0,
            isRecurring: parts[3]?.toLowerCase() === 'true',
            date: new Date().toISOString().split('T')[0]
          };
        });
        setExpenses(parsed);
      } else if (type === 'portfolio') {
        const parsed: PortfolioAsset[] = dataRows.map(row => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: crypto.randomUUID(),
            name: parts[0]?.replace(/"/g, '') || 'Imported',
            type: (parts[1]?.replace(/"/g, '') || 'OTHER') as AssetType,
            currentValue: parseFloat(parts[2]) || 0,
            monthlyInvestment: parseFloat(parts[3]) || 0,
            expectedReturn: parseFloat(parts[4]) || 0,
            expenseRatio: parseFloat(parts[5]) || 0,
            taxRate: parseFloat(parts[6]) || 0,
            frequency: (parts[7]?.replace(/"/g, '') || 'Monthly') as InvestmentFrequency
          };
        });
        setPortfolio(parsed);
      } else if (type === 'stocks') {
        const parsed: Stock[] = dataRows.map(row => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: crypto.randomUUID(),
            symbol: parts[0]?.replace(/"/g, '') || 'UNKNOWN',
            quantity: parseFloat(parts[1]) || 0,
            buyPrice: parseFloat(parts[2]) || 0,
            frequency: (parts[3]?.replace(/"/g, '') || 'One-time') as InvestmentFrequency
          };
        });
        setStocks(parsed);
      }
      setStatusMsg({ type: 'success', text: `Imported ${type} successfully.` });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8 border-b border-zinc-200 dark:border-zinc-900 pb-6">
        <div className="p-3 bg-black dark:bg-white text-white dark:text-black">
          <Database size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-widest">Settings & Account</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{uniqueSyncId ? 'Connected via Unique Sync ID' : 'Local Sandbox Mode'}</p>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 border text-[10px] font-bold uppercase tracking-widest flex items-center justify-between transition-all ${statusMsg.type === 'success' ? 'bg-metric-gradient border-black dark:border-white text-black dark:text-white' : statusMsg.type === 'offline' ? 'bg-metric-gradient border-zinc-500 text-zinc-600 dark:text-zinc-400' : 'bg-red-950 border-red-500 text-red-500'}`}>
          <div className="flex items-center gap-3">
            {statusMsg.type === 'success' ? <CheckCircle size={14} /> : statusMsg.type === 'offline' ? <WifiOff size={14} /> : <AlertCircle size={14} />}
            {statusMsg.text}
          </div>
          {statusMsg.type === 'offline' && onRetryPull && (
            <button onClick={onRetryPull} className="text-black dark:text-white hover:text-zinc-700 dark:text-zinc-300 font-bold flex items-center gap-2 border-b border-black dark:border-white pb-0.5 transition-colors">
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
      )}

      {/* Account Profile Card */}
      <Card className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-6 w-full md:w-auto">
            <div className={`w-14 h-14 border ${uniqueSyncId ? 'border-black dark:border-white text-black dark:text-white' : 'border-zinc-700 text-zinc-600'} flex items-center justify-center overflow-hidden`}>
              {uniqueSyncId ? <Key size={24} /> : <CloudOff size={24} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-black dark:text-white uppercase tracking-widest">{uniqueSyncId ? 'Sync ID Active' : 'Guest User'}</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{uniqueSyncId ? 'Private Cloud Sync Enabled' : 'No cloud session'}</p>
              <div className="flex items-center gap-2 mt-2">
                {uniqueSyncId ? (
                  <span className="inline-flex items-center px-2 py-1 bg-black dark:bg-white text-white dark:text-black text-[9px] font-bold uppercase tracking-widest">Unique Sync ID</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 border border-zinc-300 dark:border-zinc-800 text-zinc-600 text-[9px] font-bold uppercase tracking-widest">Local Mode</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full md:w-auto flex items-center justify-center gap-2 text-red-500 font-bold text-[10px] uppercase tracking-widest border border-red-900/50 hover:bg-red-950/30 px-6 py-3 transition-colors">
            <LogOut size={14} /> {uniqueSyncId ? 'Exit Session' : 'Exit Guest'}
          </button>
        </div>

        {uniqueSyncId && (
          <div className="mt-8 p-6 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 relative group">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Your Unique Sync ID</span>
              <button onClick={copySyncId} className="text-black dark:text-white hover:text-zinc-600 dark:text-zinc-400 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest transition-colors">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy ID'}
              </button>
            </div>
            <p className="font-mono text-sm md:text-base font-bold text-black dark:text-white select-all break-all tracking-tighter">{uniqueSyncId}</p>
            <p className="text-[9px] text-zinc-600 mt-4 uppercase tracking-widest">* Use this ID on other devices to restore dashboard.</p>
          </div>
        )}
      </Card>

      {/* Cloud Sync Status */}
      <Card className={`p-6 border ${activeSyncKey ? 'border-zinc-700 bg-metric-gradient' : 'border-zinc-200 dark:border-zinc-900 bg-metric-gradient/50 grayscale opacity-75'}`}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className={`p-4 border ${activeSyncKey ? (isCloudSyncing ? 'border-black dark:border-white text-black dark:text-white animate-pulse' : 'border-zinc-500 text-black dark:text-white') : 'border-zinc-300 dark:border-zinc-800 text-zinc-700'}`}>
              {activeSyncKey ? <Cloud size={24} /> : <CloudOff size={24} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-black dark:text-white uppercase tracking-widest leading-none">Cloud Link</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
                {!activeSyncKey ? 'Enter a Sync ID to enable cloud backup.' : (lastSyncedAt ? `Last active: ${lastSyncedAt}` : 'Securely connected to cloud.')}
              </p>
            </div>
          </div>
          {activeSyncKey && (
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <button
                onClick={handleCloudSyncPush}
                disabled={isCloudSyncing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-black dark:bg-white text-white dark:text-black px-8 py-4 hover:bg-zinc-200 disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                {isCloudSyncing ? <RefreshCw className="animate-spin" size={14} /> : <Upload size={14} />}
                Sync Portfolio
              </button>
              <button
                onClick={handleCloudSyncPull}
                disabled={isCloudSyncing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-transparent text-black dark:text-white border border-zinc-700 px-8 py-4 hover:bg-zinc-100 dark:bg-zinc-900 hover:border-black dark:border-white disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <History size={14} />
                Reload Data
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Expenses (CSV)" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="flex gap-4 mt-4">
            <button onClick={() => exportCSV('expenses')} className="flex-1 flex items-center justify-center gap-2 bg-transparent text-black dark:text-white border border-zinc-300 dark:border-zinc-800 py-3 hover:border-black dark:border-white text-[10px] font-bold uppercase tracking-widest transition-colors">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-zinc-200">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'expenses')} />
            </label>
          </div>
        </Card>
        <Card title="Portfolio (CSV)" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="flex gap-4 mt-4">
            <button onClick={() => exportCSV('portfolio')} className="flex-1 flex items-center justify-center gap-2 bg-transparent text-black dark:text-white border border-zinc-300 dark:border-zinc-800 py-3 hover:border-black dark:border-white text-[10px] font-bold uppercase tracking-widest transition-colors">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-zinc-200">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'portfolio')} />
            </label>
          </div>
        </Card>
        <Card title="Stocks (CSV)" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6">
          <div className="flex gap-4 mt-4">
            <button onClick={() => exportCSV('stocks')} className="flex-1 flex items-center justify-center gap-2 bg-transparent text-black dark:text-white border border-zinc-300 dark:border-zinc-800 py-3 hover:border-black dark:border-white text-[10px] font-bold uppercase tracking-widest transition-colors">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-zinc-200">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'stocks')} />
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
};