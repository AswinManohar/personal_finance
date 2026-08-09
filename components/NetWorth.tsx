import React, { useState } from 'react';
import { NetWorthState, Stock, PortfolioAsset, SavingsHistoryRecord, Loan } from '../types';
import { Camera, Check, Trash2 } from 'lucide-react';
import {
  AreaChart, AxisLabels, Card, EmptyState, Field, FieldLabel, IconBox, Input, ListRow,
  PrimaryButton, SectionLabel, StatBlock, Tile, Tone, FormError,
} from './ui';
import { recordSavingsHistory, getSavingsHistory, deleteHistoryRecord } from '../services/supabaseService';
import { totalLoanBalance, num } from '../utils/finance';

interface NetWorthProps {
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  currentSavings: number;
  stocks: Stock[];
  portfolio: PortfolioAsset[];
  userKey?: string;
  history: SavingsHistoryRecord[];
  setHistory: React.Dispatch<React.SetStateAction<SavingsHistoryRecord[]>>;
  onSync?: (overrides?: any) => Promise<void>;
  loans?: Loan[];
}

export const NetWorth: React.FC<NetWorthProps> = ({
  netWorthData, setNetWorthData, currentSavings, stocks, portfolio, userKey, history, setHistory, onSync, loans = []
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    if (!userKey) {
      setHistoryError('Sign in to record snapshots — they are stored in the cloud.');
      return;
    }
    setHistoryError(null);
    setIsRecording(true);
    try {
      await recordSavingsHistory(userKey, {
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: netWorth,
        savings_amount: currentSavings,
        investment_amount: portfolioValue,
        gold_amount: netWorthData.goldInvestment,
        stock_amount: stockValue
      });
      const updatedHistory = await getSavingsHistory(userKey);
      setHistory(updatedHistory);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      // Was a blocking alert(), which freezes the WebView on Android.
      console.error(err);
      setHistoryError(`Could not save the snapshot: ${err?.message ?? 'unknown error'}`);
    } finally {
      setIsRecording(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm("Delete this historical record?")) return;
    try {
      setHistoryError(null);
      await deleteHistoryRecord(id);
      setHistory(history.filter(h => h.id !== id));
    } catch (err: any) {
      // Previously console-only: the row stayed on screen and the user had no
      // way to know the delete had not happened.
      console.error(err);
      setHistoryError(`Could not delete that snapshot: ${err?.message ?? 'unknown error'}`);
    }
  };

  // Timeline data for SVG chart
  const timelineData = history.map(h => ({
    date: new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    netWorth: h.net_worth,
    assets: h.total_assets
  }));

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

  // Asset rows derived from actual data. Icons are Material Symbol names now,
  // so IconBox owns the tint and size instead of each row carrying its own SVG.
  type AssetRow = { icon: string; name: string; subtitle: string; value: number; tone: Tone };
  const assetRows: AssetRow[] = [
    currentSavings > 0 && {
      icon: 'account_balance_wallet',
      name: 'Cash & Savings',
      subtitle: 'Liquid savings',
      value: currentSavings,
      tone: 'positive' as Tone,
    },
    portfolioValue > 0 && {
      icon: 'trending_up',
      name: 'Portfolio',
      subtitle: `${portfolio.length} fund${portfolio.length !== 1 ? 's' : ''}`,
      value: portfolioValue,
      tone: 'primary' as Tone,
    },
    stockValue > 0 && {
      icon: 'candlestick_chart',
      name: 'Stocks',
      subtitle: `${stocks.length} position${stocks.length !== 1 ? 's' : ''}`,
      value: stockValue,
      tone: 'primary' as Tone,
    },
    netWorthData.goldInvestment > 0 && {
      icon: 'diamond',
      name: 'Gold',
      subtitle: 'Physical gold',
      value: netWorthData.goldInvestment,
      tone: 'tertiary' as Tone,
    },
    (netWorthData.otherAssets || 0) > 0 && {
      icon: 'home_work',
      name: 'Other Assets',
      subtitle: 'Real estate, crypto, etc.',
      value: netWorthData.otherAssets || 0,
      tone: 'neutral' as Tone,
    },
  ].filter(Boolean) as AssetRow[];

  const historySeries = history.map(h => h.net_worth);
  const axisLabels = timelineData.length >= 2
    ? [timelineData[0].date, timelineData[Math.floor(timelineData.length / 2)].date, timelineData[timelineData.length - 1].date]
    : [];

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* ── Hero ── */}
      <Card className="relative overflow-hidden lg:col-span-2">
        <div className="absolute top-0 right-0 w-2/5 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <FieldLabel className="!tracking-[.24em] !text-secondary mb-3">Current Net Worth</FieldLabel>
        <h1 className="text-num-lg font-bold tabular-nums mb-2">€{fmt(netWorth)}</h1>
        <div
          className={`flex items-center gap-2 mb-5 ${netWorth >= 0 ? 'text-positive' : 'text-negative'}`}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
            {netWorth >= 0 ? 'trending_up' : 'trending_down'}
          </span>
          <span className="text-body font-semibold">
            {netWorth >= 0 ? 'Assets exceed liabilities' : 'Liabilities exceed assets'}
            <span className="font-normal text-secondary/60 tabular-nums">
              {' '}· debt ratio {debtRatio.toFixed(0)}%
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Total Assets" tone="positive" value={`€${fmt(totalAssets)}`} />
          <StatBlock label="Total Liabilities" tone="negative" value={`-€${fmt(totalLiabilities)}`} />
        </div>
      </Card>

      {/* ── Asset breakdown ── */}
      <Card>
        <SectionLabel className="mb-3">Asset Breakdown</SectionLabel>
        <div className="flex flex-col gap-2">
          {assetRows.length === 0 && (
            <EmptyState icon="account_balance">
              No assets recorded yet. Add savings, funds or stocks to see the breakdown.
            </EmptyState>
          )}
          {assetRows.map(row => (
            <Tile key={row.name}>
              <span className="flex items-center gap-3 min-w-0">
                <IconBox icon={row.icon} tone={row.tone} />
                <span className="min-w-0">
                  <span className="block text-body font-bold truncate">{row.name}</span>
                  <span className="block mt-0.5 text-label text-secondary/60">{row.subtitle}</span>
                </span>
              </span>
              <span className="text-right flex-none">
                <span className="block text-body font-bold tabular-nums">€{fmt(row.value)}</span>
                <span className="block mt-0.5 text-micro font-bold text-positive tabular-nums">
                  {totalAssets > 0 ? ((row.value / totalAssets) * 100).toFixed(0) : 0}%
                </span>
              </span>
            </Tile>
          ))}

          <div className="bg-surface-container-lowest border border-outline-variant/12 rounded-xl p-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 min-w-0">
              <IconBox icon="credit_card" tone="negative" />
              <span className="min-w-0">
                <span className="block text-body font-bold">Loans</span>
                <span className="block mt-0.5 text-label text-secondary/60">
                  {loans.length > 0
                    ? `${loans.length} from Debts tab`
                    : 'manual entry below'}
                </span>
              </span>
            </span>
            <span className="text-right flex-none">
              <span className="block text-body font-bold tabular-nums">-€{fmt(totalLiabilities)}</span>
              <span className="block mt-0.5 text-micro font-bold text-negative tabular-nums">
                {debtRatio.toFixed(0)}% ratio
              </span>
            </span>
          </div>
        </div>
      </Card>

      {/* ── Manual inputs ── */}
      <Card className="flex flex-col gap-3">
        <SectionLabel>Manual Inputs</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Physical Gold" htmlFor="nw-gold">
            <Input
              id="nw-gold"
              type="number"
              value={netWorthData.goldInvestment || ''}
              onChange={e => handleValueChange('goldInvestment', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Other Assets" htmlFor="nw-other">
            <Input
              id="nw-other"
              type="number"
              value={netWorthData.otherAssets || ''}
              onChange={e => handleValueChange('otherAssets', e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        {loans.length === 0 && (
          <Field label="Remaining Loan" htmlFor="nw-loan">
            <Input
              id="nw-loan"
              type="number"
              value={netWorthData.remainingLoan || ''}
              onChange={e => handleValueChange('remainingLoan', e.target.value)}
              placeholder="0"
            />
          </Field>
        )}
      </Card>

      {/* ── Historical performance ── */}
      <Card className="lg:col-span-2">
        <h2 className="text-title font-bold">Historical Performance</h2>
        <p className="mt-1 mb-4 text-label text-secondary">Net worth over recorded snapshots</p>

        {historySeries.length >= 2 ? (
          <>
            <div className="h-40">
              <AreaChart points={historySeries} label="Net worth over recorded snapshots" />
            </div>
            <AxisLabels labels={axisLabels} className="mt-3" />
          </>
        ) : (
          <EmptyState icon="timeline">
            Record your first snapshot to begin tracking your wealth growth over time.
          </EmptyState>
        )}

        <div className="mt-4 p-4 rounded-xl bg-surface-container-highest/30 flex items-center justify-between gap-3">
          <span className="flex items-center gap-3 min-w-0">
            <IconBox icon="history" />
            <span className="text-caption text-secondary">
              {lastSyncTime
                ? <>Last snapshot <span className="text-on-surface font-bold">{lastSyncTime}</span></>
                : 'No snapshots recorded yet'}
            </span>
          </span>
          <PrimaryButton
            size="md"
            className="flex-none"
            onClick={handleRecordSnapshot}
            disabled={isRecording || !userKey}
          >
            {showSuccess ? <Check size={16} /> : <Camera size={16} />}
            {showSuccess ? 'Saved!' : isRecording ? 'Saving…' : 'Snapshot'}
          </PrimaryButton>
        </div>

        <FormError className="mt-3">{historyError}</FormError>

        {history.length > 0 && (
          <div className="mt-3 flex flex-col">
            {[...history].reverse().slice(0, 6).map((h, i, arr) => (
              <ListRow key={h.id} divider={i < arr.length - 1} className="h-11 group">
                <span className="text-label text-secondary tabular-nums">
                  {new Date(h.created_at).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-body font-semibold tabular-nums">€{fmt(h.net_worth)}</span>
                  <button
                    onClick={() => handleDeleteRecord(h.id)}
                    aria-label="Delete snapshot"
                    className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </ListRow>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
