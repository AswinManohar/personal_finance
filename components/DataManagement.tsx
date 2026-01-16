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
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-primary-100 text-primary-700 rounded-xl">
          <Database size={24} />
        </div>
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Settings & Account</h2>
           <p className="text-slate-500">{uniqueSyncId ? 'Connected via Unique Sync ID' : 'Local Sandbox Mode'}</p>
        </div>
      </div>

      {statusMsg && (
          <div className={`p-4 rounded-xl text-sm flex items-center justify-between transition-all ${statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : statusMsg.type === 'offline' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
              <div className="flex items-center gap-3">
                {statusMsg.type === 'success' ? <CheckCircle size={18} /> : statusMsg.type === 'offline' ? <WifiOff size={18} /> : <AlertCircle size={18} />}
                {statusMsg.text}
              </div>
              {statusMsg.type === 'offline' && onRetryPull && (
                <button onClick={onRetryPull} className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1">
                  <RefreshCw size={14} /> Retry
                </button>
              )}
          </div>
      )}

      {/* Account Profile Card */}
      <Card className="bg-white border-slate-200">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
               {uniqueSyncId ? <Key size={32} className="text-indigo-600" /> : <CloudOff size={32} />}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{uniqueSyncId ? 'Sync ID Active' : 'Guest User'}</h3>
              <p className="text-sm text-slate-500">{uniqueSyncId ? 'Private Cloud Sync Enabled' : 'No cloud session'}</p>
              <div className="flex items-center gap-2 mt-1">
                {uniqueSyncId ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-widest">Unique Sync ID</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest">Local Mode</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full md:w-auto flex items-center justify-center gap-2 text-red-600 font-bold text-sm hover:bg-red-50 px-4 py-2 rounded-xl transition-all">
            <LogOut size={18} /> {uniqueSyncId ? 'Exit' : 'Exit Guest'}
          </button>
        </div>
        
        {uniqueSyncId && (
          <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
             <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Unique Sync ID</span>
                <button onClick={copySyncId} className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy ID'}
                </button>
             </div>
             <p className="font-mono text-sm font-bold text-slate-900 select-all tracking-wider break-all">{uniqueSyncId}</p>
             <p className="text-[9px] text-slate-400 mt-2 italic">* Use this ID on other devices to restore your dashboard securely without an email account.</p>
          </div>
        )}
      </Card>

      {/* Cloud Sync Status */}
      <Card className={`bg-white shadow-lg ${activeSyncKey ? 'border-primary-100' : 'border-slate-200 opacity-60 grayscale'}`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${activeSyncKey ? (isCloudSyncing ? 'bg-primary-50 text-primary-600 animate-pulse' : 'bg-emerald-50 text-emerald-600') : 'bg-slate-50 text-slate-400'}`}>
                      {activeSyncKey ? <Cloud size={32} /> : <CloudOff size={32} />}
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-900">Cloud Link</h3>
                      <p className="text-sm text-slate-500">
                        {!activeSyncKey ? 'Enter a Sync ID to enable cloud backup.' : (lastSyncedAt ? `Last active: ${lastSyncedAt}` : 'Securely connected to cloud.')}
                      </p>
                  </div>
              </div>
              {activeSyncKey && (
                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={handleCloudSyncPush}
                        disabled={isCloudSyncing}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl hover:bg-primary-700 disabled:opacity-50 font-bold transition-all shadow-md active:scale-95"
                    >
                        {isCloudSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Upload size={18} />}
                        Sync
                    </button>
                    <button 
                        onClick={handleCloudSyncPull}
                        disabled={isCloudSyncing}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-primary-700 border border-primary-100 px-6 py-3 rounded-xl hover:bg-primary-50 disabled:opacity-50 font-bold transition-all shadow-sm active:scale-95"
                    >
                        <History size={18} />
                        Reload
                    </button>
                </div>
              )}
          </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Expenses (CSV)">
          <div className="flex gap-2">
            <button onClick={() => exportCSV('expenses')} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-xs font-bold transition-all">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-bold transition-all">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'expenses')} />
            </label>
          </div>
        </Card>
        <Card title="Portfolio (CSV)">
          <div className="flex gap-2">
            <button onClick={() => exportCSV('portfolio')} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-xs font-bold transition-all">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-bold transition-all">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'portfolio')} />
            </label>
          </div>
        </Card>
        <Card title="Stocks (CSV)">
          <div className="flex gap-2">
            <button onClick={() => exportCSV('stocks')} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-xs font-bold transition-all">
              <Download size={14} /> Export
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-bold transition-all">
              <Upload size={14} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'stocks')} />
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
};