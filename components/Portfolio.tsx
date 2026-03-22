import React, { useState, useMemo } from 'react';
import { PortfolioAsset, AssetType, InvestmentFrequency } from '../types';
import { Plus, Trash2, TrendingUp, BarChart2, Download, SlidersHorizontal, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  const [isAdding, setIsAdding] = useState(false);
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
      id: crypto.randomUUID(),
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
    setIsAdding(false);
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

  const exportCSV = () => {
    const headers = 'Fund Name,Type,Expense Ratio,Expected Return,Tax Rate,Monthly Investment,Current Value';
    const rows = assets.map(
      (a) =>
        `"${a.name}","${typeLabel[a.type]}",${a.expenseRatio}%,${a.expectedReturn}%,${a.taxRate}%,${a.monthlyInvestment},${a.currentValue}`
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'portfolio.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const inputCls =
    'w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg p-3 text-on-surface outline-none transition-all text-sm';
  const labelCls = 'block text-xs font-bold tracking-widest uppercase text-secondary mb-1.5';

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Summary Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Total Portfolio Value</p>
            <h3 className="text-4xl font-bold text-on-surface tabular-nums tracking-tighter">
              €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <BarChart2 size={96} />
          </div>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Weighted Avg Return</p>
            <h3 className="text-4xl font-bold text-[#3DD68C] tabular-nums tracking-tighter">
              {weightedReturn.toFixed(1)}%
            </h3>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <TrendingUp size={96} />
          </div>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Total Monthly Investment</p>
            <h3 className="text-4xl font-bold text-on-surface tabular-nums tracking-tighter">
              €{totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Plus size={96} />
          </div>
        </div>
      </section>

      {/* Table Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tight">Active Holdings</h1>
          <p className="text-secondary text-sm mt-1">Detailed performance and allocation ledger across all assets.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-on-surface hover:bg-surface-bright transition-all">
            <SlidersHorizontal size={16} /> Filter
          </button>
          <button
            onClick={exportCSV}
            className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-on-surface hover:bg-surface-bright transition-all"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:opacity-90 transition-all"
          >
            <Plus size={16} /> Add Fund
          </button>
        </div>
      </div>

      {/* Add Fund Form */}
      {isAdding && (
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-bold tracking-widest uppercase text-secondary">Add New Fund</h3>
            <button onClick={() => setIsAdding(false)} className="text-secondary hover:text-on-surface transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className={labelCls}>Fund Name</label>
              <input
                type="text"
                placeholder="e.g. Nifty 50 Index Fund"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select
                value={newType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className={inputCls}
              >
                <option value="MUTUAL_FUND_INDIA">Mutual Fund (India)</option>
                <option value="ETF_GLOBAL">ETF (Global)</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Frequency</label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                className={inputCls}
              >
                <option value="One-time">One-time</option>
                <option value="Monthly">Monthly</option>
                <option value="Bi-monthly">Bi-monthly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Current Value (€)</label>
              <input
                type="number"
                value={newCurrentValue}
                onChange={(e) => setNewCurrentValue(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Monthly Investment (€)</label>
              <input
                type="number"
                value={newMonthly}
                onChange={(e) => setNewMonthly(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Expected Return (%)</label>
              <input
                type="number"
                value={newReturn}
                onChange={(e) => setNewReturn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Expense Ratio / TER (%)</label>
              <input
                type="number"
                value={newTER}
                onChange={(e) => setNewTER(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Tax Rate (%)</label>
              <input
                type="number"
                value={newTax}
                onChange={(e) => setNewTax(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setIsAdding(false)}
              className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-semibold text-secondary hover:bg-surface-bright transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold px-6 py-2 rounded-lg text-sm hover:opacity-90 transition-all"
            >
              Add to Portfolio
            </button>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      {assets.length > 0 ? (
        <>
          <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-2xl mb-12">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-high/50 text-left border-b border-outline-variant/10">
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary">Fund Name</th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary">Type</th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Expense Ratio
                    </th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Expected Return
                    </th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Tax Rate
                    </th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Monthly Investment
                    </th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Current Value
                    </th>
                    <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                      Gain / Loss
                    </th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {assets.map((asset, idx) => {
                    const simulatedFinal = simulationData[simulationData.length - 1];
                    const assetGain = simulatedFinal
                      ? asset.currentValue * (Math.pow(1 + (asset.expectedReturn - asset.expenseRatio) / 100, 1) - 1)
                      : 0;
                    const isPositive = assetGain >= 0;
                    const rowClass =
                      idx % 2 === 0
                        ? 'bg-surface hover:bg-surface-container-low transition-colors group'
                        : 'bg-surface-container-low hover:bg-surface-container-high transition-colors group';

                    return (
                      <tr key={asset.id} className={rowClass}>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                              <TrendingUp size={16} />
                            </div>
                            <span className="font-bold text-on-surface">{asset.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="bg-surface-container-high text-secondary text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">
                            {typeLabel[asset.type]}
                          </span>
                        </td>
                        <td className="px-6 py-5 tabular-nums text-right text-on-surface font-semibold">
                          {asset.expenseRatio}%
                        </td>
                        <td className="px-6 py-5 tabular-nums text-right text-on-surface font-semibold">
                          {asset.expectedReturn}%
                        </td>
                        <td className="px-6 py-5 tabular-nums text-right text-on-surface font-semibold">
                          {asset.taxRate}%
                        </td>
                        <td className="px-6 py-5 tabular-nums text-right font-bold text-on-surface tracking-tight">
                          €{asset.monthlyInvestment.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-5 tabular-nums text-right font-bold text-on-surface tracking-tight">
                          €{asset.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`px-6 py-5 tabular-nums text-right font-bold tracking-tight ${
                            isPositive ? 'text-[#3DD68C]' : 'text-[#F26B6B]'
                          }`}
                        >
                          {isPositive ? '+' : ''}€{assetGain.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button
                            onClick={() => handleDelete(asset.id)}
                            className="text-outline-variant hover:text-[#F26B6B] transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Section: Allocation Drift + Insights */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
            <div className="lg:col-span-8 bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black text-on-surface tracking-tight">Allocation Drift</h2>
                  <p className="text-secondary text-sm">Comparison of target vs. current asset weights.</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <label className="text-xs font-bold tracking-widest uppercase text-secondary">
                    Projection Years
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    value={projectionYears}
                    onChange={(e) => setProjectionYears(parseInt(e.target.value))}
                    className="accent-primary w-28"
                  />
                  <span className="text-on-surface font-bold tabular-nums w-6">{projectionYears}</span>
                </div>
              </div>

              {/* Allocation bars */}
              <div className="space-y-5 mb-8">
                {allocationByType.length > 0 ? (
                  allocationByType.map(({ label, pct }, i) => (
                    <div key={label} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold tracking-widest uppercase text-secondary">
                        <span>{label}</span>
                        <span className="tabular-nums font-semibold tracking-tight">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            i % 3 === 0 ? 'bg-primary' : i % 3 === 1 ? 'bg-tertiary' : 'bg-secondary'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-secondary text-sm">No allocation data available.</p>
                )}
              </div>

              {/* Growth Chart */}
              {simulationData.length > 1 && (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="portNetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c1c1ff" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#c1c1ff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="year"
                        tick={{ fill: '#ccc5c0', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                        tick={{ fill: '#ccc5c0', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <CartesianGrid strokeDasharray="3 3" stroke="#464554" strokeOpacity={0.15} vertical={false} />
                      <Tooltip
                        contentStyle={{ background: '#1f1f24', border: '1px solid #464554', borderRadius: 8 }}
                        labelStyle={{ color: '#c7c4d7', fontSize: 11 }}
                        itemStyle={{ color: '#e3e2e7' }}
                        formatter={(value: number) => `€${value.toLocaleString()}`}
                        labelFormatter={(l) => `Year ${l}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="grossValue"
                        stroke="#464554"
                        strokeDasharray="4 4"
                        fillOpacity={0}
                        name="Gross (Pre-Tax)"
                      />
                      <Area
                        type="monotone"
                        dataKey="netValue"
                        stroke="#c1c1ff"
                        fillOpacity={1}
                        fill="url(#portNetGrad)"
                        name="Net Wealth (Post-Tax)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-gradient-to-br from-surface-container-high to-surface-container-lowest rounded-xl p-8 border border-outline-variant/15 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-black text-on-surface tracking-tight mb-2">Portfolio Insights</h2>
                <p className="text-secondary text-sm leading-relaxed mb-6">
                  {assets.length === 0
                    ? 'Add your first fund to start tracking your portfolio performance and allocation.'
                    : `You have ${assets.length} active holding${assets.length > 1 ? 's' : ''}. Weighted average return is ${weightedReturn.toFixed(1)}% across all assets.`}
                </p>
                <div className="space-y-3">
                  {simulationData.length > 1 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-secondary">Projected ({projectionYears}yr)</span>
                        <span className="text-on-surface font-bold tabular-nums">
                          €{simulationData[simulationData.length - 1].netValue.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-secondary">Total Invested</span>
                        <span className="text-on-surface font-bold tabular-nums">
                          €{simulationData[simulationData.length - 1].invested.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-secondary">Est. Net Gains</span>
                        <span className="text-[#3DD68C] font-bold tabular-nums">
                          +€
                          {(
                            simulationData[simulationData.length - 1].netValue -
                            simulationData[simulationData.length - 1].invested
                          ).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-surface-container-lowest/50 p-4 rounded-lg border border-outline-variant/5 mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-tertiary" />
                  <span className="text-xs font-bold tracking-widest uppercase text-tertiary">Tax Efficiency</span>
                </div>
                <p className="text-sm font-semibold text-on-surface">Net-of-tax simulation active</p>
                <p className="text-xs text-secondary mt-1">
                  Gains are projected after applying individual tax rates per fund.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-5">
            <BarChart2 size={32} />
          </div>
          <p className="text-on-surface font-bold text-lg mb-1">No holdings yet</p>
          <p className="text-secondary text-sm mb-6">Start building your portfolio by adding your first fund.</p>
          <button
            onClick={() => setIsAdding(true)}
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold px-6 py-3 rounded-lg text-sm hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Add Your First Fund
          </button>
        </div>
      )}
    </div>
  );
};
