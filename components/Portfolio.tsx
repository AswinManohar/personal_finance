import React, { useState, useMemo } from 'react';
import { PortfolioAsset, AssetType, InvestmentFrequency } from '../types';
import { Plus, Trash2, Download } from 'lucide-react';
import {
  AreaChart as UiAreaChart, AxisLabels, Card, ChipGroup, Dot, EmptyState, Field, FieldLabel,
  GhostButton, Input, PrimaryButton, ScreenTitle, SectionLabel, Select, StackedBar, StatBlock, Tile,
} from './ui';
import { newId } from '../utils/id';
import { saveTextFile } from '../services/download';

interface PortfolioProps {
  assets: PortfolioAsset[];
  setAssets: React.Dispatch<React.SetStateAction<PortfolioAsset[]>>;
  onSync?: (overrides?: any) => Promise<void>;
}

const typeLabel: Record<AssetType, string> = {
  MUTUAL_FUND_INDIA: 'Mutual Fund',
  ETF_GLOBAL: 'ETF Global',
  OTHER: 'Other',
};

export const Portfolio: React.FC<PortfolioProps> = ({ assets, setAssets, onSync }) => {
  const [projectionYears, setProjectionYears] = useState(10);

  // Form State
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AssetType>('MUTUAL_FUND_INDIA');
  const [newCurrentValue, setNewCurrentValue] = useState('');
  const [newMonthly, setNewMonthly] = useState('');
  const [newReturn, setNewReturn] = useState('12');
  const [newTER, setNewTER] = useState('0.8');
  const [newTax, setNewTax] = useState('12.5');
  const [newFrequency, setNewFrequency] = useState<InvestmentFrequency>('Monthly');

  const handleTypeChange = (type: AssetType) => {
    setNewType(type);
    if (type === 'MUTUAL_FUND_INDIA') {
      setNewReturn('12');
      setNewTER('0.8');
      setNewTax('12.5');
    } else if (type === 'ETF_GLOBAL') {
      setNewReturn('10');
      setNewTER('0.15');
      setNewTax('20');
    }
  };

  const handleAdd = async () => {
    if (!newName) return;

    const asset: PortfolioAsset = {
      id: newId(),
      name: newName,
      type: newType,
      currentValue: parseFloat(newCurrentValue) || 0,
      monthlyInvestment: parseFloat(newMonthly) || 0,
      expectedReturn: parseFloat(newReturn) || 0,
      expenseRatio: parseFloat(newTER) || 0,
      taxRate: parseFloat(newTax) || 0,
      frequency: newFrequency,
    };

    const updatedAssets = [...assets, asset];
    setAssets(updatedAssets);

    if (onSync) {
      await onSync({ portfolio: updatedAssets });
    }

    setNewName('');
    setNewCurrentValue('');
    setNewMonthly('');
    setNewReturn('12');
    setNewTER('0.8');
    setNewTax('12.5');
  };

  const handleDelete = async (id: string) => {
    const updatedAssets = assets.filter((a) => a.id !== id);
    setAssets(updatedAssets);
    if (onSync) {
      await onSync({ portfolio: updatedAssets });
    }
  };

  // Simulation
  const simulationData = useMemo(() => {
    const data = [];
    const months = projectionYears * 12;

    let currentAssets = assets.map((a) => ({
      ...a,
      simulatedValue: a.currentValue,
      totalInvested: a.currentValue,
    }));

    for (let i = 0; i <= months; i++) {
      if (i % 12 === 0) {
        const grossValue = currentAssets.reduce((sum, a) => sum + a.simulatedValue, 0);
        const invested = currentAssets.reduce((sum, a) => sum + a.totalInvested, 0);

        let totalNetValue = 0;
        currentAssets.forEach((asset) => {
          const gains = asset.simulatedValue - asset.totalInvested;
          const tax = gains > 0 ? gains * (asset.taxRate / 100) : 0;
          totalNetValue += asset.simulatedValue - tax;
        });

        data.push({
          year: i / 12,
          grossValue: Math.round(grossValue),
          netValue: Math.round(totalNetValue),
          invested: Math.round(invested),
        });
      }

      if (i < months) {
        currentAssets = currentAssets.map((asset) => {
          const effectiveAnnualRate = asset.expectedReturn - asset.expenseRatio;
          const monthlyRate = effectiveAnnualRate / 100 / 12;

          let monthlyContribution = asset.monthlyInvestment;
          if (asset.frequency === 'One-time') monthlyContribution = 0;
          if (asset.frequency === 'Bi-monthly') monthlyContribution = asset.monthlyInvestment / 2;

          return {
            ...asset,
            simulatedValue: (asset.simulatedValue + monthlyContribution) * (1 + monthlyRate),
            totalInvested: asset.totalInvested + monthlyContribution,
          };
        });
      }
    }
    return data;
  }, [assets, projectionYears]);

  // Summary metrics
  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalMonthly = assets.reduce((s, a) => {
    if (a.frequency === 'One-time') return s;
    if (a.frequency === 'Bi-monthly') return s + a.monthlyInvestment / 2;
    return s + a.monthlyInvestment;
  }, 0);
  const weightedReturn =
    totalValue > 0
      ? assets.reduce((s, a) => s + a.expectedReturn * a.currentValue, 0) / totalValue
      : 0;

  // Allocation drift data per type
  const allocationByType = useMemo(() => {
    const totals: Record<string, number> = {};
    assets.forEach((a) => {
      totals[a.type] = (totals[a.type] || 0) + a.currentValue;
    });
    return Object.entries(totals).map(([type, val]) => ({
      label: typeLabel[type as AssetType] || type,
      pct: totalValue > 0 ? Math.round((val / totalValue) * 100) : 0,
    }));
  }, [assets, totalValue]);

  const exportCSV = async () => {
    const headers = 'Fund Name,Type,Expense Ratio,Expected Return,Tax Rate,Monthly Investment,Current Value';
    const rows = assets.map(
      (a) =>
        `"${a.name}","${typeLabel[a.type]}",${a.expenseRatio}%,${a.expectedReturn}%,${a.taxRate}%,${a.monthlyInvestment},${a.currentValue}`
    );
    // See services/download.ts: a blob: URL silently does nothing in a WebView.
    await saveTextFile('portfolio.csv', [headers, ...rows].join('\n'));
  };

  const fmt = (v: number) =>
    '€' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  const TYPE_COLOR: Record<string, string> = {
    'Mutual Fund': '#8183ff',
    'ETF Global': '#c1c1ff',
    Other: '#eec060',
  };

  const final = simulationData[simulationData.length - 1];

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <ScreenTitle title="Portfolio" subtitle="Mutual funds and long-term holdings." />

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <Card>
          <StatBlock label="Current Value" size="num-sm" value={fmt(totalValue)} />
        </Card>
        <Card>
          <StatBlock
            label="Monthly In"
            size="num-sm"
            tone="positive"
            value={fmt(totalMonthly)}
            sub={`${weightedReturn.toFixed(1)}% weighted return`}
          />
        </Card>
      </div>

      {/* ── Holdings ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Holdings</SectionLabel>
          <GhostButton size="sm" onClick={() => { void exportCSV(); }}>
            <Download size={15} /> Export
          </GhostButton>
        </div>

        {assets.length === 0 ? (
          <EmptyState icon="pie_chart">
            No funds yet. Add your first holding to project its growth.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {assets.map(asset => (
              <Tile key={asset.id} className="group">
                <span className="min-w-0">
                  <span className="block text-body font-bold truncate">{asset.name}</span>
                  <span className="block mt-0.5 text-label text-secondary/60 tabular-nums">
                    {typeLabel[asset.type]} · {asset.expectedReturn}% · TER {asset.expenseRatio}%
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-none">
                  <span className="text-right">
                    <span className="block text-body font-bold tabular-nums">
                      {fmt(asset.currentValue)}
                    </span>
                    <span className="block mt-0.5 text-micro font-bold text-primary tabular-nums">
                      {fmt(asset.monthlyInvestment)}/{asset.frequency === 'One-time' ? 'once' : 'mo'}
                    </span>
                  </span>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    aria-label={`Delete ${asset.name}`}
                    className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </Tile>
            ))}
          </div>
        )}

        {allocationByType.length > 0 && (
          <div className="mt-4 pt-4 border-t border-outline-variant/12">
            <FieldLabel className="mb-2">Allocation</FieldLabel>
            <StackedBar
              height={8}
              className="mb-3"
              segments={allocationByType.map(a => ({
                label: a.label,
                value: a.pct,
                color: TYPE_COLOR[a.label] ?? '#464554',
              }))}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {allocationByType.map(a => (
                <span key={a.label} className="flex items-center gap-2 text-label text-secondary">
                  <Dot color={TYPE_COLOR[a.label] ?? '#464554'} />
                  {a.label} <span className="tabular-nums font-bold">{a.pct}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Add fund ── */}
      <Card className="flex flex-col gap-3">
        <div>
          <SectionLabel>New Fund</SectionLabel>
          <p className="mt-1 text-label text-secondary opacity-70">
            Type presets fill return, TER and tax
          </p>
        </div>
        <Field label="Fund Name" htmlFor="pf-name">
          <Input
            id="pf-name"
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Parag Parikh Flexi Cap"
          />
        </Field>
        <Field label="Type" htmlFor="pf-type">
          <Select
            id="pf-type"
            value={newType}
            onChange={e => handleTypeChange(e.target.value as AssetType)}
          >
            <option value="MUTUAL_FUND_INDIA">Mutual Fund</option>
            <option value="ETF_GLOBAL">ETF Global</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current Value" htmlFor="pf-value">
            <Input
              id="pf-value"
              type="number"
              value={newCurrentValue}
              onChange={e => setNewCurrentValue(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Monthly" htmlFor="pf-monthly">
            <Input
              id="pf-monthly"
              type="number"
              value={newMonthly}
              onChange={e => setNewMonthly(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Return %" htmlFor="pf-return">
            <Input
              id="pf-return"
              type="number"
              step="0.1"
              value={newReturn}
              onChange={e => setNewReturn(e.target.value)}
            />
          </Field>
          <Field label="TER %" htmlFor="pf-ter">
            <Input
              id="pf-ter"
              type="number"
              step="0.01"
              value={newTER}
              onChange={e => setNewTER(e.target.value)}
            />
          </Field>
          <Field label="Tax %" htmlFor="pf-tax">
            <Input
              id="pf-tax"
              type="number"
              step="0.1"
              value={newTax}
              onChange={e => setNewTax(e.target.value)}
            />
          </Field>
          <Field label="Frequency" htmlFor="pf-frequency">
            <Select
              id="pf-frequency"
              value={newFrequency}
              onChange={e => setNewFrequency(e.target.value as InvestmentFrequency)}
            >
              <option value="Monthly">Monthly</option>
              <option value="Bi-monthly">Bi-monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="One-time">One-time</option>
            </Select>
          </Field>
        </div>
        <PrimaryButton onClick={handleAdd}>
          <Plus size={16} /> Add Fund
        </PrimaryButton>
      </Card>

      {/* ── Projection ── */}
      {assets.length > 0 && (
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center gap-2 mb-4">
            <SectionLabel>Growth Projection</SectionLabel>
            <ChipGroup
              aria-label="Projection horizon"
              value={projectionYears}
              onChange={setProjectionYears}
              options={[5, 10, 20, 30].map(y => ({ value: y, label: `${y}Y` }))}
            />
          </div>
          <div className="h-[180px]">
            <UiAreaChart
              points={simulationData.map(d => d.netValue)}
              baseline={simulationData.map(d => d.invested)}
              label="Projected net value against total invested"
            />
          </div>
          <AxisLabels
            className="mt-2 mb-4"
            labels={['Y0', `Y${Math.round(projectionYears / 2)}`, `Y${projectionYears}`]}
          />
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-outline-variant/12">
            <StatBlock label="Invested" value={fmt(final?.invested ?? 0)} />
            <StatBlock label="Gross" value={fmt(final?.grossValue ?? 0)} />
            <StatBlock label="After Tax" tone="positive" value={fmt(final?.netValue ?? 0)} />
          </div>
        </Card>
      )}
    </div>
  );
};
