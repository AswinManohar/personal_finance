/**
 * What the app has learned about raw card-network merchant strings.
 *
 * Notifications carry the acquirer's descriptor, not a name a human would
 * choose: `MEGA LIMITED`, `DM DROGERIE SAGT DANKE`, `REWE Bonn, Friedenspla`.
 * The first time one appears the LLM proposes a readable name and a category;
 * every confirmation after that teaches this map, so a repeat merchant prefills
 * instantly, offline, with no model call.
 *
 * Keys are the raw descriptor, normalised only for case and whitespace.
 * Deliberately *not* fuzzy-matched: acquirer truncation is stable per merchant
 * (`REWE Bonn, Friedenspla` arrives identically every time), but two
 * differently-truncated strings are two different shops and must not collide.
 *
 * Phone-local, like the pending queue it serves.
 */
import { ExpenseCategory } from '../types';

export interface MerchantMemory {
  /** Human-readable name to prefill the expense with. */
  name: string;
  category: ExpenseCategory;
}

export type MerchantMap = Record<string, MerchantMemory>;

const normalise = (rawMerchant: string): string =>
  rawMerchant.trim().replace(/\s+/g, ' ').toLowerCase();

export const recallMerchant = (
  map: MerchantMap,
  rawMerchant: string,
): MerchantMemory | undefined => map[normalise(rawMerchant)];

/** Returns a new map; the caller owns persistence. */
export const rememberMerchant = (
  map: MerchantMap,
  rawMerchant: string,
  memory: MerchantMemory,
): MerchantMap => ({ ...map, [normalise(rawMerchant)]: memory });
