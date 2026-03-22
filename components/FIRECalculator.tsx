import React, { useMemo } from 'react';
import { FIREState } from '../types';

interface FIRECalculatorProps {
  state: FIREState;
  setState: React.Dispatch<React.SetStateAction<FIREState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const FIRECalculator: React.FC<FIRECalculatorProps> = ({ state, setState, onSync }) => {
  const handleChange = (field: keyof FIREState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...state,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setState(newState);
    if (onSync) {
      onSync({ fire: newState });
    }
  };

  const { fireNumber, projection, yearsToFire, ageAtFire } = useMemo(() => {
    const fireNumber = state.annualExpenses / (state.withdrawalRate / 100);
    const projection = [];

    let currentBalance = state.currentNetWorth;
    let age = state.currentAge;
    let year = new Date().getFullYear();
    let yearsPassed = 0;
    let reached = false;

    while (yearsPassed < 60) {
      projection.push({
        year,
        age,
        balance: Math.round(currentBalance),
        fireNumber: Math.round(fireNumber),
        isReached: currentBalance >= fireNumber
      });

      if (currentBalance >= fireNumber && !reached) {
        reached = true;
      }

      const growth = currentBalance * (state.annualReturn / 100);
      currentBalance = currentBalance + growth + state.annualSavings;

      age++;
      year++;
      yearsPassed++;
    }

    const reachedIndex = projection.findIndex(p => p.isReached);
    const yearsToFire = reachedIndex !== -1 ? reachedIndex : '> 60';
    const ageAtFire = reachedIndex !== -1 ? state.currentAge + reachedIndex : 'N/A';

    return { fireNumber, projection, yearsToFire, ageAtFire };
  }, [state]);

  // Chart geometry helpers
  const chartW = 800;
  const chartH = 380;
  const maxBalance = Math.max(...projection.map(p => p.balance), fireNumber);
  const fireReachedIdx = typeof yearsToFire === 'number' ? yearsToFire : -1;

  // Build SVG path from projection data
  const toX = (i: number) => (i / (projection.length - 1)) * chartW;
  const toY = (val: number) => chartH - (val / (maxBalance * 1.05)) * chartH;

  const accPoints = projection.slice(0, fireReachedIdx !== -1 ? fireReachedIdx + 1 : projection.length);
  const drawPoints = fireReachedIdx !== -1 ? projection.slice(fireReachedIdx) : [];

  const buildPath = (pts: typeof projection, startIdx: number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(startIdx + i).toFixed(1)},${toY(p.balance).toFixed(1)}`).join(' ');

  const buildAreaPath = (pts: typeof projection, startIdx: number) => {
    if (pts.length === 0) return '';
    const linePart = buildPath(pts, startIdx);
    const lastX = toX(startIdx + pts.length - 1).toFixed(1);
    const firstX = toX(startIdx).toFixed(1);
    return `${linePart} L${lastX},${chartH} L${firstX},${chartH} Z`;
  };

  const fireLineX = fireReachedIdx !== -1 ? ((fireReachedIdx / (projection.length - 1)) * 100).toFixed(1) : null;

  const fireAgeLabel = typeof ageAtFire === 'number' ? `AGE ${ageAtFire}` : 'N/A';
  const yearsLabel = typeof yearsToFire === 'number' ? yearsToFire.toString() : '> 60';
  const ageLabel = typeof ageAtFire === 'number' ? ageAtFire.toString() : 'N/A';

  // Y-axis labels
  const yLabels = [maxBalance * 1.05, (maxBalance * 1.05) * 0.75, (maxBalance * 1.05) * 0.5, (maxBalance * 1.05) * 0.25, 0];
  const formatMoney = (v: number) => {
    if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
    return `€${v.toFixed(0)}`;
  };

  // X-axis age ticks (7 evenly spaced)
  const xTicks = Array.from({ length: 7 }, (_, i) => {
    const idx = Math.round((i / 6) * (projection.length - 1));
    return projection[idx]?.age ?? '';
  });

  const projectedExitYear = typeof yearsToFire === 'number'
    ? new Date().getFullYear() + yearsToFire
    : null;

  const monthlySavings = Math.round(state.annualSavings / 12);
  const savingsBoost500 = 500;
  // Rough estimate: each $500/mo extra ≈ how many months saved
  const monthsReduced = fireReachedIdx !== -1
    ? Math.round((savingsBoost500 * 12) / (fireNumber * 0.01))
    : null;

  const withdrawalSuccessRate = state.withdrawalRate <= 3.5 ? 99 : state.withdrawalRate <= 4 ? 96 : state.withdrawalRate <= 4.5 ? 90 : 82;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-on-surface">FIRE Calculator</h1>
        <p className="text-secondary text-sm max-w-2xl leading-relaxed">
          Precision modeling for financial independence. Map your journey from accumulation to early exit using institutional-grade projection logic.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Col: Inputs */}
        <aside className="lg:col-span-4 bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
          <h2 className="text-lg font-bold mb-8 flex items-center gap-2 text-on-surface">
            <svg className="text-primary w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" />
            </svg>
            Inputs
          </h2>

          <div className="space-y-6">
            {/* Annual Expenses */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Annual Expenses</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-semibold">€</span>
                <input
                  type="number"
                  value={state.annualExpenses}
                  onChange={(e) => handleChange('annualExpenses', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 pl-8 pr-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
                />
              </div>
            </div>

            {/* Current Savings */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Current Savings</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-semibold">€</span>
                <input
                  type="number"
                  value={state.currentNetWorth}
                  onChange={(e) => handleChange('currentNetWorth', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 pl-8 pr-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
                />
              </div>
            </div>

            {/* Monthly Savings */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Monthly Savings</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-semibold">€</span>
                <input
                  type="number"
                  value={monthlySavings}
                  onChange={(e) => {
                    const monthly = parseFloat(e.target.value);
                    const annual = isNaN(monthly) ? 0 : monthly * 12;
                    const newState = { ...state, annualSavings: annual };
                    setState(newState);
                    if (onSync) onSync({ fire: newState });
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 pl-8 pr-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
                />
              </div>
            </div>

            {/* Return % and Withdrawal % */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Return %</label>
                <div className="relative">
                  <input
                    type="number"
                    value={state.annualReturn}
                    step="0.1"
                    onChange={(e) => handleChange('annualReturn', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 px-4 pr-8 text-on-surface tabular-nums font-semibold outline-none transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary font-semibold">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Withdrawal %</label>
                <div className="relative">
                  <input
                    type="number"
                    value={state.withdrawalRate}
                    step="0.1"
                    onChange={(e) => handleChange('withdrawalRate', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 px-4 pr-8 text-on-surface tabular-nums font-semibold outline-none transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary font-semibold">%</span>
                </div>
              </div>
            </div>

            {/* Current Age */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">Current Age</label>
              <input
                type="number"
                value={state.currentAge}
                onChange={(e) => handleChange('currentAge', e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg py-3 px-4 text-on-surface tabular-nums font-semibold outline-none transition-all"
              />
            </div>

            <button
              onClick={() => {
                // Re-triggers memoized calculation — state is already live
                if (onSync) onSync({ fire: state });
              }}
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary-container font-bold py-4 rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Recalculate Projection
            </button>
          </div>
        </aside>

        {/* Right Col */}
        <div className="lg:col-span-8 space-y-8">
          {/* 60-Year Projection Chart */}
          <section className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
            <div className="flex justify-between items-end mb-12">
              <div>
                <h2 className="text-lg font-bold mb-1 text-on-surface">60-Year Projection</h2>
                <p className="text-sm text-secondary">Projected net worth and asset depletion modeling.</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary/40"></div>
                  <span className="text-xs font-medium text-secondary">Accumulation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-positive/40"></div>
                  <span className="text-xs font-medium text-secondary">Drawdown</span>
                </div>
              </div>
            </div>

            <div className="relative h-[400px] w-full mt-8 group">
              {/* Y-Axis Labels */}
              <div className="absolute left-0 h-full flex flex-col justify-between text-[10px] text-secondary/60 tabular-nums font-semibold tracking-tight py-2">
                {yLabels.map((v, i) => (
                  <span key={i}>{formatMoney(v)}</span>
                ))}
              </div>

              {/* Chart Canvas */}
              <div className="ml-12 h-full relative">
                {/* Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="border-t border-outline-variant/10 w-full h-px" />
                  ))}
                  <div className="border-b border-outline-variant/20 w-full h-px" />
                </div>

                {/* SVG Chart */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="accGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#c1c1ff" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#c1c1ff" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="drawGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3DD68C" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3DD68C" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Accumulation area */}
                  {accPoints.length > 1 && (
                    <path
                      d={buildAreaPath(accPoints, 0)}
                      fill="url(#accGrad)"
                    />
                  )}
                  {/* Drawdown area */}
                  {drawPoints.length > 1 && (
                    <path
                      d={buildAreaPath(drawPoints, fireReachedIdx)}
                      fill="url(#drawGrad)"
                    />
                  )}
                  {/* Accumulation line */}
                  {accPoints.length > 1 && (
                    <path
                      d={buildPath(accPoints, 0)}
                      fill="none"
                      stroke="#c1c1ff"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Drawdown line */}
                  {drawPoints.length > 1 && (
                    <path
                      d={buildPath(drawPoints, fireReachedIdx)}
                      fill="none"
                      stroke="#3DD68C"
                      strokeWidth="3"
                      strokeDasharray="8 4"
                      strokeLinecap="round"
                    />
                  )}
                </svg>

                {/* FIRE Date Indicator */}
                {fireLineX !== null && (
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-primary z-10 group-hover:border-primary-container transition-colors"
                    style={{ left: `${fireLineX}%` }}
                  >
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-xl tabular-nums tracking-tight">
                      FIRE DATE: {fireAgeLabel}
                    </div>
                  </div>
                )}

                {/* X-Axis Age Ticks */}
                <div className="absolute bottom-[-32px] w-full flex justify-between text-[10px] text-secondary/60 font-semibold tabular-nums tracking-tight">
                  {xTicks.map((tick, i) => (
                    <span key={i}>{i === 0 ? `AGE ${tick}` : tick}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-2">FIRE Number</span>
              <div className="text-3xl font-black tabular-nums tracking-tighter text-on-surface">
                €{fireNumber.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="mt-2 text-[11px] text-secondary font-semibold tabular-nums tracking-tight">
                Based on {state.withdrawalRate.toFixed(1)}% SWR
              </div>
            </div>

            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-2">Years to FIRE</span>
              <div className="text-3xl font-black tabular-nums tracking-tighter text-on-surface">
                {yearsLabel}
              </div>
              <div className="mt-2 text-[11px] text-secondary font-semibold tabular-nums tracking-tight">
                {typeof yearsToFire === 'number'
                  ? <span>At current savings rate</span>
                  : <span className="text-negative">Increase savings rate</span>
                }
              </div>
            </div>

            <div className={`bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col items-center text-center ${typeof ageAtFire === 'number' && ageAtFire < 55 ? 'ring-1 ring-positive/20' : ''}`}>
              <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-2">Age at FIRE</span>
              <div className={`text-3xl font-black tabular-nums tracking-tighter ${typeof ageAtFire === 'number' && ageAtFire < 55 ? 'text-positive' : 'text-on-surface'}`}>
                {ageLabel}
              </div>
              <div className="mt-2 text-[11px] text-secondary font-semibold tabular-nums tracking-tight">
                {projectedExitYear ? `Projected Exit: ${projectedExitYear}` : 'Beyond 60-year window'}
              </div>
            </div>
          </div>

          {/* Strategic Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-surface-container-low border border-outline-variant/10 flex gap-4">
              <div className="w-12 h-12 rounded-lg bg-tertiary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-tertiary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7zm-2 19v-1h4v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold mb-1 text-on-surface">Optimization Logic</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Increasing monthly savings by{' '}
                  <span className="font-semibold tabular-nums tracking-tight text-on-surface">€500</span>{' '}
                  {monthsReduced !== null
                    ? <>reduces your FIRE timeline by{' '}<span className="font-semibold tabular-nums tracking-tight text-on-surface">{monthsReduced}</span> months.</>
                    : <>reduces your FIRE timeline significantly.</>
                  }{' '}
                  Consider reallocation of discretionary budget.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-surface-container-low border border-outline-variant/10 flex gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold mb-1 text-on-surface">Risk Assessment</h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Your current withdrawal rate of{' '}
                  <span className="font-semibold tabular-nums tracking-tight text-on-surface">{state.withdrawalRate.toFixed(1)}%</span>{' '}
                  has a{' '}
                  <span className="font-semibold tabular-nums tracking-tight text-on-surface">{withdrawalSuccessRate}%</span>{' '}
                  success probability over a{' '}
                  <span className="font-semibold tabular-nums tracking-tight text-on-surface">40</span>-year horizon based on historical volatility.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
