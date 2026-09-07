import React, { useState } from 'react';
import {
  Download, Upload, CheckCircle, RefreshCw, AlertCircle,
  LogOut, Copy, WifiOff,
} from 'lucide-react';
import {
  Expense, PortfolioAsset, Stock, ExpenseCategory, IncomeState, InvestmentState,
  SavingsGoal, FIREState, NetWorthState, InvestmentFrequency, AssetType, EmergencyFundState, Loan
} from '../types';
import { 
  pushToCloud, pullFromCloud, isNetworkError, 
  generateIntegrationToken, getIntegrationTokens, revokeIntegrationToken 
} from '../services/supabaseService';
import {
  Card, DangerButton, FieldLabel, GhostButton, IconBox, Pill, ScreenTitle, Tile,
} from './ui';
import { newId } from '../utils/id';
import { normaliseContributions, num } from '../utils/finance';
import { saveTextFile } from '../services/download';

interface DataManagementProps {
  expenses: Expense[];
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  income: IncomeState;
  investment: InvestmentState;
  goal: SavingsGoal;
  fire: FIREState;
  netWorthData: NetWorthState;
  emergencyFund: EmergencyFundState;
  loans: Loan[];
  userId: string | null;
  /** Shown instead of the raw id, which is no longer a credential. */
  accountEmail?: string | null;
  lastSyncedAt: string | null;
  setExpenses: (data: Expense[]) => void;
  setPortfolio: (data: PortfolioAsset[]) => void;
  setStocks: (data: Stock[]) => void;
  setIncome: (data: IncomeState) => void;
  setInvestment: (data: InvestmentState) => void;
  setGoal: (data: SavingsGoal) => void;
  setFire: (data: FIREState) => void;
  setNetWorthData: (data: NetWorthState) => void;
  setEmergencyFund: (data: EmergencyFundState) => void;
  setLoans: (data: Loan[]) => void;
  onLogout: () => void;
  onRetryPull?: () => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans,
  userId, accountEmail, lastSyncedAt,
  setExpenses, setPortfolio, setStocks, setIncome, setInvestment, setGoal, setFire, setNetWorthData, setEmergencyFund, setLoans,
  onLogout, onRetryPull,
}) => {
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info' | 'offline'; text: string } | null>(null);
  
  const [tokens, setTokens] = useState<any[]>([]);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [newTokenText, setNewTokenText] = useState<string | null>(null);

  const activeUserKey = userId;

  React.useEffect(() => {
    if (activeUserKey) {
      getIntegrationTokens(activeUserKey).then(data => setTokens(data)).catch(console.error);
    }
  }, [activeUserKey]);

  const handleGenerateToken = async () => {
    if (!activeUserKey) return;
    setIsGeneratingToken(true);
    try {
      const token = await generateIntegrationToken(activeUserKey, "Life OS Integration");
      setNewTokenText(token);
      const updatedTokens = await getIntegrationTokens(activeUserKey);
      setTokens(updatedTokens);
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: 'Failed to generate token: ' + e.message });
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleRevokeToken = async (id: string) => {
    try {
      await revokeIntegrationToken(id);
      setTokens(tokens.filter(t => t.id !== id));
      if (newTokenText) setNewTokenText(null);
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: 'Failed to revoke token: ' + e.message });
    }
  };

  /** Pull then push, so one tap reconciles both directions. */
  const handleSyncNow = async () => {
    await handleCloudSyncPull();
    await handleCloudSyncPush();
  };

  const handleCloudSyncPush = async () => {
    if (!activeUserKey) return;
    setIsCloudSyncing(true);
    setStatusMsg(null);

    const payload = { expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans };

    try {
      await pushToCloud(activeUserKey, payload);
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
    if (!activeUserKey) return;
    setIsCloudSyncing(true);
    setStatusMsg(null);

    try {
      const { data } = await pullFromCloud(activeUserKey);

      if (data.expenses) setExpenses(data.expenses);
      if (data.portfolio) setPortfolio(data.portfolio);
      if (data.stocks) setStocks(data.stocks);
      if (data.income) setIncome(data.income);
      if (data.investment) setInvestment(data.investment);
      if (data.goal) setGoal(data.goal);
      if (data.fire) setFire(data.fire);
      if (data.netWorthData) setNetWorthData(data.netWorthData);
      // Normalised on the way in so the state matches its declared shape. Not
      // migration: legacy { targetMonths } payloads degrade to zeros.
      if (data.emergencyFund) setEmergencyFund({
        targetAmount: num(data.emergencyFund.targetAmount),
        currentAmount: num(data.emergencyFund.currentAmount),
        contributions: normaliseContributions(data.emergencyFund.contributions),
      });
      if (data.loans) setLoans(data.loans);

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

  const exportCSV = async (type: 'expenses' | 'portfolio' | 'stocks') => {
    // saveTextFile, not a blob: URL — a Capacitor WebView registers no
    // DownloadListener and refuses blob: navigations, so the old helper made
    // these buttons do nothing at all on the phone.
    const downloadCSV = async (content: string, filename: string) => {
      try {
        await saveTextFile(filename, content);
      } catch (e: any) {
        setStatusMsg({ type: 'error', text: `Export failed: ${e?.message ?? e}` });
      }
    };

    if (type === 'expenses') {
      const headers = ['Name,Category,Amount,Recurring'];
      const rows = expenses.map((e) => `"${e.name}","${e.category}",${e.amount},${e.isRecurring}`);
      await downloadCSV([headers, ...rows].join('\n'), 'expenses.csv');
    } else if (type === 'portfolio') {
      const headers = ['Name,Type,Current Value,Monthly Investment,Return %,TER %,Tax Rate %,Frequency'];
      const rows = portfolio.map(
        (p) =>
          `"${p.name}","${p.type}",${p.currentValue},${p.monthlyInvestment},${p.expectedReturn},${p.expenseRatio},${p.taxRate},"${p.frequency}"`
      );
      await downloadCSV([headers, ...rows].join('\n'), 'portfolio.csv');
    } else if (type === 'stocks') {
      const headers = ['Symbol,Quantity,Buy Price,Frequency'];
      const rows = stocks.map((s) => `"${s.symbol}",${s.quantity},${s.buyPrice},"${s.frequency}"`);
      await downloadCSV([headers, ...rows].join('\n'), 'stocks.csv');
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'expenses' | 'portfolio' | 'stocks') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    // An unreadable file used to return silently, leaving the Import button
    // looking like it had worked.
    reader.onerror = () =>
      setStatusMsg({ type: 'error', text: `Could not read ${file.name}.` });
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setStatusMsg({ type: 'error', text: `${file.name} is empty.` });
        return;
      }
      const lines = text.split('\n');
      const dataRows = lines.slice(1).filter((line) => line.trim() !== '');
      if (type === 'expenses') {
        const parsed: Expense[] = dataRows.map((row) => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          return {
            id: newId(),
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
            id: newId(),
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
            id: newId(),
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


  const csvSets = [
    { key: 'expenses' as const, name: 'Expenses', count: `${expenses.length} records` },
    { key: 'portfolio' as const, name: 'Portfolio', count: `${portfolio.length} funds` },
    { key: 'stocks' as const, name: 'Stocks', count: `${stocks.length} holdings` },
  ];

  return (
    <div className="flex flex-col gap-3 max-w-[720px] w-full mx-auto">
      <ScreenTitle
        title="Data Management"
        subtitle={
          userId
            ? 'Signed in with Google — cloud backup enabled.'
            : 'Local sandbox mode — data stored in browser only.'
        }
      />

      {statusMsg && (
        <div
          className={`p-4 rounded-card text-body flex items-center justify-between gap-3 border ${
            statusMsg.type === 'success'
              ? 'bg-positive/10 text-positive border-positive/20'
              : statusMsg.type === 'offline'
              ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
              : 'bg-negative/10 text-negative border-negative/20'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            {statusMsg.type === 'success' ? (
              <CheckCircle size={18} className="flex-none" />
            ) : statusMsg.type === 'offline' ? (
              <WifiOff size={18} className="flex-none" />
            ) : (
              <AlertCircle size={18} className="flex-none" />
            )}
            {statusMsg.text}
          </span>
          {statusMsg.type === 'offline' && onRetryPull && (
            <button
              onClick={onRetryPull}
              className="flex items-center gap-1 font-bold flex-none hover:text-on-surface transition-colors"
            >
              <RefreshCw size={14} /> Retry
            </button>
          )}
        </div>
      )}

      {/* ── Cloud sync ── */}
      <Card flush className={activeUserKey ? '' : 'opacity-60'}>
        <div className="px-5 py-4 border-b border-outline-variant/12 flex items-center gap-3">
          <IconBox icon="cloud" tone={activeUserKey ? 'primary' : 'neutral'} />
          <div className="flex-1 min-w-0">
            <p className="text-body font-bold">Cloud Sync</p>
            <p className="mt-0.5 text-label text-secondary truncate">
              {activeUserKey
                ? lastSyncedAt
                  ? `Last synced: ${lastSyncedAt}`
                  : 'Connected — never synced'
                : 'Sign in with Google to enable'}
            </p>
          </div>
          {activeUserKey && (
            <span className="flex items-center gap-1.5 flex-none">
              <span className="w-2 h-2 rounded-full bg-positive" />
              <span className="text-label font-bold text-positive">Active</span>
            </span>
          )}
        </div>

        {activeUserKey ? (
          // Sync runs by itself: on sign-in, whenever the app comes back to the
          // foreground, and after every change. This is a manual nudge for
          // impatience, not a step anyone has to remember — the old separate
          // Push and Pull buttons made an automatic process look like a chore.
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 min-w-0">
              <RefreshCw size={18} className="text-secondary flex-none" />
              <span className="min-w-0">
                <span className="block text-body font-semibold">Sync now</span>
                <span className="block mt-0.5 text-label text-secondary">
                  Runs automatically — this just does it sooner
                </span>
              </span>
            </span>
            <GhostButton onClick={handleSyncNow} disabled={isCloudSyncing}>
              {isCloudSyncing ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sync
            </GhostButton>
          </div>
        ) : (
          <p className="px-5 py-4 text-body text-secondary">
            Sign in with Google on the login screen to enable cloud backup.
          </p>
        )}
      </Card>

      {/* ── Export / import ── */}
      <Card flush>
        <div className="px-5 py-4 border-b border-outline-variant/12 flex items-center gap-3">
          <IconBox icon="database" tone="tertiary" />
          <div>
            <p className="text-body font-bold">Export / Import</p>
            <p className="mt-0.5 text-label text-secondary">CSV backup and restore</p>
          </div>
        </div>
        {csvSets.map((set, i) => (
          <div
            key={set.key}
            className={`px-5 py-3 flex items-center justify-between gap-3 ${
              i < csvSets.length - 1 ? 'border-b border-outline-variant/[.08]' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-body font-semibold">{set.name}</p>
              <p className="mt-0.5 text-label text-secondary tabular-nums">{set.count}</p>
            </div>
            <div className="flex gap-2 flex-none">
              <GhostButton size="sm" onClick={() => { void exportCSV(set.key); }}>
                <Download size={15} /> Export
              </GhostButton>
              <label
                className="h-10 px-3 text-caption inline-flex items-center justify-center gap-1.5 rounded-field
                  font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright
                  transition-colors cursor-pointer"
              >
                <Upload size={15} /> Import
                <input
                  type="file"
                  accept=".csv"
                  aria-label={`Import ${set.name} CSV`}
                  className="hidden"
                  onChange={e => handleImport(e, set.key)}
                />
              </label>
            </div>
          </div>
        ))}
      </Card>

      {/* ── Session ── */}
      <Card flush>
        <div className="px-5 py-4 border-b border-outline-variant/12 flex items-center gap-3">
          <IconBox icon="person" tone="neutral" />
          <div className="flex-1 min-w-0">
            <p className="text-body font-bold">{userId ? 'Google Account' : 'Guest Session'}</p>
            <p className="mt-0.5 text-label text-secondary">
              {userId ? 'Private cloud sync enabled' : 'Local data only — no cloud'}
            </p>
          </div>
          <Pill tone={userId ? 'primary' : 'neutral'}>
            {userId ? 'Synced' : 'Local Mode'}
          </Pill>
        </div>

        {userId && (
          <div className="px-5 py-4 border-b border-outline-variant/[.08]">
            <FieldLabel className="mb-1">Signed in as</FieldLabel>
            <p className="text-body font-semibold break-all">
              {accountEmail ?? 'Google account'}
            </p>
            <p className="mt-2 text-micro text-secondary italic">
              Your data is tied to this account. Sign in with it on another device to
              see the same figures.
            </p>
          </div>
        )}

        <div className="px-5 py-3">
          <DangerButton onClick={onLogout}>
            <LogOut size={16} />
            {userId ? 'Exit Session' : 'Exit Guest Mode'}
          </DangerButton>
        </div>
      </Card>

      {/* ── Integrations ── */}
      {userId && (
        <Card flush>
          <div className="px-5 py-4 border-b border-outline-variant/12 flex items-center gap-3">
            <IconBox icon="key" tone="neutral" />
            <div>
              <p className="text-body font-bold">API Integrations</p>
              <p className="mt-0.5 text-label text-secondary">Service tokens for apps like Life OS</p>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="flex justify-between items-center gap-3 mb-4">
              <p className="text-body text-secondary">Active Tokens</p>
              <button
                onClick={handleGenerateToken}
                disabled={isGeneratingToken}
                className="h-10 px-3 rounded-field border-0 bg-primary/10 text-primary text-label font-bold
                  cursor-pointer hover:bg-primary/20 transition-colors flex-none disabled:opacity-50"
              >
                {isGeneratingToken ? 'Generating…' : '+ Generate Token'}
              </button>
            </div>

            {newTokenText && (
              <div className="mb-4 p-4 rounded-card bg-positive/10 border border-positive/20">
                <p className="mb-1 text-label font-bold text-positive">
                  New token generated — copy it now, it will not be shown again.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-caption break-all select-all">{newTokenText}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(newTokenText)}
                    aria-label="Copy token"
                    className="w-11 h-11 flex items-center justify-center flex-none text-secondary hover:text-on-surface"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}

            {tokens.length === 0 ? (
              <p className="text-label text-secondary italic">No active tokens.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {tokens.map(token => (
                  <Tile key={token.id}>
                    <span className="min-w-0">
                      <span className="block text-body font-bold truncate">{token.token_name}</span>
                      <span className="block mt-0.5 text-micro text-secondary">
                        Created {new Date(token.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <button
                      onClick={() => handleRevokeToken(token.id)}
                      className="h-10 px-3 rounded-field text-label text-negative hover:bg-negative/10 transition-colors flex-none"
                    >
                      Revoke
                    </button>
                  </Tile>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
