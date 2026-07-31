import React, { useState } from 'react';
import { Stock, InvestmentFrequency } from '../types';
import { Plus, Trash2 } from 'lucide-react';
import {
  Card, EmptyState, Field, IconBox, Input, PrimaryButton, ScreenTitle, SectionLabel, Select,
  StatBlock, Tile,
} from './ui';
import { newId } from '../utils/id';

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

  const handleAdd = async () => {
    if (!newSymbol || !newQuantity || !newBuyPrice) return;

    const stock: Stock = {
      id: newId(),
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

  const fmt = (v: number) =>
    '€' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <ScreenTitle title="Stocks" subtitle="Individual equity positions." />

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <Card>
          <StatBlock label="Current Value" size="num-sm" value={fmt(totalCurrentValue)} />
        </Card>
        <Card>
          <StatBlock
            label="Unrealised P/L"
            size="num-sm"
            tone={totalPL >= 0 ? 'positive' : 'negative'}
            value={`${totalPL >= 0 ? '+' : ''}${fmt(totalPL)}`}
            sub={`${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent.toFixed(2)}% on ${fmt(totalInvested)}`}
          />
        </Card>
      </div>

      {/* ── Holdings ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Holdings</SectionLabel>
          <span className="text-label font-bold tracking-[.08em] uppercase text-secondary">
            {stocks.length} position{stocks.length === 1 ? '' : 's'}
          </span>
        </div>

        {stocks.length === 0 ? (
          <EmptyState icon="candlestick_chart">
            No positions yet. Add your first holding to track its value.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {stocks.map(stock => {
              const current = stock.currentPrice || stock.buyPrice;
              const value = stock.quantity * current;
              const pl = value - stock.quantity * stock.buyPrice;
              const plPct = stock.buyPrice > 0 ? (pl / (stock.quantity * stock.buyPrice)) * 100 : 0;
              return (
                <Tile key={stock.id} className="group">
                  <span className="flex items-center gap-3 min-w-0">
                    <IconBox
                      icon={pl >= 0 ? 'trending_up' : 'trending_down'}
                      tone={pl >= 0 ? 'positive' : 'negative'}
                    />
                    <span className="min-w-0">
                      <span className="block text-body font-bold truncate">{stock.symbol}</span>
                      <span className="block mt-0.5 text-label text-secondary/60 tabular-nums">
                        {stock.quantity} × {fmt(stock.buyPrice)} · {stock.frequency}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 flex-none">
                    <span className="text-right">
                      <span className="block text-body font-bold tabular-nums">{fmt(value)}</span>
                      <span
                        className={`block mt-0.5 text-micro font-bold tabular-nums ${
                          pl >= 0 ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {pl >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                      </span>
                    </span>
                    <button
                      onClick={() => handleDelete(stock.id)}
                      aria-label={`Delete ${stock.symbol}`}
                      className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </Tile>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Add position ── */}
      <Card className="flex flex-col gap-3">
        <div>
          <SectionLabel>New Position</SectionLabel>
          <p className="mt-1 text-label text-secondary opacity-70">Track a single equity holding</p>
        </div>
        <Field label="Symbol" htmlFor="stock-symbol">
          <Input
            id="stock-symbol"
            type="text"
            value={newSymbol}
            onChange={e => setNewSymbol(e.target.value)}
            placeholder="e.g. VWCE"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="stock-quantity">
            <Input
              id="stock-quantity"
              type="number"
              value={newQuantity}
              onChange={e => setNewQuantity(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Buy Price (€)" htmlFor="stock-price">
            <Input
              id="stock-price"
              type="number"
              value={newBuyPrice}
              onChange={e => setNewBuyPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <Field label="Frequency" htmlFor="stock-frequency">
          <Select
            id="stock-frequency"
            value={newFrequency}
            onChange={e => setNewFrequency(e.target.value as InvestmentFrequency)}
          >
            <option value="One-time">One-time</option>
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Yearly">Yearly</option>
          </Select>
        </Field>
        <PrimaryButton onClick={handleAdd}>
          <Plus size={16} /> Add Position
        </PrimaryButton>
      </Card>
    </div>
  );
};
