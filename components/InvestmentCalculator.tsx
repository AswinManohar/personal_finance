import React, { useMemo } from 'react';
import { InvestmentState, CalculationResult } from '../types';
import {
  AreaChart as UiAreaChart, AxisLabels, Card, Dot, Field, FieldLabel, Input, ScreenTitle,
  SectionLabel, StatBlock,
} from './ui';

interface InvestmentCalculatorProps {
  investment: InvestmentState;
  setInvestment: React.Dispatch<React.SetStateAction<InvestmentState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const InvestmentCalculator: React.FC<InvestmentCalculatorProps> = ({
  investment,
  setInvestment,
  onSync,
}) => {
  const handleChange = (field: keyof InvestmentState, value: string) => {
    const numValue = parseFloat(value);
    const newState = {
      ...investment,
      [field]: isNaN(numValue) ? 0 : numValue,
    };
    setInvestment(newState);
    if (onSync) {
      onSync({ investment: newState });
    }
  };

  const data: CalculationResult[] = useMemo(() => {
    const results: CalculationResult[] = [];
    const months = investment.yearsToGrow * 12;
    const monthlyRate = investment.annualInterestRate / 100 / 12;

    let currentValue = investment.initialPrincipal;
    let totalInvested = investment.initialPrincipal;

    for (let i = 0; i <= months; i++) {
      if (i % 12 === 0) {
        results.push({
          month: i / 12,
          value: parseFloat(currentValue.toFixed(2)),
          invested: parseFloat(totalInvested.toFixed(2)),
        });
      }

      if (i < months) {
        currentValue = (currentValue + investment.monthlyContribution) * (1 + monthlyRate);
        totalInvested += investment.monthlyContribution;
      }
    }
    return results;
  }, [investment]);

  const finalAmount = data[data.length - 1].value;
  const totalPrincipal = data[data.length - 1].invested;
  const totalInterest = finalAmount - totalPrincipal;

  const fmt = (v: number) =>
    '€' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <ScreenTitle
        title="Investment Calculator"
        subtitle="Project compounded growth over time."
      />

      {/* ── Parameters ── */}
      <Card className="flex flex-col gap-4">
        <SectionLabel>Parameters</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Principal (€)" htmlFor="inv-principal">
            <Input
              id="inv-principal"
              type="number"
              value={investment.initialPrincipal || ''}
              onChange={e => handleChange('initialPrincipal', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Monthly (€)" htmlFor="inv-monthly">
            <Input
              id="inv-monthly"
              type="number"
              value={investment.monthlyContribution || ''}
              onChange={e => handleChange('monthlyContribution', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Rate (%)" htmlFor="inv-rate">
            <Input
              id="inv-rate"
              type="number"
              step="0.1"
              value={investment.annualInterestRate || ''}
              onChange={e => handleChange('annualInterestRate', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label={`Years — ${investment.yearsToGrow}`} htmlFor="inv-years">
            <Input
              id="inv-years"
              type="number"
              value={investment.yearsToGrow || ''}
              onChange={e => handleChange('yearsToGrow', e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          aria-label="Years to grow"
          value={investment.yearsToGrow}
          onChange={e => handleChange('yearsToGrow', e.target.value)}
          className="w-full h-6 accent-primary cursor-pointer"
        />
      </Card>

      {/* ── Results ── */}
      <div className="flex flex-col gap-3">
        <Card>
          <FieldLabel>Final Value</FieldLabel>
          <p className="mt-1 text-num font-bold tabular-nums">{fmt(finalAmount)}</p>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <StatBlock label="Contributed" value={fmt(totalPrincipal)} />
          </Card>
          <Card>
            <StatBlock label="Interest" tone="positive" value={`+${fmt(totalInterest)}`} />
          </Card>
        </div>
      </div>

      {/* ── Growth projection ── */}
      <Card className="lg:col-span-2">
        <div className="flex justify-between items-center mb-4">
          <SectionLabel>Growth Projection</SectionLabel>
          <span className="flex gap-3 text-micro text-secondary">
            <span className="flex items-center gap-1">
              <Dot color="#c1c1ff" /> Value
            </span>
            <span className="flex items-center gap-1">
              <Dot color="#464554" /> Invested
            </span>
          </span>
        </div>
        <div className="h-[180px]">
          <UiAreaChart
            points={data.map(d => d.value)}
            baseline={data.map(d => d.invested)}
            label="Projected value against total invested"
          />
        </div>
        <AxisLabels
          className="mt-2"
          labels={['Y0', `Y${Math.round(investment.yearsToGrow / 2)}`, `Y${investment.yearsToGrow}`]}
        />
      </Card>
    </div>
  );
};
