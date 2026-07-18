import React, { useState } from 'react';
import { NetWorthState, Stock, PortfolioAsset, SavingsHistoryRecord, Loan } from '../types';
import { Camera, Check, RefreshCw } from 'lucide-react';
import { recordSavingsHistory, getSavingsHistory, deleteHistoryRecord } from '../services/supabaseService';
import { totalLoanBalance, num } from '../utils/finance';

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
  loans?: Loan[];
}

export const NetWorth: React.FC<NetWorthProps> = ({
  netWorthData, setNetWorthData, currentSavings, stocks, portfolio, syncKey, history, setHistory, onSync, loans = []
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const stockValue = stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0);
  const portfolioValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);

  const totalAssets = currentSavings + stockValue + portfolioValue + netWorthData.goldInvestment + (netWorthData.otherAssets || 0);
  const totalLiabilities = loans.length > 0 ? totalLoanBalance(loans) : num(netWorthData.remainingLoan);
  const netWorth = totalAssets - totalLiabilities;

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
        total_liabilities: totalLiabilities,
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

  // Timeline data for SVG chart
  const timelineData = history.map(h => ({
    date: new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    netWorth: h.net_worth,
    assets: h.total_assets
  }));

  // Build SVG area chart from history
  const svgW = 800;
  const svgH = 400;
  const chartData = timelineData.length >= 2 ? timelineData : null;
  const maxNW = chartData ? Math.max(...chartData.map(d => d.netWorth)) * 1.1 : 1;
  const minNW = chartData ? Math.min(0, Math.min(...chartData.map(d => d.netWorth))) : 0;
  const range = maxNW - minNW || 1;

  const toSvgX = (i: number, total: number) => (i / Math.max(total - 1, 1)) * svgW;
  const toSvgY = (val: number) => svgH - ((val - minNW) / range) * svgH;

  const linePath = chartData
    ? chartData.map((d, i) => `${i === 0 ? 'M' : 'L'}${toSvgX(i, chartData.length).toFixed(1)},${toSvgY(d.netWorth).toFixed(1)}`).join(' ')
    : '';
  const areaPath = chartData && chartData.length >= 2
    ? `${linePath} L${toSvgX(chartData.length - 1, chartData.length).toFixed(1)},${svgH} L0,${svgH} Z`
    : '';

  // Data points for chart (show every ~25% interval + last)
  const chartPoints = chartData
    ? chartData.filter((_, i) => i === 0 || i === chartData.length - 1 || i % Math.max(1, Math.floor(chartData.length / 4)) === 0)
    : [];

  const lastSyncTime = history.length > 0
    ? (() => {
        const d = new Date(history[history.length - 1].created_at);
        const diffMs = Date.now() - d.getTime();
        const diffH = Math.floor(diffMs / 3_600_000);
        const diffD = Math.floor(diffMs / 86_400_000);
        if (diffH < 1) return 'just now';
        if (diffH < 24) return `${diffH} hour${diffH !== 1 ? 's' : ''} ago`;
        return `${diffD} day${diffD !== 1 ? 's' : ''} ago`;
      })()
    : null;

  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  // Format helpers
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const fmtSigned = (v: number) => (v >= 0 ? '+' : '') + v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Asset rows derived from actual data
  type AssetRow = { icon: React.ReactNode; name: string; subtitle: string; value: number; iconBg: string; iconColor: string };
  const assetRows: AssetRow[] = [
    currentSavings > 0 && {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      ),
      name: 'Cash & Savings',
      subtitle: 'Liquid savings',
      value: currentSavings,
      iconBg: 'bg-positive/10',
      iconColor: 'text-positive',
    },
    portfolioValue > 0 && {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
      ),
      name: 'Portfolio',
      subtitle: `${portfolio.length} fund${portfolio.length !== 1 ? 's' : ''}`,
      value: portfolioValue,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    stockValue > 0 && {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      name: 'Stocks',
      subtitle: `${stocks.length} position${stocks.length !== 1 ? 's' : ''}`,
      value: stockValue,
      iconBg: 'bg-tertiary/10',
      iconColor: 'text-tertiary',
    },
    netWorthData.goldInvestment > 0 && {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      ),
      name: 'Gold',
      subtitle: 'Physical gold',
      value: netWorthData.goldInvestment,
      iconBg: 'bg-gold/10',
      iconColor: 'text-gold',
    },
    (netWorthData.otherAssets || 0) > 0 && {
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      name: 'Other Assets',
      subtitle: 'Real estate, crypto, etc.',
      value: netWorthData.otherAssets || 0,
      iconBg: 'bg-secondary/10',
      iconColor: 'text-secondary',
    },
  ].filter(Boolean) as AssetRow[];

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      {/* Hero Card */}
      <section className="mb-10">
        <div className="bg-surface-container-low rounded-3xl p-8 md:p-12 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <span className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-4 block">
                Current Net Worth
              </span>
              <h1 className="text-6xl md:text-8xl font-bold text-on-surface tracking-tighter tabular-nums mb-2">
                €{fmt(Math.abs(netWorth))}
              </h1>
              <div className={`flex items-center gap-2 ${netWorth >= 0 ? 'text-positive' : 'text-negative'}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {netWorth >= 0
                    ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>
                    : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>
                  }
                </svg>
                <span className="font-semibold text-lg tracking-tight tabular-nums">
                  {netWorth >= 0 ? 'Assets exceed liabilities' : 'Liabilities exceed assets'}
                  <span className="text-sm font-normal text-secondary/60 ml-2">· Debt ratio {debtRatio.toFixed(1)}%</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 md:gap-12">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-secondary/70 font-semibold">Total Assets</span>
                <p className="text-3xl font-bold text-positive tabular-nums tracking-tight">€{fmt(totalAssets)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-secondary/70 font-semibold">Total Liabilities</span>
                <p className="text-3xl font-bold text-negative tabular-nums tracking-tight">-€{fmt(totalLiabilities)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* Left Col: Asset & Liability Breakdown */}
        <div className="xl:col-span-5 space-y-10">
          {/* Assets */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold tracking-tight text-on-surface">Asset Breakdown</h2>
            </div>
            {assetRows.length > 0 ? (
              <div className="space-y-1">
                {assetRows.map((row, i) => (
                  <div
                    key={i}
                    className="bg-surface-container-high/40 p-5 rounded-2xl flex items-center justify-between hover:bg-surface-container-high transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl ${row.iconBg} flex items-center justify-center ${row.iconColor}`}>
                        {row.icon}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface">{row.name}</p>
                        <p className="text-xs text-secondary/60 tabular-nums font-medium">{row.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums tracking-tight text-on-surface">€{fmt(row.value)}</p>
                      <p className="text-[10px] text-positive font-bold tabular-nums">
                        {((row.value / totalAssets) * 100).toFixed(1)}% of assets
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-container-high/40 p-8 rounded-2xl text-center">
                <p className="text-secondary text-sm">No asset data yet. Add your savings, portfolio, or stocks to see a breakdown.</p>
              </div>
            )}
          </div>

          {/* Manual Inputs */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-on-surface mb-6">Manual Inputs</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">Physical Gold Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-semibold">€</span>
                  <input
                    type="number"
                    value={netWorthData.goldInvestment || ''}
                    onChange={(e) => handleValueChange('goldInvestment', e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 pl-8 pr-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">Other Assets</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-semibold">€</span>
                  <input
                    type="number"
                    value={netWorthData.otherAssets || ''}
                    onChange={(e) => handleValueChange('otherAssets', e.target.value)}
                    placeholder="Real estate, crypto, vehicles..."
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 pl-8 pr-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
                  />
                </div>
                <p className="text-[10px] text-secondary/50 mt-1 ml-1">Real estate equity, crypto, vehicles, collectibles, etc.</p>
              </div>
            </div>
          </div>

          {/* Liabilities */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold tracking-tight text-on-surface">Liabilities</h2>
            </div>
            <div className="space-y-1">
              <div className="bg-surface-container-lowest p-5 rounded-2xl flex items-center justify-between border border-outline-variant/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-negative/10 flex items-center justify-center text-negative">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Remaining Loan</p>
                    <div className="mt-1">
                      <input
                        type="number"
                        value={netWorthData.remainingLoan || ''}
                        onChange={(e) => handleValueChange('remainingLoan', e.target.value)}
                        placeholder="e.g. 15000"
                        className="w-32 bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded py-1 px-2 text-xs text-on-surface tabular-nums font-semibold outline-none transition-all"
                      />
                    </div>
                    {loans.length > 0 && (
                      <p className="text-[10px] text-secondary/50 mt-1">
                        Using {loans.length} loan{loans.length !== 1 ? 's' : ''} from the Debts tab
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums tracking-tight text-on-surface">-€{fmt(totalLiabilities)}</p>
                  <p className="text-[10px] text-negative font-bold tabular-nums">
                    {debtRatio.toFixed(1)}% debt ratio
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Historical Chart */}
        <div className="xl:col-span-7">
          <div className="bg-surface-container-low rounded-3xl p-8 h-full flex flex-col">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h2 className="text-2xl font-bold tracking-tight mb-1 text-on-surface">Historical Performance</h2>
                <p className="text-secondary text-sm">Net worth growth over recorded snapshots</p>
              </div>
              {history.length > 0 && (
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-surface-container-high rounded-full text-xs font-bold text-primary tabular-nums">All</span>
                </div>
              )}
            </div>

            {/* Chart */}
            <div className="flex-1 w-full min-h-[400px] relative mt-4">
              {chartData ? (
                <>
                  <svg
                    className="w-full h-full overflow-visible"
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#c1c1ff" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#c1c1ff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line stroke="rgba(70,69,84,0.2)" strokeWidth="1" x1="0" x2={svgW} y1={svgH * 0.25} y2={svgH * 0.25} />
                    <line stroke="rgba(70,69,84,0.2)" strokeWidth="1" x1="0" x2={svgW} y1={svgH * 0.5} y2={svgH * 0.5} />
                    <line stroke="rgba(70,69,84,0.2)" strokeWidth="1" x1="0" x2={svgW} y1={svgH * 0.75} y2={svgH * 0.75} />
                    {/* Area fill */}
                    {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}
                    {/* Line */}
                    {linePath && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#c1c1ff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {/* Data points */}
                    {chartData.map((d, i) => {
                      const cx = toSvgX(i, chartData.length);
                      const cy = toSvgY(d.netWorth);
                      const isLast = i === chartData.length - 1;
                      return (
                        <circle
                          key={i}
                          cx={cx}
                          cy={cy}
                          r={isLast ? 6 : 4}
                          fill="#c1c1ff"
                          stroke={isLast ? '#1a1b20' : undefined}
                          strokeWidth={isLast ? 2 : undefined}
                        />
                      );
                    })}
                  </svg>
                  {/* X-axis labels */}
                  <div className="flex justify-between mt-6 text-[10px] uppercase tracking-widest text-secondary/40 font-bold tabular-nums">
                    {timelineData.length <= 6
                      ? timelineData.map((d, i) => <span key={i}>{d.date}</span>)
                      : [0, Math.floor(timelineData.length / 4), Math.floor(timelineData.length / 2), Math.floor((timelineData.length * 3) / 4), timelineData.length - 1].map(idx => (
                          <span key={idx}>{timelineData[idx]?.date}</span>
                        ))
                    }
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-on-surface mb-2">Start Your Timeline</h4>
                  <p className="text-secondary text-sm max-w-xs">
                    Record your first snapshot to begin tracking your wealth growth over time.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom action strip */}
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 p-6 bg-surface-container-highest/30 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                </div>
                <p className="text-sm text-secondary">
                  {lastSyncTime
                    ? <>Last snapshot <span className="text-on-surface font-bold tabular-nums tracking-tight">{lastSyncTime}</span></>
                    : <span>No snapshots recorded yet</span>
                  }
                </p>
              </div>
              <button
                onClick={handleRecordSnapshot}
                disabled={isRecording || !syncKey}
                className="w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary-container font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isRecording
                  ? <RefreshCw size={16} className="animate-spin" />
                  : showSuccess
                  ? <Check size={16} />
                  : <Camera size={16} />
                }
                {showSuccess ? 'Snapshot Saved!' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
