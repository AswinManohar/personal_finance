/**
 * Dedup for captured Advanzia notifications.
 *
 * Charting agreed to auto-merge captures that matched on (amount, merchant,
 * a few minutes). The on-device capture then made that rule indefensible: every
 * transaction carries a unique, stable `FCM-Notification:<id>` tag and nothing
 * re-posts, so the notification key is already an exact identity — while the
 * fuzzy rule would silently merge two legitimate 1,95 € purchases at the same
 * shop minutes apart, deleting a real expense with no trace.
 *
 * So the key does the deduping, and the fuzzy rule was demoted to a flag that a
 * human resolves. Nothing here ever drops a capture on a heuristic's say-so.
 *
 * All of this is phone-local, beside the native queue — no `Expense` field and
 * no Supabase column, keeping the pending queue local as charted.
 */

/** How close in time two identical-looking purchases must be to raise a flag. */
export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/** A capture already confirmed or dismissed. Kept only for dedup. */
export interface HandledRecord {
  key: string;
  amount: number | null;
  merchant: string | null;
  postedAt: number;
}

interface KeyedItem {
  key: string;
}

interface CaptureCandidate {
  amount: number | null;
  merchant: string | null;
  postedAt: number;
}

/**
 * True if this notification key is already queued or already dealt with.
 *
 * The `handled` half covers the interrupted drain: `getPending()` returned an
 * item, the app died before `clearPending()`, and the native queue still holds
 * something already turned into an expense.
 */
export const isAlreadyKnown = (
  key: string,
  queue: readonly KeyedItem[],
  handled: readonly HandledRecord[],
): boolean =>
  queue.some(item => item.key === key) || handled.some(record => record.key === key);

const sameMerchant = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A recently-handled capture this one resembles, or null.
 *
 * Advisory only — the caller shows it as "possible duplicate of X" and lets the
 * user decide. An unknown amount matches nothing: without it the comparison has
 * no discriminating power and would flag everything.
 */
export const findPossibleDuplicate = (
  candidate: CaptureCandidate,
  handled: readonly HandledRecord[],
): HandledRecord | null => {
  if (candidate.amount === null) return null;
  return (
    handled.find(
      record =>
        record.amount === candidate.amount &&
        sameMerchant(record.merchant, candidate.merchant) &&
        Math.abs(record.postedAt - candidate.postedAt) <= DUPLICATE_WINDOW_MS,
    ) ?? null
  );
};

export interface AdmissionResult {
  admitted: boolean;
  possibleDuplicateOf: HandledRecord | null;
}

/**
 * The single decision point for letting a capture into the inbox: admitted on
 * key novelty alone, with the fuzzy resemblance attached as a flag.
 */
export const admitCapture = (
  candidate: CaptureCandidate & KeyedItem,
  queue: readonly KeyedItem[],
  handled: readonly HandledRecord[],
): AdmissionResult => {
  if (isAlreadyKnown(candidate.key, queue, handled)) {
    return { admitted: false, possibleDuplicateOf: null };
  }
  return { admitted: true, possibleDuplicateOf: findPossibleDuplicate(candidate, handled) };
};
