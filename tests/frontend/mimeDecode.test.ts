import { describe, it, expect } from 'vitest';
import {
  findPart,
  decodeBase64Url,
  decodeQuotedPrintable,
  decodeRfc2047,
  extractPlainBody,
  type MimePart,
} from '../../utils/mimeDecode';

/**
 * Every function here is a silent-corruption risk, which is why they are tested
 * separately from the parser that consumes them.
 *
 * The `REAL_TREE` shape is taken verbatim from the `Show original` source of a
 * genuine Kontowecker mail (2026-08-06): multipart/mixed wrapping
 * multipart/related wrapping a single quoted-printable text/plain part. A flat
 * scan of `payload.parts` finds nothing in that tree.
 */

const b64url = (s: string): string =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const REAL_BODY_QP = [
  'Guten Tag,',
  '',
  'auf dem Konto *8393 wurden folgende Ums=C3=A4tze verbucht:',
  '',
  'Pravallik.: -1,00 EUR',
  '',
  'Neuer Saldo: 614,93 EUR',
  '',
  'Mit freundlichen Gr=C3=BC=C3=9Fen',
  'Ihre Sparkasse',
].join('\n');

const REAL_TREE: MimePart = {
  mimeType: 'multipart/mixed',
  parts: [
    {
      mimeType: 'multipart/related',
      parts: [{ mimeType: 'text/plain', body: { data: b64url(REAL_BODY_QP) } }],
    },
  ],
};

describe('findPart', () => {
  it('descends into nested multiparts', () => {
    const part = findPart(REAL_TREE, 'text/plain');
    expect(part).not.toBeNull();
    expect(part!.body!.data).toBe(b64url(REAL_BODY_QP));
  });

  it('returns null rather than guessing when the type is absent', () => {
    expect(findPart(REAL_TREE, 'text/html')).toBeNull();
  });

  it('finds a part at the top level too', () => {
    const flat: MimePart = { mimeType: 'text/plain', body: { data: 'x' } };
    expect(findPart(flat, 'text/plain')).toBe(flat);
  });

  it('ignores a mimeType with parameters mismatching only in case', () => {
    const tree: MimePart = { mimeType: 'TEXT/PLAIN', body: { data: 'x' } };
    expect(findPart(tree, 'text/plain')).toBe(tree);
  });
});

describe('decodeQuotedPrintable', () => {
  it('decodes UTF-8 hex escapes', () => {
    expect(decodeQuotedPrintable('Ums=C3=A4tze')).toBe('Umsätze');
    expect(decodeQuotedPrintable('Gr=C3=BC=C3=9Fen')).toBe('Grüßen');
  });

  it('joins soft line breaks before anything else', () => {
    // A trailing `=` continues the line. Without joining, the counterparty and
    // its amount land on separate lines and the parser's line regex silently
    // stops matching.
    const wrapped = 'SEHR LANGER ZAHLUNGSEMPFAENGER GMBH UND CO KG BERL=\r\nIN: -12,34 EUR';
    expect(decodeQuotedPrintable(wrapped)).toBe(
      'SEHR LANGER ZAHLUNGSEMPFAENGER GMBH UND CO KG BERLIN: -12,34 EUR',
    );
  });

  it('joins soft breaks with a bare newline too', () => {
    expect(decodeQuotedPrintable('abc=\ndef')).toBe('abcdef');
  });

  it('leaves ordinary text untouched', () => {
    expect(decodeQuotedPrintable('Pravallik.: -1,00 EUR')).toBe('Pravallik.: -1,00 EUR');
  });

  it('preserves hard line breaks', () => {
    expect(decodeQuotedPrintable('a\r\nb')).toBe('a\r\nb');
  });
});

describe('decodeRfc2047', () => {
  it('decodes the Q form, which the plural subject needs', () => {
    // "Umsätze" is non-ASCII, so every multi-transaction subject arrives
    // encoded. Undecoded, it fails the count check the count check exists for.
    expect(decodeRfc2047('=?UTF-8?Q?Ihr_Umsatzwecker=3A_2_neue_Ums=C3=A4tze?=')).toBe(
      'Ihr Umsatzwecker: 2 neue Umsätze',
    );
  });

  it('decodes the B form', () => {
    expect(decodeRfc2047('=?UTF-8?B?VW1zw6R0emU=?=')).toBe('Umsätze');
  });

  it('passes a plain ASCII subject through unchanged', () => {
    expect(decodeRfc2047('Ihr Umsatzwecker: 1 neuer Umsatz')).toBe(
      'Ihr Umsatzwecker: 1 neuer Umsatz',
    );
  });

  it('decodes multiple encoded words in one header', () => {
    expect(decodeRfc2047('=?UTF-8?Q?a=C3=A4?= and =?UTF-8?Q?b=C3=B6?=')).toBe('aä and bö');
  });
});

describe('extractPlainBody', () => {
  it('unwraps the real nested tree end to end', () => {
    expect(extractPlainBody(REAL_TREE)).toContain('Pravallik.: -1,00 EUR');
    expect(extractPlainBody(REAL_TREE)).toContain('folgende Umsätze verbucht:');
  });

  it('falls back to HTML with tags stripped when there is no plain part', () => {
    const htmlOnly: MimePart = {
      mimeType: 'multipart/related',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: b64url('<p>Pravallik.: -1,00 EUR</p>') },
        },
      ],
    };
    expect(extractPlainBody(htmlOnly)).toContain('Pravallik.: -1,00 EUR');
  });

  it('returns null when there is no readable part at all', () => {
    expect(extractPlainBody({ mimeType: 'image/png', body: { data: 'x' } })).toBeNull();
  });
});
