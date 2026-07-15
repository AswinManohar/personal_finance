
import React, { useMemo, useState } from 'react';
import { NetWorthState, PortfolioAsset, Stock, Expense, EmergencyFundState } from '../types';
import { monthlyEssentials, runwayMonths, emergencyFundTarget, monthsToTarget } from '../utils/finance';

interface SavingsDashboardProps {
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  onSync: (overrides?: any) => Promise<void>;
  expenses?: Expense[];
  emergencyFund?: EmergencyFundState;
  setEmergencyFund?: (next: EmergencyFundState) => void;
}

export const SavingsDashboard: React.FC<SavingsDashboardProps> = ({
  portfolio,
  stocks,
  netWorthData,
  setNetWorthData,
  onSync,
  expenses = [],
  emergencyFund,
  setEmergencyFund,
}) => {
  const [addAmount, setAddAmount] = useState('');

  // Coerce any value to a finite number; missing/invalid fields become 0 so a
  // single undefined never poisons an aggregate into NaN ("€NaN").
  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const stockValue = useMemo(
    () => stocks.reduce((sum, s) => sum + num(s.quantity) * num(s.currentPrice || s.buyPrice), 0),
    [stocks]
  );
  const portfolioValue = useMemo(
    () => portfolio.reduce((sum, p) => sum + num(p.currentValue), 0),
    [portfolio]
  );

  // Net-worth scalars, coerced once so every downstream calc is NaN-safe even
  // when the synced state omits a key.
  const gold = num(netWorthData.goldInvestment);
  const cash = num(netWorthData.accumulatedSavings);
  const otherAssets = num(netWorthData.otherAssets);
  const monthlySavings = num(netWorthData.monthlyRecurringSavings);

  // Emergency fund & runway
  const targetMonths = emergencyFund?.targetMonths ?? 3;
  const essentials = monthlyEssentials(expenses);
  const runway = runwayMonths(cash, essentials);
  const target = emergencyFundTarget(essentials, targetMonths);
  const etaMonths = monthsToTarget(cash, target, monthlySavings);

  const runwayLabel =
    runway === null ? '—'
    : runway < 1 ? `~${Math.round(runway * 4.345)} weeks`
    : `${runway.toFixed(1)} months`;

  const etaLabel = (() => {
    if (etaMonths === null) return '—';
    if (etaMonths === 0) return 'Funded';
    const d = new Date();
    d.setMonth(d.getMonth() + etaMonths);
    return `~${etaMonths} month${etaMonths === 1 ? '' : 's'} (${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})`;
  })();

  const handleTargetMonths = (m: number) => {
    const next: EmergencyFundState = { targetMonths: m };
    setEmergencyFund?.(next);
    onSync({ emergencyFund: next });
  };

  // Total assets = Mutual Funds + Stocks + Gold + Cash + Other Assets
  const totalAssets = portfolioValue + stockValue + gold + cash + otherAssets;

  const handleSavingsUpdate = (
    field: 'monthlyRecurringSavings' | 'accumulatedSavings',
    value: string
  ) => {
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
      accumulatedSavings: cash + amount,
    };
    setNetWorthData(newData);
    onSync({ netWorthData: newData });
    setAddAmount('');
  };

  // Asset categories for breakdown
  const assetCategories = [
    { label: 'Mutual Funds', value: portfolioValue, color: 'bg-primary-container', dotColor: 'bg-primary-container' },
    { label: 'Stocks', value: stockValue, color: 'bg-primary', dotColor: 'bg-primary' },
    { label: 'Gold', value: gold, color: 'bg-tertiary', dotColor: 'bg-tertiary' },
    { label: 'Cash', value: cash, color: 'bg-outline-variant', dotColor: 'bg-outline-variant' },
  ];

  const totalForBar = assetCategories.reduce((s, c) => s + c.value, 0) || 1;

  // Distribution mix percentages for donut chart
  const distCategories = [
    { label: 'Mutual Funds', value: portfolioValue, stroke: '#c1c1ff', dotColor: 'bg-primary' },
    { label: 'Stocks', value: stockValue, stroke: '#8183ff', dotColor: 'bg-primary-container' },
    { label: 'Gold & Other', value: gold + otherAssets, stroke: '#eec060', dotColor: 'bg-tertiary' },
  ];
  const totalDist = distCategories.reduce((s, c) => s + c.value, 0) || 1;

  // SVG donut: r=80, circumference ~502
  const circumference = 2 * Math.PI * 80; // ~502.65
  const donutSegments = (() => {
    let offset = 0;
    return distCategories.map((cat) => {
      const pct = cat.value / totalDist;
      const dashLength = pct * circumference;
      const dashOffset = circumference - offset;
      offset += dashLength;
      return { ...cat, dasharray: circumference, dashoffset: dashOffset - dashLength };
    });
  })();

  // 12-month outlook projected values
  const projected12m = cash + monthlySavings * 12;
  const netGrowth12m = monthlySavings * 12;

  // Monthly savings bar heights (decorative ratios based on savings categories)
  const autoRatio =
    totalAssets > 0
      ? Math.min(100, Math.round((cash / totalAssets) * 300))
      : 40;
  const divsRatio =
    totalAssets > 0
      ? Math.min(100, Math.round(((portfolioValue + stockValue) / totalAssets) * 100))
      : 60;
  const extraRatio =
    totalAssets > 0
      ? Math.min(100, Math.round((gold / totalAssets) * 300))
      : 25;

  const fmt = (n: number) =>
    '€' +
    num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  return (
    <div className="px-8 py-8 max-w-[1440px] mx-auto">
      <div className="grid grid-cols-12 gap-6">

        {/* ── Row 1: Hero Card ── */}
        <section className="col-span-12">
          <div className="bg-surface-container-low p-8 rounded-xl flex justify-between items-end relative overflow-hidden">
            <div className="z-10">
              <p className="text-[12px] uppercase tracking-[0.2em] text-secondary font-medium mb-2">
                Total Tracked Assets
              </p>
              <h1
                className="text-[3.5rem] font-bold text-[#F0EDE8] leading-none tracking-tighter tabular-nums mb-2"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmt(totalAssets)}
              </h1>
              <div className="flex items-center gap-2">
                <span className="flex items-center text-[#3DD68C] text-sm font-semibold tabular-nums tracking-tight">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  +{totalAssets > 0 ? ((monthlySavings * 12 / Math.max(totalAssets, 1)) * 100).toFixed(1) : '0.0'}%
                </span>
                <span className="text-secondary text-xs opacity-60">projected annual</span>
              </div>
            </div>

            {/* Decorative sparkline */}
            <div className="absolute right-0 bottom-0 w-1/3 h-32 opacity-20 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="hero-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c1c1ff" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#c1c1ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,80 Q50,70 100,50 T200,60 T300,20 T400,10 V100 H0 Z"
                  fill="url(#hero-gradient)"
                />
                <path
                  d="M0,80 Q50,70 100,50 T200,60 T300,20 T400,10"
                  fill="none"
                  stroke="#c1c1ff"
                  strokeWidth="3"
                />
              </svg>
            </div>
          </div>
        </section>

        {/* ── Emergency Fund & Runway ── */}
        <section className="col-span-12">
          <div className="bg-surface-container-low p-6 rounded-xl">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
                Emergency Fund &amp; Runway
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">Target</span>
                <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-full">
                  {[3, 4, 5, 6].map(m => (
                    <button
                      key={m}
                      onClick={() => handleTargetMonths(m)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-full tabular-nums transition-colors ${
                        targetMonths === m ? 'bg-surface-container-highest text-primary' : 'text-secondary hover:text-on-surface'
                      }`}
                    >
                      {m}M
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {essentials <= 0 ? (
              <p className="text-secondary text-sm italic">
                Mark your recurring expenses as "Essential" in the Expenses tab to track your runway and emergency fund target.
              </p>
            ) : (
              <>
                {runway !== null && runway < 1 && (
                  <div className="mb-6 p-3 bg-[#F26B6B]/10 border border-[#F26B6B]/20 rounded-lg">
                    <p className="text-[#F26B6B] text-xs font-bold">
                      Critical: less than one month of essential costs in cash.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Runway</p>
                    <p className="text-2xl font-bold text-on-surface tabular-nums tracking-tight">{runwayLabel}</p>
                    <p className="text-xs text-secondary mt-1">{fmt(essentials)} essential costs / month</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">
                      Emergency Fund · {fmt(target)} target
                    </p>
                    <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden my-3">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, target > 0 ? (cash / target) * 100 : 0)}%` }}
                      />
                    </div>
                    <p className="text-xs text-secondary tabular-nums">
                      {fmt(cash)} of {fmt(target)} ({target > 0 ? Math.min(100, Math.round((cash / target) * 100)) : 0}%)
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Fully Funded</p>
                    <p className="text-2xl font-bold text-on-surface tabular-nums tracking-tight">{etaLabel}</p>
                    <p className="text-xs text-secondary mt-1">
                      {monthlySavings > 0 ? `at ${fmt(monthlySavings)} / month` : 'set a monthly savings target'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Row 2 Left: Asset Breakdown + 12-Month Outlook ── */}
        <section className="col-span-12 lg:col-span-7 space-y-6">

          {/* Asset Breakdown */}
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-6">
              Asset Breakdown
            </h2>

            {/* Horizontal stacked bar */}
            <div className="h-10 w-full flex rounded-full overflow-hidden mb-8">
              {assetCategories.map((cat) => (
                <div
                  key={cat.label}
                  className={`h-full ${cat.color}`}
                  style={{ width: `${(cat.value / totalForBar) * 100}%` }}
                />
              ))}
            </div>

            {/* Legend grid */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              {assetCategories.map((cat) => (
                <div
                  key={cat.label}
                  className="flex justify-between items-center py-2 border-b border-outline-variant/10"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${cat.dotColor}`} />
                    <span className="text-sm font-medium text-on-surface">{cat.label}</span>
                  </div>
                  <span
                    className="tabular-nums font-semibold text-on-surface tracking-tight"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmt(cat.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 12-Month Outlook */}
          <div className="bg-surface-container-low p-6 rounded-xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
                12-Month Outlook
              </h2>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-surface-container-high rounded-full text-[10px] font-bold text-primary">
                  PROJECTED
                </span>
              </div>
            </div>

            <div className="h-64 relative flex items-end justify-between px-2">
              {/* Grid lines */}
              <div className="absolute inset-0 top-4 bottom-8 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-b border-on-surface w-full" />
                <div className="border-b border-on-surface w-full" />
                <div className="border-b border-on-surface w-full" />
                <div className="border-b border-on-surface w-full" />
              </div>

              {/* Area chart SVG */}
              <svg
                className="absolute inset-0 h-48 w-full mt-4"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="chart-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c1c1ff" />
                    <stop offset="100%" stopColor="#c1c1ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,80 L10,75 L20,78 L30,60 L40,55 L50,45 L60,40 L70,35 L80,25 L90,15 L100,10 V100 H0 Z"
                  fill="url(#chart-gradient)"
                  fillOpacity="0.15"
                />
                <path
                  d="M0,80 L10,75 L20,78 L30,60 L40,55 L50,45 L60,40 L70,35 L80,25 L90,15 L100,10"
                  fill="none"
                  stroke="#c1c1ff"
                  strokeWidth="1.5"
                />
              </svg>

              {/* Month labels */}
              <div className="w-full flex justify-between text-[10px] text-secondary font-semibold tracking-widest absolute bottom-0 tabular-nums">
                {months.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>

            {/* Projected figures */}
            <div className="mt-4 pt-4 border-t border-outline-variant/10 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">
                  Projected Balance
                </p>
                <p
                  className="text-lg font-bold text-on-surface tabular-nums tracking-tight"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(projected12m)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">
                  Net Growth
                </p>
                <p
                  className="text-lg font-bold text-[#3DD68C] tabular-nums tracking-tight"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  +{fmt(netGrowth12m)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Row 2 Right: Monthly Savings + Distribution Mix ── */}
        <section className="col-span-12 lg:col-span-5 space-y-6">

          {/* Monthly Savings */}
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">
              Monthly Savings
            </h2>

            {/* Input for monthly savings */}
            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium block mb-2">
                Set Monthly Target
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary font-bold text-sm">
                  €
                </span>
                <input
                  type="number"
                  value={netWorthData.monthlyRecurringSavings || ''}
                  onChange={(e) => handleSavingsUpdate('monthlyRecurringSavings', e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 bg-surface-container rounded-lg border border-outline-variant/20 focus:border-primary/50 focus:outline-none text-on-surface font-semibold tabular-nums text-sm transition-colors"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            </div>

            <div className="mb-6">
              <span
                className="text-4xl font-bold text-on-surface tabular-nums leading-tight tracking-tighter"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmt(monthlySavings)}
              </span>
              <p className="text-xs text-secondary mt-1">Monthly recurring savings target</p>
            </div>

            {/* Mini bar columns */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="h-24 bg-surface-container-high rounded-lg flex flex-col justify-end overflow-hidden p-1">
                  <div
                    className="bg-primary-container w-full rounded-md transition-all duration-500"
                    style={{ height: `${Math.max(10, Math.min(90, autoRatio))}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-center text-on-surface-variant">AUTO</p>
              </div>
              <div className="space-y-2">
                <div className="h-24 bg-surface-container-high rounded-lg flex flex-col justify-end overflow-hidden p-1">
                  <div
                    className="bg-primary w-full rounded-md transition-all duration-500"
                    style={{ height: `${Math.max(10, Math.min(90, divsRatio))}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-center text-on-surface-variant">DIVS</p>
              </div>
              <div className="space-y-2">
                <div className="h-24 bg-surface-container-high rounded-lg flex flex-col justify-end overflow-hidden p-1">
                  <div
                    className="bg-tertiary w-full rounded-md transition-all duration-500"
                    style={{ height: `${Math.max(10, Math.min(90, extraRatio))}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-center text-on-surface-variant">EXTRA</p>
              </div>
            </div>

            {/* Quick add accumulated savings */}
            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium block mb-2">
                Cash Savings Balance
              </label>
              <div className="relative mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary font-bold text-sm">
                  €
                </span>
                <input
                  type="number"
                  value={netWorthData.accumulatedSavings || ''}
                  onChange={(e) => handleSavingsUpdate('accumulatedSavings', e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 bg-surface-container rounded-lg border border-outline-variant/20 focus:border-primary/50 focus:outline-none text-on-surface font-semibold tabular-nums text-sm transition-colors"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>

              {/* Manual add entry */}
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary font-bold text-sm">
                    +€
                  </span>
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="Add amount"
                    className="w-full pl-9 pr-3 py-2 bg-surface-container rounded-lg border border-outline-variant/20 focus:border-primary/50 focus:outline-none text-on-surface font-semibold tabular-nums text-sm transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <button
                  onClick={handleQuickAdd}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
                >
                  ADD
                </button>
              </div>
            </div>
          </div>

          {/* Distribution Mix Donut */}
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-8">
              Distribution Mix
            </h2>

            {/* SVG Donut */}
            <div className="relative flex justify-center mb-8">
              <svg className="w-48 h-48" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background track */}
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="transparent"
                  stroke="#464554"
                  strokeOpacity="0.2"
                  strokeWidth="12"
                />
                {/* Segments */}
                {donutSegments.map((seg, idx) => {
                  const pct = seg.value / totalDist;
                  if (pct <= 0) return null;
                  const dashLen = pct * circumference;
                  // cumulative offset
                  const prevOffset = donutSegments
                    .slice(0, idx)
                    .reduce((s, c) => s + (c.value / totalDist) * circumference, 0);
                  return (
                    <circle
                      key={seg.label}
                      cx="96"
                      cy="96"
                      r="80"
                      fill="transparent"
                      stroke={seg.stroke}
                      strokeWidth="12"
                      strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                      strokeDashoffset={circumference - prevOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-secondary font-bold tracking-widest uppercase">
                  Total
                </span>
                <span
                  className="text-xl font-bold text-on-surface tracking-tighter tabular-nums"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(totalAssets)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-3">
              {distCategories.map((cat) => {
                const pct = totalDist > 0 ? ((cat.value / totalDist) * 100).toFixed(0) : '0';
                return (
                  <div key={cat.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cat.dotColor}`} />
                      <span className="font-medium text-on-surface">{cat.label}</span>
                    </div>
                    <span
                      className="tabular-nums font-semibold text-secondary tracking-tight"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Action Callout */}
          <div className="bg-primary/5 border border-primary/10 p-5 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-primary">Optimize Savings</h4>
              <p className="text-[11px] text-on-surface-variant">
                Projected 12-month growth:{' '}
                <span className="tabular-nums font-semibold">{fmt(netGrowth12m)}</span>
              </p>
            </div>
            <button className="bg-primary text-on-primary px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
              REVIEW
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};
