import { extractPlainBody, decodeRfc2047, type MimePart } from '../utils/mimeDecode';
import {
  parseKontoweckerEmail,
  looksTransactional,
  KONTOWECKER_SENDER,
  type SparkasseLine,
} from '../utils/sparkasseEmail';
import { admitCapture, type HandledRecord } from '../utils/advanziaQueue';
import { gmailFetch } from './gmailAuth';

/**
 * The Gmail half of Sparkasse capture.
 *
 * Structurally this is `advanziaCapture.drainPending`, with one hard difference:
 * the native queue is DESTRUCTIVE. `clearPending()` means a capture can never be
 * offered twice, so the Advanzia path gets idempotency for free. Gmail hands the
 * same mailbox back on every poll, so this module has to earn it — otherwise
 * dismissing an expense just brings it back the next time the app opens.
 *
 * Two guards, the same composite-cursor shape as api/routers/integrations.py:
 *
 *   - a watermark on internalDate, queried with 3 days of deliberate overlap
 *     because mail arrives late and out of order;
 *   - a non-rolling seen-message-id set covering everything inside that overlap.
 *
 * The watermark keeps the query small; the set makes re-polling exact. Neither
 * is trusted alone. In particular, `HANDLED_LIMIT` in advanziaCapture.ts caps
 * handled records at 200 — fine for one-notification-one-expense, far too few
 * once a single email contributes several lines.
 *
 * Like the Advanzia inbox, everything here is localStorage: only *confirmed*
 * expenses reach Supabase.
 */

const PENDING_KEY = 'sparkasse.pending';
const HANDLED_KEY = 'sparkasse.handled';
const WATERMARK_KEY = 'sparkasse.watermark';
const SEEN_KEY = 'sparkasse.seen';
const STATUS_KEY = 'sparkasse.status';

/** Mail is delivered late and out of order; re-read this far behind. */
const OVERLAP_MS = 3 * 24 * 60 * 60 * 1000;
/** Generous: at ~1 mail a day this is years, and each entry is a short string. */
const SEEN_LIMIT = 2000;
const HANDLED_LIMIT = 500;

export interface SparkasseItem {
  key: string;
  messageId: string;
  line: SparkasseLine;
  postedAt: number;
  possibleDuplicateOf: HandledRecord | null;
}

export interface SparkasseStatus {
  authorized: boolean;
  lastPolledAt: number;
  lastCaptureAt: number;
  /** Kontowecker mail quoting a euro amount that failed the gate — the tell that wording changed. */
  lastSuspiciousAt: number;
  /**
   * Last poll that could not reach the mailbox. Zero once one does.
   *
   * Without it a still-authorized but permanently failing poller is
   * indistinguishable from a quiet month: pending stays empty, nothing is
   * suspicious, and the card renders nothing at all.
   */
  lastPollFailedAt: number;
  pending: number;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // A full localStorage costs the inbox, not the mail — Gmail still has it.
    return false;
  }
};

export const readSparkassePending = (): SparkasseItem[] => read<SparkasseItem[]>(PENDING_KEY, []);
const readHandled = (): HandledRecord[] => read<HandledRecord[]>(HANDLED_KEY, []);
const readSeen = (): string[] => read<string[]>(SEEN_KEY, []);

export const readSparkasseStatus = (): SparkasseStatus => ({
  authorized: false,
  lastPolledAt: 0,
  lastCaptureAt: 0,
  lastSuspiciousAt: 0,
  lastPollFailedAt: 0,
  ...read<Partial<SparkasseStatus>>(STATUS_KEY, {}),
  pending: readSparkassePending().length,
});

const patchStatus = (patch: Partial<SparkasseStatus>): void => {
  write(STATUS_KEY, { ...read<Partial<SparkasseStatus>>(STATUS_KEY, {}), ...patch });
};

const headerOf = (payload: MimePart, name: string): string =>
  payload.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/**
 * Reads new Kontowecker mail into the pending inbox.
 *
 * Always returns the current inbox, even on failure, so callers can render
 * unconditionally. A poll that cannot reach Gmail is not an empty inbox.
 */
export const pollSparkasse = async (): Promise<SparkasseItem[]> => {
  const watermark = read<number>(WATERMARK_KEY, 0);
  // Gmail's `after:` takes seconds. Reach behind the watermark deliberately.
  const afterSeconds = Math.floor(Math.max(0, watermark - OVERLAP_MS) / 1000);
  const query = encodeURIComponent(
    `from:${KONTOWECKER_SENDER}${afterSeconds > 0 ? ` after:${afterSeconds}` : ''}`,
  );

  const listResponse = await gmailFetch(`/messages?q=${query}&maxResults=50`);
  if (!listResponse?.ok) {
    // No authorization, no network, or Gmail refusing us. Recorded because the
    // inbox is empty either way and only this tells the two apart.
    patchStatus({ lastPollFailedAt: Date.now() });
    return readSparkassePending();
  }

  const list = await listResponse.json().catch(() => null);
  const ids: string[] = (list?.messages ?? []).map((m: { id: string }) => m.id);

  patchStatus({ lastPolledAt: Date.now(), lastPollFailedAt: 0 });
  if (ids.length === 0) return readSparkassePending();

  const pending = readSparkassePending();
  const handled = readHandled();
  const seen = new Set(readSeen());
  let newestSeen = watermark;
  let captured = false;
  let suspicious = false;

  for (const id of ids) {
    if (seen.has(id)) continue;

    const response = await gmailFetch(`/messages/${id}?format=full`);
    if (!response?.ok) continue;

    const message = await response.json().catch(() => null);
    if (!message?.payload) continue;

    const postedAt = Number(message.internalDate) || Date.now();
    newestSeen = Math.max(newestSeen, postedAt);

    const sender = headerOf(message.payload, 'From');
    const subject = decodeRfc2047(headerOf(message.payload, 'Subject'));
    const body = extractPlainBody(message.payload);

    // Mark seen before parsing: a message we cannot read is still a message we
    // should not fetch again on every resume forever.
    seen.add(id);

    if (!body) continue;

    const lines = parseKontoweckerEmail(sender, subject, body);
    // Two ways a mail can yield no transactions, and both are the same deafness:
    // null failed the envelope gate, [] passed it and no line inside parsed. The
    // empty array is the more dangerous of the two — `seen.add` has already run
    // and the watermark is about to advance, so an unflagged [] means the mail
    // is never fetched again and its transactions are gone for good. If it
    // quotes a euro amount, the wording has probably changed and capture has
    // gone quietly deaf — the one failure mode that looks exactly like "no
    // transactions this week".
    if (lines === null || lines.length === 0) {
      if (looksTransactional(body)) suspicious = true;
      continue;
    }

    lines.forEach((line, index) => {
      const key = `gmail:${id}#${index}`;
      const decision = admitCapture(
        { key, amount: line.amount, merchant: line.counterparty, postedAt },
        pending,
        handled,
      );
      if (!decision.admitted) return;

      pending.push({
        key,
        messageId: id,
        line,
        postedAt,
        possibleDuplicateOf: decision.possibleDuplicateOf,
      });
      captured = true;
    });
  }

  pending.sort((a, b) => b.postedAt - a.postedAt);

  // The seen-set and watermark are what stop a message being re-read. Advancing
  // them when the inbox write failed would mark these transactions handled while
  // nothing holds them — they would never be fetched again. Losing a poll is
  // recoverable; losing a transaction is not.
  if (write(PENDING_KEY, pending)) {
    write(SEEN_KEY, [...seen].slice(-SEEN_LIMIT));
    write(WATERMARK_KEY, newestSeen);
    patchStatus({
      ...(captured ? { lastCaptureAt: Date.now() } : {}),
      ...(suspicious ? { lastSuspiciousAt: Date.now() } : {}),
    });
  }

  return pending;
};

/** Removes an item from the inbox and records it so it can never come back. */
export const resolveSparkasseItem = (key: string): SparkasseItem[] => {
  const pending = readSparkassePending();
  const item = pending.find(p => p.key === key);
  const remaining = pending.filter(p => p.key !== key);
  write(PENDING_KEY, remaining);

  if (item) {
    write(
      HANDLED_KEY,
      [
        {
          key: item.key,
          amount: item.line.amount,
          merchant: item.line.counterparty,
          postedAt: item.postedAt,
        },
        ...readHandled(),
      ].slice(0, HANDLED_LIMIT),
    );
  }

  return remaining;
};
