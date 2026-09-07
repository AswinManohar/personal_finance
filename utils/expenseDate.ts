/**
 * Every date decision in the app, in one place.
 *
 * The bug this module exists to end: an expense's day was being derived with
 * `new Date(x).toISOString().split('T')[0]`, which is the **UTC** date. East of
 * Greenwich that files anything spent between midnight and the UTC offset onto
 * the previous day — and when that day is a Monday, into the previous week.
 *
 * Two rules follow, and both matter:
 *
 * 1. A transaction date is a *calendar date*, not an instant. It is carried as a
 *    `YYYY-MM-DD` string and compared lexicographically. String comparison on
 *    that format is ordering-correct and involves no timezone at all, which is
 *    why it cannot drift the way `Date` comparisons did.
 * 2. Never mix the two. The moment a `YYYY-MM-DD` goes through `new Date()` it
 *    becomes UTC midnight and every comparison against a local `Date` is off by
 *    the offset. That mismatch is what made each weekly bucket count six days
 *    instead of seven.
 */

/** ISO-ordered output; `en-CA` renders `YYYY-MM-DD` on every ICU build. */
const YMD = 'en-CA';

/**
 * The calendar date `d` falls on, in `timeZone` (default: the device's).
 *
 * The client passes no zone — the day a person means by "today" is the one on
 * the wall in front of them. Server-side and backfill code names Europe/Berlin
 * explicitly, because it is reinterpreting stored instants against the place
 * they were recorded.
 */
export const localYmd = (d: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat(YMD, timeZone ? { timeZone } : undefined).format(d);

/** The calendar date an epoch-milliseconds timestamp falls on. */
export const ymdFromEpoch = (epochMs: number, timeZone?: string): string =>
  localYmd(new Date(epochMs), timeZone);

/**
 * The Berlin calendar day a captured instant falls on.
 *
 * For a notification's post time or a Kontowecker mail's internalDate. Those
 * are instants recorded for a German bank transaction, and the ledger dates
 * such things in Europe/Berlin (see resolveExpenseDate). Reading them in the
 * device zone prefilled a phone on holiday, or an emulator on UTC, with the
 * wrong day, and that day was then saved verbatim.
 */
export const berlinYmd = (epochMs: number): string => ymdFromEpoch(epochMs, 'Europe/Berlin');

/** Today, as a calendar date. */
export const todayYmd = (timeZone?: string): string => localYmd(new Date(), timeZone);

/**
 * The Monday of the week containing `d`, with the time zeroed.
 *
 * Zeroing is not cosmetic. The previous implementation kept the current
 * time-of-day on its window bounds and compared them against dates parsed as
 * UTC midnight, so the first day of every window fell outside its own range.
 */
export const startOfWeek = (d: Date): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // getDay: Sun=0 -> Mon=0
  return x;
};

export interface WeekBucket {
  /** Monday, `YYYY-MM-DD`, inclusive. */
  start: string;
  /** Sunday, `YYYY-MM-DD`, inclusive. */
  end: string;
  /** Short human range, e.g. `17–23 Aug`. */
  label: string;
  /** True for the week containing `now`; it is partial by definition. */
  isCurrent: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `17–23 Aug`, or `29 Sep–5 Oct` when the week straddles two months. */
const rangeLabel = (start: Date, end: Date): string =>
  start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]}–${end.getDate()} ${MONTHS[end.getMonth()]}`;

/**
 * The `n` calendar weeks ending with the one containing `now`, oldest first.
 *
 * Calendar weeks, not trailing 7-day windows. The distinction is the whole
 * point: on a Monday a trailing window reaches back into six days of the
 * previous week, which is precisely what made "this week" read far too high.
 */
export const weekBuckets = (now: Date, n: number): WeekBucket[] => {
  const current = startOfWeek(now);
  const buckets: WeekBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(current);
    start.setDate(current.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    buckets.push({
      start: localYmd(start),
      end: localYmd(end),
      label: rangeLabel(start, end),
      isCurrent: i === 0,
    });
  }
  return buckets;
};

/** Inclusive both ends. Safe because `YYYY-MM-DD` sorts lexicographically. */
export const inRange = (ymd: string, lo: string, hi: string): boolean => ymd >= lo && ymd <= hi;

/** The shape of a `user_expenses` row, as far as dating it is concerned. */
export interface DatedRow {
  date?: string | null;
  created_at?: string | null;
}

/**
 * The day a synced row's money was spent.
 *
 * Dual-read, and deliberately temporary. The `date` column is authoritative;
 * `created_at` is only consulted for rows written before the column existed, or
 * by a producer that does not set it (the Telegram bot lives outside this repo
 * and only ever sends `created_at`). Once `date` is NOT NULL the fallback here
 * is provably unreachable and should be deleted.
 *
 * The fallback names Europe/Berlin rather than the device zone on purpose: it is
 * reinterpreting an instant recorded in the past, and where the reader happens
 * to be standing now is not evidence about where it was recorded.
 *
 * One bad row must never poison a whole pull, so an unparseable value degrades
 * to today rather than throwing.
 */
export const resolveExpenseDate = (row: DatedRow, fallbackZone = 'Europe/Berlin'): string => {
  if (typeof row.date === 'string' && row.date !== '') return row.date;
  if (row.created_at) {
    const parsed = new Date(row.created_at);
    if (!Number.isNaN(parsed.getTime())) return localYmd(parsed, fallbackZone);
  }
  return todayYmd();
};
