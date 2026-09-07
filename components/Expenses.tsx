import React, { useState, useMemo, useEffect } from 'react';
import { Expense, ExpenseCategory, IncomeState, RecurringFrequency } from '../types';
import { Trash2, Repeat } from 'lucide-react';
import {
  Card, ChipGroup, CollapseToggle, ColumnChart, Donut, Dot, EmptyState, Field, FieldLabel,
  IconBox, Input, ListRow, PrimaryButton, SectionLabel, Select, ToggleButton, FormError,
} from './ui';
import { newId } from '../utils/id';
import { localYmd, todayYmd } from '../utils/expenseDate';
import { monthlyAmount } from '../utils/finance';
import {
  categoryTotals, monthlyTotal, oneOffExpenses, recurringBills, recurringIcon,
  recurringSublabel, subscriptionExpenses, weeklyTotals, withinSpan,
} from '../utils/expenseSummary';
import { AdvanziaInbox } from './AdvanziaInbox';
import { SparkasseInbox } from './SparkasseInbox';

interface ExpensesProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  income: IncomeState;
  setIncome: React.Dispatch<React.SetStateAction<IncomeState>>;
  onSync?: (overrides?: any) => Promise<void>;
  /** Records an explicit deletion and returns the resulting tombstone log. */
  onExpenseDeleted?: (id: string) => string[];
  /** Lifts a tombstone when a deletion is undone; returns the resulting log. */
  onExpenseRestored?: (id: string) => string[];
  /** Capture key from a notification tap, routed down from App's deep-link handler. */
  captureFocusKey?: string | null;
  onCaptureFocusHandled?: () => void;
}

import type { TimeSpan } from '../utils/expenseSummary';

const CATEGORY_COLORS: Record<string, { stroke: string; bg: string; text: string }> = {
  [ExpenseCategory.HOUSING]:       { stroke: '#c1c1ff', bg: 'bg-primary',      text: 'text-primary' },
  [ExpenseCategory.FOOD]:          { stroke: '#eec060', bg: 'bg-tertiary',      text: 'text-tertiary' },
  [ExpenseCategory.TRANSPORT]:     { stroke: '#3DD68C', bg: 'bg-[#3DD68C]',     text: 'text-[#3DD68C]' },
  [ExpenseCategory.UTILITIES]:     { stroke: '#8183ff', bg: 'bg-primary-container', text: 'text-primary-container' },
  [ExpenseCategory.ENTERTAINMENT]: { stroke: '#F26B6B', bg: 'bg-[#F26B6B]',    text: 'text-[#F26B6B]' },
  [ExpenseCategory.OTHER]:         { stroke: '#ccc5c0', bg: 'bg-secondary',     text: 'text-secondary' },
};


const SPAN_LABEL: Record<TimeSpan, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  all: 'all time',
};

const MONTH_OF = (ymd: string) =>
  new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/**
 * Newest first. `YYYY-MM-DD` sorts correctly as a string, so this avoids the
 * `new Date(...)` round-trip that reinterpreted each date as UTC midnight.
 */
const byDateDesc = (a: Expense, b: Expense): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

/**
 * Shared 56px row for Recurring Expenses and Subscriptions.
 *
 * Module-scoped on purpose. Declared inside Expenses it was a new component
 * type on every render, so every keystroke in the add form unmounted and
 * remounted every recurring row: hover-revealed buttons vanished mid-tap and
 * focus was lost.
 */
const RecurringRow: React.FC<{
  expense: Expense;
  tone: 'primary' | 'tertiary';
  divider: boolean;
  onDelete: (id: string) => void;
}> = ({ expense, tone, divider, onDelete }) => {
  const tint = tone === 'primary' ? 'bg-[rgba(193,193,255,0.1)] text-primary' : 'bg-[rgba(238,192,96,0.1)] text-tertiary';
  return (
    <ListRow divider={divider} className="h-14 group">
      <span className="flex items-center gap-3 min-w-0">
        <span className={`w-9 h-9 rounded-field flex items-center justify-center flex-none ${tint}`}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
            {recurringIcon(expense)}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-caption font-semibold truncate">{expense.name}</span>
          <span className="block text-label text-secondary opacity-70 truncate">
            {recurringSublabel(expense)}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2 flex-none">
        <span className={`text-caption font-bold tabular-nums ${tone === 'primary' ? 'text-primary' : 'text-tertiary'}`}>
          €{monthlyAmount(expense).toFixed(2)}
        </span>
        <button
          onClick={() => onDelete(expense.id)}
          aria-label={`Delete ${expense.name}`}
          className="w-11 h-11 flex items-center justify-center text-secondary hover:text-negative transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </ListRow>
  );
};

/**
 * The clock the period window and the week buckets are computed against.
 *
 * Reading `new Date()` inside a useMemo froze it: a phone left on this tab
 * across midnight kept yesterday's 7D/30D window and yesterday's "this week"
 * bucket until an expense changed. Re-read when the tab comes back to the
 * foreground and once a minute, but only publish a new value when the
 * calendar day has actually moved, so nothing re-renders for no reason.
 */
const useToday = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(prev => (localYmd(prev) === localYmd(new Date()) ? prev : new Date()));
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, []);
  return now;
};

export const Expenses: React.FC<ExpensesProps> = ({ expenses, setExpenses, income, setIncome, onSync, onExpenseDeleted, onExpenseRestored, captureFocusKey, onCaptureFocusHandled }) => {
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);
  const [newVendor, setNewVendor] = useState('');
  const [newDate, setNewDate] = useState(todayYmd());
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurringFrequency, setNewRecurringFrequency] = useState<RecurringFrequency>('monthly');
  // Bill unless said otherwise. Only read when `newIsRecurring` — a one-off
  // expense is neither, and must be stored with no opinion rather than `false`.
  const [newIsSubscription, setNewIsSubscription] = useState(false);
  const [newIsEssential, setNewIsEssential] = useState(false);
  const [timeSpan, setTimeSpan] = useState<TimeSpan>('30d');
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * The one action undo can walk back, or null.
   *
   * Deliberately a single slot rather than a stack. Every entry here is already
   * committed to the cloud, so a deep history would let someone reverse a sync
   * from ten minutes ago and be unable to tell what they had just undone. One
   * step covers the mistake this exists for — the wrong row tapped, the button
   * hit twice — and nothing beyond it.
   */
  const [undoable, setUndoable] = useState<{ kind: 'add' | 'delete'; expense: Expense } | null>(null);
  /** Category whose day-by-day breakdown is open, or null. */
  const [drilldown, setDrilldown] = useState<ExpenseCategory | null>(null);
  // Per-card collapse, independent of the drill-down above — collapsing
  // Breakdown hides the whole donut/category list, drill-down is a detail
  // inside that list.
  const [breakdownCollapsed, setBreakdownCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);

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
      isSubscription: newIsRecurring ? newIsSubscription : undefined,
      isEssential: newIsEssential,
    };

    const updatedExpenses = [...expenses, newExpense].sort(byDateDesc);
    setExpenses(updatedExpenses);
    setUndoable({ kind: 'add', expense: newExpense });

    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }

    setFormError(null);
    setNewName('');
    setNewAmount('');
    setNewVendor('');
    setNewIsRecurring(false);
    setNewRecurringFrequency('monthly');
    setNewIsSubscription(false);
    setNewIsEssential(false);
  };

  /**
   * Confirming a captured notification. Same path as a manual add — a capture is
   * an ordinary expense once a human has agreed to it, and only then does it
   * reach the cloud.
   */
  const handleAddCaptured = async (expense: Expense) => {
    const updatedExpenses = [...expenses, expense].sort(byDateDesc);
    setExpenses(updatedExpenses);
    if (onSync) {
      await onSync({ expenses: updatedExpenses });
    }
  };

  const handleDelete = async (id: string) => {
    const removed = expenses.find(e => e.id === id);
    const updatedExpenses = expenses.filter(e => e.id !== id);
    // Carry the deletion explicitly — the push no longer infers it from absence.
    const deletedExpenseIds = onExpenseDeleted ? onExpenseDeleted(id) : [id];
    setExpenses(updatedExpenses);
    if (removed) setUndoable({ kind: 'delete', expense: removed });
    if (onSync) {
      await onSync({ expenses: updatedExpenses, deletedExpenseIds });
    }
  };

  /**
   * Reverses the last add or delete.
   *
   * Restoring a deletion has to lift the tombstone as well as put the row back.
   * The two are not interchangeable: `pushToCloud` skips any expense whose id is
   * in `deletedExpenseIds` precisely so a stale pull cannot resurrect it, so a
   * restore that left the id behind would show the row on screen while leaving
   * it `deleted: true` in the cloud — and the next pull would take it away
   * again. Because the delete is soft, the ordinary upsert (which writes
   * `deleted: false`) is all that is needed to bring the row properly back.
   */
  const handleUndo = async () => {
    if (!undoable) return;
    const { kind, expense } = undoable;
    setUndoable(null);

    if (kind === 'add') {
      await handleDelete(expense.id);
      // handleDelete offers its own undo; an undone add is not itself undoable.
      setUndoable(null);
      return;
    }

    const updatedExpenses = [...expenses, expense].sort(byDateDesc);
    const deletedExpenseIds = onExpenseRestored ? onExpenseRestored(expense.id) : [];
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

  /**
   * What the Breakdown card and Weekly Trends count.
   *
   * Recurring rows are excluded from BOTH, and consistently so. Tapping a
   * category bar has to open a sheet that sums to the bar — a €912 Housing bar
   * opening a €12 list would be worse than either number alone.
   */
  const oneOff = useMemo(() => oneOffExpenses(expenses), [expenses]);
  const today = useToday();

  const filteredExpenses = useMemo(
    () => withinSpan(oneOff, timeSpan, today),
    [oneOff, timeSpan, today]
  );

  // Calendar weeks over the full history, not the chip-filtered slice: a 7D chip
  // would otherwise zero every bar but the last and make the chart unreadable.
  const weeklyChartData = useMemo(() => weeklyTotals(expenses, today, 4), [expenses, today]);

  // The last bucket is the week containing today — `weekBuckets` builds oldest
  // first and marks it `isCurrent`. Read from the same array the bars render so
  // the caption under them cannot report a different set of rows: it used to
  // show `filteredExpenses.length`, i.e. the CHIP period, which on ALL is every
  // one-off expense on record under a label that says "this week".
  const thisWeek = weeklyChartData[weeklyChartData.length - 1];

  const chartData = useMemo(() => categoryTotals(filteredExpenses), [filteredExpenses]);

  const periodTotal = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);

  /**
   * The open category's transactions, newest first.
   *
   * Reads `filteredExpenses` — the same list the bars are computed from — so the
   * list always reconciles with the bar that opened it, and changing the span
   * re-filters an already-open category rather than going stale.
   */
  const drilldownItems = useMemo(
    () => (drilldown ? [...filteredExpenses.filter(e => e.category === drilldown)].sort(byDateDesc) : []),
    [drilldown, filteredExpenses]
  );
  const totalIncome = income.salaryMe + income.salaryPartner;

  // Grouping expenses for recent list (use all expenses, most recent 8)
  const recentExpenses = useMemo(() => {
    return [...expenses].sort(byDateDesc).slice(0, 8);
  }, [expenses]);

  // Recurring expenses, split the way the design does: name/category-heuristic
  // subscriptions (Netflix, gym, ...) get their own card, everything else
  // recurring is a bill. See utils/expenseSummary.ts `isSubscription` — there's
  // no persisted flag for this yet, so it's inferred every render.
  const recurringExpensesList = useMemo(() => recurringBills(expenses), [expenses]);
  const subscriptionsList = useMemo(() => subscriptionExpenses(expenses), [expenses]);

  // Local calendar days. Deriving these from toISOString() made "Today" flip at
  // 02:00 Berlin rather than at midnight.
  const formatDate = (dateStr: string) => {
    if (dateStr === todayYmd()) return 'Today';
    if (dateStr === localYmd(new Date(Date.now() - 86400000))) return 'Yesterday';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const catColor = (c: string) =>
    (CATEGORY_COLORS[c] || CATEGORY_COLORS[ExpenseCategory.OTHER]).stroke;

  const recurringMonthlyTotal = useMemo(() => monthlyTotal(recurringExpensesList), [recurringExpensesList]);
  const subscriptionsMonthlyTotal = useMemo(() => monthlyTotal(subscriptionsList), [subscriptionsList]);

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* ── Captured from notifications ──
          Renders nothing at all when there is nothing waiting and capture is
          healthy, so the tab is unchanged for anyone not using it. */}
      {undoable && (
        /* Spans both columns on desktop and sits first on mobile: a delete can
           be triggered from the Recent list, either recurring card or the
           breakdown sheet, and the offer has to be findable from all of them. */
        <div className="lg:col-span-2 flex items-center justify-between gap-3 rounded-card bg-surface-container-high px-4 py-3">
          <span className="text-label text-secondary min-w-0 truncate">
            {undoable.kind === 'add' ? 'Added' : 'Deleted'} “{undoable.expense.name}”
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="flex-none h-9 px-4 rounded-field text-label font-bold text-primary hover:bg-primary/[0.08] transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      <AdvanziaInbox
        onAddExpense={handleAddCaptured}
        focusKey={captureFocusKey}
        onFocusHandled={onCaptureFocusHandled}
      />
      <SparkasseInbox onAddExpense={handleAddCaptured} />

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
          <>
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

            {/* Which of the two cards this lands on. Stated, not guessed: the
                inference it replaces splits on a name regex, which put two
                identical €63 Transport commitments on opposite cards because
                one was called "DB ticket" and the other "Subscription". It is
                also the only way to have a WEEKLY subscription — the fallback's
                cadence branch can only ever say monthly. */}
            <FieldLabel>Type</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <ToggleButton
                on={!newIsSubscription}
                onClick={() => setNewIsSubscription(false)}
                icon="receipt_long"
              >
                Bill
              </ToggleButton>
              <ToggleButton
                on={newIsSubscription}
                onClick={() => setNewIsSubscription(true)}
                icon="subscriptions"
              >
                Subscription
              </ToggleButton>
            </div>
          </>
        )}

        <FormError>{formError}</FormError>

        <PrimaryButton onClick={handleAdd}>Add Expense</PrimaryButton>
      </Card>

      {/* ── Recurring Expenses ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Recurring Expenses</SectionLabel>
          <span className="text-label font-bold tabular-nums text-primary">
            €{recurringMonthlyTotal.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col">
          {recurringExpensesList.length === 0 ? (
            <EmptyState icon="autorenew">No recurring expenses.</EmptyState>
          ) : (
            recurringExpensesList.map((expense, i, arr) => (
              <RecurringRow key={expense.id} expense={expense} tone="primary" divider={i < arr.length - 1} onDelete={handleDelete} />
            ))
          )}
        </div>
        <p className="mt-3 text-label text-secondary opacity-70 italic">amounts shown per month</p>
      </Card>

      {/* ── Subscriptions ── */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <SectionLabel>Subscriptions</SectionLabel>
          <span className="text-label font-bold tabular-nums text-tertiary">
            €{subscriptionsMonthlyTotal.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col">
          {subscriptionsList.length === 0 ? (
            <EmptyState icon="subscriptions">No subscriptions.</EmptyState>
          ) : (
            subscriptionsList.map((expense, i, arr) => (
              <RecurringRow key={expense.id} expense={expense} tone="tertiary" divider={i < arr.length - 1} onDelete={handleDelete} />
            ))
          )}
        </div>
        {subscriptionsList.length > 0 && (
          <p className="mt-3 text-label text-secondary opacity-70">
            {subscriptionsList.length} active · €{(subscriptionsMonthlyTotal * 12).toFixed(2)} per year
          </p>
        )}
      </Card>

      {/* ── Breakdown ── */}
      <Card className="pr-11 relative">
        <div className="flex justify-between items-center gap-2 mb-5">
          <div>
            <h2 className="text-title font-bold">Breakdown</h2>
            <p className="text-label text-secondary opacity-70">
              {breakdownCollapsed
                ? `€${periodTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} total spent · ${chartData.length} categor${chartData.length === 1 ? 'y' : 'ies'}`
                : 'One-off spending'}
            </p>
          </div>
          {!breakdownCollapsed && (
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
          )}
        </div>
        <div className="absolute top-3.5 right-2.5">
          <CollapseToggle
            collapsed={breakdownCollapsed}
            onClick={() => setBreakdownCollapsed(v => !v)}
            label="Breakdown"
          />
        </div>

        {!breakdownCollapsed && <>
        <div className="flex justify-center mb-5">
          <Donut
            size={192}
            segments={chartData.map(d => ({ label: d.name, value: d.value, color: catColor(d.name) }))}
            label="One-off spend"
            value={`€${periodTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
        </div>

        <div className="flex flex-col gap-3">
          {chartData.length === 0 ? (
            <EmptyState icon="donut_small">No data for this period.</EmptyState>
          ) : (
            chartData.map(d => {
              const pct = periodTotal > 0 ? (d.value / periodTotal) * 100 : 0;
              const open = drilldown === d.name;
              return (
                <div key={d.name} className="flex flex-col">
                  {/* The bar is the control: tapping it expands this category in place. */}
                  <button
                    type="button"
                    onClick={() => setDrilldown(open ? null : d.name)}
                    aria-expanded={open}
                    aria-label={`${d.name}, €${d.value.toFixed(2)} — ${open ? 'hide' : 'show'} transactions`}
                    className={`flex flex-col gap-1.5 text-left rounded-lg p-1.5 -m-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${open ? 'bg-primary/[0.06]' : 'hover:bg-primary/[0.06]'}`}
                  >
                    <div className="flex justify-between items-center text-caption w-full">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="material-symbols-outlined text-secondary transition-transform duration-200 inline-block"
                          style={{ fontSize: 16, lineHeight: 1, transform: `rotate(${open ? 0 : -90}deg)` }}
                          aria-hidden="true"
                        >
                          expand_more
                        </span>
                        <Dot color={catColor(d.name)} />
                        {d.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-secondary tabular-nums">€{d.value.toFixed(2)}</span>
                        <span className="text-secondary font-bold tabular-nums">{pct.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: catColor(d.name) }}
                      />
                    </div>
                  </button>

                  {open && (
                    <div className="mt-2 ml-2 pl-3 border-l-2 border-outline-variant/40 flex flex-col">
                      {drilldownItems.length === 0 ? (
                        <p className="text-label text-secondary opacity-70 py-2">
                          Nothing in {SPAN_LABEL[timeSpan]}.
                        </p>
                      ) : (
                        <>
                          {drilldownItems.map(item => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center gap-2 min-h-[44px] py-1"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-caption font-semibold">{item.name}</span>
                                <span className="block text-label text-secondary opacity-70">
                                  {formatDate(item.date)}
                                  {item.vendor ? ` · ${item.vendor}` : ''}
                                </span>
                              </span>
                              <span className="text-caption font-bold tabular-nums whitespace-nowrap">
                                €{item.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <p className="text-label text-secondary opacity-70 pt-2">
                            {drilldownItems.length} transaction{drilldownItems.length === 1 ? '' : 's'} · {SPAN_LABEL[timeSpan]}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        </>}
      </Card>


      {/* ── Recent ── */}
      <Card className="pr-11 relative">
        {/* No "Clear Cache" here any more. The cloud is the source of truth, so
            a button that emptied local state only ever produced a screen full
            of zeroes until the next pull — it looked exactly like data loss. */}
        <div className="flex justify-between items-center mb-2">
          <SectionLabel>Recent</SectionLabel>
          <span className="text-label text-secondary tabular-nums">
            {recentExpenses.length} most recent
          </span>
        </div>
        <div className="absolute top-3.5 right-2.5">
          <CollapseToggle
            collapsed={recentCollapsed}
            onClick={() => setRecentCollapsed(v => !v)}
            label="Recent"
          />
        </div>
        {!recentCollapsed && (
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
        )}
      </Card>

      {/* ── Weekly trends ── */}
      <Card>
        <SectionLabel>Weekly Trends</SectionLabel>
        <p className="mt-1 mb-4 text-label text-secondary opacity-70">
          One-off spending, Monday to Sunday
        </p>
        <ColumnChart
          color="#c1c1ff"
          columns={weeklyChartData.map(w => ({
            label: w.label,
            value: w.amount,
            caption: `€${w.amount.toFixed(0)}`,
            highlight: w.isCurrent,
          }))}
        />
        <div className="mt-4 pt-4 border-t border-outline-variant/12 flex justify-between items-center">
          <span className="flex items-center gap-2">
            <Dot color="#c1c1ff" />
            <span className="text-label text-secondary">This week so far</span>
          </span>
          <span className="text-label text-secondary tabular-nums">
            {thisWeek.count} transaction{thisWeek.count === 1 ? '' : 's'}
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

    </div>
  );
};
