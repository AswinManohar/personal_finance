import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory, IncomeState, RecurringFrequency } from '../types';
import { Trash2, Repeat } from 'lucide-react';
import {
  Card, ChipGroup, ColumnChart, Donut, Dot, EmptyState, Field, FieldLabel, IconBox, Input,
  ListRow, Pill, PrimaryButton, SectionLabel, Select, ToggleButton, FormError,
} from './ui';
import { newId } from '../utils/id';
import { AdvanziaInbox } from './AdvanziaInbox';

interface ExpensesProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  income: IncomeState;
  setIncome: React.Dispatch<React.SetStateAction<IncomeState>>;
  onSync?: (overrides?: any) => Promise<void>;
  /** Records an explicit deletion and returns the resulting tombstone log. */
  onExpenseDeleted?: (id: string) => string[];
  /** Capture key from a notification tap, routed down from App's deep-link handler. */
  captureFocusKey?: string | null;
  onCaptureFocusHandled?: () => void;
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

export const Expenses: React.FC<ExpensesProps> = ({ expenses, setExpenses, income, setIncome, onSync, onExpenseDeleted, captureFocusKey, onCaptureFocusHandled }) => {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);
  const [newVendor, setNewVendor] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurringFrequency, setNewRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [newIsEssential, setNewIsEssential] = useState(false);
  const [timeSpan, setTimeSpan] = useState<TimeSpan>('30d');
  const [formError, setFormError] = useState<string | null>(null);

  const [localSalaryMe, setLocalSalaryMe] = useState(income.salaryMe?.toString() || '');
  const [localSalaryPartner, setLocalSalaryPartner] = useState(income.salaryPartner?.toString() || '');
  const [isSavingIncome, setIsSavingIncome] = useState(false);

  React.useEffect(() => {
    setLocalSalaryMe(income.salaryMe ? income.salaryMe.toString() : '');
    setLocalSalaryPartner(income.salaryPartner ? income.salaryPartner.toString() : '');
  }, [income.salaryMe, income.salaryPartner]);

  const handleAdd = async () => {
    // Say why nothing happened. This used to `return` silently, so a missing
    // description made the button look dead — no message, nothing in the console.
    const amount = parseFloat(newAmount);
    if (!newAmount || isNaN(amount) || amount <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }
    if (!newName.trim()) {
      setFormError('Add a description so you can recognise this later.');
      return;
    }
    setFormError(null);

    const newExpense: Expense = {
      id: newId(),
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

    setFormError(null);
    setNewName('');
    setNewAmount('');
    setNewVendor('');
    setNewIsRecurring(false);
    setNewRecurringFrequency('monthly');
    setNewIsEssential(false);
  };

  /**
   * Confirming a captured notification. Same path as a manual add — a capture is
   * an ordinary expense once a human has agreed to it, and only then does it
   * reach the cloud.
   */
  const handleAddCaptured = async (expense: Expense) => {
    const updatedExpenses = [...expenses, expense]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(updatedExpenses);
    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }
  };

  const handleDelete = async (id: string) => {
    const updatedExpenses = expenses.filter(e => e.id !== id);
    // Carry the deletion explicitly — the push no longer infers it from absence.
    const deletedExpenseIds = onExpenseDeleted ? onExpenseDeleted(id) : [id];
    setExpenses(updatedExpenses);
    if (onSync) {
      await onSync({ expenses: updatedExpenses, deletedExpenseIds });
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

  // Category Distribution
  const chartData = useMemo(() => Object.values(ExpenseCategory).map(cat => ({
    name: cat,
    value: filteredExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0)
  })).filter(d => d.value > 0), [filteredExpenses]);

  const periodTotal = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = income.salaryMe + income.salaryPartner;

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

  const catColor = (c: string) =>
    (CATEGORY_COLORS[c] || CATEGORY_COLORS[ExpenseCategory.OTHER]).stroke;

  const monthlyCommitment = recurringExpenses
    .filter(e => e.recurringFrequency === 'monthly' || !e.recurringFrequency)
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* ── Captured from notifications ──
          Renders nothing at all when there is nothing waiting and capture is
          healthy, so the tab is unchanged for anyone not using it. */}
      <AdvanziaInbox
        onAddExpense={handleAddCaptured}
        focusKey={captureFocusKey}
        onFocusHandled={onCaptureFocusHandled}
      />

      {/* ── Breakdown ── */}
      <Card>
        <div className="flex justify-between items-center gap-2 mb-5">
          <h2 className="text-title font-bold">Breakdown</h2>
          <ChipGroup
            aria-label="Time span"
            value={timeSpan}
            onChange={setTimeSpan}
            options={[
              { value: '7d' as TimeSpan, label: '7D' },
              { value: '30d' as TimeSpan, label: '30D' },
              { value: '90d' as TimeSpan, label: '90D' },
              { value: 'all' as TimeSpan, label: 'ALL' },
            ]}
          />
        </div>

        <div className="flex justify-center mb-5">
          <Donut
            size={192}
            segments={chartData.map(d => ({ label: d.name, value: d.value, color: catColor(d.name) }))}
            label="Total Spent"
            value={`€${periodTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>

        <div className="flex flex-col gap-3">
          {chartData.length === 0 ? (
            <EmptyState icon="donut_small">No data for this period.</EmptyState>
          ) : (
            chartData.map(d => {
              const pct = periodTotal > 0 ? (d.value / periodTotal) * 100 : 0;
              return (
                <div key={d.name} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-caption">
                    <span className="flex items-center gap-2 font-medium">
                      <Dot color={catColor(d.name)} />
                      {d.name}
                    </span>
                    <span className="text-secondary font-bold tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: catColor(d.name) }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Log expense ── */}
      <Card className="flex flex-col gap-3">
        <div>
          <SectionLabel>Log Expense</SectionLabel>
          <p className="mt-1 text-label text-secondary opacity-70">Capture a new transaction</p>
        </div>

        <Input
          type="number"
          inputSize="hero"
          prefix="€"
          aria-label="Amount"
          value={newAmount}
          onChange={e => setNewAmount(e.target.value)}
          placeholder="0.00"
        />

        <Field label="Category" htmlFor="expense-category">
          <Select
            id="expense-category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value as ExpenseCategory)}
          >
            {Object.values(ExpenseCategory).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </Select>
        </Field>

        <Field label="Description" htmlFor="expense-name">
          <Input
            id="expense-name"
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Weekly Groceries"
          />
        </Field>

        <Field label="Vendor / Merchant (optional)" htmlFor="expense-vendor">
          <Input
            id="expense-vendor"
            type="text"
            value={newVendor}
            onChange={e => setNewVendor(e.target.value)}
            placeholder="e.g. REWE, Amazon"
          />
        </Field>

        <Field label="Date" htmlFor="expense-date">
          <Input
            id="expense-date"
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <ToggleButton
            on={newIsRecurring}
            onClick={() => setNewIsRecurring(!newIsRecurring)}
            icon="autorenew"
          >
            {newIsRecurring ? 'Recurring' : 'One-time'}
          </ToggleButton>
          <ToggleButton
            on={newIsEssential}
            onClick={() => setNewIsEssential(!newIsEssential)}
            icon="verified"
            accent="positive"
          >
            {newIsEssential ? 'Essential' : 'Non-essential'}
          </ToggleButton>
        </div>

        {newIsRecurring && (
          <Field label="Frequency" htmlFor="expense-frequency">
            <Select
              id="expense-frequency"
              value={newRecurringFrequency}
              onChange={e => setNewRecurringFrequency(e.target.value as RecurringFrequency)}
            >
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
        )}

        <FormError>{formError}</FormError>

        <PrimaryButton onClick={handleAdd}>Add Expense</PrimaryButton>
      </Card>

      {/* ── Recent ── */}
      <Card>
        {/* No "Clear Cache" here any more. The cloud is the source of truth, so
            a button that emptied local state only ever produced a screen full
            of zeroes until the next pull — it looked exactly like data loss. */}
        <SectionLabel className="mb-2 block">Recent</SectionLabel>
        <div className="flex flex-col">
          {recentExpenses.length === 0 ? (
            <EmptyState icon="receipt_long">No transactions yet.</EmptyState>
          ) : (
            recentExpenses.map((expense, i) => {
              const colors = CATEGORY_COLORS[expense.category] || CATEGORY_COLORS[ExpenseCategory.OTHER];
              return (
                <ListRow
                  key={expense.id}
                  divider={i < recentExpenses.length - 1}
                  className="h-[60px] group"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-field bg-surface-container-high flex items-center justify-center flex-none">
                      {expense.isRecurring
                        ? <Repeat size={16} className="text-primary" />
                        : <span className={`text-caption font-bold ${colors.text}`}>
                            {expense.category.slice(0, 2).toUpperCase()}
                          </span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body font-medium truncate">{expense.name}</span>
                      <span className="block mt-0.5 text-label text-secondary tabular-nums">
                        {formatDate(expense.date)}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 flex-none">
                    <span className="text-body font-bold tabular-nums text-negative">
                      -€{expense.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      aria-label={`Delete ${expense.name}`}
                      className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </ListRow>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Weekly trends ── */}
      <Card>
        <SectionLabel className="mb-4">Weekly Trends</SectionLabel>
        <ColumnChart
          color="#c1c1ff"
          columns={weeklyChartData.map(w => ({
            label: w.label,
            value: w.amount,
            caption: `€${w.amount.toFixed(0)}`,
          }))}
        />
        <div className="mt-4 pt-4 border-t border-outline-variant/12 flex justify-between items-center">
          <span className="flex items-center gap-2">
            <Dot color="#c1c1ff" />
            <span className="text-label text-secondary">Actual Spending</span>
          </span>
          <span className="text-label text-secondary tabular-nums">
            {filteredExpenses.length} transactions
          </span>
        </div>
      </Card>

      {/* ── Monthly income ── */}
      <Card accent>
        <div className="flex justify-between items-start mb-4">
          <div>
            <FieldLabel>Monthly Income</FieldLabel>
            <p className="mt-2 text-num-sm font-bold tabular-nums">
              €{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <IconBox icon="payments" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="My Salary" htmlFor="salary-me">
            <Input
              id="salary-me"
              type="number"
              value={localSalaryMe}
              onChange={e => setLocalSalaryMe(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Partner" htmlFor="salary-partner">
            <Input
              id="salary-partner"
              type="number"
              value={localSalaryPartner}
              onChange={e => setLocalSalaryPartner(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <PrimaryButton onClick={handleSaveIncome} disabled={isSavingIncome}>
          {isSavingIncome ? 'Saving...' : 'Save Income'}
        </PrimaryButton>
      </Card>

      {/* ── Recurring ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Recurring</SectionLabel>
          <span className="text-label font-bold tracking-[.08em] uppercase text-primary">
            {recurringExpenses.length} active
          </span>
        </div>
        <div className="flex flex-col">
          {recurringExpenses.length === 0 ? (
            <EmptyState icon="autorenew">No recurring expenses.</EmptyState>
          ) : (
            recurringExpenses.slice(0, 5).map((expense, i, arr) => (
              <ListRow
                key={expense.id}
                divider={i < arr.length - 1}
                className="min-h-14 py-2 group"
              >
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="text-body font-medium truncate">{expense.name}</span>
                  <span className="flex gap-1">
                    <Pill
                      tone={
                        expense.recurringFrequency === 'yearly' ||
                        expense.recurringFrequency === 'quarterly'
                          ? 'tertiary'
                          : 'primary'
                      }
                    >
                      {expense.recurringFrequency || 'monthly'}
                    </Pill>
                    {expense.isEssential && <Pill tone="positive">Essential</Pill>}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-none">
                  <span className="text-body font-bold tabular-nums">
                    €{expense.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    aria-label={`Delete ${expense.name}`}
                    className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </ListRow>
            ))
          )}
        </div>
        {recurringExpenses.length > 0 && (
          <div className="mt-3 p-3 rounded-field bg-surface-container-highest/30 flex items-center gap-3">
            <IconBox icon="calendar_month" tone="tertiary" />
            <span className="flex flex-col">
              <span className="text-label text-secondary font-medium">Monthly commitment</span>
              <span className="text-body font-bold tabular-nums">
                €{monthlyCommitment.toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
};
