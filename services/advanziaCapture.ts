import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabaseService';
import { apiUrl } from './apiBase';
import { ExpenseCategory } from '../types';
import { parseAdvanziaBody, type ParseOutcome } from '../utils/advanziaNotification';
import {
  admitCapture,
  type HandledRecord,
} from '../utils/advanziaQueue';
import {
  recallMerchant,
  rememberMerchant,
  type MerchantMap,
  type MerchantMemory,
} from '../utils/merchantMemory';

/**
 * The WebView half of Advanzia notification capture.
 *
 * The native listener only ever writes raw notification text to a queue; every
 * decision — parsing, dedup, guessing, what the user sees — happens here, where
 * it is testable.
 *
 * The inbox lives in localStorage rather than Supabase, as charted: only
 * *confirmed* expenses reach the cloud, so an unreviewed capture never
 * contaminates synced data. The trade is that uninstalling loses unconfirmed
 * items, which is acceptable because the native queue would be gone too.
 */

interface AdvanziaCapturePlugin {
  getPending(): Promise<{ items: NativeCapture[] }>;
  clearPending(options: { keys: string[] }): Promise<void>;
  getStatus(): Promise<CaptureStatus>;
  openListenerSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
}

const plugin = registerPlugin<AdvanziaCapturePlugin>('AdvanziaCapture');

interface NativeCapture {
  key: string;
  gate: 'transaction' | 'suspicious';
  title: string;
  body: string;
  postedAt: number;
}

export interface CaptureStatus {
  /** Notification access — revocable from system settings with no callback, so re-read on every resume. */
  listenerEnabled: boolean;
  notificationsEnabled: boolean;
  /** Epoch ms, or 0. "Capture is working" evidence, since the failure mode is silence. */
  lastCaptureAt: number;
  /** Epoch ms of the last notification that looked transactional but failed the title gate. */
  lastSuspiciousAt: number;
  queued: number;
}

export interface PendingItem {
  key: string;
  gate: 'transaction' | 'suspicious';
  body: string;
  postedAt: number;
  parse: ParseOutcome;
  possibleDuplicateOf: HandledRecord | null;
}

const PENDING_KEY = 'advanzia.pending';
const HANDLED_KEY = 'advanzia.handled';
const MERCHANTS_KEY = 'advanzia.merchants';

/** Enough history for the duplicate window to work, not enough to grow forever. */
const HANDLED_LIMIT = 200;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked localStorage costs the inbox, not the capture — the
    // native queue still holds anything not yet cleared.
  }
};

export const readPending = (): PendingItem[] => read<PendingItem[]>(PENDING_KEY, []);
export const readHandled = (): HandledRecord[] => read<HandledRecord[]>(HANDLED_KEY, []);
export const readMerchants = (): MerchantMap => read<MerchantMap>(MERCHANTS_KEY, {});

const amountOf = (parse: ParseOutcome): number | null =>
  parse.kind === 'strict' ? parse.amount : parse.kind === 'loose' ? parse.amount : null;

const merchantOf = (parse: ParseOutcome): string | null =>
  parse.kind === 'strict' ? parse.merchant : parse.kind === 'loose' ? parse.merchant : null;

/**
 * Pulls whatever the listener queued while the app was away, folds it into the
 * inbox, then tells the native side it can let go.
 *
 * Order matters: the native queue is only cleared *after* the items are written
 * to localStorage, so a crash mid-drain leaves them queued rather than losing
 * them. The duplicate that would cause is caught by the handled-key set.
 */
export const drainPending = async (): Promise<PendingItem[]> => {
  if (!Capacitor.isNativePlatform()) return readPending();

  let captures: NativeCapture[] = [];
  try {
    const result = await plugin.getPending();
    captures = result?.items ?? [];
  } catch {
    // Plugin missing (web build, or an APK predating it). Nothing to drain.
    return readPending();
  }

  if (captures.length === 0) return readPending();

  const pending = readPending();
  const handled = readHandled();
  const admittedKeys: string[] = [];

  for (const capture of captures) {
    const parse = parseAdvanziaBody(capture.body);
    const decision = admitCapture(
      {
        key: capture.key,
        amount: amountOf(parse),
        merchant: merchantOf(parse),
        postedAt: capture.postedAt,
      },
      pending,
      handled,
    );

    // Already known keys are still cleared natively — leaving them queued would
    // make the listener re-offer them on every single resume.
    admittedKeys.push(capture.key);
    if (!decision.admitted) continue;

    pending.push({
      key: capture.key,
      gate: capture.gate,
      body: capture.body,
      postedAt: capture.postedAt,
      parse,
      possibleDuplicateOf: decision.possibleDuplicateOf,
    });
  }

  pending.sort((a, b) => b.postedAt - a.postedAt);
  write(PENDING_KEY, pending);

  try {
    await plugin.clearPending({ keys: admittedKeys });
  } catch {
    // Harmless: the next drain re-reads them and the handled-key set filters
    // out anything already dealt with.
  }

  return pending;
};

/** Removes an item from the inbox and records it so it can never come back. */
export const resolvePending = (key: string): PendingItem[] => {
  const pending = readPending();
  const item = pending.find(p => p.key === key);
  const remaining = pending.filter(p => p.key !== key);
  write(PENDING_KEY, remaining);

  if (item) {
    const handled: HandledRecord[] = [
      {
        key: item.key,
        amount: amountOf(item.parse),
        merchant: merchantOf(item.parse),
        postedAt: item.postedAt,
      },
      ...readHandled(),
    ].slice(0, HANDLED_LIMIT);
    write(HANDLED_KEY, handled);
  }

  return remaining;
};

/** Teaches the merchant map from a confirmation, so this merchant never needs the LLM again. */
export const learnMerchant = (rawMerchant: string, memory: MerchantMemory): void => {
  write(MERCHANTS_KEY, rememberMerchant(readMerchants(), rawMerchant, memory));
};

export const recallLocalMerchant = (rawMerchant: string): MerchantMemory | undefined =>
  recallMerchant(readMerchants(), rawMerchant);

const CATEGORY_VALUES = Object.values(ExpenseCategory) as string[];

/**
 * Asks the backend to read an acquirer descriptor for us.
 *
 * Only ever called for a merchant the map has never seen. Any failure — offline,
 * signed out, LLM down — returns undefined and the caller falls back to `Other`
 * with the raw descriptor as the name, which is exactly the charted behaviour.
 */
export const guessMerchant = async (rawMerchant: string): Promise<MerchantMemory | undefined> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return undefined;

    const response = await fetch(apiUrl('/api/merchants/guess'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ merchant: rawMerchant }),
    });
    if (!response.ok) return undefined;

    const body = await response.json();
    if (!body?.name || !CATEGORY_VALUES.includes(body.category)) return undefined;
    return { name: body.name, category: body.category as ExpenseCategory };
  } catch {
    return undefined;
  }
};

export const getCaptureStatus = async (): Promise<CaptureStatus | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await plugin.getStatus();
  } catch {
    return null;
  }
};

export const openListenerSettings = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) await plugin.openListenerSettings().catch(() => {});
};

export const openBatterySettings = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) await plugin.openBatterySettings().catch(() => {});
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { granted } = await plugin.requestNotificationPermission();
    return granted;
  } catch {
    return false;
  }
};

/** Parses `cashflow://review?key=…` from a deep link, or null. */
export const captureKeyFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'cashflow:') return null;
    return parsed.searchParams.get('key');
  } catch {
    return null;
  }
};
