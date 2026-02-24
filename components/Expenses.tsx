import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory, IncomeState } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, Euro, Wallet, Repeat, ShieldCheck, Calendar, Clock, TrendingDown, BarChart3, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface ExpensesProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  income: IncomeState;
  setIncome: React.Dispatch<React.SetStateAction<IncomeState>>;
  onSync?: (overrides?: any) => Promise<void>;
}
const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
type TimeSpan = '7d' | '30d' | '90d' | 'all';

export const Expenses: React.FC<ExpensesProps> = ({ expenses, setExpenses, income, setIncome, onSync }) => {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [timeSpan, setTimeSpan] = useState<TimeSpan>('30d');

  const handleAdd = async () => {
    if (!newName || !newAmount) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      name: newName,
      amount: amount,
      category: newCategory,
      date: newDate,
      isRecurring: newIsRecurring
    };

    const updatedExpenses = [...expenses, newExpense].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(updatedExpenses);

    // Immediate Cloud Sync
    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }

    setNewName('');
    setNewAmount('');
    setNewIsRecurring(false);
  };

  const handleDelete = async (id: string) => {
    const updatedExpenses = expenses.filter(e => e.id !== id);
    setExpenses(updatedExpenses);
    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }
  };

  const handleIncomeChange = (field: keyof IncomeState, value: string) => {
    const numValue = parseFloat(value);
    const newIncome = {
      ...income,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setIncome(newIncome);
    if (onSync) {
      onSync({ income: newIncome });
    }
  };

  // 1. Time-based Filtering
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();

    if (timeSpan === '7d') cutoff.setDate(now.getDate() - 7);
    else if (timeSpan === '30d') cutoff.setDate(now.getDate() - 30);
    else if (timeSpan === '90d') cutoff.setDate(now.getDate() - 90);
    else return expenses;

    return expenses.filter(e => new Date(e.date) >= cutoff);
  }, [expenses, timeSpan]);

  // 2. Daily Aggregation for Chart
  const dailyChartData = useMemo(() => {
    const dailyMap: Record<string, number> = {};

    filteredExpenses.forEach(e => {
      const dateKey = e.date || new Date().toISOString().split('T')[0];
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + e.amount;
    });

    return Object.entries(dailyMap)
      .map(([date, amount]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        fullDate: date,
        amount
      }))
      .sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
  }, [filteredExpenses]);

  // 3. Category Distribution
  const chartData = Object.values(ExpenseCategory).map(cat => {
    return {
      name: cat,
      value: filteredExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)
    };
  }).filter(d => d.value > 0);

  // Calculations
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = income.salaryMe + income.salaryPartner;
  const periodTotal = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentDay = today.getDate();
  const timeProgress = (currentDay / daysInMonth) * 100;
  const budgetProgress = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  const dailyAverage = totalExpenses / currentDay;
  const projectedMonthly = dailyAverage * daysInMonth;

  // Grouping expenses for list
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    filteredExpenses.forEach(e => {
      const dateKey = e.date || new Date().toISOString().split('T')[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(e);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [filteredExpenses]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-visible h-full">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-black dark:text-white">Monthly Budget Timeline</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 border border-zinc-200 dark:border-zinc-900 inline-block px-2 py-1">Spending vs. Time</p>
            </div>
            <div className="flex gap-8">
              <div className="text-right">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Daily Burn</p>
                <p className="text-sm font-bold text-black dark:text-white">€{dailyAverage.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Projected</p>
                <p className={`text-sm font-bold ${projectedMonthly > totalIncome ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  €{projectedMonthly.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          <div className="relative h-4 bg-metric-gradient mb-8 overflow-hidden border border-zinc-200 dark:border-zinc-900">
            <div
              className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-4 ${budgetProgress > timeProgress ? 'bg-red-500' : 'bg-black dark:bg-white'}`}
              style={{ width: `${Math.min(100, budgetProgress)}%` }}
            >
            </div>

            <div
              className="absolute top-0 bottom-0 w-1 bg-zinc-500 z-10 pointer-events-none"
              style={{ left: `${timeProgress}%` }}
            >
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div className="w-0.5 h-2 bg-zinc-500"></div>
                <span className="text-[9px] font-bold text-zinc-500 uppercase whitespace-nowrap">Day {currentDay}</span>
              </div>
            </div>
          </div>

          {budgetProgress > timeProgress && (
            <div className="flex items-center gap-2 p-3 bg-metric-gradient border border-red-500 text-red-500 text-xs font-bold uppercase tracking-widest">
              <TrendingDown size={14} />
              Alert: Spent {budgetProgress.toFixed(0)}% budget vs {timeProgress.toFixed(0)}% elapsed.
            </div>
          )}
        </Card>

        <Card className="h-full flex flex-col">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-black dark:text-white">Allocation</h3>
              <p className="text-[10px] text-transparent uppercase tracking-widest mt-2 border border-transparent inline-block px-2 py-1 select-none pointer-events-none">_</p>
            </div>
            <div className="flex gap-8 opacity-0 pointer-events-none">
              <div className="text-right">
                <p className="text-[10px] font-bold text-transparent uppercase tracking-widest">_</p>
                <p className="text-sm font-bold text-transparent">_</p>
              </div>
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="flex-1 w-full min-h-[250px] flex pb-4 items-center justify-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => `€${value.toFixed(2)}`}
                    contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    itemStyle={{ color: 'var(--chart-text)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '20px' }} iconType="square" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-700">
              <p className="text-[10px] font-bold uppercase tracking-widest">No data mapped</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-visible">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-900 pb-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-black dark:text-white">Spending Trends</h3>
          </div>

          <div className="flex items-center border border-zinc-200 dark:border-zinc-900 p-1">
            {(['7d', '30d', '90d', 'all'] as TimeSpan[]).map((span) => (
              <button
                key={span}
                onClick={() => setTimeSpan(span)}
                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${timeSpan === span ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-zinc-500 hover:text-black dark:hover:text-white'
                  }`}
              >
                {span === 'all' ? 'All' : `${span.slice(0, -1)}D`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="p-6 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Period Spending</p>
              <p className="text-2xl font-bold text-black dark:text-white">€{periodTotal.toLocaleString()}</p>
            </div>
            <div className="p-6 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{filteredExpenses.length} Transactions</p>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="h-[200px] w-full">
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(val) => `€${val}`} />
                    <RechartsTooltip
                      cursor={{ fill: '#18181b' }}
                      contentStyle={{ backgroundColor: 'var(--chart-bg)', border: '1px solid var(--chart-grid)', borderRadius: '0', color: 'var(--chart-text)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      formatter={(val: number) => [`€${val.toFixed(2)}`, 'Spent']}
                    />
                    <Bar dataKey="amount" fill="var(--chart-line)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-700 border border-dashed border-zinc-300 dark:border-zinc-800 bg-metric-gradient">
                  <p className="text-[10px] font-bold uppercase tracking-widest">No data for this period</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="Monthly Income">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">My Salary</label>
                <div className="relative border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <div className="absolute left-0 top-2.5 text-zinc-600">€</div>
                  <input
                    type="number"
                    value={income.salaryMe || ''}
                    onChange={(e) => handleIncomeChange('salaryMe', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white outline-none font-bold placeholder:text-zinc-800"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Partner</label>
                <div className="relative border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <div className="absolute left-0 top-2.5 text-zinc-600">€</div>
                  <input
                    type="number"
                    value={income.salaryPartner || ''}
                    onChange={(e) => handleIncomeChange('salaryPartner', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-4 pr-0 py-2 bg-transparent text-black dark:text-white outline-none font-bold placeholder:text-zinc-800"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-6 border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950">
              <span className="font-bold text-[10px] text-zinc-500 uppercase tracking-widest">Total Income</span>
              <span className="font-bold text-xl text-black dark:text-white">€{totalIncome.toLocaleString()}</span>
            </div>
          </Card>

          <Card title="Add Expense">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1 border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="NAME"
                    className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-600 uppercase tracking-widest text-xs"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors relative">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full py-2 bg-transparent text-zinc-600 dark:text-zinc-400 font-bold outline-none uppercase tracking-widest text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors flex items-center">
                  <span className="text-zinc-600 mr-2">€</span>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full py-2 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-600 text-xs"
                  />
                </div>
                <div className="border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ExpenseCategory)}
                    className="w-full py-2 bg-transparent text-zinc-700 dark:text-zinc-300 outline-none uppercase tracking-widest text-xs appearance-none"
                  >
                    {Object.values(ExpenseCategory).map(cat => (
                      <option key={cat} value={cat} className="bg-white dark:bg-black text-black dark:text-white">{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={newIsRecurring}
                  onChange={(e) => setNewIsRecurring(e.target.checked)}
                  className="w-4 h-4 accent-white bg-transparent border-zinc-300 dark:border-zinc-800"
                />
                <label htmlFor="recurring" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer">
                  Recurring Expense
                </label>
              </div>

              <button
                onClick={handleAdd}
                className="w-full btn-pulse bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest py-4 hover:bg-zinc-200 transition-colors"
              >
                Add Transaction
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="History" className="h-full min-h-[500px]">
            <div className="space-y-6 h-full max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {filteredExpenses.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-700">
                  <p className="text-[10px] font-bold uppercase tracking-widest">No transactions found</p>
                </div>
              )}

              {groupedExpenses.map(([date, items]) => (
                <div key={date} className="space-y-3">
                  <div className="border-b border-zinc-200 dark:border-zinc-900 pb-2">
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  {items.map((expense) => (
                    <div key={expense.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950 gap-4 group hover:border-zinc-700 transition-colors">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-bold text-black dark:text-white uppercase tracking-widest text-xs">{expense.name}</p>
                          {expense.isRecurring && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-100 dark:text-zinc-900 bg-black dark:bg-white px-1.5 py-0.5">Sub</span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{expense.category}</p>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                        <span className="font-bold text-black dark:text-white text-sm">€{expense.amount.toFixed(2)}</span>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          className="text-zinc-600 hover:text-black dark:hover:text-white transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};