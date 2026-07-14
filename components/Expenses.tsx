import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory, IncomeState, RecurringFrequency } from '../types';
import { Trash2, Repeat } from 'lucide-react';

interface ExpensesProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  income: IncomeState;
  setIncome: React.Dispatch<React.SetStateAction<IncomeState>>;
  onSync?: (overrides?: any) => Promise<void>;
}

type TimeSpan = '7d' | '30d' | '90d' | 'all';

const CATEGORY_COLORS: Record<string, { stroke: string; bg: string; text: string }> = {
  [ExpenseCategory.HOUSING]:       { stroke: '#c1c1ff', bg: 'bg-primary',      text: 'text-primary' },
  [ExpenseCategory.FOOD]:          { stroke: '#eec060', bg: 'bg-tertiary',      text: 'text-tertiary' },
  [ExpenseCategory.TRANSPORT]:     { stroke: '#3DD68C', bg: 'bg-[#3DD68C]',     text: 'text-[#3DD68C]' },
  [ExpenseCategory.UTILITIES]:     { stroke: '#8183ff', bg: 'bg-primary-container', text: 'text-primary-container' },
  [ExpenseCategory.ENTERTAINMENT]: { stroke: '#F26B6B', bg: 'bg-[#F26B6B]',    text: 'text-[#F26B6B]' },
  [ExpenseCategory.OTHER]:         { stroke: '#ccc5c0', bg: 'bg-secondary',     text: 'text-secondary' },
};

export const Expenses: React.FC<ExpensesProps> = ({ expenses, setExpenses, income, setIncome, onSync }) => {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);
  const [newVendor, setNewVendor] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurringFrequency, setNewRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [newIsEssential, setNewIsEssential] = useState(false);
  const [timeSpan, setTimeSpan] = useState<TimeSpan>('30d');

  const [localSalaryMe, setLocalSalaryMe] = useState(income.salaryMe?.toString() || '');
  const [localSalaryPartner, setLocalSalaryPartner] = useState(income.salaryPartner?.toString() || '');
  const [isSavingIncome, setIsSavingIncome] = useState(false);

  React.useEffect(() => {
    setLocalSalaryMe(income.salaryMe ? income.salaryMe.toString() : '');
    setLocalSalaryPartner(income.salaryPartner ? income.salaryPartner.toString() : '');
  }, [income.salaryMe, income.salaryPartner]);

  const handleAdd = async () => {
    if (!newName || !newAmount) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      name: newName,
      amount: amount,
      category: newCategory,
      vendor: newVendor ? newVendor : undefined,
      date: newDate,
      isRecurring: newIsRecurring,
      recurringFrequency: newIsRecurring ? newRecurringFrequency : undefined,
      isEssential: newIsEssential,
    };

    const updatedExpenses = [...expenses, newExpense].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(updatedExpenses);

    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }

    setNewName('');
    setNewAmount('');
    setNewVendor('');
    setNewIsRecurring(false);
    setNewRecurringFrequency('monthly');
    setNewIsEssential(false);
  };

  const handleClearLocalHistory = () => {
    if (!confirm('Clear all transactions from local browser cache? This does NOT delete data from the cloud.')) return;
    setExpenses([]);
    window.localStorage.removeItem('expenses');
  };

  const handleDelete = async (id: string) => {
    const updatedExpenses = expenses.filter(e => e.id !== id);
    setExpenses(updatedExpenses);
    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }
  };

  const handleSaveIncome = async () => {
    setIsSavingIncome(true);
    const sMe = parseFloat(localSalaryMe) || 0;
    const sPart = parseFloat(localSalaryPartner) || 0;
    const newIncome = { salaryMe: sMe, salaryPartner: sPart };
    setIncome(newIncome);
    if (onSync) {
      await onSync({ income: newIncome });
    }
    setIsSavingIncome(false);
  };

  // Time-based Filtering
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();

    if (timeSpan === '7d') cutoff.setDate(now.getDate() - 7);
    else if (timeSpan === '30d') cutoff.setDate(now.getDate() - 30);
    else if (timeSpan === '90d') cutoff.setDate(now.getDate() - 90);
    else return expenses;

    return expenses.filter(e => new Date(e.date) >= cutoff);
  }, [expenses, timeSpan]);

  // Daily Aggregation for Weekly Trends bar chart
  const weeklyChartData = useMemo(() => {
    // Build 4 weeks of data from the filtered set
    const now = new Date();
    const weeks: { label: string; amount: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      const total = filteredExpenses
        .filter(e => {
          const d = new Date(e.date);
          return d >= weekStart && d <= weekEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      weeks.push({ label: `W${4 - w}`, amount: total });
    }
    return weeks;
  }, [filteredExpenses]);

  const maxWeeklyAmount = Math.max(...weeklyChartData.map(w => w.amount), 1);

  // Category Distribution
  const chartData = useMemo(() => Object.values(ExpenseCategory).map(cat => ({
    name: cat,
    value: filteredExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)
  })).filter(d => d.value > 0), [filteredExpenses]);

  const periodTotal = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = income.salaryMe + income.salaryPartner;

  // Donut chart calculations (SVG stroke-dasharray)
  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  let cumulativeOffset = 0;
  const donutSegments = chartData.map(d => {
    const pct = periodTotal > 0 ? d.value / periodTotal : 0;
    const dash = pct * CIRCUMFERENCE;
    const gap = CIRCUMFERENCE - dash;
    const offset = -cumulativeOffset;
    cumulativeOffset += dash;
    return { ...d, dash, gap, offset };
  });

  // Grouping expenses for recent list (use all expenses, most recent 8)
  const recentExpenses = useMemo(() => {
    return [...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [expenses]);

  // Recurring expenses
  const recurringExpenses = useMemo(() => expenses.filter(e => e.isRecurring), [expenses]);

  const formatDate = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="px-8 py-8 max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">

      {/* ── LEFT COLUMN ── */}
      <div className="md:col-span-3 flex flex-col gap-6">

        {/* Log Expense Card */}
        <section className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-on-surface font-semibold text-sm uppercase tracking-wider">Log Expense</h2>
            <p className="text-secondary text-xs opacity-70">Capture a new transaction</p>
          </div>
          <div className="flex flex-col gap-4">
            {/* Amount */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-xl">€</span>
              <input
                type="number"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg py-4 pl-10 pr-4 text-3xl font-bold tabular-nums text-on-surface focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            {/* Category */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary ml-1">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none appearance-none cursor-pointer"
              >
                {Object.values(ExpenseCategory).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            {/* Description */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary ml-1">Description</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Weekly Groceries"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none"
              />
            </div>
            {/* Vendor */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary ml-1">Vendor / Merchant (Optional)</label>
              <input
                type="text"
                value={newVendor}
                onChange={e => setNewVendor(e.target.value)}
                placeholder="e.g. REWE, Amazon"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none"
              />
            </div>
            {/* Date + Recurring row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-secondary ml-1">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-sm text-on-surface focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-secondary ml-1">Recurring</label>
                <div
                  className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 cursor-pointer"
                  onClick={() => setNewIsRecurring(!newIsRecurring)}
                >
                  <span className="text-xs text-on-surface">{newIsRecurring ? 'Recurring' : 'One-time'}</span>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${newIsRecurring ? 'bg-primary/60' : 'bg-outline-variant/30'}`}>
                    <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${newIsRecurring ? 'left-5 bg-primary' : 'left-1 bg-secondary'}`}></div>
                  </div>
                </div>
              </div>
            </div>
            {/* Frequency (if recurring) */}
            {newIsRecurring && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-secondary ml-1">Frequency</label>
                <select
                  value={newRecurringFrequency}
                  onChange={e => setNewRecurringFrequency(e.target.value as RecurringFrequency)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            {/* Essential toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary ml-1">Priority</label>
              <div
                className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 cursor-pointer"
                onClick={() => setNewIsEssential(!newIsEssential)}
              >
                <span className="text-xs text-on-surface">{newIsEssential ? 'Essential' : 'Non-essential'}</span>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${newIsEssential ? 'bg-[#3DD68C]/40' : 'bg-outline-variant/30'}`}>
                  <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${newIsEssential ? 'left-5 bg-[#3DD68C]' : 'left-1 bg-secondary'}`}></div>
                </div>
              </div>
            </div>
            <button
              onClick={handleAdd}
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg shadow-lg hover:opacity-90 transition-all active:scale-[0.98]"
            >
              Add Expense
            </button>
          </div>
        </section>

        {/* Recent Transactions */}
        <section className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-on-surface font-semibold text-sm uppercase tracking-wider">Recent</h3>
            <button
              onClick={handleClearLocalHistory}
              className="text-[#F26B6B] text-[10px] font-bold uppercase tracking-widest hover:underline"
            >
              Clear Cache
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {recentExpenses.length === 0 && (
              <p className="text-secondary text-xs italic text-center py-4">No transactions yet.</p>
            )}
            {recentExpenses.map(expense => {
              const colors = CATEGORY_COLORS[expense.category] || CATEGORY_COLORS[ExpenseCategory.OTHER];
              return (
                <div
                  key={expense.id}
                  className="flex justify-between items-center p-3 rounded-lg hover:bg-surface-container-high transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                      {expense.isRecurring
                        ? <Repeat size={16} className="text-primary" />
                        : <span className={`text-xs font-bold ${colors.text}`}>{expense.category.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface leading-none">{expense.name}</p>
                      <p className="text-[10px] text-secondary tabular-nums mt-0.5">{formatDate(expense.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-[#F26B6B]">-€{expense.amount.toFixed(2)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(expense.id); }}
                      className="opacity-0 group-hover:opacity-100 text-secondary hover:text-[#F26B6B] transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Monthly Income Card */}
        <section className="bg-surface-container-low p-6 rounded-xl border-l-4 border-primary flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-secondary text-xs uppercase tracking-widest font-bold">Monthly Income</h3>
              <p className="text-2xl font-bold tabular-nums text-on-surface mt-1 tracking-tight">
                €{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-primary/10 p-2 rounded-lg">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M21 18v1a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 12H9m6 0l-3-3m3 3l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-secondary uppercase tracking-wider ml-1">My Salary</label>
              <input
                type="number"
                value={localSalaryMe}
                onChange={e => setLocalSalaryMe(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-secondary uppercase tracking-wider ml-1">Partner</label>
              <input
                type="number"
                value={localSalaryPartner}
                onChange={e => setLocalSalaryPartner(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm tabular-nums"
              />
            </div>
          </div>
          <button
            onClick={handleSaveIncome}
            disabled={isSavingIncome}
            className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold py-3 rounded-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {isSavingIncome ? 'Saving...' : 'Save Income'}
          </button>
        </section>
      </div>

      {/* ── CENTER COLUMN ── */}
      <div className="md:col-span-5 flex flex-col gap-6">
        <section className="bg-surface-container-low p-8 rounded-xl flex flex-col flex-grow">
          {/* Header + Time Filters */}
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-on-surface font-semibold text-lg">Expense Breakdown</h2>
            <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-full">
              {(['7d', '30d', '90d', 'all'] as TimeSpan[]).map(span => (
                <button
                  key={span}
                  onClick={() => setTimeSpan(span)}
                  className={`px-4 py-1.5 text-[10px] font-bold rounded-full tabular-nums transition-colors ${
                    timeSpan === span
                      ? 'bg-surface-container-highest text-primary'
                      : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  {span === 'all' ? 'ALL' : span.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Donut Chart */}
          <div className="flex-grow flex flex-col items-center justify-center py-8">
            <div className="relative w-64 h-64">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Track */}
                <circle cx="50" cy="50" r={RADIUS} fill="transparent" stroke="#343439" strokeWidth="8" />
                {/* Segments */}
                {donutSegments.length === 0 ? (
                  <circle cx="50" cy="50" r={RADIUS} fill="transparent" stroke="#343439" strokeWidth="10" />
                ) : (
                  donutSegments.map((seg, i) => {
                    const color = CATEGORY_COLORS[seg.name]?.stroke || '#ccc5c0';
                    return (
                      <circle
                        key={seg.name}
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="transparent"
                        stroke={color}
                        strokeWidth="10"
                        strokeDasharray={`${seg.dash} ${seg.gap}`}
                        strokeDashoffset={seg.offset}
                        strokeLinecap="butt"
                      />
                    );
                  })
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-secondary text-[10px] uppercase font-bold tracking-tighter">Total Spent</span>
                <span className="text-4xl font-black tabular-nums text-on-surface">
                  €{periodTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          {/* Legend with Percentage Bars */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 mt-8">
            {chartData.length === 0 ? (
              <p className="col-span-2 text-center text-secondary text-sm italic">No data for this period.</p>
            ) : (
              chartData.map(d => {
                const pct = periodTotal > 0 ? (d.value / periodTotal) * 100 : 0;
                const colors = CATEGORY_COLORS[d.name] || CATEGORY_COLORS[ExpenseCategory.OTHER];
                return (
                  <div key={d.name} className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-2 text-on-surface font-medium">
                        <span className={`w-2 h-2 rounded-full ${colors.bg}`}></span>
                        {d.name}
                      </span>
                      <span className="text-secondary font-bold tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors.bg} rounded-full`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="md:col-span-4 flex flex-col gap-6">

        {/* Weekly Trends Bar Chart */}
        <section className="bg-surface-container-low p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">Weekly Trends</h3>
          </div>
          <div className="h-48 flex items-end justify-between gap-3 px-2">
            {weeklyChartData.map(week => {
              const heightPct = maxWeeklyAmount > 0 ? (week.amount / maxWeeklyAmount) * 100 : 0;
              return (
                <div key={week.label} className="flex flex-col gap-1 w-full items-center">
                  <div className="flex items-end gap-1 h-32 w-full">
                    <div
                      className="w-full bg-primary rounded-t-sm transition-all"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      title={`€${week.amount.toFixed(2)}`}
                    ></div>
                  </div>
                  <span className="text-[8px] text-secondary font-bold uppercase tabular-nums">{week.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm bg-primary"></span>
              <span className="text-[10px] text-secondary">Actual Spending</span>
            </div>
            <span className="text-[10px] text-secondary tabular-nums">
              {filteredExpenses.length} transactions
            </span>
          </div>
        </section>

        {/* Recurring Expenses */}
        <section className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">Recurring</h3>
            <span className="text-primary text-[10px] font-bold uppercase tracking-widest">
              {recurringExpenses.length} active
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {recurringExpenses.length === 0 && (
              <p className="text-secondary text-xs italic text-center py-2">No recurring expenses.</p>
            )}
            {recurringExpenses.slice(0, 5).map(expense => {
              const freqColor = expense.recurringFrequency === 'yearly' || expense.recurringFrequency === 'quarterly'
                ? 'bg-tertiary/10 text-tertiary'
                : 'bg-primary/10 text-primary';
              return (
                <div key={expense.id} className="flex justify-between items-center group">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-on-surface">{expense.name}</span>
                    <div className="flex gap-1">
                      <span className={`text-[10px] py-0.5 px-2 ${freqColor} rounded-full w-fit font-bold uppercase tracking-tighter`}>
                        {expense.recurringFrequency || 'monthly'}
                      </span>
                      {expense.isEssential && (
                        <span className="text-[10px] py-0.5 px-2 bg-[#3DD68C]/10 text-[#3DD68C] rounded-full w-fit font-bold uppercase tracking-tighter">
                          Essential
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-on-surface">€{expense.amount.toFixed(2)}</span>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="opacity-0 group-hover:opacity-100 text-secondary hover:text-[#F26B6B] transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {recurringExpenses.length > 0 && (
            <div className="mt-2 p-3 bg-surface-container-highest/30 rounded-lg flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-tertiary flex-shrink-0">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div className="flex flex-col">
                <span className="text-[10px] text-secondary font-medium">Monthly commitment</span>
                <span className="text-xs font-bold text-on-surface tabular-nums">
                  €{recurringExpenses
                    .filter(e => e.recurringFrequency === 'monthly' || !e.recurringFrequency)
                    .reduce((sum, e) => sum + e.amount, 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
