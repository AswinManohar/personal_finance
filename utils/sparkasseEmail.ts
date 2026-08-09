/**
 * Parsing for Sparkasse Kontowecker transaction emails.
 *
 * The Advanzia parser reads one sentence and returns one outcome. This one
 * reads a *list*, and that is where its danger lives: a batch email that
 * partially parses loses a real expense with nothing to show for it.
 *
 * Ground truth is the `Show original` source of a real mail (2026-08-06):
 *
 *   auf dem Konto *8393 wurden folgende Umsätze verbucht:
 *   Pravallik.: -1,00 EUR
 *   Neuer Saldo: 614,93 EUR
 *
 * Three hazards drove every decision below:
 *
 *   - `Neuer Saldo` is shaped exactly like a transaction line. Read as one it
 *     invents a €614,93 expense on every single email, so it is excluded by
 *     LABEL rather than by position.
 *   - The amount is SIGNED. A positive is money arriving; the app has no
 *     transaction ledger for income, so positives are never convertible. An
 *     UNSIGNED amount is treated as incoming too — ambiguity must fail away
 *     from inventing spending.
 *   - The Advanzia card is direct-debited from this account, so its monthly
 *     settlement appears here as one lump sum covering purchases the
 *     notification listener already captured individually.
 *
 * Callers pass an already-decoded subject and body — see utils/mimeDecode.ts.
 */
import { parseGermanAmount } from './advanziaNotification';

export const KONTOWECKER_SENDER = 'noreply@kontowecker.de';

/** Subject of a transaction notification, after RFC 2047 decoding. */
const SUBJECT_PATTERN = /(\d+)\s+neue[rn]?\s+(?:Umsatz|Umsätze)/i;

/**
 * A transaction line: label, colon, signed German amount, EUR.
 *
 * The label group is greedy so a counterparty containing a colon survives —
 * `FIRMA: ABT 4: -9,99 EUR` is one transaction, not a parse error. The amount
 * is anchored to the end, so backtracking settles on the LAST colon.
 */
const LINE_PATTERN = /^(.+):\s*([+-]?[\d.,]+)\s*EUR$/;

/** Excluded by label, never by position. */
const BALANCE_LABEL = /^neuer\s+saldo$/i;

/** Where the transaction block starts. Lines above it are greeting prose. */
const HEADER_MARKER = /verbucht:/i;

const ADVANZIA_MARKER = /advanzia/i;

export type LineKind = 'clean' | 'flagged' | 'incoming' | 'settlement';

export interface SparkasseLine {
  kind: LineKind;
  counterparty: string;
  /** Always positive. Direction lives in `kind`, never in the sign. */
  amount: number | null;
  raw: string;
  /** Only on 'flagged'. Why a human has to look before saving. */
  reason?: string;
}

/** Only these two ever reach the review sheet. */
export const isAddable = (kind: LineKind): boolean =>
  kind === 'clean' || kind === 'flagged';

/**
 * The tell that the wording changed.
 *
 * Mail from Kontowecker that quotes a euro amount but failed the envelope gate
 * means capture has gone deaf. Surfaced as a health alarm, not dropped.
 */
const EURO_AMOUNT = /\d+,\d{2}\s*EUR|EUR\s*\d+,\d{2}/;

export const looksTransactional = (body: string): boolean => EURO_AMOUNT.test(body);

const senderMatches = (sender: string): boolean =>
  sender.toLowerCase().includes(KONTOWECKER_SENDER);

/**
 * Returns one entry per transaction, or null if this is not a Kontowecker
 * transaction notification at all.
 *
 * An empty array is meaningful and different from null: the mail WAS one, and
 * nothing in it parsed.
 */
export const parseKontoweckerEmail = (
  sender: string,
  subject: string,
  body: string,
): SparkasseLine[] | null => {
  if (!senderMatches(sender)) return null;

  const subjectMatch = SUBJECT_PATTERN.exec(subject);
  if (!subjectMatch) return null;

  const promised = Number(subjectMatch[1]);

  const all = body.split(/\r?\n/).map(l => l.trim());
  const headerAt = all.findIndex(l => HEADER_MARKER.test(l));
  const candidates = headerAt >= 0 ? all.slice(headerAt + 1) : all;

  const lines: SparkasseLine[] = [];
  for (const raw of candidates) {
    const match = LINE_PATTERN.exec(raw);
    if (!match) continue;

    const counterparty = match[1].trim();
    if (BALANCE_LABEL.test(counterparty)) continue;

    const signed = match[2].trim();
    // `parseGermanAmount` is the 1000x guard and refuses anything not
    // unambiguously German EUR. A line it rejects is dropped here and the
    // count check below turns that silence into a visible flag.
    const amount = parseGermanAmount(signed.replace(/^[+-]/, ''));
    if (amount === null) continue;

    // Settlement outranks the sign: an Advanzia refund is still not ours to add.
    const kind: LineKind = ADVANZIA_MARKER.test(counterparty)
      ? 'settlement'
      : signed.startsWith('-')
        ? 'clean'
        : 'incoming';

    lines.push({ kind, counterparty, amount, raw });
  }

  // The subject is the only independent witness to how many transactions this
  // mail carries. Disagreement means at least one was lost, so nothing here is
  // trusted enough to add on one tap.
  if (lines.length !== promised) {
    const reason = `Die Betreffzeile nennt ${promised}, gelesen wurden ${lines.length}.`;
    return lines.map(line =>
      line.kind === 'clean' ? { ...line, kind: 'flagged' as const, reason } : line,
    );
  }

  return lines;
};
