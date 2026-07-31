import React, { useMemo, useState } from 'react';
import { Loan, Expense, NetWorthState } from '../types';
import { Trash2 } from 'lucide-react';
import {
  Card, EmptyState, Field, FieldLabel, Input, Pill, PrimaryButton, SectionLabel, Select,
  StatBlock, Tile, FormError,
} from './ui';
import { monthlyInterest, sortByAvalanche, totalLoanBalance, num, monthlyEssentials, simulatePayoff, currentBalance, remainingBalance } from '../utils/finance';
import { newId } from '../utils/id';

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
  const [newTerm, setNewTerm] = useState('');
  const [newPaid, setNewPaid] = useState('');
  const [newLender, setNewLender] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Live preview of what the schedule implies, so the figure is visible before
  // committing rather than appearing as a surprise in the list.
  const previewBalance = remainingBalance(
    parseFloat(newPayment), parseFloat(newRate), parseFloat(newTerm), parseFloat(newPaid) || 0
  );

  const sorted = useMemo(() => sortByAvalanche(loans), [loans]);
  const totalBalance = totalLoanBalance(loans);
  const totalMonthlyInterest = loans.reduce((s, l) => s + monthlyInterest(l), 0);

  const fmt = (n: number) =>
    '€' + num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleAdd = async () => {
    // Every failure used to be a bare `return`: the button did nothing, said
    // nothing, and leaving Balance empty — the whole point of the schedule —
    // was itself one of the failures.
    const rate = parseFloat(newRate);
    const payment = parseFloat(newPayment);
    const term = parseFloat(newTerm);
    const paid = parseFloat(newPaid) || 0;

    if (!newName.trim()) {
      setFormError('Give the loan a name.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setFormError('Enter the annual interest rate (0 is fine for an interest-free loan).');
      return;
    }
    if (isNaN(payment) || payment <= 0) {
      setFormError('Enter the monthly installment.');
      return;
    }
    if (isNaN(term) || term <= 0) {
      setFormError('Enter the total number of installments.');
      return;
    }
    if (paid < 0 || paid > term) {
      setFormError(`Installments paid must be between 0 and ${term}.`);
      return;
    }

    const balance = remainingBalance(payment, rate, term, paid);
    if (balance === null) {
      setFormError('Those numbers do not describe a loan that can be calculated.');
      return;
    }

    setFormError(null);
    const loan: Loan = {
      id: newId(),
      name: newName,
      balance,
      interestRate: rate,
      monthlyPayment: payment,
      termMonths: term,
      installmentsPaid: paid,
      lender: newLender || undefined,
    };
    const updated = [...loans, loan];
    setLoans(updated);
    if (onSync) await onSync({ loans: updated });
    setNewName(''); setNewRate(''); setNewPayment('');
    setNewTerm(''); setNewPaid(''); setNewLender('');
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
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
      {/* ── Payoff order ── */}
      <Card className="lg:col-span-8">
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Payoff Order (Avalanche)</SectionLabel>
          <span className="text-label font-bold tracking-[.08em] uppercase text-secondary">
            {loans.length} active
          </span>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon="credit_card">
            No loans tracked yet. Add your first loan to see the payoff order.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((loan, i) => (
              <Tile key={loan.id} data-testid="loan-row" className="group">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-body font-bold truncate">{loan.name}</span>
                    {i === 0 && <Pill tone="negative">Pay First</Pill>}
                  </span>
                  <span className="block mt-1 text-label text-secondary/60 tabular-nums">
                    {loan.lender ? `${loan.lender} · ` : ''}
                    {num(loan.interestRate)}% · {fmt(loan.monthlyPayment)}/month
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-none">
                  <span className="text-right">
                    <span className="block text-body font-bold tabular-nums">{fmt(currentBalance(loan))}</span>
                    <span className="block mt-0.5 text-micro font-bold text-negative tabular-nums">
                      {fmt(monthlyInterest(loan))}/mo interest
                    </span>
                  </span>
                  <button
                    onClick={() => handleDelete(loan.id)}
                    aria-label={`Delete ${loan.name}`}
                    className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </Tile>
            ))}
          </div>
        )}

        {loans.length > 0 && (
          <div className="mt-4 pt-4 border-t border-outline-variant/12 grid grid-cols-2 gap-3">
            <StatBlock label="Total Debt" value={fmt(totalBalance)} />
            <StatBlock label="Interest / Month" tone="negative" value={fmt(totalMonthlyInterest)} />
          </div>
        )}
      </Card>

      {/* ── Lump-sum simulator ── */}
      {loans.length > 0 && (
        <Card className="lg:col-span-8 lg:order-3">
          <SectionLabel className="mb-1">Lump-Sum Payoff Simulator</SectionLabel>
          <p className="mb-4 text-label text-secondary tabular-nums">
            Liquid cash: {fmt(liquidCash)}
            {essentialsPerMonth > 0 ? ` · essentials ${fmt(essentialsPerMonth)}/mo` : ''}
          </p>

          <div className="flex flex-col gap-3 mb-4">
            <Select
              data-testid="payoff-loan-select"
              aria-label="Loan to pay off"
              value={selectedLoan?.id || ''}
              onChange={e => setPayoffLoanId(e.target.value)}
            >
              {sorted.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({fmt(currentBalance(l))})</option>
              ))}
            </Select>
            <Input
              data-testid="payoff-amount-input"
              type="number"
              aria-label="Amount to pay off"
              value={payoffAmount}
              onChange={e => setPayoffAmount(e.target.value)}
              placeholder="Amount to pay off"
            />
          </div>

          {sim && (
            <>
              {sim.breachesBuffer && (
                <div className="mb-3 p-3 rounded-field bg-[rgba(242,107,107,0.1)] border border-negative/20">
                  <p className="text-label font-bold text-negative">
                    Leaves less than one month of essentials in cash. Max safe payoff:{' '}
                    {fmt(sim.safeAmount)}.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <StatBlock label="Cash After" size="stat" value={fmt(sim.newLiquidCash)} />
                <StatBlock
                  label="Saved / Mo"
                  size="stat"
                  tone="positive"
                  value={fmt(sim.monthlyInterestSaved)}
                />
                <StatBlock
                  label="New Runway"
                  size="stat"
                  value={sim.newRunwayMonths === null ? '—' : `${sim.newRunwayMonths.toFixed(1)} months`}
                />
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── New loan ── */}
      <Card className="flex flex-col gap-3 lg:col-span-4 lg:row-span-2 lg:order-2">
        <div>
          <SectionLabel>New Loan</SectionLabel>
          <p className="mt-1 text-label text-secondary opacity-70">The balance is worked out for you</p>
        </div>
        <Input
          type="text"
          aria-label="Loan name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="e.g. Car Loan"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Annual rate %" htmlFor="loan-rate">
            <Input
              id="loan-rate"
              type="number"
              step="0.1"
              value={newRate}
              onChange={e => setNewRate(e.target.value)}
              placeholder="5.0"
            />
          </Field>
          <Field label="Monthly installment" htmlFor="loan-payment">
            <Input
              id="loan-payment"
              type="number"
              prefix="€"
              value={newPayment}
              onChange={e => setNewPayment(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Total installments" htmlFor="loan-term">
            <Input
              id="loan-term"
              type="number"
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              placeholder="60"
            />
          </Field>
          <Field label="Installments paid" htmlFor="loan-paid">
            <Input
              id="loan-paid"
              type="number"
              value={newPaid}
              onChange={e => setNewPaid(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <Input
          type="text"
          aria-label="Lender"
          value={newLender}
          onChange={e => setNewLender(e.target.value)}
          placeholder="Lender (optional)"
        />

        {/* The whole point: the balance is shown, never asked for. */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-field bg-surface-container-highest/40 border border-outline-variant/12">
          <span className="min-w-0">
            <FieldLabel className="!text-micro">Outstanding balance</FieldLabel>
            <span className="block mt-0.5 text-label text-secondary">
              {previewBalance === null
                ? 'Fill in rate, installment and term'
                : `after ${parseFloat(newPaid) || 0} of ${parseFloat(newTerm) || 0} installments`}
            </span>
          </span>
          <span className="text-num-sm font-bold text-primary tabular-nums flex-none">
            {previewBalance === null ? '—' : fmt(previewBalance)}
          </span>
        </div>

        <FormError>{formError}</FormError>

        <PrimaryButton onClick={handleAdd}>Add Loan</PrimaryButton>
      </Card>
    </div>
  );
};
