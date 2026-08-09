import { describe, it, expect } from 'vitest';
import {
  DUPLICATE_WINDOW_MS,
  isAlreadyKnown,
  findPossibleDuplicate,
  admitCapture,
  type HandledRecord,
} from '../../utils/advanziaQueue';
import {
  recallMerchant,
  rememberMerchant,
  type MerchantMap,
} from '../../utils/merchantMemory';
import { ExpenseCategory } from '../../types';

/**
 * Dedup rules, and the reason they are the shape they are.
 *
 * Charting agreed to auto-merge captures matching on (amount, merchant, a few
 * minutes). The on-device capture then showed every transaction carries a
 * unique, stable `FCM-Notification:<id>` tag and that nothing re-posts — so the
 * notification key is an *exact* identity, and the fuzzy rule was left doing
 * nothing but harm: two legitimate 1,95 € purchases at the same DM minutes
 * apart would silently become one, deleting a real expense.
 *
 * So: the key dedups, and the fuzzy rule only ever raises a flag a human
 * resolves. Nothing is dropped on its say-so.
 */

const handled = (over: Partial<HandledRecord> = {}): HandledRecord => ({
  key: 'k1',
  amount: 1.95,
  merchant: 'DM DROGERIE SAGT DANKE',
  postedAt: 1_785_944_905_849,
  ...over,
});

describe('isAlreadyKnown', () => {
  it('rejects a key already sitting in the queue', () => {
    expect(isAlreadyKnown('k1', [{ key: 'k1' }], [])).toBe(true);
  });

  /**
   * The interrupted-drain case: getPending() succeeded, the app died before
   * clearPending(), so the native queue still holds an item already confirmed.
   */
  it('rejects a key already confirmed or dismissed', () => {
    expect(isAlreadyKnown('k1', [], [handled()])).toBe(true);
  });

  it('admits a key it has never seen', () => {
    expect(isAlreadyKnown('k2', [{ key: 'k1' }], [handled()])).toBe(false);
  });
});

describe('findPossibleDuplicate', () => {
  it('flags a same-amount same-merchant capture within the window', () => {
    const prior = handled();
    const match = findPossibleDuplicate(
      { amount: 1.95, merchant: 'DM DROGERIE SAGT DANKE', postedAt: prior.postedAt + 60_000 },
      [prior],
    );
    expect(match).toEqual(prior);
  });

  it('does not flag once the window has passed', () => {
    const prior = handled();
    const match = findPossibleDuplicate(
      {
        amount: 1.95,
        merchant: 'DM DROGERIE SAGT DANKE',
        postedAt: prior.postedAt + DUPLICATE_WINDOW_MS + 1,
      },
      [prior],
    );
    expect(match).toBeNull();
  });

  it('does not flag a different amount or a different merchant', () => {
    const prior = handled();
    expect(findPossibleDuplicate(
      { amount: 2.95, merchant: 'DM DROGERIE SAGT DANKE', postedAt: prior.postedAt + 1000 }, [prior],
    )).toBeNull();
    expect(findPossibleDuplicate(
      { amount: 1.95, merchant: 'REWE', postedAt: prior.postedAt + 1000 }, [prior],
    )).toBeNull();
  });

  it('never flags when the amount is unknown, which would match everything', () => {
    const prior = handled();
    expect(findPossibleDuplicate(
      { amount: null, merchant: null, postedAt: prior.postedAt + 1000 }, [prior],
    )).toBeNull();
  });
});

describe('admitCapture', () => {
  const capture = (over: Record<string, unknown> = {}) => ({
    key: 'new-key',
    amount: 1.95,
    merchant: 'DM DROGERIE SAGT DANKE',
    postedAt: handled().postedAt + 60_000,
    ...over,
  });

  /**
   * The behaviour the whole design turns on: buying two identical coffees
   * minutes apart must produce two expenses, one of them flagged — never one
   * expense.
   */
  it('admits a genuine repeat purchase, flagged rather than merged', () => {
    const result = admitCapture(capture(), [], [handled()]);
    expect(result.admitted).toBe(true);
    expect(result.possibleDuplicateOf).toEqual(handled());
  });

  it('admits an unrelated capture with no flag', () => {
    const result = admitCapture(capture({ merchant: 'REWE Bonn, Friedenspla', amount: 49.54 }), [], [handled()]);
    expect(result.admitted).toBe(true);
    expect(result.possibleDuplicateOf).toBeNull();
  });

  it('refuses a capture whose key it has already handled', () => {
    const result = admitCapture(capture({ key: 'k1' }), [], [handled()]);
    expect(result.admitted).toBe(false);
  });
});

describe('merchant memory', () => {
  const map: MerchantMap = {};

  it('recalls nothing for a merchant it has never seen', () => {
    expect(recallMerchant(map, 'MEGA LIMITED')).toBeUndefined();
  });

  it('remembers what a confirmation taught it', () => {
    const learned = rememberMerchant(map, 'MEGA LIMITED', {
      name: 'Mega Store',
      category: ExpenseCategory.OTHER,
    });
    expect(recallMerchant(learned, 'MEGA LIMITED')).toEqual({
      name: 'Mega Store',
      category: ExpenseCategory.OTHER,
    });
  });

  it('matches regardless of case and stray whitespace', () => {
    const learned = rememberMerchant({}, 'DM DROGERIE SAGT DANKE', {
      name: 'dm',
      category: ExpenseCategory.FOOD,
    });
    expect(recallMerchant(learned, '  dm drogerie sagt danke ')).toMatchObject({ name: 'dm' });
  });

  /**
   * Acquirer-truncated strings like "REWE Bonn, Friedenspla" are stable per
   * merchant, so they make a perfectly good key — but they are not the same
   * merchant as a differently-truncated one, and must not collide.
   */
  it('keeps differently-truncated merchants apart', () => {
    let learned = rememberMerchant({}, 'REWE Bonn, Friedenspla', {
      name: 'REWE', category: ExpenseCategory.FOOD,
    });
    learned = rememberMerchant(learned, 'REWE Koeln, Hohenzol', {
      name: 'REWE Köln', category: ExpenseCategory.FOOD,
    });
    expect(recallMerchant(learned, 'REWE Bonn, Friedenspla')?.name).toBe('REWE');
    expect(recallMerchant(learned, 'REWE Koeln, Hohenzol')?.name).toBe('REWE Köln');
  });

  it('overwrites an earlier guess when corrected', () => {
    let learned = rememberMerchant({}, 'MEGA LIMITED', {
      name: 'Mega', category: ExpenseCategory.OTHER,
    });
    learned = rememberMerchant(learned, 'MEGA LIMITED', {
      name: 'Mega Store', category: ExpenseCategory.ENTERTAINMENT,
    });
    expect(recallMerchant(learned, 'MEGA LIMITED')).toEqual({
      name: 'Mega Store', category: ExpenseCategory.ENTERTAINMENT,
    });
  });
});
