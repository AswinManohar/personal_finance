import React, { useState } from 'react';
import { Expense, ExpenseCategory, IncomeState } from '../types';
import { Card } from './ui/Card';
import { Plus, Trash2, Euro, Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface ExpensesProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  income: IncomeState;
  setIncome: React.Dispatch<React.SetStateAction<IncomeState>>;
}

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'];

export const Expenses: React.FC<ExpensesProps> = ({ expenses, setExpenses, income, setIncome }) => {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);

  const handleAdd = () => {
    if (!newName || !newAmount) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      name: newName,
      amount: amount,
      category: newCategory
    };

    setExpenses([...expenses, newExpense]);
    setNewName('');
    setNewAmount('');
  };

  const handleDelete = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const handleIncomeChange = (field: keyof IncomeState, value: string) => {
    const numValue = parseFloat(value);
    setIncome(prev => ({
      ...prev,
      [field]: isNaN(numValue) ? 0 : numValue
    }));
  };

  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = income.salaryMe + income.salaryPartner;
  const remainingBalance = totalIncome - totalExpenses;

  const chartData = Object.values(ExpenseCategory).map(cat => {
    return {
      name: cat,
      value: expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)
    };
  }).filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        {/* Income Section */}
        <Card title="Monthly Income">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">My Salary (€)</label>
              <input
                type="number"
                value={income.salaryMe || ''}
                onChange={(e) => handleIncomeChange('salaryMe', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Partner's Salary (€)</label>
              <input
                type="number"
                value={income.salaryPartner || ''}
                onChange={(e) => handleIncomeChange('salaryPartner', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full">
                <Wallet size={18} />
              </div>
              <span className="font-medium text-slate-700">Total Income</span>
            </div>
            <span className="font-bold text-emerald-600 text-lg">€{totalIncome.toFixed(2)}</span>
          </div>
        </Card>

        {/* Add Expense Section */}
        <Card title="Add Expense">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expense Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Grocery Run"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (€)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                >
                  {Object.values(ExpenseCategory).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleAdd}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg transition-colors font-medium"
            >
              <Plus size={18} /> Add Expense
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Budget Summary Section */}
        <div className="grid grid-cols-2 gap-4">
           <Card className="bg-white border-red-100">
              <div className="flex flex-col items-center justify-center py-2 text-center">
                 <div className="flex items-center gap-2 text-red-600 mb-1">
                   <ArrowDownCircle size={18} />
                   <span className="text-sm font-medium uppercase">Expenses</span>
                 </div>
                 <span className="text-2xl font-bold text-slate-900">€{totalExpenses.toFixed(2)}</span>
              </div>
           </Card>
           <Card className={`${remainingBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex flex-col items-center justify-center py-2 text-center">
                 <div className={`flex items-center gap-2 mb-1 ${remainingBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                   <ArrowUpCircle size={18} />
                   <span className="text-sm font-medium uppercase">Remaining</span>
                 </div>
                 <span className={`text-2xl font-bold ${remainingBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                   €{remainingBalance.toFixed(2)}
                 </span>
              </div>
           </Card>
        </div>

        <Card title="Monthly Breakdown">
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {expenses.length === 0 && (
              <p className="text-center text-slate-400 py-4 italic">No expenses added yet.</p>
            )}
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                    <Euro size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{expense.name}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{expense.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-700">€{expense.amount.toFixed(2)}</span>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Visual Breakdown" className="min-h-[300px]">
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
                  <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
              <p>Add expenses to see the breakdown</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};