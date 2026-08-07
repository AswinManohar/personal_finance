
import React, { useMemo, useState } from 'react';
import { ActiveTab, NetWorthState, PortfolioAsset, Stock, Expense, EmergencyFundState } from '../types';
import { assetBreakdown, monthlyAmount, num, totalAssets as sumAssets } from '../utils/finance';
import {
  AreaChart, AxisLabels, Card, Donut, Dot, EmptyState, Field, FieldLabel, Input, ListRow,
  Pill, PrimaryButton, ProgressBar, SectionLabel, StackedBar, StatBlock, FormError,
} from './ui';

interface SavingsDashboardProps {
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  onSync: (overrides?: any) => Promise<void>;
  expenses?: Expense[];
  emergencyFund?: EmergencyFundState;
  setEmergencyFund?: (next: EmergencyFundState) => void;
  /** Lets the "Optimize Savings" callout hand off to the Calculator. */
  onNavigate?: (tab: ActiveTab) => void;
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
  onNavigate,
}) => {
  const [addAmount, setAddAmount] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // One breakdown, shared with Net Worth and the Goal screen. Memoized because
  // the stock and fund sums walk arrays on every keystroke otherwise.
  const breakdown = useMemo(
    () => assetBreakdown(netWorthData, stocks, portfolio),
    [netWorthData, stocks, portfolio]
  );
  const {
    cash, gold, stocks: stockValue, mutualFunds: portfolioValue, other: otherAssets,
  } = breakdown;
  const monthlySavings = num(netWorthData.monthlyRecurringSavings);

  // Emergency fund. Both figures are typed in; nothing is inferred from the
  // expense list. The fund is a carve-out of accumulatedSavings rather than a
  // separate asset, so totalAssets below is deliberately untouched.
  const efCurrent = num(emergencyFund?.currentAmount);
  const efTarget = num(emergencyFund?.targetAmount);

  const handleEmergencyFund = (
    field: 'currentAmount' | 'targetAmount',
    value: string
  ) => {
    // Floored at zero: a negative fund is not a thing, and letting one through
    // (pasted, or set programmatically past the input's min) turns the
    // carve-out readouts into nonsense — free cash above tracked cash, a
    // negative percentage of target.
    const next: EmergencyFundState = {
      targetAmount: efTarget,
      currentAmount: efCurrent,
      [field]: Math.max(0, parseFloat(value) || 0),
    };
    setEmergencyFund?.(next);
    onSync({ emergencyFund: next });
  };

  // Active subscriptions = recurring expenses, most expensive (per month) first
  const subscriptions = useMemo(
    () => expenses.filter(e => e.isRecurring).sort((a, b) => monthlyAmount(b) - monthlyAmount(a)),
    [expenses]
  );
  const subscriptionTotal = subscriptions.reduce((s, e) => s + monthlyAmount(e), 0);

  // Total assets = Mutual Funds + Stocks + Gold + Cash + Other Assets
  const totalAssets = sumAssets(breakdown);

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
    if (isNaN(amount) || amount <= 0) {
      setAddError('Enter an amount greater than zero.');
      return;
    }
    setAddError(null);
    const newData = {
      ...netWorthData,
      accumulatedSavings: cash + amount,
    };
    setNetWorthData(newData);
    onSync({ netWorthData: newData });
    setAddAmount('');
  };

  // Asset categories for breakdown. Colours are literal so the stacked bar, the
  // legend dot and the donut can never drift apart.
  const assetCategories = [
    { label: 'Mutual Funds', value: portfolioValue, color: '#8183ff' },
    { label: 'Stocks', value: stockValue, color: '#c1c1ff' },
    { label: 'Gold', value: gold, color: '#eec060' },
    { label: 'Cash', value: cash, color: '#464554' },
  ];

  const distCategories = [
    { label: 'Mutual Funds', value: portfolioValue, color: '#8183ff' },
    { label: 'Stocks', value: stockValue, color: '#c1c1ff' },
    { label: 'Gold & Other', value: gold + otherAssets, color: '#eec060' },
  ];
  const totalDist = distCategories.reduce((s, c) => s + c.value, 0) || 1;

  // 12-month outlook projected values
  const projected12m = cash + monthlySavings * 12;
  const netGrowth12m = monthlySavings * 12;
  const outlookSeries = Array.from({ length: 13 }, (_, i) => cash + monthlySavings * i);

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


  const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
  const efPct = pct(efCurrent, efTarget);
  // Free cash floors at zero: the fund is allowed to exceed tracked cash (the
  // usual cause is a stale Cash figure, not a wrong fund), and a negative
  // remainder would be a stranger reading than a warned zero.
  const freeCash = Math.max(0, cash - efCurrent);
  const efOverCash = efCurrent > cash;

  return (
    <>
      {/* ── Hero: total tracked assets ── */}
      <Card className="relative overflow-hidden">
        <FieldLabel className="!tracking-[.16em] mb-2">Total Tracked Assets</FieldLabel>
        <div className="text-num-lg font-extrabold text-hero tabular-nums mb-2">
          {fmt(totalAssets)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-body font-bold text-positive tabular-nums">
            ↗ +{pct(netGrowth12m, Math.max(totalAssets, 1)).toFixed(1)}%
          </span>
          <span className="text-label text-secondary opacity-60">projected annual</span>
        </div>
        <div className="absolute right-0 bottom-0 w-[45%] h-[72px] opacity-20 pointer-events-none">
          <AreaChart points={outlookSeries} grid={false} />
        </div>
      </Card>

      {/* ── Emergency fund ── */}
      <Card>
        <SectionLabel className="mb-4">Emergency Fund</SectionLabel>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Field, not FieldLabel + aria-label: the visible text is the
              accessible name, so speech input can reach the control. */}
          <Field label="Current in fund" htmlFor="ef-current">
            <Input
              id="ef-current"
              type="number"
              min="0"
              prefix="€"
              value={emergencyFund?.currentAmount || ''}
              onChange={e => handleEmergencyFund('currentAmount', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Target" htmlFor="ef-target">
            <Input
              id="ef-target"
              type="number"
              min="0"
              prefix="€"
              value={emergencyFund?.targetAmount || ''}
              onChange={e => handleEmergencyFund('targetAmount', e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        {efCurrent === 0 && efTarget === 0 ? (
          <EmptyState icon="shield">
            Enter what your emergency fund holds today and what you want it to hold.
          </EmptyState>
        ) : (
          <>
            {efOverCash && (
              <div className="mb-4 p-3 rounded-field bg-[rgba(242,107,107,0.1)] border border-negative/20">
                <p className="text-label font-bold text-negative">
                  Your emergency fund is larger than your tracked cash ({fmt(cash)}). Check your
                  Cash Savings Balance or the fund amount.
                </p>
              </div>
            )}
            <ProgressBar percent={efPct} className="mb-2" />
            <p className="text-label text-secondary tabular-nums">
              {fmt(efCurrent)} of {fmt(efTarget)} ({Math.min(100, Math.round(efPct))}%)
            </p>
            <p className="mt-1 text-label text-secondary tabular-nums">
              {fmt(freeCash)} free cash outside the fund
            </p>
          </>
        )}
      </Card>

      {/* Two columns from lg up; a single stack in prototype order below it. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
        <div className="flex flex-col gap-3 lg:col-span-7">
          {/* ── Asset breakdown ── */}
          <Card>
            <SectionLabel className="mb-4">Asset Breakdown</SectionLabel>
            <StackedBar segments={assetCategories} className="mb-4" />
            <div className="flex flex-col">
              {assetCategories.map((cat, i) => (
                <ListRow key={cat.label} divider={i < assetCategories.length - 1} className="h-11">
                  <span className="flex items-center gap-3">
                    <Dot color={cat.color} />
                    <span className="text-body font-medium">{cat.label}</span>
                  </span>
                  <span className="text-body font-semibold tabular-nums">{fmt(cat.value)}</span>
                </ListRow>
              ))}
            </div>
          </Card>

          {/* ── 12-month outlook ── */}
          <Card>
            <div className="flex justify-between items-center mb-4">
              <SectionLabel>12-Month Outlook</SectionLabel>
              <Pill>Projected</Pill>
            </div>
            <div className="h-[140px] mb-2">
              <AreaChart points={outlookSeries} label="Projected savings over the next 12 months" />
            </div>
            <AxisLabels labels={['Jan', 'Mar', 'Jun', 'Sep', 'Dec']} className="mb-4" />
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-outline-variant/12">
              <StatBlock label="Projected Balance" value={fmt(projected12m)} />
              <StatBlock label="Net Growth" tone="positive" value={`+${fmt(netGrowth12m)}`} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-5">
          {/* ── Monthly savings ── */}
          <Card>
            <SectionLabel className="mb-4">Monthly Savings</SectionLabel>

            <FieldLabel className="mb-2">Set Monthly Target</FieldLabel>
            <Input
              type="number"
              prefix="€"
              aria-label="Monthly savings target"
              value={netWorthData.monthlyRecurringSavings || ''}
              onChange={e => handleSavingsUpdate('monthlyRecurringSavings', e.target.value)}
              placeholder="0"
              className="mb-4"
            />

            <div className="mb-4">
              <span className="text-num font-bold tabular-nums">{fmt(monthlySavings)}</span>
              <p className="mt-1 text-label text-secondary">Monthly recurring savings target</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'AUTO', ratio: autoRatio, color: '#8183ff' },
                { label: 'DIVS', ratio: divsRatio, color: '#c1c1ff' },
                { label: 'EXTRA', ratio: extraRatio, color: '#eec060' },
              ].map(b => (
                <div key={b.label} className="flex flex-col gap-2">
                  <div className="h-[88px] bg-surface-container-high rounded-field flex flex-col justify-end p-1 box-border">
                    <div
                      className="w-full rounded transition-[height] duration-500"
                      style={{
                        height: `${Math.max(10, Math.min(90, b.ratio))}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <p className="text-label font-bold text-center text-on-surface-variant">{b.label}</p>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-outline-variant/12">
              <FieldLabel className="mb-2">Cash Savings Balance</FieldLabel>
              <Input
                type="number"
                prefix="€"
                aria-label="Cash savings balance"
                value={netWorthData.accumulatedSavings || ''}
                onChange={e => handleSavingsUpdate('accumulatedSavings', e.target.value)}
                placeholder="0"
                className="mb-3"
              />
              <div className="flex gap-3">
                <Input
                  type="number"
                  prefix="+€"
                  aria-label="Amount to add to savings"
                  value={addAmount}
                  onChange={e => setAddAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                  placeholder="Add amount"
                  className="flex-1"
                />
                <PrimaryButton size="md" onClick={handleQuickAdd}>
                  ADD
                </PrimaryButton>
              </div>
              <FormError className="mt-2">{addError}</FormError>
            </div>
          </Card>

          {/* ── Distribution mix ── */}
          <Card>
            <SectionLabel className="mb-5">Distribution Mix</SectionLabel>
            <div className="flex justify-center mb-5">
              <Donut segments={distCategories} label="Total" value={fmt(totalAssets)} />
            </div>
            <div className="flex flex-col">
              {distCategories.map((cat, i) => (
                <ListRow key={cat.label} divider={i < distCategories.length - 1} className="h-10">
                  <span className="flex items-center gap-3">
                    <Dot color={cat.color} />
                    <span className="text-body font-medium">{cat.label}</span>
                  </span>
                  <span className="text-body font-semibold text-secondary tabular-nums">
                    {pct(cat.value, totalDist).toFixed(0)}%
                  </span>
                </ListRow>
              ))}
            </div>
          </Card>

          {/* ── Active subscriptions ── */}
          <Card>
            <div className="flex justify-between items-center mb-3">
              <SectionLabel>Active Subscriptions</SectionLabel>
              <span className="text-label font-bold tracking-[.08em] uppercase text-primary">
                {subscriptions.length} active
              </span>
            </div>
            {subscriptions.length === 0 ? (
              <EmptyState icon="autorenew">
                No active subscriptions. Recurring expenses appear here.
              </EmptyState>
            ) : (
              <>
                <div className="flex flex-col">
                  {subscriptions.map((s, i) => (
                    <ListRow
                      key={s.id}
                      divider={i < subscriptions.length - 1}
                      className="min-h-14 py-2"
                    >
                      <span
                        data-testid="subscription-row"
                        className="flex flex-col gap-1 min-w-0"
                      >
                        <span className="text-body font-medium truncate">{s.name}</span>
                        <span className="flex gap-1">
                          <Pill>{s.recurringFrequency || 'monthly'}</Pill>
                          {s.isEssential && <Pill tone="positive">Essential</Pill>}
                        </span>
                      </span>
                      <span className="text-body font-bold tabular-nums flex-none">
                        {fmt(monthlyAmount(s))}
                        <span className="text-micro font-medium text-secondary"> /mo</span>
                      </span>
                    </ListRow>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-3">
                  <FieldLabel>Total / Month</FieldLabel>
                  <span className="text-stat font-bold tabular-nums">{fmt(subscriptionTotal)}</span>
                </div>
              </>
            )}
          </Card>

          {/* ── Optimize callout ── */}
          <div className="bg-primary/5 border border-primary/10 rounded-card p-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-body font-bold text-primary">Optimize Savings</h4>
              <p className="mt-1 text-label text-on-surface-variant">
                12-month growth:{' '}
                <span className="font-semibold tabular-nums">{fmt(netGrowth12m)}</span>
              </p>
            </div>
            <PrimaryButton
              size="md"
              className="flex-none"
              onClick={() => onNavigate?.('investment')}
            >
              REVIEW
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
};
