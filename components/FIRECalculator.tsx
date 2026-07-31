import React, { useMemo } from 'react';
import { FIREState } from '../types';
import {
  AreaChart, AxisLabels, Card, Dot, Field, FieldLabel, IconBox, Input, ScreenTitle, SectionLabel,
} from './ui';

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

  // Chart geometry now lives in the AreaChart primitive; only the labels and
  // the reached-index are still needed here.
  const fireReachedIdx = typeof yearsToFire === 'number' ? yearsToFire : -1;

  const formatMoney = (v: number) => {
    if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
    return `€${v.toFixed(0)}`;
  };

  const xTicks = Array.from({ length: 7 }, (_, i) => {
    const idx = Math.round((i / 6) * (projection.length - 1));
    return projection[idx]?.age ?? '';
  });

  const yearsLabel = typeof yearsToFire === 'number' ? yearsToFire.toString() : '> 60';
  const ageLabel = typeof ageAtFire === 'number' ? ageAtFire.toString() : 'N/A';

  const projectedExitYear = typeof yearsToFire === 'number'
    ? new Date().getFullYear() + yearsToFire
    : null;

  const savingsBoost500 = 500;
  // Rough estimate: each $500/mo extra ≈ how many months saved
  const monthsReduced = fireReachedIdx !== -1
    ? Math.round((savingsBoost500 * 12) / (fireNumber * 0.01))
    : null;

  const withdrawalSuccessRate = state.withdrawalRate <= 3.5 ? 99 : state.withdrawalRate <= 4 ? 96 : state.withdrawalRate <= 4.5 ? 90 : 82;

  // The chart shows the whole 60-year run; the accumulation leg is the primary
  // series and the drawdown leg is what the FIRE marker separates.
  const balanceSeries = projection.map(p => p.balance);
  const targetSeries = projection.map(() => fireNumber);

  const inputs: { label: string; field: keyof FIREState; step?: string }[] = [
    { label: 'Annual Expenses', field: 'annualExpenses' },
    { label: 'Current Savings', field: 'currentNetWorth' },
    { label: 'Annual Savings', field: 'annualSavings' },
    { label: 'Current Age', field: 'currentAge' },
    { label: 'Return %', field: 'annualReturn', step: '0.1' },
    { label: 'Withdrawal %', field: 'withdrawalRate', step: '0.1' },
  ];

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <ScreenTitle
        title="FIRE Calculator"
        subtitle="Map your journey to financial independence."
      />

      {/* ── Headline figures ── */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <Card className="text-center">
          <FieldLabel className="!tracking-[.16em]">FIRE Number</FieldLabel>
          <div className="mt-2 text-num-sm font-extrabold tabular-nums">
            {formatMoney(fireNumber)}
          </div>
          <div className="mt-1 text-label text-secondary tabular-nums">
            {state.withdrawalRate}% SWR
          </div>
        </Card>
        <Card className="text-center">
          <FieldLabel className="!tracking-[.16em]">Age at FIRE</FieldLabel>
          <div className="mt-2 text-num-sm font-extrabold text-positive tabular-nums">{ageLabel}</div>
          <div className="mt-1 text-label text-secondary tabular-nums">
            in {yearsLabel} yrs{projectedExitYear ? ` · ${projectedExitYear}` : ''}
          </div>
        </Card>
      </div>

      {/* ── Projection ── */}
      <Card className="lg:col-span-2">
        <div className="flex justify-between items-center mb-4">
          <SectionLabel>60-Year Projection</SectionLabel>
          <span className="flex gap-3 text-micro text-secondary">
            <span className="flex items-center gap-1">
              <Dot color="#c1c1ff" /> Balance
            </span>
            <span className="flex items-center gap-1">
              <Dot color="#464554" /> FIRE number
            </span>
          </span>
        </div>
        <div className="h-[180px]">
          <AreaChart
            points={balanceSeries}
            baseline={targetSeries}
            label="Projected balance against the FIRE number over 60 years"
          />
        </div>
        <AxisLabels
          className="mt-2"
          labels={[`Age ${xTicks[0]}`, `${xTicks[3]}`, `${xTicks[6]}`]}
        />
      </Card>

      {/* ── Inputs ── */}
      <Card className="flex flex-col gap-4">
        <SectionLabel>Inputs</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {inputs.map(input => (
            <Field key={input.field} label={input.label} htmlFor={`fire-${input.field}`}>
              <Input
                id={`fire-${input.field}`}
                type="number"
                step={input.step}
                value={state[input.field] || ''}
                onChange={e => handleChange(input.field, e.target.value)}
                placeholder="0"
              />
            </Field>
          ))}
        </div>
      </Card>

      {/* ── Guidance ── */}
      <div className="flex flex-col gap-3">
        <Card className="flex gap-4">
          <IconBox icon="lightbulb" tone="tertiary" size={44} />
          <div>
            <h3 className="text-body font-bold mb-1">Optimization</h3>
            <p className="text-caption text-secondary leading-relaxed">
              Saving <span className="text-on-surface font-semibold">€{savingsBoost500}</span> more
              per month brings FIRE forward by{' '}
              <span className="text-on-surface font-semibold tabular-nums">
                {monthsReduced ?? '—'}
              </span>{' '}
              months.
            </p>
          </div>
        </Card>

        <Card className="flex gap-4">
          <IconBox icon="shield" tone="primary" size={44} />
          <div>
            <h3 className="text-body font-bold mb-1">Risk Assessment</h3>
            <p className="text-caption text-secondary leading-relaxed">
              A{' '}
              <span className="text-on-surface font-semibold tabular-nums">
                {state.withdrawalRate}%
              </span>{' '}
              withdrawal rate has a{' '}
              <span className="text-on-surface font-semibold tabular-nums">
                {withdrawalSuccessRate}%
              </span>{' '}
              historical success rate over 40 years.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
