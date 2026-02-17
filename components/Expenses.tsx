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

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'];

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
      <Card className="bg-white border-primary-100 overflow-visible relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="text-primary-600" size={20} />
              Monthly Budget Timeline
            </h3>
            <p className="text-xs text-slate-500">Visualization of spending vs. time elapsed this month.</p>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Daily Burn</p>
              <p className="text-sm font-bold text-slate-900">€{dailyAverage.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Projected</p>
              <p className={`text-sm font-bold ${projectedMonthly > totalIncome ? 'text-red-600' : 'text-emerald-600'}`}>
                €{projectedMonthly.toFixed(0)}
              </p>
            </div>
          </div>
        </div>

        <div className="relative h-12 bg-slate-100 rounded-2xl mb-8 overflow-hidden border border-slate-200 shadow-inner">
          <div
            className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-4 ${budgetProgress > timeProgress ? 'bg-amber-500' : 'bg-primary-500'}`}
            style={{ width: `${Math.min(100, budgetProgress)}%` }}
          >
            {budgetProgress > 10 && (
              <span className="text-[10px] font-black text-white uppercase tracking-tighter">Spent {budgetProgress.toFixed(0)}%</span>
            )}
          </div>

          <div
            className="absolute top-0 bottom-0 w-1 bg-slate-900/20 z-10 pointer-events-none"
            style={{ left: `${timeProgress}%` }}
          >
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className="w-0.5 h-2 bg-slate-400"></div>
              <span className="text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap">Today (Day {currentDay})</span>
            </div>
          </div>
        </div>

        {budgetProgress > timeProgress && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs font-medium">
            <TrendingDown size={14} />
            Alert: You've spent {budgetProgress.toFixed(0)}% of your budget, but only {timeProgress.toFixed(0)}% of the month has passed.
          </div>
        )}
      </Card>

      <Card className="border-slate-200 shadow-sm overflow-visible">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Spending Trends</h3>
              <p className="text-xs text-slate-500">Analyze your spending over specific periods.</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {(['7d', '30d', '90d', 'all'] as TimeSpan[]).map((span) => (
              <button
                key={span}
                onClick={() => setTimeSpan(span)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${timeSpan === span ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {span === 'all' ? 'All' : `${span.slice(0, -1)} Days`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Period Spending</p>
              <p className="text-3xl font-black text-slate-900">€{periodTotal.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400 mt-2 italic">*Reflects only visible filtered items</p>
            </div>
            <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100">
              <p className="text-[10px] font-bold text-primary-400 uppercase tracking-widest mb-1">Items in View</p>
              <p className="text-xl font-black text-primary-700">{filteredExpenses.length} Transactions</p>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="h-[200px] w-full">
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(val) => `€${val}`} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(val: number) => [`€${val.toFixed(2)}`, 'Spent']}
                    />
                    <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <Filter size={32} className="opacity-20 mb-2" />
                  <p className="text-sm font-medium">No data for this period</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="text-primary-600" size={20} />
                Monthly Income
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">Persistent</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">My Salary (€)</label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 text-slate-400">€</div>
                  <input
                    type="number"
                    value={income.salaryMe || ''}
                    onChange={(e) => handleIncomeChange('salaryMe', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 text-black border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Partner (€)</label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 text-slate-400">€</div>
                  <input
                    type="number"
                    value={income.salaryPartner || ''}
                    onChange={(e) => handleIncomeChange('salaryPartner', e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 text-black border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary-600 rounded-2xl text-white shadow-md shadow-primary-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Wallet size={20} />
                </div>
                <span className="font-bold text-sm uppercase tracking-wide">Total Income</span>
              </div>
              <span className="font-black text-2xl">€{totalIncome.toLocaleString()}</span>
            </div>
          </Card>

          <Card title="Add Expense">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expense Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Grocery Run"
                    className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (€)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 bg-white text-black border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    {Object.values(ExpenseCategory).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={newIsRecurring}
                  onChange={(e) => setNewIsRecurring(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="recurring" className="text-sm font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer">
                  <Repeat size={14} className={newIsRecurring ? 'text-primary-500' : 'text-slate-400'} />
                  Mark as Recurring Expense
                </label>
              </div>

              <button
                onClick={handleAdd}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg transition-colors font-bold shadow-sm"
              >
                <Plus size={18} /> Add Expense
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Transaction History" className="min-h-[500px]">
            <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {filteredExpenses.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                  <Filter size={48} className="opacity-10 mb-2" />
                  <p className="text-center italic">No transactions found for the selected period.</p>
                </div>
              )}

              {groupedExpenses.map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center gap-4 py-1">
                    <div className="h-px bg-slate-100 flex-1"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                    <div className="h-px bg-slate-100 flex-1"></div>
                  </div>

                  {items.map((expense) => (
                    <div key={expense.id} className={`flex items-center justify-between p-3 rounded-xl group border transition-all ${expense.isRecurring ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${expense.isRecurring ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                          {expense.isRecurring ? <Repeat size={18} /> : <Euro size={18} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 leading-none">{expense.name}</p>
                            {expense.isRecurring && (
                              <span className="text-[9px] font-bold uppercase text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded leading-none">Recurring</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">{expense.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-slate-900">€{expense.amount.toFixed(2)}</span>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Category Allocation">
            {chartData.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex flex-col items-center justify-center text-slate-300">
                <BarChart3 size={48} className="opacity-20 mb-2" />
                <p className="text-sm">Enter data to see breakdown</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};