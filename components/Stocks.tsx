import React, { useState } from 'react';
import { Stock, InvestmentFrequency } from '../types';
import { Plus, Trash2, TrendingUp, TrendingDown, BarChart2, X } from 'lucide-react';

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
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newSymbol || !newQuantity || !newBuyPrice) return;

    const stock: Stock = {
      id: crypto.randomUUID(),
      symbol: newSymbol.toUpperCase(),
      quantity: parseFloat(newQuantity),
      buyPrice: parseFloat(newBuyPrice),
      currentPrice: parseFloat(newBuyPrice),
      frequency: newFrequency,
    };

    const updatedStocks = [...stocks, stock];
    setStocks(updatedStocks);

    if (onSync) {
      await onSync({ stocks: updatedStocks });
    }

    setNewSymbol('');
    setNewQuantity('');
    setNewBuyPrice('');
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    const updatedStocks = stocks.filter((s) => s.id !== id);
    setStocks(updatedStocks);
    if (onSync) {
      await onSync({ stocks: updatedStocks });
    }
  };

  const totalInvested = stocks.reduce((sum, s) => sum + s.quantity * s.buyPrice, 0);
  const totalCurrentValue = stocks.reduce((sum, s) => sum + s.quantity * (s.currentPrice || s.buyPrice), 0);
  const totalPL = totalCurrentValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const inputCls =
    'w-full bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg p-3 text-on-surface outline-none transition-all text-sm';
  const labelCls = 'block text-xs font-bold tracking-widest uppercase text-secondary mb-1.5';

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Summary Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Total Stocks Value</p>
            <h3 className="text-4xl font-bold text-on-surface tabular-nums tracking-tighter">
              €{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <BarChart2 size={96} />
          </div>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Total Unrealised Gain/Loss</p>
            <div className="flex items-baseline gap-2">
              <h3
                className={`text-4xl font-bold tabular-nums tracking-tighter ${
                  totalPL >= 0 ? 'text-[#3DD68C]' : 'text-[#F26B6B]'
                }`}
              >
                {totalPL >= 0 ? '+' : ''}€{totalPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <span
                className={`text-sm font-bold tabular-nums ${totalPL >= 0 ? 'text-[#3DD68C]' : 'text-[#F26B6B]'}`}
              >
                ({totalPLPercent >= 0 ? '+' : ''}
                {totalPLPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            {totalPL >= 0 ? <TrendingUp size={96} /> : <TrendingDown size={96} />}
          </div>
        </div>
        <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-secondary text-xs font-bold tracking-widest uppercase mb-1">Number of Holdings</p>
            <h3 className="text-4xl font-bold text-on-surface tabular-nums tracking-tighter">{stocks.length}</h3>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Plus size={96} />
          </div>
        </div>
      </section>

      {/* Table Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tight">Stock Holdings</h1>
          <p className="text-secondary text-sm mt-1">Track your real-time stock portfolio performance.</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:opacity-90 transition-all"
        >
          <Plus size={16} /> Add Stock
        </button>
      </div>

      {/* Add Stock Form */}
      {isAdding && (
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-bold tracking-widest uppercase text-secondary">Add New Stock</h3>
            <button onClick={() => setIsAdding(false)} className="text-secondary hover:text-on-surface transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Ticker Symbol</label>
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="e.g. AAPL"
                className={`${inputCls} uppercase font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Frequency</label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as InvestmentFrequency)}
                className={inputCls}
              >
                <option value="One-time">One-time (Bulk)</option>
                <option value="Monthly">Monthly SIP</option>
                <option value="Bi-monthly">Bi-monthly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Quantity</label>
              <input
                type="number"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Avg Buy Price (€)</label>
              <input
                type="number"
                value={newBuyPrice}
                onChange={(e) => setNewBuyPrice(e.target.value)}
                placeholder="0.00"
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
              Add Stock
            </button>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      {stocks.length > 0 ? (
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-high/50 text-left border-b border-outline-variant/10">
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary">Ticker</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary">Company / Type</th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                    Quantity
                  </th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                    Buy Price
                  </th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                    Current Price
                  </th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                    Unrealised Gain
                  </th>
                  <th className="px-6 py-4 text-xs font-bold tracking-widest uppercase text-secondary tabular-nums text-right">
                    Value
                  </th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {stocks.map((stock, idx) => {
                  const currentPrice = stock.currentPrice || stock.buyPrice;
                  const currentVal = stock.quantity * currentPrice;
                  const gain = currentVal - stock.quantity * stock.buyPrice;
                  const gainPercent =
                    stock.buyPrice > 0 ? (gain / (stock.quantity * stock.buyPrice)) * 100 : 0;
                  const isPositive = gain >= 0;

                  const rowClass =
                    idx % 2 === 0
                      ? 'bg-surface hover:bg-surface-container-low transition-colors group'
                      : 'bg-surface-container-low hover:bg-surface-container-high transition-colors group';

                  return (
                    <tr key={stock.id} className={rowClass}>
                      <td className="px-6 py-5">
                        <span className="bg-primary/10 text-primary font-mono text-xs font-bold px-2 py-1 rounded tracking-widest">
                          {stock.symbol}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-on-surface font-semibold">{stock.symbol}</p>
                        <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mt-0.5">
                          {stock.frequency}
                        </p>
                      </td>
                      <td className="px-6 py-5 tabular-nums text-right text-on-surface font-semibold">
                        {stock.quantity}
                      </td>
                      <td className="px-6 py-5 tabular-nums text-right text-on-surface font-semibold">
                        €{stock.buyPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-5 tabular-nums text-right font-bold text-on-surface">
                        €{currentPrice.toFixed(2)}
                      </td>
                      <td className={`px-6 py-5 tabular-nums text-right font-bold tracking-tight ${isPositive ? 'text-[#3DD68C]' : 'text-[#F26B6B]'}`}>
                        <div>
                          <span>
                            {isPositive ? '+' : ''}€{gain.toFixed(2)}
                          </span>
                          <span className="text-xs ml-1">
                            ({isPositive ? '+' : ''}
                            {gainPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 tabular-nums text-right font-bold text-on-surface tracking-tight">
                        €{currentVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={() => handleDelete(stock.id)}
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
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-5">
            <TrendingUp size={32} />
          </div>
          <p className="text-on-surface font-bold text-lg mb-1">No stocks added yet</p>
          <p className="text-secondary text-sm mb-6">Add your first stock holding to start tracking performance.</p>
          <button
            onClick={() => setIsAdding(true)}
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold px-6 py-3 rounded-lg text-sm hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Add Your First Stock
          </button>
        </div>
      )}
    </div>
  );
};
