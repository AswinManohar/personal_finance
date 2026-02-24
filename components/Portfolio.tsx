import React, { useState, useMemo } from 'react';
import { PortfolioAsset, AssetType, InvestmentFrequency } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, Globe, Building2, TrendingUp, AlertCircle, Briefcase, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PortfolioProps {
  assets: PortfolioAsset[];
  setAssets: React.Dispatch<React.SetStateAction<PortfolioAsset[]>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const Portfolio: React.FC<PortfolioProps> = ({ assets, setAssets, onSync }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [projectionYears, setProjectionYears] = useState(10);

  // Form State
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AssetType>('MUTUAL_FUND_INDIA');
  const [newCurrentValue, setNewCurrentValue] = useState('');
  const [newMonthly, setNewMonthly] = useState('');
  const [newReturn, setNewReturn] = useState('');
  const [newTER, setNewTER] = useState('');
  const [newTax, setNewTax] = useState('');
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
      frequency: newFrequency
    };

    const updatedAssets = [...assets, asset];
    setAssets(updatedAssets);

    if (onSync) {
      await onSync({ portfolio: updatedAssets });
    }

    setNewName('');
    setNewCurrentValue('');
    setNewMonthly('');
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    const updatedAssets = assets.filter(a => a.id !== id);
    setAssets(updatedAssets);
    if (onSync) {
      await onSync({ portfolio: updatedAssets });
    }
  };

  // Complex Simulation
  const simulationData = useMemo(() => {
    const data = [];
    const months = projectionYears * 12;

    let currentAssets = assets.map(a => ({
      ...a,
      simulatedValue: a.currentValue,
      totalInvested: a.currentValue
    }));

    for (let i = 0; i <= months; i++) {
      if (i % 12 === 0) {
        const grossValue = currentAssets.reduce((sum, a) => sum + a.simulatedValue, 0);
        const invested = currentAssets.reduce((sum, a) => sum + a.totalInvested, 0);

        let totalNetValue = 0;
        currentAssets.forEach(asset => {
          const gains = asset.simulatedValue - asset.totalInvested;
          const tax = gains > 0 ? gains * (asset.taxRate / 100) : 0;
          totalNetValue += (asset.simulatedValue - tax);
        });

        data.push({
          year: i / 12,
          grossValue: Math.round(grossValue),
          netValue: Math.round(totalNetValue),
          invested: Math.round(invested)
        });
      }

      if (i < months) {
        currentAssets = currentAssets.map(asset => {
          const effectiveAnnualRate = asset.expectedReturn - asset.expenseRatio;
          const monthlyRate = effectiveAnnualRate / 100 / 12;

          // Frequency Adjustment
          let monthlyContribution = asset.monthlyInvestment;
          if (asset.frequency === 'One-time') monthlyContribution = 0;
          if (asset.frequency === 'Bi-monthly') monthlyContribution = asset.monthlyInvestment / 2;

          return {
            ...asset,
            simulatedValue: (asset.simulatedValue + monthlyContribution) * (1 + monthlyRate),
            totalInvested: asset.totalInvested + monthlyContribution
          };
        });
      }
    }
    return data;
  }, [assets, projectionYears]);

  const finalMetrics = simulationData[simulationData.length - 1] || { grossValue: 0, netValue: 0, invested: 0 };
  const totalTaxLiability = finalMetrics.grossValue - finalMetrics.netValue;
  const totalGains = finalMetrics.netValue - finalMetrics.invested;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-widest">Portfolio & Tax Simulator</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">Track Funds & ETFs (net returns after fees & taxes).</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors flex items-center gap-2"
        >
          <Plus size={14} /> Add Asset
        </button>
      </div>

      {isAdding && (
        <Card title="Add New Asset" className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient/50 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2 border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Asset Name</label>
              <input
                type="text"
                placeholder="e.g. Nifty 50 Index Fund"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
              />
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Type</label>
              <select
                value={newType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-[10px] appearance-none"
              >
                <option value="MUTUAL_FUND_INDIA" className="bg-white dark:bg-black text-black dark:text-white">Mutual Fund (India)</option>
                <option value="ETF_GLOBAL" className="bg-white dark:bg-black text-black dark:text-white">ETF (Global)</option>
                <option value="OTHER" className="bg-white dark:bg-black text-black dark:text-white">Other</option>
              </select>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Current Value (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={newCurrentValue}
                  onChange={(e) => setNewCurrentValue(e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Frequency</label>
              <div className="relative">
                <Calendar className="absolute left-0 top-2.5 text-zinc-600" size={14} />
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                  className="w-full pl-6 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-[10px] appearance-none"
                >
                  <option value="One-time" className="bg-white dark:bg-black">One-time</option>
                  <option value="Monthly" className="bg-white dark:bg-black">Monthly</option>
                  <option value="Bi-monthly" className="bg-white dark:bg-black">Bi-monthly</option>
                </select>
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Investment (€)</label>
              <div className="relative">
                <span className="absolute left-0 top-2 text-zinc-600">€</span>
                <input
                  type="number"
                  value={newMonthly}
                  onChange={(e) => setNewMonthly(e.target.value)}
                  className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
                />
              </div>
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Return (%)</label>
              <input
                type="number"
                value={newReturn}
                onChange={(e) => setNewReturn(e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
              />
            </div>
            <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">TER (%)</label>
              <input
                type="number"
                value={newTER}
                onChange={(e) => setNewTER(e.target.value)}
                className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
              />
            </div>
          </div>
          <div className="mt-8 flex justify-end gap-4">
            <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-black dark:hover:text-black dark:text-white transition-colors">Cancel</button>
            <button onClick={handleAdd} className="bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold uppercase tracking-widest px-8 py-3 hover:bg-zinc-200 transition-colors">Add Position</button>
          </div>
        </Card>
      )}

      {assets.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-bold text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Briefcase size={14} /> Active Positions
            </h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {assets.map(asset => (
                <div key={asset.id} className="border border-zinc-200 dark:border-zinc-900 bg-metric-gradient p-6 group hover:border-zinc-700 transition-colors">
                  <div className="flex justify-between items-start mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 ${asset.type === 'ETF_GLOBAL' ? 'bg-black dark:bg-white' : 'bg-zinc-500'}`}></div>
                      <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-widest">{asset.frequency}</span>
                    </div>
                    <button onClick={() => handleDelete(asset.id)} className="text-zinc-700 hover:text-black dark:hover:text-black dark:text-white transition-colors"><Trash2 size={14} /></button>
                  </div>
                  <h4 className="font-bold text-black dark:text-white uppercase tracking-widest text-sm mb-4 leading-relaxed">{asset.name}</h4>
                  <div className="grid grid-cols-2 gap-y-4 text-xs font-bold tracking-tighter">
                    <div>
                      <p className="text-zinc-500 uppercase tracking-widest text-[9px] mb-1">Value</p>
                      <p className="text-black dark:text-white">€{asset.currentValue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 uppercase tracking-widest text-[9px] mb-1">{asset.frequency === 'One-time' ? 'Bulk' : 'Recurring'}</p>
                      <p className="text-black dark:text-white">€{asset.monthlyInvestment.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card title="Net Wealth Projection (Post-Tax & Fees)" className="h-full border border-zinc-200 dark:border-zinc-900 bg-metric-gradient">
              <div className="mb-8 flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Projection Timeline</span>
                <div className="flex items-center gap-4 flex-1 max-w-sm">
                  <input
                    type="range"
                    min="5"
                    max="40"
                    value={projectionYears}
                    onChange={(e) => setProjectionYears(parseInt(e.target.value))}
                    className="accent-white flex-1 h-1 bg-zinc-800 appearance-none"
                  />
                  <span className="font-bold text-black dark:text-white text-sm w-8 tracking-tighter">{projectionYears}Y</span>
                </div>
              </div>

              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                    <Tooltip
                      formatter={(value: number) => `€${value.toLocaleString()}`}
                      contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a' }} iconType="square" />
                    <Area type="monotone" dataKey="grossValue" stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" fillOpacity={0} name="Gross (Pre-Tax)" />
                    <Area type="monotone" dataKey="netValue" stroke="var(--chart-line)" strokeWidth={2} fillOpacity={0.05} fill="var(--chart-line)" name="Net Wealth (Post-Tax)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="text-center py-24 border border-dashed border-zinc-200 dark:border-zinc-900 bg-metric-gradient flex flex-col items-center">
          <Briefcase className="text-zinc-800 mb-6" size={32} />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">No positions mapped.</p>
          <button
            onClick={() => setIsAdding(true)}
            className="mt-6 text-[10px] font-bold uppercase tracking-widest text-black dark:text-white hover:text-zinc-600 dark:text-zinc-400 transition-colors border-b border-black dark:border-white pb-1"
          >
            Initiate Position
          </button>
        </div>
      )}
    </div>
  );
};