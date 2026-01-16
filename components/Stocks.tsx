import React, { useState, useEffect } from 'react';
import { Stock, InvestmentFrequency } from '../types';
import { Card } from './ui/Card';
import { getStockPrices } from '../services/geminiService';
import { Plus, Trash2, RefreshCw, ExternalLink, Calendar } from 'lucide-react';

interface StocksProps {
  stocks: Stock[];
  setStocks: React.Dispatch<React.SetStateAction<Stock[]>>;
  onSync?: (overrides?: any) => Promise<void>;
}

export const Stocks: React.FC<StocksProps> = ({ stocks, setStocks, onSync }) => {
  const [newSymbol, setNewSymbol] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newBuyPrice, setNewBuyPrice] = useState('');
  const [newFrequency, setNewFrequency] = useState<InvestmentFrequency>('One-time');
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);

  const handleAdd = async () => {
    if (!newSymbol || !newQuantity || !newBuyPrice) return;
    
    const stock: Stock = {
      id: crypto.randomUUID(),
      symbol: newSymbol.toUpperCase(),
      quantity: parseFloat(newQuantity),
      buyPrice: parseFloat(newBuyPrice),
      currentPrice: parseFloat(newBuyPrice),
      frequency: newFrequency
    };

    const updatedStocks = [...stocks, stock];
    setStocks(updatedStocks);
    
    if (onSync) {
      await onSync({ stocks: updatedStocks });
    }

    setNewSymbol('');
    setNewQuantity('');
    setNewBuyPrice('');
  };

  const handleDelete = async (id: string) => {
    const updatedStocks = stocks.filter(s => s.id !== id);
    setStocks(updatedStocks);
    if (onSync) {
      await onSync({ stocks: updatedStocks });
    }
  };

  const handleRefreshPrices = async () => {
    if (stocks.length === 0) return;
    setLoading(true);
    
    const symbols: string[] = [...new Set(stocks.map(s => s.symbol))];
    const result = await getStockPrices(symbols);
    
    const updatedStocks = stocks.map(stock => ({
      ...stock,
      currentPrice: result.prices[stock.symbol] || stock.currentPrice || stock.buyPrice
    }));
    
    setStocks(updatedStocks);

    if (result.sources) {
      setSources(result.sources);
    }
    
    if (onSync) {
      await onSync({ stocks: updatedStocks });
    }
    
    setLoading(false);
  };

  const totalInvested = stocks.reduce((sum, s) => sum + (s.quantity * s.buyPrice), 0);
  const totalCurrentValue = stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0);
  const totalPL = totalCurrentValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Stock Investments</h2>
           <p className="text-slate-500">Track your real-time stock portfolio performance.</p>
        </div>
        <button 
          onClick={handleRefreshPrices}
          disabled={loading || stocks.length === 0}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all ${
             loading 
             ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
             : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
          }`}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching Prices...' : 'Refresh Prices'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200">
           <p className="text-sm font-medium text-slate-500">Total Invested</p>
           <p className="text-2xl font-bold text-slate-900 mt-1">€{totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="bg-white border-slate-200">
           <p className="text-sm font-medium text-slate-500">Current Value</p>
           <div className="flex items-center gap-2 mt-1">
             <p className="text-2xl font-bold text-slate-900">€{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
           </div>
        </Card>
        <Card className={`${totalPL >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
           <p className={`text-sm font-medium ${totalPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Total P&L</p>
           <div className="flex items-center gap-2 mt-1">
             <p className={`text-2xl font-bold ${totalPL >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
               {totalPL >= 0 ? '+' : ''}€{totalPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
             </p>
             <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${totalPL >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
               {totalPLPercent.toFixed(2)}%
             </span>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card title="Add Holding">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ticker Symbol</label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="e.g. AAPL, MSFT"
                  className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <select 
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                    className="w-full pl-8 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="One-time">One-time (Bulk)</option>
                    <option value="Monthly">Monthly SIP</option>
                    <option value="Bi-monthly">Bi-monthly</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Avg Buy Price</label>
                  <input
                    type="number"
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleAdd}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-lg transition-colors font-medium"
              >
                <Plus size={18} /> Add Stock
              </button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
           <Card title="Portfolio Holdings">
             {stocks.length === 0 ? (
               <div className="text-center py-8 text-slate-400">No stocks added yet.</div>
             ) : (
               <div className="overflow-x-auto">
                 <table className="min-w-full text-sm">
                   <thead className="bg-slate-50 text-slate-500">
                     <tr>
                       <th className="px-4 py-3 text-left font-semibold">Symbol</th>
                       <th className="px-4 py-3 text-right font-semibold">Qty</th>
                       <th className="px-4 py-3 text-right font-semibold">LTP</th>
                       <th className="px-4 py-3 text-right font-semibold">P&L</th>
                       <th className="px-4 py-3 text-center font-semibold">Action</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {stocks.map((stock) => {
                       const currentPrice = stock.currentPrice || stock.buyPrice;
                       const currentVal = stock.quantity * currentPrice;
                       const gain = currentVal - (stock.quantity * stock.buyPrice);
                       const gainPercent = (gain / (stock.quantity * stock.buyPrice)) * 100;
                       
                       return (
                         <tr key={stock.id} className="hover:bg-slate-50">
                           <td className="px-4 py-3">
                              <span className="font-bold text-slate-900">{stock.symbol}</span>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{stock.frequency}</p>
                           </td>
                           <td className="px-4 py-3 text-right text-slate-600">{stock.quantity}</td>
                           <td className="px-4 py-3 text-right font-medium text-slate-900">€{currentPrice.toFixed(2)}</td>
                           <td className={`px-4 py-3 text-right font-medium ${gain >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                             {gain >= 0 ? '+' : ''}€{gain.toFixed(2)}
                           </td>
                           <td className="px-4 py-3 text-center">
                             <button onClick={() => handleDelete(stock.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                               <Trash2 size={16} />
                             </button>
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>
             )}
           </Card>
        </div>
      </div>
    </div>
  );
};