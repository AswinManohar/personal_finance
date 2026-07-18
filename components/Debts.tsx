import React, { useMemo, useState } from 'react';
import { Loan, Expense, NetWorthState } from '../types';
import { Trash2 } from 'lucide-react';
import { monthlyInterest, sortByAvalanche, totalLoanBalance, num, monthlyEssentials, simulatePayoff } from '../utils/finance';

interface DebtsProps {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  netWorthData: NetWorthState;
  expenses?: Expense[];
  onSync?: (overrides?: any) => Promise<void>;
}

export const Debts: React.FC<DebtsProps> = ({ loans, setLoans, netWorthData, expenses = [], onSync }) => {
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newPayment, setNewPayment] = useState('');
  const [newLender, setNewLender] = useState('');

  const sorted = useMemo(() => sortByAvalanche(loans), [loans]);
  const totalBalance = totalLoanBalance(loans);
  const totalMonthlyInterest = loans.reduce((s, l) => s + monthlyInterest(l), 0);

  const fmt = (n: number) =>
    '€' + num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleAdd = async () => {
    const balance = parseFloat(newBalance);
    const rate = parseFloat(newRate);
    if (!newName || isNaN(balance) || balance <= 0 || isNaN(rate) || rate < 0) return;
    const loan: Loan = {
      id: crypto.randomUUID(),
      name: newName,
      balance,
      interestRate: rate,
      monthlyPayment: parseFloat(newPayment) || 0,
      lender: newLender || undefined,
    };
    const updated = [...loans, loan];
    setLoans(updated);
    if (onSync) await onSync({ loans: updated });
    setNewName(''); setNewBalance(''); setNewRate(''); setNewPayment(''); setNewLender('');
  };

  const handleDelete = async (id: string) => {
    const updated = loans.filter(l => l.id !== id);
    setLoans(updated);
    if (onSync) await onSync({ loans: updated });
  };

  const [payoffLoanId, setPayoffLoanId] = useState('');
  const [payoffAmount, setPayoffAmount] = useState('');

  const liquidCash = num(netWorthData.accumulatedSavings);
  const essentialsPerMonth = monthlyEssentials(expenses);
  const selectedLoan = loans.find(l => l.id === payoffLoanId) || sorted[0];
  const payAmount = parseFloat(payoffAmount);
  const sim = selectedLoan && !isNaN(payAmount) && payAmount > 0
    ? simulatePayoff(selectedLoan, payAmount, liquidCash, essentialsPerMonth)
    : null;

  return (
    <div className="px-8 py-8 max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* ── Add Loan form ── */}
      <section className="lg:col-span-4">
        <div className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
          <div>
            <h2 className="text-on-surface font-semibold text-sm uppercase tracking-wider">New Loan</h2>
            <p className="text-secondary text-xs opacity-70">Track each debt individually</p>
          </div>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Car Loan"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors" />
          <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)}
            placeholder="Remaining balance"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
          <div className="grid grid-cols-2 gap-4">
            <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)}
              placeholder="Annual rate %"
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
            <input type="number" value={newPayment} onChange={e => setNewPayment(e.target.value)}
              placeholder="Monthly payment"
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
          </div>
          <input type="text" value={newLender} onChange={e => setNewLender(e.target.value)}
            placeholder="Lender (optional)"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors" />
          <button onClick={handleAdd}
            className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg shadow-lg hover:opacity-90 transition-all active:scale-[0.98]">
            Add Loan
          </button>
        </div>
      </section>

      {/* ── Avalanche table ── */}
      <section className="lg:col-span-8 space-y-6">
        <div className="bg-surface-container-low p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">Payoff Order (Avalanche)</h2>
            <span className="text-secondary text-[10px] font-bold uppercase tracking-widest">{loans.length} active</span>
          </div>

          {sorted.length === 0 ? (
            <p className="text-secondary text-sm italic text-center py-8">
              No loans tracked yet. Add your first loan to see the payoff order.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((loan, i) => (
                <div key={loan.id} data-testid="loan-row"
                  className="bg-surface-container-high/40 p-4 rounded-xl flex items-center justify-between gap-4 group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-on-surface truncate">{loan.name}</p>
                      {i === 0 && (
                        <span className="text-[10px] py-0.5 px-2 bg-[#F26B6B]/10 text-[#F26B6B] rounded-full font-bold uppercase tracking-tighter shrink-0">
                          PAY FIRST
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary/60">
                      {loan.lender ? `${loan.lender} · ` : ''}{num(loan.interestRate)}% · {fmt(loan.monthlyPayment)}/month
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-bold tabular-nums text-on-surface">{fmt(loan.balance)}</p>
                      <p className="text-[10px] text-[#F26B6B] font-bold tabular-nums">{fmt(monthlyInterest(loan))}/mo interest</p>
                    </div>
                    <button onClick={() => handleDelete(loan.id)}
                      className="opacity-0 group-hover:opacity-100 text-secondary hover:text-[#F26B6B] transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loans.length > 0 && (
            <div className="mt-6 pt-4 border-t border-outline-variant/10 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Total Debt</p>
                <p className="text-lg font-bold text-on-surface tabular-nums">{fmt(totalBalance)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Interest Cost / Month</p>
                <p className="text-lg font-bold text-[#F26B6B] tabular-nums">{fmt(totalMonthlyInterest)}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Payoff simulator ── */}
        {loans.length > 0 && (
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-2">Lump-Sum Payoff Simulator</h2>
            <p className="text-xs text-secondary mb-4 tabular-nums">
              Liquid cash: {fmt(liquidCash)}
              {essentialsPerMonth > 0 ? ` · essentials ${fmt(essentialsPerMonth)}/month` : ''}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <select
                data-testid="payoff-loan-select"
                value={selectedLoan?.id || ''}
                onChange={e => setPayoffLoanId(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none appearance-none cursor-pointer"
              >
                {sorted.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({fmt(l.balance)})</option>
                ))}
              </select>
              <input
                data-testid="payoff-amount-input"
                type="number"
                value={payoffAmount}
                onChange={e => setPayoffAmount(e.target.value)}
                placeholder="Amount to pay off"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {sim && (
              <>
                {sim.breachesBuffer && (
                  <div className="mb-4 p-3 bg-[#F26B6B]/10 border border-[#F26B6B]/20 rounded-lg">
                    <p className="text-[#F26B6B] text-xs font-bold">
                      Leaves less than one month of essentials in cash. Max safe payoff: {fmt(sim.safeAmount)}.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Cash After Payoff</p>
                    <p className="text-lg font-bold text-on-surface tabular-nums">{fmt(sim.newLiquidCash)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Interest Saved / Month</p>
                    <p className="text-lg font-bold text-[#3DD68C] tabular-nums">{fmt(sim.monthlyInterestSaved)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">New Runway</p>
                    <p className="text-lg font-bold text-on-surface tabular-nums">
                      {sim.newRunwayMonths === null ? '—' : `${sim.newRunwayMonths.toFixed(1)} months`}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
