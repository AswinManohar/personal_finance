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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Portfolio & Tax Simulator</h2>
           <p className="text-slate-500">Track Funds (India) & ETFs (Global) to see real net returns after fees & taxes.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 font-medium"
        >
          <Plus size={18} /> Add Asset
        </button>
      </div>

      {isAdding && (
        <Card title="Add New Asset" className="border-primary-200 ring-4 ring-primary-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asset Name</label>
              <input
                type="text"
                placeholder="e.g. Nifty 50 Index Fund"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Type</label>
              <select 
                value={newType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              >
                <option value="MUTUAL_FUND_INDIA">Mutual Fund (India)</option>
                <option value="ETF_GLOBAL">ETF (Global)</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current Value (€)</label>
              <input
                type="number"
                value={newCurrentValue}
                onChange={(e) => setNewCurrentValue(e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Frequency</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <select 
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                  className="w-full pl-8 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500 text-sm"
                >
                  <option value="One-time">One-time</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Bi-monthly">Bi-monthly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Investment (€)</label>
              <input
                type="number"
                value={newMonthly}
                onChange={(e) => setNewMonthly(e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Return (%)</label>
              <input
                type="number"
                value={newReturn}
                onChange={(e) => setNewReturn(e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">TER (%)</label>
              <input
                type="number"
                value={newTER}
                onChange={(e) => setNewTER(e.target.value)}
                className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:border-primary-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800">Cancel</button>
            <button onClick={handleAdd} className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700">Add to Portfolio</button>
          </div>
        </Card>
      )}

      {assets.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Briefcase size={18} /> Your Holdings
            </h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {assets.map(asset => (
                <div key={asset.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 group relative hover:border-primary-300 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {asset.type === 'ETF_GLOBAL' ? <Globe size={16} className="text-blue-500" /> : <Building2 size={16} className="text-orange-500" />}
                      <span className="text-xs font-bold uppercase text-slate-500">{asset.frequency}</span>
                    </div>
                    <button onClick={() => handleDelete(asset.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-3">{asset.name}</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">Value</p>
                      <p className="font-medium">€{asset.currentValue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">{asset.frequency === 'One-time' ? 'One-time' : 'Recurring'}</p>
                      <p className="font-medium">€{asset.monthlyInvestment.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
             <Card title="Net Wealth Projection (Post-Tax & Fees)">
                <div className="mb-4 flex items-center gap-4">
                  <label className="text-sm font-medium text-slate-600">Project for (Years):</label>
                  <input 
                    type="range" 
                    min="5" 
                    max="40" 
                    value={projectionYears} 
                    onChange={(e) => setProjectionYears(parseInt(e.target.value))}
                    className="accent-primary-600 flex-1 bg-white"
                  />
                  <span className="font-bold text-slate-900 w-8">{projectionYears}</span>
                </div>
                
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="year" />
                      <YAxis tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <Tooltip formatter={(value: number) => `€${value.toLocaleString()}`} />
                      <Legend />
                      <Area type="monotone" dataKey="grossValue" stroke="#94a3b8" strokeDasharray="5 5" fillOpacity={0} name="Gross (Pre-Tax)" />
                      <Area type="monotone" dataKey="netValue" stroke="#10b981" fillOpacity={1} fill="url(#colorNet)" name="Net Wealth (Post-Tax)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
             </Card>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
           <Briefcase className="mx-auto text-slate-300 mb-4" size={48} />
           <p className="text-slate-500 font-medium">No assets added yet.</p>
           <button 
            onClick={() => setIsAdding(true)}
            className="mt-4 text-primary-600 hover:text-primary-800 font-medium"
          >
            Start Building Portfolio
          </button>
        </div>
      )}
    </div>
  );
};