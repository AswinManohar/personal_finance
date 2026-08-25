import { Expense, ExpenseCategory } from '../types';
import { WeekBucket, inRange, localYmd, weekBuckets } from './expenseDate';
import { monthlyAmount, num } from './finance';

export type TimeSpan = '7d' | '30d' | '90d' | 'all';

/**
 * Spending the weekly and category views count.
 *
 * Recurring rows are excluded, and that is a deliberate reading rather than a
 * simplification. A recurring expense is stored as a *single row with one date*,
 * not one row per occurrence — so rent entered once on the 1st lands in whichever
 * week contains the 1st and is absent from every other. Counting it made the
 * weekly bar incoherent: one week carrying €900 of rent and the next carrying
 * none says nothing about how the money was actually spent. The commitment is
 * reported separately, monthly-normalised, where that shape makes sense.
 */
export const oneOffExpenses = (expenses: Expense[]): Expense[] =>
  expenses.filter(e => !e.isRecurring);

const SPAN_DAYS: Record<Exclude<TimeSpan, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Inclusive `YYYY-MM-DD` bounds for a chip period, or null for "all".
 *
 * "7D" means the seven calendar days ending today — today plus the six before
 * it. The previous implementation subtracted seven days from a `Date` that still
 * carried the current time-of-day and compared it against dates parsed as UTC
 * midnight, so the oldest day fell outside its own window and the period was
 * quietly one day short.
 */
export const spanBounds = (span: TimeSpan, now: Date): { lo: string; hi: string } | null => {
  if (span === 'all') return null;
  const lo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  lo.setDate(lo.getDate() - (SPAN_DAYS[span] - 1));
  return { lo: localYmd(lo), hi: localYmd(now) };
};

export const withinSpan = (expenses: Expense[], span: TimeSpan, now: Date): Expense[] => {
  const bounds = spanBounds(span, now);
  return bounds ? expenses.filter(e => inRange(e.date, bounds.lo, bounds.hi)) : expenses;
};

export interface WeekTotal extends WeekBucket {
  amount: number;
  /**
   * How many one-off rows make up `amount`.
   *
   * Carried here rather than recomputed by the caller so the "This week so far"
   * line and the bar above it cannot disagree. They did: the line rendered the
   * chip-filtered list's length, which on ALL is every one-off expense ever.
   */
  count: number;
}

/**
 * One-off spending per calendar week, oldest first.
 *
 * Deliberately reads the full expense list rather than the chip-filtered one:
 * the weekly chart answers "how do recent weeks compare", which a 7-day filter
 * makes unanswerable by zeroing every bar but the last.
 */
export const weeklyTotals = (expenses: Expense[], now: Date, n: number): WeekTotal[] => {
  const rows = oneOffExpenses(expenses);
  return weekBuckets(now, n).map(w => {
    const inWeek = rows.filter(e => inRange(e.date, w.start, w.end));
    return {
      ...w,
      amount: inWeek.reduce((sum, e) => sum + num(e.amount), 0),
      count: inWeek.length,
    };
  });
};

export interface CategoryTotal {
  name: ExpenseCategory;
  value: number;
}

/** Per-category sums in enum order, with empty categories dropped. */
export const categoryTotals = (expenses: Expense[]): CategoryTotal[] =>
  Object.values(ExpenseCategory)
    .map(cat => ({
      name: cat,
      value: expenses.filter(e => e.category === cat).reduce((s, e) => s + num(e.amount), 0),
    }))
    .filter(d => d.value > 0);

export interface DayGroup {
  date: string;
  total: number;
  items: Expense[];
}

/** Newest day first, with a subtotal — the shape the drill-down sheet renders. */
export const groupByDay = (expenses: Expense[]): DayGroup[] => {
  const byDate = new Map<string, Expense[]>();
  for (const e of expenses) {
    const bucket = byDate.get(e.date);
    if (bucket) bucket.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => ({
      date,
      total: items.reduce((s, e) => s + num(e.amount), 0),
      items,
    }));
};

/**
 * Names that read as a subscription regardless of category or cadence. Checked
 * before the category/cadence heuristic below, so a yearly Netflix or a
 * non-essential-but-untagged Spotify still lands in Subscriptions.
 */
const SUBSCRIPTION_NAME_RE =
  /netflix|spotify|prime|disney|gym|icloud|storage|membership|subscription|apple|youtube/i;

/**
 * Whether a recurring row belongs on the Subscriptions card or the Recurring
 * Expenses one.
 *
 * The stored flag wins outright. Everything below it is the legacy inference,
 * kept only for rows written before `is_subscription` existed — it is arbitrary
 * and known to be wrong in both directions: it claims "Internet subscription"
 * for the Subscriptions card on the strength of its name, and it cannot ever
 * classify a *weekly* subscription, because the cadence branch requires
 * monthly. Both are why the explicit flag was added; neither is worth fixing in
 * the fallback, which every row loses the moment a human states an answer.
 */
export const isSubscription = (e: Expense): boolean => {
  if (e.isSubscription !== undefined) return e.isSubscription;
  if (SUBSCRIPTION_NAME_RE.test(e.name)) return true;
  // `!e.recurringFrequency` defaults to monthly, matching monthlyCommitment's
  // reading elsewhere: a recurring row with no cadence set is assumed monthly.
  const isMonthly = !e.recurringFrequency || e.recurringFrequency === 'monthly';
  return (
    !e.isEssential &&
    isMonthly &&
    (e.category === ExpenseCategory.ENTERTAINMENT || e.category === ExpenseCategory.OTHER)
  );
};

/**
 * Material Symbol for a recurring row. Name match first (a "Netflix" entered
 * under Other should still show the streaming glyph), category as the fallback.
 */
export const recurringIcon = (e: Expense): string => {
  const name = e.name.toLowerCase();
  if (/netflix|prime|disney|youtube/.test(name)) return 'smart_display';
  if (/spotify/.test(name)) return 'music_note';
  if (/gym|fitness/.test(name)) return 'fitness_center';
  if (/internet|wifi/.test(name)) return 'wifi';
  if (/rent|mortgage/.test(name)) return 'home';
  if (/electric/.test(name)) return 'bolt';
  if (/insurance/.test(name)) return 'shield';
  if (/phone/.test(name)) return 'smartphone';
  if (/icloud|storage/.test(name)) return 'cloud';

  const CATEGORY_ICON: Record<ExpenseCategory, string> = {
    [ExpenseCategory.HOUSING]: 'home',
    [ExpenseCategory.TRANSPORT]: 'directions_bus',
    [ExpenseCategory.FOOD]: 'shopping_cart',
    [ExpenseCategory.UTILITIES]: 'bolt',
    [ExpenseCategory.ENTERTAINMENT]: 'movie',
    [ExpenseCategory.OTHER]: 'category',
  };
  return CATEGORY_ICON[e.category] ?? 'category';
};

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  'bi-weekly': 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/**
 * The row's second line. Monthly items just name the category — the amount
 * shown alongside is already the true monthly figure, so restating it would be
 * redundant. Non-monthly items instead show their native frequency and native
 * amount ("Weekly · €95.20 · Food"): the row's headline amount is the monthly
 * *equivalent*, and pairing a converted figure with an unconverted frequency
 * word would misstate what was actually charged.
 */
export const recurringSublabel = (e: Expense): string => {
  const freq = e.recurringFrequency || 'monthly';
  if (freq === 'monthly') return `Monthly · ${e.category}`;
  return `${FREQUENCY_LABEL[freq] ?? freq} · €${num(e.amount).toFixed(2)} · ${e.category}`;
};

/** Recurring rows classified as bills (Recurring Expenses card). */
export const recurringBills = (expenses: Expense[]): Expense[] =>
  expenses.filter(e => e.isRecurring && !isSubscription(e));

/** Recurring rows classified as subscriptions (Subscriptions card). */
export const subscriptionExpenses = (expenses: Expense[]): Expense[] =>
  expenses.filter(e => e.isRecurring && isSubscription(e));

/** Monthly-equivalent total across a set of recurring rows. */
export const monthlyTotal = (expenses: Expense[]): number =>
  expenses.reduce((sum, e) => sum + monthlyAmount(e), 0);
