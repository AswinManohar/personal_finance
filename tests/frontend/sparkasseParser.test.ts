import { describe, it, expect } from 'vitest';
import {
  parseKontoweckerEmail,
  isAddable,
  looksTransactional,
  KONTOWECKER_SENDER,
} from '../../utils/sparkasseEmail';

/**
 * This parser reads bank mail, so every ambiguity is a chance to invent an
 * expense. It fails closed, and it fails *visibly*.
 *
 * REAL is the verbatim decoded text/plain part of a genuine Kontowecker mail
 * (2026-08-06, `Show original`). Everything else is a hostile variation on it.
 *
 * Three traps are load-bearing:
 *
 *  - `Neuer Saldo: 614,93 EUR` is shaped exactly like a transaction line. Read
 *    as one, it books a €614,93 expense out of thin air every single email.
 *  - The amount is SIGNED. A positive is money arriving, not money spent, and
 *    the app has no transaction ledger for income to land in.
 *  - The Advanzia card is direct-debited from this same account, so its monthly
 *    settlement appears here as one lump sum covering purchases the notification
 *    listener already captured one by one.
 */

const REAL = [
  'Guten Tag,',
  '',
  'auf dem Konto *8393 wurden folgende Umsätze verbucht:',
  '',
  'Pravallik.: -1,00 EUR',
  '',
  'Neuer Saldo: 614,93 EUR',
  '',
  'Mit freundlichen Grüßen',
  'Ihre Sparkasse',
].join('\n');

const SUBJECT_ONE = 'Ihr Umsatzwecker: 1 neuer Umsatz';

const batch = (lines: string[], subject: string) => ({
  subject,
  body: [
    'Guten Tag,',
    '',
    'auf dem Konto *8393 wurden folgende Umsätze verbucht:',
    '',
    ...lines,
    '',
    'Neuer Saldo: 614,93 EUR',
    '',
    'Mit freundlichen Grüßen',
    'Ihre Sparkasse',
  ].join('\n'),
});

describe('envelope gate', () => {
  it('accepts the real message', () => {
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, SUBJECT_ONE, REAL)).not.toBeNull();
  });

  it('rejects a different sender even with a perfect body', () => {
    expect(parseKontoweckerEmail('phish@example.com', SUBJECT_ONE, REAL)).toBeNull();
  });

  it('matches the sender inside a display-name form', () => {
    expect(
      parseKontoweckerEmail('Kontowecker <noreply@kontowecker.de>', SUBJECT_ONE, REAL),
    ).not.toBeNull();
  });

  it('rejects other Kontowecker mail, such as a balance alert', () => {
    expect(
      parseKontoweckerEmail(KONTOWECKER_SENDER, 'Ihr Saldowecker: Kontostand', REAL),
    ).toBeNull();
  });

  it('accepts the decoded plural subject', () => {
    const { subject, body } = batch(['A GmbH: -5,00 EUR', 'B AG: -6,00 EUR'], 'Ihr Umsatzwecker: 2 neue Umsätze');
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)).toHaveLength(2);
  });
});

describe('line extraction', () => {
  it('reads the single real transaction', () => {
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, SUBJECT_ONE, REAL)!;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'clean',
      counterparty: 'Pravallik.',
      amount: 1,
      raw: 'Pravallik.: -1,00 EUR',
    });
  });

  it('never reads Neuer Saldo as a transaction', () => {
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, SUBJECT_ONE, REAL)!;
    expect(lines.every(l => !l.raw.includes('Neuer Saldo'))).toBe(true);
    expect(lines.every(l => l.amount !== 614.93)).toBe(true);
  });

  it('excludes Neuer Saldo by label even when it is moved above the transactions', () => {
    const body = [
      'auf dem Konto *8393 wurden folgende Umsätze verbucht:',
      'Neuer Saldo: 614,93 EUR',
      'EDEKA: -20,00 EUR',
    ].join('\n');
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, SUBJECT_ONE, body)!;
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(20);
  });

  it('keeps a counterparty containing a colon', () => {
    const { subject, body } = batch(['FIRMA: ABT 4: -9,99 EUR'], SUBJECT_ONE);
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines[0].counterparty).toBe('FIRMA: ABT 4');
    expect(lines[0].amount).toBe(9.99);
  });

  it('reads a batch of three', () => {
    const { subject, body } = batch(
      ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR', 'NETFLIX: -12,99 EUR'],
      'Ihr Umsatzwecker: 3 neue Umsätze',
    );
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines.map(l => l.amount)).toEqual([20, 85.5, 12.99]);
    expect(lines.every(l => l.kind === 'clean')).toBe(true);
  });

  it('reads German thousands grouping', () => {
    const { subject, body } = batch(['MIETE: -1.250,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].amount).toBe(1250);
  });
});

describe('direction', () => {
  it('treats a negative amount as spending', () => {
    const { subject, body } = batch(['EDEKA: -20,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].kind).toBe('clean');
  });

  it('treats a positive amount as incoming, never an expense', () => {
    const { subject, body } = batch(['ARBEITGEBER GMBH: +2.400,00 EUR'], SUBJECT_ONE);
    const line = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0];
    expect(line.kind).toBe('incoming');
    expect(isAddable(line.kind)).toBe(false);
  });

  it('treats an UNSIGNED amount as incoming, failing away from inventing spending', () => {
    const { subject, body } = batch(['UNKLAR: 42,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].kind).toBe('incoming');
  });

  it('reports a positive amount as a positive number', () => {
    const { subject, body } = batch(['ARBEITGEBER GMBH: +2.400,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].amount).toBe(2400);
  });
});

describe('Advanzia settlement', () => {
  it('is never addable, or the month double-counts', () => {
    const { subject, body } = batch(['ADVANZIA BANK S.A.: -487,32 EUR'], SUBJECT_ONE);
    const line = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0];
    expect(line.kind).toBe('settlement');
    expect(isAddable(line.kind)).toBe(false);
  });

  it('matches case-insensitively and on a substring', () => {
    const { subject, body } = batch(['Lastschrift advanzia mastercard: -100,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].kind).toBe('settlement');
  });

  it('outranks the sign, so an Advanzia refund is still not addable', () => {
    const { subject, body } = batch(['ADVANZIA BANK S.A.: +20,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].kind).toBe('settlement');
  });
});

describe('count check', () => {
  it('flags every line when the subject count disagrees', () => {
    // Subject promises 3, only 2 parsed. The missing one is a real expense that
    // would otherwise vanish without trace.
    const { subject, body } = batch(
      ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR'],
      'Ihr Umsatzwecker: 3 neue Umsätze',
    );
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines).toHaveLength(2);
    expect(lines.every(l => l.kind === 'flagged')).toBe(true);
    expect(lines[0].reason).toMatch(/3/);
  });

  it('does not downgrade incoming or settlement to flagged', () => {
    const { subject, body } = batch(
      ['ARBEITGEBER GMBH: +2.400,00 EUR', 'ADVANZIA BANK S.A.: -487,32 EUR'],
      'Ihr Umsatzwecker: 5 neue Umsätze',
    );
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines.map(l => l.kind)).toEqual(['incoming', 'settlement']);
  });

  it('leaves a matching count clean', () => {
    const { subject, body } = batch(['EDEKA: -20,00 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)![0].kind).toBe('clean');
  });
});

describe('amount safety', () => {
  it('refuses an English-formatted amount rather than misreading it 1000x', () => {
    const { subject, body } = batch(['SHOP: -1,234.56 EUR'], SUBJECT_ONE);
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines).toHaveLength(0);
  });

  it('refuses a one-decimal amount', () => {
    const { subject, body } = batch(['SHOP: -12,5 EUR'], SUBJECT_ONE);
    expect(parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!).toHaveLength(0);
  });

  it('flags the surviving lines when a sibling line was unreadable', () => {
    // One good line, one malformed; subject says 2. The count check catches it.
    const { subject, body } = batch(
      ['EDEKA: -20,00 EUR', 'SHOP: -1,234.56 EUR'],
      'Ihr Umsatzwecker: 2 neue Umsätze',
    );
    const lines = parseKontoweckerEmail(KONTOWECKER_SENDER, subject, body)!;
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('flagged');
  });
});

describe('isAddable', () => {
  it('permits only clean and flagged', () => {
    expect(isAddable('clean')).toBe(true);
    expect(isAddable('flagged')).toBe(true);
    expect(isAddable('incoming')).toBe(false);
    expect(isAddable('settlement')).toBe(false);
  });
});

describe('looksTransactional', () => {
  it('spots a euro amount in mail that failed the gate', () => {
    expect(looksTransactional('irgendwas 12,34 EUR irgendwas')).toBe(true);
  });

  it('stays quiet on prose', () => {
    expect(looksTransactional('Ihr Kontoauszug liegt bereit.')).toBe(false);
  });
});
