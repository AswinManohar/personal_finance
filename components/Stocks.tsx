import React, { useState, useEffect } from 'react';
import { Stock, InvestmentFrequency } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, ExternalLink, Calendar } from 'lucide-react';

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


  const totalInvested = stocks.reduce((sum, s) => sum + (s.quantity * s.buyPrice), 0);
  const totalCurrentValue = stocks.reduce((sum, s) => sum + (s.quantity * (s.currentPrice || s.buyPrice)), 0);
  const totalPL = totalCurrentValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-widest">Stock Investments</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">Track real-time portfolio performance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Invested</p>
          <p className="text-2xl font-bold text-black dark:text-white mt-2 tracking-tighter">€{totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-6">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Current Value</p>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-2xl font-bold text-black dark:text-white tracking-tighter">€{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </Card>
        <Card className={`p-6 border ${totalPL >= 0 ? 'border-zinc-700 bg-black dark:bg-white/5' : 'border-red-900 bg-red-950/20'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${totalPL >= 0 ? 'text-zinc-600 dark:text-zinc-400' : 'text-red-500'}`}>Total P&L</p>
          <div className="flex items-center justify-between mt-2">
            <p className={`text-2xl font-bold tracking-tighter ${totalPL >= 0 ? 'text-black dark:text-white' : 'text-red-500'}`}>
              {totalPL >= 0 ? '+' : ''}€{totalPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <span className={`text-[10px] font-bold px-2 py-1 uppercase tracking-widest ${totalPL >= 0 ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-red-500 text-black dark:text-white'}`}>
              {totalPLPercent.toFixed(2)}%
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card title="Add Holding">
            <div className="space-y-6">
              <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Ticker Symbol</label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="AAPL, MSFT"
                  className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-sm placeholder:text-zinc-800"
                />
              </div>
              <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Frequency</label>
                <div className="relative">
                  <Calendar className="absolute left-0 top-2.5 text-zinc-600" size={14} />
                  <select
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                    className="w-full pl-6 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none uppercase tracking-widest text-xs appearance-none"
                  >
                    <option value="One-time" className="bg-white dark:bg-black">One-time (Bulk)</option>
                    <option value="Monthly" className="bg-white dark:bg-black">Monthly SIP</option>
                    <option value="Bi-monthly" className="bg-white dark:bg-black">Bi-monthly</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Quantity</label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
                  />
                </div>
                <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Avg Buy Price</label>
                  <div className="relative">
                    <span className="absolute left-0 top-2 text-zinc-600">€</span>
                    <input
                      type="number"
                      value={newBuyPrice}
                      onChange={(e) => setNewBuyPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-800 text-sm"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleAdd}
                className="w-full flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest py-4 hover:bg-zinc-200 transition-colors mt-4"
              >
                <Plus size={16} /> Add Position
              </button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Portfolio Holdings" className="h-full">
            {stocks.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-zinc-700 h-full border border-dashed border-zinc-200 dark:border-zinc-900">
                <p className="text-[10px] font-bold uppercase tracking-widest">No positions initiated</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-900">
                      <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Symbol</th>
                      <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Qty</th>
                      <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">LTP</th>
                      <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">P&L</th>
                      <th className="pb-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {stocks.map((stock) => {
                      const currentPrice = stock.currentPrice || stock.buyPrice;
                      const currentVal = stock.quantity * currentPrice;
                      const gain = currentVal - (stock.quantity * stock.buyPrice);
                      const gainPercent = (gain / (stock.quantity * stock.buyPrice)) * 100;

                      return (
                        <tr key={stock.id} className="group hover:bg-metric-gradient/50 transition-colors">
                          <td className="py-4">
                            <span className="font-bold text-black dark:text-white uppercase tracking-widest text-sm">{stock.symbol}</span>
                            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">{stock.frequency}</p>
                          </td>
                          <td className="py-4 text-right text-zinc-700 dark:text-zinc-300 font-bold text-sm tracking-tighter">{stock.quantity}</td>
                          <td className="py-4 text-right font-bold text-black dark:text-white text-sm tracking-tighter">€{currentPrice.toFixed(2)}</td>
                          <td className={`py-4 text-right font-bold tracking-tighter text-sm ${gain >= 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-red-500'}`}>
                            {gain >= 0 ? '+' : ''}€{gain.toFixed(2)}
                            <p className={`text-[9px] uppercase tracking-widest mt-1 ${gain >= 0 ? 'text-zinc-500' : 'text-red-500/70'}`}>
                              {gainPercent.toFixed(2)}%
                            </p>
                          </td>
                          <td className="py-4 text-center">
                            <button onClick={() => handleDelete(stock.id)} className="text-zinc-700 hover:text-black dark:hover:text-black dark:text-white transition-colors">
                              <Trash2 size={14} className="mx-auto" />
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