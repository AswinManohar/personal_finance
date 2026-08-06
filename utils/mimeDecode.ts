/**
 * Unwrapping a Gmail API message payload into readable text.
 *
 * Nothing here knows about Sparkasse. It exists as its own module because all
 * three decoders fail *silently* when they are wrong — a missed nesting level
 * returns no body, a missed soft line break splits a transaction in two, a
 * missed RFC 2047 header fails a count check — and silent failures deserve
 * their own tests.
 *
 * Ground truth is the `Show original` source of a real Kontowecker mail
 * (2026-08-06): multipart/mixed > multipart/related > text/plain, transfer
 * encoding quoted-printable, subject plain ASCII only because "1 neuer Umsatz"
 * happens to be.
 */

export interface MimePart {
  mimeType?: string;
  /** Present on the top-level payload; absent on most sub-parts. */
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: MimePart[];
}

/**
 * Depth-first search of the MIME tree.
 *
 * The real message nests the text two levels down, so the obvious
 * `payload.parts.find(p => p.mimeType === 'text/plain')` returns undefined and
 * capture appears to work while producing nothing.
 */
export const findPart = (payload: MimePart, mimeType: string): MimePart | null => {
  const wanted = mimeType.toLowerCase();
  const type = payload.mimeType?.split(';')[0].trim().toLowerCase();
  if (type === wanted) return payload;
  for (const child of payload.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
};

/** Gmail returns part bodies base64url-encoded, padding stripped. */
export const decodeBase64Url = (data: string): string => {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

/**
 * Quoted-printable, per RFC 2045.
 *
 * Soft line breaks are joined FIRST, deliberately. A trailing `=` means "this
 * line continues"; a counterparty long enough to push the line past 76
 * characters arrives split, and joining after decoding would leave the split in
 * place. Order is load-bearing, not stylistic.
 */
export const decodeQuotedPrintable = (text: string): string => {
  const joined = text.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // Non-ASCII should not appear in a QP body, but if it does, keep its
      // UTF-8 bytes rather than mangling them.
      for (const b of new TextEncoder().encode(joined[i])) bytes.push(b);
    }
  }
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
};

const ENCODED_WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

/**
 * RFC 2047 encoded words in a header.
 *
 * Required for the subject: the plural "Umsätze" is non-ASCII, so every
 * multi-transaction mail arrives encoded. Skipping this makes the count check —
 * the guard against a batch losing a line — fail on exactly the mails it exists
 * to protect.
 */
export const decodeRfc2047 = (header: string): string =>
  header.replace(ENCODED_WORD, (_match, _charset, encoding, payload) => {
    if (encoding.toUpperCase() === 'B') {
      const binary = atob(payload);
      return new TextDecoder('utf-8').decode(
        Uint8Array.from(binary, ch => ch.charCodeAt(0)),
      );
    }
    // In the Q encoding an underscore stands for a space.
    return decodeQuotedPrintable(payload.replace(/_/g, ' '));
  });

const stripTags = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/**
 * The readable body of a message, or null.
 *
 * Prefers text/plain, which is all the observed mail carries. The HTML fallback
 * is kept because a `multipart/related` wrapper around a single text part is a
 * strong hint that other Kontowecker mail types do ship HTML with inline images.
 */
export const extractPlainBody = (payload: MimePart): string | null => {
  const plain = findPart(payload, 'text/plain');
  if (plain?.body?.data) return decodeQuotedPrintable(decodeBase64Url(plain.body.data));

  const html = findPart(payload, 'text/html');
  if (html?.body?.data) {
    return stripTags(decodeQuotedPrintable(decodeBase64Url(html.body.data)));
  }
  return null;
};
