import { describe, it, expect } from 'vitest';
import {
  parseGermanAmount,
  parseAdvanziaBody,
  looksTransactional,
  TRANSACTION_TITLE,
} from '../../utils/advanziaNotification';

/**
 * The parser reads bank notifications, so every ambiguity here is a chance to
 * invent an expense that never happened. It fails closed instead.
 *
 * The four `FIXTURES` below are verbatim `android.bigText` values captured off
 * the phone with `dumpsys notification --noredact` (see
 * .scratch/advanzia-notification-capture/issues/02-*). They are the only real
 * data we have; everything else in this suite is a hostile variation on them.
 *
 * Two traps are load-bearing:
 *
 *  - `REWE Bonn, Friedenspla` is truncated mid-word by the acquirer AND contains
 *    a comma, so any merchant capture that stops at punctuation is wrong.
 *  - Declines and refunds almost certainly reuse the title "Kartentransaktion".
 *    A loose match on "über X € ... an MERCHANT" would book a declined payment
 *    as a real expense, or flip the sign on a refund. Hence the reject-list.
 */

const FIXTURES = {
  mega: 'Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.',
  dm: 'Eine Zahlung über 1,95 € der Mastercard mit der Kartenendung 9520 an DM DROGERIE SAGT DANKE wurde erfolgreich ausgeführt.',
  rewe: 'Eine Zahlung über 49,54 € der Mastercard mit der Kartenendung 9520 an REWE Bonn, Friedenspla wurde erfolgreich ausgeführt.',
  kaffee: 'Eine Zahlung über 9,20 € der Mastercard mit der Kartenendung 9520 an Der Kaffeeladen GmbH wurde erfolgreich ausgeführt.',
};

describe('parseGermanAmount', () => {
  it('reads the plain two-decimal form the bank actually sends', () => {
    expect(parseGermanAmount('11,89')).toBe(11.89);
    expect(parseGermanAmount('1,95')).toBe(1.95);
    expect(parseGermanAmount('9,20')).toBe(9.2);
  });

  it('reads German thousands grouping', () => {
    expect(parseGermanAmount('1.234,56')).toBe(1234.56);
    expect(parseGermanAmount('12.345,67')).toBe(12345.67);
    expect(parseGermanAmount('1.234.567,89')).toBe(1234567.89);
  });

  /**
   * The 1000x bug this whole function exists to prevent: parsed with German
   * rules (strip dots, comma to dot) "1,234.56" becomes 1.23456 — an expense
   * wrong by three orders of magnitude, silently. Reject rather than guess.
   */
  it('refuses English-style formatting instead of misreading it', () => {
    expect(parseGermanAmount('1,234.56')).toBeNull();
    expect(parseGermanAmount('1234.56')).toBeNull();
  });

  it('requires exactly two decimals', () => {
    expect(parseGermanAmount('11,8')).toBeNull();
    expect(parseGermanAmount('11,899')).toBeNull();
    expect(parseGermanAmount('1189')).toBeNull();
  });

  it('refuses malformed thousands grouping', () => {
    expect(parseGermanAmount('1.2345,67')).toBeNull();
    expect(parseGermanAmount('12.34,56')).toBeNull();
  });

  it('refuses junk', () => {
    expect(parseGermanAmount('')).toBeNull();
    expect(parseGermanAmount('abc')).toBeNull();
    expect(parseGermanAmount('-11,89')).toBeNull();
  });
});

describe('parseAdvanziaBody — strict tier', () => {
  it('parses every captured fixture exactly', () => {
    expect(parseAdvanziaBody(FIXTURES.mega)).toEqual({
      kind: 'strict', amount: 11.89, merchant: 'MEGA LIMITED', cardEnding: '9520',
    });
    expect(parseAdvanziaBody(FIXTURES.dm)).toEqual({
      kind: 'strict', amount: 1.95, merchant: 'DM DROGERIE SAGT DANKE', cardEnding: '9520',
    });
    expect(parseAdvanziaBody(FIXTURES.kaffee)).toEqual({
      kind: 'strict', amount: 9.2, merchant: 'Der Kaffeeladen GmbH', cardEnding: '9520',
    });
  });

  it('keeps a merchant that contains a comma and is truncated mid-word', () => {
    expect(parseAdvanziaBody(FIXTURES.rewe)).toEqual({
      kind: 'strict', amount: 49.54, merchant: 'REWE Bonn, Friedenspla', cardEnding: '9520',
    });
  });

  it('accepts any card ending, since a replacement card changes the number', () => {
    const body = FIXTURES.mega.replace('9520', '4417');
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'strict', cardEnding: '4417' });
  });

  it('parses a four-figure amount', () => {
    const body = FIXTURES.mega.replace('11,89', '1.499,00');
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'strict', amount: 1499 });
  });
});

describe('parseAdvanziaBody — reject tier', () => {
  /**
   * These must never reach the strict or loose tiers: a declined payment is not
   * an expense, and a refund booked as a charge has the sign backwards.
   */
  it('rejects a declined payment', () => {
    const body = 'Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde abgelehnt.';
    expect(parseAdvanziaBody(body)).toEqual({ kind: 'rejected', marker: 'abgelehnt' });
  });

  it('rejects a refund', () => {
    const body = 'Eine Gutschrift über 20,00 € der Mastercard mit der Kartenendung 9520 an REWE wurde erfolgreich ausgeführt.';
    expect(parseAdvanziaBody(body)).toEqual({ kind: 'rejected', marker: 'Gutschrift' });
  });

  it('rejects regardless of casing', () => {
    const body = 'Eine Zahlung über 5,00 € wurde STORNIERT.';
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'rejected' });
  });

  it('rejects before parsing, even when the sentence is otherwise well-formed', () => {
    const body = FIXTURES.mega.replace('erfolgreich ausgeführt', 'fehlgeschlagen');
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'rejected' });
  });
});

describe('parseAdvanziaBody — loose tier', () => {
  /**
   * Reached only when Advanzia rewords the sentence. The result is prefilled
   * but flagged, never auto-saved — that flag is the visible signal that the
   * strict pattern needs updating.
   */
  it('still extracts fields from a reworded sentence', () => {
    const body = 'Zahlung über 11,89 € mit Kartenendung 9520 an MEGA LIMITED durchgeführt.';
    expect(parseAdvanziaBody(body)).toEqual({
      kind: 'loose', amount: 11.89, merchant: 'MEGA LIMITED', cardEnding: '9520',
    });
  });

  it('drops to loose with a null amount rather than coercing a foreign currency', () => {
    const body = 'Eine Zahlung über 25,00 USD der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.';
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'loose', amount: null });
  });

  it('drops to loose rather than misreading an English-formatted amount', () => {
    const body = FIXTURES.mega.replace('11,89', '1,234.56');
    expect(parseAdvanziaBody(body)).toMatchObject({ kind: 'loose', amount: null });
  });

  it('yields an all-null loose result for text it cannot read at all', () => {
    expect(parseAdvanziaBody('Ihr Kontoauszug ist verfügbar.')).toEqual({
      kind: 'loose', amount: null, merchant: null, cardEnding: null,
    });
  });
});

describe('looksTransactional — the capture-health guard', () => {
  /**
   * Guard 2. If Advanzia ever renames the title, the title gate swallows every
   * transaction silently. A notification that quotes a euro amount but did not
   * pass the gate is the tell.
   */
  it('flags text quoting a euro amount', () => {
    expect(looksTransactional(FIXTURES.mega)).toBe(true);
    expect(looksTransactional('Zahlung 49,54 € ausgeführt')).toBe(true);
  });

  it('ignores text with no euro amount', () => {
    expect(looksTransactional('Ihr Kontoauszug ist verfügbar.')).toBe(false);
    expect(looksTransactional('Willkommen bei Advanzia!')).toBe(false);
  });

  it('accepts the known false positive: marketing that quotes a price', () => {
    // One dismissal is a cheaper failure than missing real transactions.
    expect(looksTransactional('Nur 4,99 € pro Monat!')).toBe(true);
  });
});

describe('TRANSACTION_TITLE', () => {
  it('is the exact title every captured transaction carried', () => {
    expect(TRANSACTION_TITLE).toBe('Kartentransaktion');
  });
});
