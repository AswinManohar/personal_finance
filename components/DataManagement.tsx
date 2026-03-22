import React, { useState } from 'react';
import {
  Download, Upload, CheckCircle, RefreshCw, AlertCircle, Cloud,
  LogOut, CloudOff, Key, Copy, Check, WifiOff, ArrowUpFromLine, ArrowDownToLine,
  Database, User
} from 'lucide-react';
import {
  Expense, PortfolioAsset, Stock, ExpenseCategory, IncomeState, InvestmentState,
  SavingsGoal, FIREState, NetWorthState, InvestmentFrequency, AssetType
} from '../types';
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
  onLogout, onRetryPull,
}) => {
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info' | 'offline'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const activeSyncKey = uniqueSyncId;

  const handleCloudSyncPush = async () => {
    if (!activeSyncKey) return;
    setIsCloudSyncing(true);
    setStatusMsg(null);

    const payload = { expenses, portfolio, stocks, income, investment, goal, fire, netWorthData };

    try {
      await pushToCloud(activeSyncKey, payload);
      setStatusMsg({ type: 'success', text: 'Cloud backup updated successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (error: any) {
      if (isNetworkError(error)) {
        setStatusMsg({ type: 'offline', text: 'Cloud unreachable. Check network or firewall settings.' });
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
      const rows = expenses.map((e) => `"${e.name}","${e.category}",${e.amount},${e.isRecurring}`);
      downloadCSV([headers, ...rows].join('\n'), 'expenses.csv');
    } else if (type === 'portfolio') {
      const headers = ['Name,Type,Current Value,Monthly Investment,Return %,TER %,Tax Rate %,Frequency'];
      const rows = portfolio.map(
        (p) =>
          `"${p.name}","${p.type}",${p.currentValue},${p.monthlyInvestment},${p.expectedReturn},${p.expenseRatio},${p.taxRate},"${p.frequency}"`
      );
      downloadCSV([headers, ...rows].join('\n'), 'portfolio.csv');
    } else if (type === 'stocks') {
      const headers = ['Symbol,Quantity,Buy Price,Frequency'];
      const rows = stocks.map((s) => `"${s.symbol}",${s.quantity},${s.buyPrice},"${s.frequency}"`);
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
      const dataRows = lines.slice(1).filter((line) => line.trim() !== '');
      if (type === 'expenses') {
        const parsed: Expense[] = dataRows.map((row) => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: crypto.randomUUID(),
            name: parts[0]?.replace(/"/g, '') || 'Imported',
            category: (parts[1]?.replace(/"/g, '') || 'Other') as ExpenseCategory,
            amount: parseFloat(parts[2]) || 0,
            isRecurring: parts[3]?.toLowerCase() === 'true',
            date: new Date().toISOString().split('T')[0],
          };
        });
        setExpenses(parsed);
      } else if (type === 'portfolio') {
        const parsed: PortfolioAsset[] = dataRows.map((row) => {
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
            frequency: (parts[7]?.replace(/"/g, '') || 'Monthly') as InvestmentFrequency,
          };
        });
        setPortfolio(parsed);
      } else if (type === 'stocks') {
        const parsed: Stock[] = dataRows.map((row) => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: crypto.randomUUID(),
            symbol: parts[0]?.replace(/"/g, '') || 'UNKNOWN',
            quantity: parseFloat(parts[1]) || 0,
            buyPrice: parseFloat(parts[2]) || 0,
            frequency: (parts[3]?.replace(/"/g, '') || 'One-time') as InvestmentFrequency,
          };
        });
        setStocks(parsed);
      }
      setStatusMsg({ type: 'success', text: `Imported ${type} successfully.` });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const ghostBtn =
    'bg-surface-container-high px-4 py-2 rounded-lg text-sm font-semibold text-on-surface hover:bg-surface-bright transition-all flex items-center gap-2';

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-on-surface tracking-tight">Data Management</h1>
        <p className="text-secondary text-sm mt-1">
          {uniqueSyncId ? 'Connected via Unique Sync ID — cloud backup enabled.' : 'Local sandbox mode — data stored in browser only.'}
        </p>
      </div>

      {/* Status Message */}
      {statusMsg && (
        <div
          className={`mb-6 p-4 rounded-xl text-sm flex items-center justify-between border ${
            statusMsg.type === 'success'
              ? 'bg-[#3DD68C]/10 text-[#3DD68C] border-[#3DD68C]/20'
              : statusMsg.type === 'offline'
              ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
              : 'bg-[#F26B6B]/10 text-[#F26B6B] border-[#F26B6B]/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {statusMsg.type === 'success' ? (
              <CheckCircle size={18} />
            ) : statusMsg.type === 'offline' ? (
              <WifiOff size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            {statusMsg.text}
          </div>
          {statusMsg.type === 'offline' && onRetryPull && (
            <button
              onClick={onRetryPull}
              className="font-bold flex items-center gap-1 text-tertiary hover:text-on-surface transition-colors"
            >
              <RefreshCw size={14} /> Retry
            </button>
          )}
        </div>
      )}

      <div className="max-w-[720px] space-y-5">
        {/* Cloud Sync Card */}
        <div className={`bg-surface-container-low rounded-xl border ${activeSyncKey ? 'border-outline-variant/15' : 'border-outline-variant/10 opacity-60'}`}>
          <div className="px-6 pt-5 pb-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeSyncKey ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-secondary'}`}>
                <Cloud size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">Cloud Sync</p>
                <p className="text-xs text-secondary">
                  {activeSyncKey
                    ? lastSyncedAt
                      ? `Last synced: ${lastSyncedAt}`
                      : 'Connected — never synced'
                    : 'Login with a Sync ID to enable'}
                </p>
              </div>
              {activeSyncKey && (
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#3DD68C]" />
                  <span className="text-xs text-[#3DD68C] font-bold">Active</span>
                </div>
              )}
            </div>
          </div>

          {activeSyncKey && (
            <>
              {/* Push row */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/5">
                <div className="flex items-center gap-3">
                  <ArrowUpFromLine size={18} className="text-secondary" />
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Push to Cloud</p>
                    <p className="text-xs text-secondary">Upload current data to your sync ID</p>
                  </div>
                </div>
                <button
                  onClick={handleCloudSyncPush}
                  disabled={isCloudSyncing}
                  className={`${ghostBtn} disabled:opacity-50`}
                >
                  {isCloudSyncing ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  Push
                </button>
              </div>
              {/* Pull row */}
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ArrowDownToLine size={18} className="text-secondary" />
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Pull from Cloud</p>
                    <p className="text-xs text-secondary">Restore data from your sync ID</p>
                  </div>
                </div>
                <button
                  onClick={handleCloudSyncPull}
                  disabled={isCloudSyncing}
                  className={`${ghostBtn} disabled:opacity-50`}
                >
                  {isCloudSyncing ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                  Pull
                </button>
              </div>
            </>
          )}

          {!activeSyncKey && (
            <div className="px-6 py-5 text-sm text-secondary">
              Sign in with a Sync ID on the login screen to enable cloud backup.
            </div>
          )}
        </div>

        {/* Export / Import Card */}
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10">
          <div className="px-6 pt-5 pb-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Database size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">Export / Import</p>
                <p className="text-xs text-secondary">Download or restore data as CSV files</p>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/5">
            <div>
              <p className="text-sm font-semibold text-on-surface">Expenses</p>
              <p className="text-xs text-secondary">{expenses.length} records</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportCSV('expenses')} className={ghostBtn}>
                <Download size={14} /> Export
              </button>
              <label className={`${ghostBtn} cursor-pointer`}>
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'expenses')} />
              </label>
            </div>
          </div>

          {/* Portfolio */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/5">
            <div>
              <p className="text-sm font-semibold text-on-surface">Portfolio</p>
              <p className="text-xs text-secondary">{portfolio.length} funds</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportCSV('portfolio')} className={ghostBtn}>
                <Download size={14} /> Export
              </button>
              <label className={`${ghostBtn} cursor-pointer`}>
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'portfolio')} />
              </label>
            </div>
          </div>

          {/* Stocks */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-on-surface">Stocks</p>
              <p className="text-xs text-secondary">{stocks.length} holdings</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportCSV('stocks')} className={ghostBtn}>
                <Download size={14} /> Export
              </button>
              <label className={`${ghostBtn} cursor-pointer`}>
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'stocks')} />
              </label>
            </div>
          </div>
        </div>

        {/* Account / User Card */}
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10">
          <div className="px-6 pt-5 pb-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
                <User size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">
                  {uniqueSyncId ? 'Sync ID Session' : 'Guest Session'}
                </p>
                <p className="text-xs text-secondary">
                  {uniqueSyncId ? 'Private cloud sync enabled' : 'Local data only — no cloud'}
                </p>
              </div>
              <span className={`ml-auto text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase ${uniqueSyncId ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-secondary'}`}>
                {uniqueSyncId ? 'Sync ID' : 'Local Mode'}
              </span>
            </div>
          </div>

          {uniqueSyncId && (
            <div className="px-6 py-4 border-b border-outline-variant/5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold tracking-widest uppercase text-secondary flex items-center gap-1.5">
                  <Key size={12} /> Your Sync ID
                </span>
                <button
                  onClick={copySyncId}
                  className="text-xs font-bold text-primary hover:text-on-surface transition-colors flex items-center gap-1"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="font-mono text-sm text-on-surface select-all tracking-wider break-all">
                {uniqueSyncId}
              </p>
              <p className="text-[10px] text-secondary mt-2 italic">
                Use this ID on other devices to restore your data without an account.
              </p>
            </div>
          )}

          <div className="px-6 py-4">
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-sm font-bold text-[#F26B6B] hover:bg-[#F26B6B]/10 px-3 py-2 rounded-lg transition-all"
            >
              <LogOut size={16} />
              {uniqueSyncId ? 'Exit Session' : 'Exit Guest Mode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
