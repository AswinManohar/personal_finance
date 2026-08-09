/**
 * Parsing for Advanzia card-transaction notifications.
 *
 * Advanzia sends no structured data — the entire payload is one German sentence
 * in `android.bigText`, so a regex over prose is the only option. That makes
 * this the most dangerous module in the feature: a wrong reading here invents an
 * expense that never happened, or books a refund as a charge.
 *
 * Everything below therefore fails closed. Three tiers, checked in order:
 *
 *   0. reject   — the sentence carries a negative marker (declined, refunded,
 *                 reversed). Never becomes an expense, in any tier.
 *   1. strict   — the exact known sentence. Normal pending expense.
 *   2. loose    — anything else: extract what we can, flag it "needs checking",
 *                 and let the review sheet force a human to look.
 *
 * Ground truth for the strict pattern was captured off the phone with
 * `dumpsys notification --noredact`; see
 * .scratch/advanzia-notification-capture/issues/02-verify-advanzia-notifications-on-device.md
 */

/** Every captured transaction carried exactly this `android.title`. */
export const TRANSACTION_TITLE = 'Kartentransaktion';

/**
 * Tier 0. Declines and refunds almost certainly reuse the "Kartentransaktion"
 * title, so the title gate alone cannot keep them out.
 *
 * PROVISIONAL: these are informed guesses at German banking wording, not
 * observed strings — no decline or refund notification was available when the
 * feature was built. Correct this list against the first real one that appears.
 * The cost of a miss is bounded: an unlisted refund reaches the loose tier,
 * which is flagged and cannot be confirmed without being opened.
 */
const REJECT_MARKERS = [
  'abgelehnt',
  'Gutschrift',
  'storniert',
  'fehlgeschlagen',
  'rückerstattet',
] as const;

/**
 * German money, and nothing else.
 *
 * Either plain (`11,89`) or dot-grouped (`1.234,56`), always exactly two
 * decimals. Anything else is refused rather than guessed at, because the
 * failure mode is silent and severe: read with German rules, the English
 * `1,234.56` becomes `1.23456` — an expense wrong by 1000x that nothing
 * downstream would catch.
 */
const AMOUNT_PATTERN = /^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;

export const parseGermanAmount = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
};

/**
 * Tier 1. The merchant group is greedy and the suffix is anchored, so it
 * backtracks to the *last* "wurde erfolgreich ausgeführt." — `REWE Bonn,
 * Friedenspla` proved merchants contain commas and get truncated mid-word by
 * the acquirer, so punctuation must never act as a delimiter.
 */
const STRICT_PATTERN =
  /^Eine Zahlung über (\S+) € der Mastercard mit der Kartenendung (\d{4}) an (.+) wurde erfolgreich ausgeführt\.$/;

/** Tier 2 fragments, each independent so a reworded sentence still yields parts. */
const LOOSE_AMOUNT = /([\d.,]+)\s*€/;
const LOOSE_CARD = /Kartenendung\s+(\d{4})/;
const LOOSE_MERCHANT = /\san\s+(.+?)(?:\s+wurde\b|\s+durchgeführt\b|\.\s*$|$)/;

export type ParseOutcome =
  /** The known sentence. Safe to prefill and confirm normally. */
  | { kind: 'strict'; amount: number; merchant: string; cardEnding: string }
  /** Unrecognised wording. Prefill what we found, but flag it — never auto-save. */
  | { kind: 'loose'; amount: number | null; merchant: string | null; cardEnding: string | null }
  /** Not an expense at all. Visible in the inbox, never convertible. */
  | { kind: 'rejected'; marker: string };

export const parseAdvanziaBody = (body: string): ParseOutcome => {
  const text = body.trim();

  // Tier 0 first: a declined or refunded transaction must not reach the
  // extractors, which would happily read it as an ordinary payment.
  const lowered = text.toLowerCase();
  const marker = REJECT_MARKERS.find(m => lowered.includes(m.toLowerCase()));
  if (marker) return { kind: 'rejected', marker };

  // Tier 1.
  const strict = STRICT_PATTERN.exec(text);
  if (strict) {
    const amount = parseGermanAmount(strict[1]);
    // A malformed amount inside an otherwise perfect sentence is exactly the
    // case worth flagging rather than coercing, so fall through to tier 2.
    if (amount !== null) {
      return { kind: 'strict', amount, merchant: strict[3], cardEnding: strict[2] };
    }
  }

  // Tier 2.
  const amountMatch = LOOSE_AMOUNT.exec(text);
  const merchantMatch = LOOSE_MERCHANT.exec(text);
  const cardMatch = LOOSE_CARD.exec(text);
  return {
    kind: 'loose',
    amount: amountMatch ? parseGermanAmount(amountMatch[1]) : null,
    merchant: merchantMatch ? merchantMatch[1].trim() : null,
    cardEnding: cardMatch ? cardMatch[1] : null,
  };
};

/**
 * Guard 2's tell.
 *
 * The residual hole in the title gate is Advanzia renaming the title, which
 * would make capture stop silently. A notification that quotes a euro amount but
 * did *not* pass the gate is the signal something changed.
 *
 * Mirrored in AdvanziaNotificationListener.kt, which has to make this call while
 * the WebView is dead. Keep the two in step.
 */
const EURO_AMOUNT = /\d+,\d{2}\s*€|€\s*\d+,\d{2}/;

export const looksTransactional = (body: string): boolean => EURO_AMOUNT.test(body);
