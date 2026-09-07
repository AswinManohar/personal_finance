# Sparkasse Email Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Sparkasse Kontowecker emails in Gmail into reviewable pending expenses, using a pipeline that runs entirely on the phone and never modifies the working Advanzia capture path.

**Architecture:** A second, fully parallel capture pipeline. `utils/mimeDecode.ts` unwraps the raw Gmail payload (recursive MIME descent, quoted-printable, RFC 2047), `utils/sparkasseEmail.ts` parses the decoded text into a list of transaction lines, `services/gmailAuth.ts` holds a self-contained PKCE flow for `gmail.readonly`, `services/sparkasseCapture.ts` polls the Gmail REST API on app resume, and `components/SparkasseInbox.tsx` + `components/SparkasseReview.tsx` render and confirm. It shares four already-exported pure/storage-local functions with the Advanzia path by import only.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Vitest + Testing Library (happy-dom), Capacitor 7 (Android), Java native plugin, Gmail API v1 over plain `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-06-sparkasse-email-capture-design.md`

## Global Constraints

- **Do not modify any existing file except the two one-line wiring points in Task 8** (`components/Expenses.tsx` and `android/app/src/main/java/com/aswinmanohar/cashflow/MainActivity.java`). This is decision 6 of the spec. In particular: do not rename `components/AdvanziaInbox.tsx`, do not extract its module-local `ReviewSheet` (line 248), do not widen `PendingItem`, do not touch `App.tsx`, and do not edit `AdvanziaCapturePlugin.java`.
- **The Advanzia test suite must pass unchanged at every commit.** If a change requires editing an Advanzia test, the isolation has been broken — stop and report.
- Test command is `npm test` (`vitest run`). Single file: `npx vitest run tests/frontend/<file>`.
- Frontend tests live in `tests/frontend/**/*.test.{ts,tsx}` — that glob is the only thing vitest picks up.
- **Reuse `parseGermanAmount` from `utils/advanziaNotification.ts` by import. Never re-implement it.** It is the 1000× misparse guard (`docs/lessons/05` §2); a second copy is a second chance to get it wrong.
- Native sources are **Java**, in `android/app/src/main/java/com/aswinmanohar/cashflow/`. There is no Kotlin in this project.
- Storage keys are `sparkasse.pending`, `sparkasse.handled`, `sparkasse.watermark`, `sparkasse.seen`. The merchant map stays shared at `advanzia.merchants`, reached only through the exported `recallLocalMerchant` / `learnMerchant`.
- Nothing auto-saves. Every state, including `clean`, requires a user tap.
- Currency is euro throughout.
- Every commit message ends with `Co-Authored-By: AswinManohar <aswinbio@gmail.com>`. Do not add a Claude trailer.
- No backend, API, or schema work. This feature is phone-side and additive.

## Shared imports (read-only, never edited)

| Symbol | From |
|---|---|
| `parseGermanAmount` | `utils/advanziaNotification.ts` |
| `admitCapture`, `HandledRecord` | `utils/advanziaQueue.ts` |
| `recallLocalMerchant`, `learnMerchant` | `services/advanziaCapture.ts` |
| `MerchantMemory` | `utils/merchantMemory.ts` |

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `utils/mimeDecode.ts` | Three pure decoders. No knowledge of Sparkasse. |
| `utils/sparkasseEmail.ts` | Decoded subject+body → `SparkasseLine[]`. No knowledge of Gmail. |
| `services/gmailAuth.ts` | PKCE authorize, token refresh, secure storage. No knowledge of email content. |
| `services/sparkasseCapture.ts` | Gmail polling, watermark/seen-set idempotency, localStorage inbox. |
| `components/SparkasseInbox.tsx` | Pending list, health banners, state gating. |
| `components/SparkasseReview.tsx` | Review sheet → `Expense`. The only place this pipeline creates money. |
| `android/.../SecureStorePlugin.java` | `EncryptedSharedPreferences` get/set/remove. |
| `tests/frontend/mimeDecode.test.ts` | |
| `tests/frontend/sparkasseParser.test.ts` | |
| `tests/frontend/sparkasseCapture.test.ts` | |
| `tests/frontend/gmailAuth.test.ts` | |
| `tests/frontend/SparkasseInbox.test.tsx` | |

**Modified (one line each, Task 8 only):** `components/Expenses.tsx`, `MainActivity.java`.

## Task order

Tasks 1–2 are pure functions with no dependencies and can be built and reviewed immediately. Task 3 needs a real Gmail message, so it is placed after the parser is proven against the fixture we already have. Tasks 4–5 depend on 1–3. Tasks 6–7 depend on 4. Task 8 wires up. Task 9 is on-device verification.

---

### Task 1: MIME decoding

**Files:**
- Create: `utils/mimeDecode.ts`
- Test: `tests/frontend/mimeDecode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface MimePart {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: MimePart[];
  }
  export const findPart: (payload: MimePart, mimeType: string) => MimePart | null;
  export const decodeBase64Url: (data: string) => string;
  export const decodeQuotedPrintable: (text: string) => string;
  export const decodeRfc2047: (header: string) => string;
  export const extractPlainBody: (payload: MimePart) => string | null;
  ```

Each of these three decoders fails **silently** when wrong — that is why they are split out with their own tests rather than inlined into the poller.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/mimeDecode.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/mimeDecode.test.ts`
Expected: FAIL — `Failed to resolve import "../../utils/mimeDecode"`.

- [ ] **Step 3: Write the implementation**

Create `utils/mimeDecode.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/mimeDecode.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full suite to prove nothing regressed**

Run: `npm test`
Expected: PASS. The Advanzia suites must be untouched and green.

- [ ] **Step 6: Commit**

```bash
git add utils/mimeDecode.ts tests/frontend/mimeDecode.test.ts
git commit -m "feat: decode the three ways a Gmail payload hides its text

The real Kontowecker mail nests text/plain two levels down, encodes it
quoted-printable, and — once the subject says 'Umsätze' rather than
'Umsatz' — encodes the header too. Each of those fails silently: a flat
parts scan finds nothing, an unjoined soft break splits a long
counterparty away from its amount, and an undecoded subject fails the
count check on exactly the batch mails it guards.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 2: The Kontowecker parser

**Files:**
- Create: `utils/sparkasseEmail.ts`
- Test: `tests/frontend/sparkasseParser.test.ts`

**Interfaces:**
- Consumes: `parseGermanAmount` from `utils/advanziaNotification.ts`.
- Produces:
  ```ts
  export const KONTOWECKER_SENDER = 'noreply@kontowecker.de';
  export type LineKind = 'clean' | 'flagged' | 'incoming' | 'settlement';
  export interface SparkasseLine {
    kind: LineKind;
    counterparty: string;
    amount: number | null;
    raw: string;
    /** Only on 'flagged'. Why a human has to look. */
    reason?: string;
  }
  export const isAddable: (kind: LineKind) => boolean;
  export const looksTransactional: (body: string) => boolean;
  export const parseKontoweckerEmail: (
    sender: string,
    subject: string,
    body: string,
  ) => SparkasseLine[] | null;
  ```
  `null` means the envelope gate rejected the mail — it is not a Kontowecker transaction notification at all. An empty array means it was, but nothing parsed.

Callers must pass an **already decoded** subject and body (Task 1). Raw MIME in here makes the parser silently wrong instead of loudly broken.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/sparkasseParser.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/sparkasseParser.test.ts`
Expected: FAIL — `Failed to resolve import "../../utils/sparkasseEmail"`.

- [ ] **Step 3: Write the implementation**

Create `utils/sparkasseEmail.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/sparkasseParser.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, Advanzia suites untouched.

- [ ] **Step 6: Commit**

```bash
git add utils/sparkasseEmail.ts tests/frontend/sparkasseParser.test.ts
git commit -m "feat: read a Kontowecker mail as a list of signed transactions

One email can carry several bookings, so this returns a list where the
Advanzia parser returns a single outcome — and a batch that partially
parses is the failure worth guarding. The subject states the count, so a
disagreement flags every line rather than quietly banking the ones that
did parse.

Neuer Saldo is excluded by label, not position: it is shaped exactly like
a transaction and would otherwise invent a 614,93 EUR expense on every
mail. Positive and unsigned amounts are incoming and never addable, and
anything naming Advanzia is the card settlement, whose purchases the
notification listener already captured one by one.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 3: Native secure storage for the refresh token

**Files:**
- Create: `android/app/src/main/java/com/aswinmanohar/cashflow/SecureStorePlugin.java`
- Modify: `android/app/build.gradle` (one dependency line)

**Interfaces:**
- Consumes: nothing.
- Produces: a Capacitor plugin named `SecureStore` with three methods, called from TypeScript in Task 4:
  ```ts
  get({ key: string }): Promise<{ value: string | null }>
  set({ key: string, value: string }): Promise<void>
  remove({ key: string }): Promise<void>
  ```

The refresh token grants read access to the entire mailbox. `localStorage` is the wrong home: it survives in device backups and is readable by anything running in the WebView. `@capacitor/preferences` is plain `SharedPreferences` with no encryption at rest, so it is rejected too.

Registration of this plugin happens in Task 8 with the other wiring.

- [ ] **Step 1: Add the AndroidX security dependency**

In `android/app/build.gradle`, inside the existing `dependencies { … }` block, add:

```gradle
    implementation "androidx.security:security-crypto:1.1.0-alpha06"
```

- [ ] **Step 2: Write the plugin**

Create `android/app/src/main/java/com/aswinmanohar/cashflow/SecureStorePlugin.java`:

```java
package com.aswinmanohar.cashflow;

import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Encrypted key/value storage, used for the Gmail OAuth refresh token.
 *
 * That token grants read access to the whole mailbox and is long-lived, so it
 * must not sit in localStorage — which is readable by anything in the WebView
 * and survives in device backups. EncryptedSharedPreferences keys off the
 * Android Keystore, so the ciphertext is useless off the device.
 *
 * Deliberately separate from AdvanziaCapturePlugin rather than added to it: the
 * Advanzia capture path is working code and is not being modified.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String FILE = "cashflow_secure";

    private SharedPreferences prefs() throws Exception {
        MasterKey key = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                getContext(),
                FILE,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = call.getString("key");
        if (name == null) {
            call.reject("key is required");
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("value", prefs().getString(name, null));
            call.resolve(result);
        } catch (Exception e) {
            // Failing loudly matters: a silent null here looks identical to
            // "never authorized" and would send the user round the consent
            // flow forever without explaining why.
            call.reject("secure storage unavailable", e);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("key");
        String value = call.getString("value");
        if (name == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            prefs().edit().putString(name, value).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure storage unavailable", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("key");
        if (name == null) {
            call.reject("key is required");
            return;
        }
        try {
            prefs().edit().remove(name).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure storage unavailable", e);
        }
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run android:apk`
Expected: `BUILD SUCCESSFUL`. The plugin is not registered yet, so nothing calls it — this step only proves it builds.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/aswinmanohar/cashflow/SecureStorePlugin.java android/app/build.gradle
git commit -m "feat: encrypted storage for the Gmail refresh token

The token is long-lived and grants read access to the whole mailbox, so
localStorage is the wrong home — it is readable by anything in the WebView
and survives in device backups. EncryptedSharedPreferences keys off the
Android Keystore instead.

A separate plugin rather than three more methods on AdvanziaCapturePlugin,
which is working code and stays untouched.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 4: Gmail PKCE authorization

**Files:**
- Create: `services/gmailAuth.ts`
- Test: `tests/frontend/gmailAuth.test.ts`
- Modify: `package.json` (add `@capacitor/browser`)

**Interfaces:**
- Consumes: the `SecureStore` plugin from Task 3.
- Produces:
  ```ts
  export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  export const isAuthorized: () => Promise<boolean>;
  export const authorize: () => Promise<boolean>;
  export const revoke: () => Promise<void>;
  export const accessToken: () => Promise<string | null>;
  export const gmailFetch: (path: string) => Promise<Response | null>;
  export const __resetForTests: () => void;
  ```

`gmailFetch` is the only entry point Task 5 uses. It attaches the bearer token, and on a 401 refreshes once and retries — so the poller never contains auth logic.

**Setup this task depends on** (do once, outside the code):

1. Google Cloud Console → Credentials → Create OAuth client ID → type **Android**, package `com.aswinmanohar.cashflow`, SHA-1 of the signing certificate.
2. OAuth consent screen → add scope `.../auth/gmail.readonly`.
3. **Publishing status → In production.** While it sits in *Testing*, Google expires the refresh token every 7 days. Publishing unverified keeps the token alive at the cost of a one-time "Google hasn't verified this app" interstitial. Do not submit for verification — that is a CASA assessment, disproportionate for one user.
4. Put the client ID in `.env` as `VITE_GOOGLE_ANDROID_CLIENT_ID` and document it in `.env.example`.

- [ ] **Step 1: Add the browser dependency**

Run: `npm install @capacitor/browser`

- [ ] **Step 2: Write the failing tests**

Create `tests/frontend/gmailAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const secureStore = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => secureStore,
}));

vi.mock('@capacitor/browser', () => ({
  Browser: { open: vi.fn(), close: vi.fn() },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

import { gmailFetch, isAuthorized, revoke, __resetForTests } from '../../services/gmailAuth';

/**
 * The refresh path is the part worth testing hardest. A stampede of parallel
 * refreshes would have Google reject all but one, and the losers would surface
 * to the user as "authorization expired" on a grant that is perfectly valid.
 */

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
  secureStore.get.mockResolvedValue({ value: 'stored-refresh-token' });
  secureStore.set.mockResolvedValue(undefined);
  secureStore.remove.mockResolvedValue(undefined);
});

describe('isAuthorized', () => {
  it('is true when a refresh token is stored', async () => {
    await expect(isAuthorized()).resolves.toBe(true);
  });

  it('is false when there is none', async () => {
    secureStore.get.mockResolvedValue({ value: null });
    await expect(isAuthorized()).resolves.toBe(false);
  });
});

describe('gmailFetch', () => {
  it('returns null rather than throwing when never authorized', async () => {
    secureStore.get.mockResolvedValue({ value: null });
    await expect(gmailFetch('/messages')).resolves.toBeNull();
  });

  it('refreshes once and attaches the token', async () => {
    const fetchMock = vi.fn()
      // token endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'fresh', expires_in: 3600 }),
      })
      // gmail call
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const response = await gmailFetch('/messages');
    expect(response!.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.Authorization).toBe('Bearer fresh');
  });

  it('refreshes exactly once for concurrent callers', async () => {
    let tokenCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        tokenCalls++;
        return { ok: true, json: async () => ({ access_token: 'fresh', expires_in: 3600 }) };
      }
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([gmailFetch('/a'), gmailFetch('/b'), gmailFetch('/c')]);
    expect(tokenCalls).toBe(1);
  });

  it('refreshes and retries once on a 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'stale', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'fresh2', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const response = await gmailFetch('/messages');
    expect(response!.status).toBe(200);
    const [, init] = fetchMock.mock.calls[3];
    expect(init.headers.Authorization).toBe('Bearer fresh2');
  });

  it('drops the stored token when the grant is revoked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(gmailFetch('/messages')).resolves.toBeNull();
    expect(secureStore.remove).toHaveBeenCalled();
  });
});

describe('revoke', () => {
  it('clears the stored token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await revoke();
    expect(secureStore.remove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/gmailAuth.test.ts`
Expected: FAIL — `Failed to resolve import "../../services/gmailAuth"`.

- [ ] **Step 4: Write the implementation**

Create `services/gmailAuth.ts`:

```ts
import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Gmail authorization, kept entirely separate from app sign-in.
 *
 * The app signs into Supabase on Android with `signInWithIdToken`
 * (services/auth.ts), which yields an identity assertion and NO provider token.
 * There is therefore nothing to inherit: reading Gmail needs its own OAuth
 * grant, and this module is all of it. Nothing else in the app knows that
 * tokens exist.
 *
 * `gmail.readonly` is a Google *restricted* scope. The consent screen must be
 * published (In production, unverified) — while it sits in Testing, Google
 * expires the refresh token every 7 days.
 *
 * PKCE with an Android-type client, so there is no client secret and no server
 * hop. The refresh token goes to EncryptedSharedPreferences via SecureStore,
 * never localStorage.
 */

interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const secureStore = registerPlugin<SecureStorePlugin>('SecureStore');

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
const REFRESH_KEY = 'gmail.refresh_token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Custom-scheme callback. Registered on the same intent-filter the capture deep
 * link uses.
 *
 * NOTE: confirm the exact form Google requires for an Android-type client
 * before first run — it is validated at the authorization endpoint, and a
 * mismatch fails as `redirect_uri_mismatch`.
 */
const REDIRECT_URI = 'com.aswinmanohar.cashflow:/gmail-auth';

/** In-memory only. Short-lived, and losing it on restart costs one refresh. */
let cachedAccess: { token: string; expiresAt: number } | null = null;
/** Single-flight guard: see the concurrent-refresh test. */
let refreshInFlight: Promise<string | null> | null = null;

export const __resetForTests = (): void => {
  cachedAccess = null;
  refreshInFlight = null;
};

const randomVerifier = (): string => {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const challengeFor = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const readRefreshToken = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { value } = await secureStore.get({ key: REFRESH_KEY });
    return value ?? null;
  } catch {
    return null;
  }
};

const clearRefreshToken = async (): Promise<void> => {
  cachedAccess = null;
  try {
    await secureStore.remove({ key: REFRESH_KEY });
  } catch {
    // Nothing useful to do — the next call re-reads and finds it gone or not.
  }
};

export const isAuthorized = async (): Promise<boolean> =>
  (await readRefreshToken()) !== null;

/**
 * Exchanges the stored refresh token for an access token.
 *
 * Behind a single-flight promise: a poll fans out into several Gmail calls, and
 * without this each one would race to refresh. Google rejects the losers, and
 * the user sees "authorization expired" on a perfectly good grant.
 */
const refresh = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<string | null> => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        // invalid_grant means the user revoked access, or Google expired the
        // token because the consent screen was left in Testing. Either way the
        // stored token is dead and keeping it would loop forever.
        const body = await response.json().catch(() => ({}));
        if (body?.error === 'invalid_grant') await clearRefreshToken();
        return null;
      }

      const body = await response.json();
      cachedAccess = {
        token: body.access_token,
        // 60s of slack so a token cannot expire mid-request.
        expiresAt: Date.now() + (body.expires_in - 60) * 1000,
      };
      return cachedAccess.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

export const accessToken = async (): Promise<string | null> => {
  if (cachedAccess && cachedAccess.expiresAt > Date.now()) return cachedAccess.token;
  return refresh();
};

/**
 * A Gmail API call with the bearer token attached.
 *
 * Returns null when there is no usable authorization, so callers branch on a
 * value rather than catching. On a 401 it refreshes once and retries — exactly
 * once, because a second 401 means something other than staleness.
 */
export const gmailFetch = async (path: string): Promise<Response | null> => {
  let token = await accessToken();
  if (!token) return null;

  const call = (bearer: string) =>
    fetch(`${GMAIL_BASE}${path}`, { headers: { Authorization: `Bearer ${bearer}` } });

  let response = await call(token);
  if (response.status === 401) {
    cachedAccess = null;
    token = await refresh();
    if (!token) return null;
    response = await call(token);
  }
  return response;
};

/**
 * Opens Google's consent screen and stores the resulting refresh token.
 *
 * `prompt=consent` is NOT optional: without it Google withholds the refresh
 * token on any re-authorization, leaving a session that dies in an hour with no
 * way to renew and no error to explain it.
 *
 * The callback is caught with this module's OWN appUrlOpen listener. App.tsx
 * already has one for the capture deep link; Capacitor supports several, so the
 * two coexist and neither file needs to know about the other.
 */
export const authorize = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform() || !CLIENT_ID) return false;

  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);

  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');

  const code = await new Promise<string | null>(resolve => {
    let settled = false;
    void App.addListener('appUrlOpen', ({ url }) => {
      if (settled || !url.startsWith(REDIRECT_URI)) return;
      settled = true;
      const value = new URL(url).searchParams.get('code');
      void Browser.close().catch(() => {});
      resolve(value);
    }).then(handle => {
      // Best effort: if the user backs out of the custom tab there is no event
      // at all, so the promise would otherwise hang for the life of the app.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          void handle.remove();
          resolve(null);
        }
      }, 5 * 60 * 1000);
    });

    void Browser.open({
      url:
        `${AUTH_ENDPOINT}?` +
        new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: 'code',
          scope: GMAIL_SCOPE,
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
    });
  });

  if (!code) return false;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!response.ok) return false;

    const body = await response.json();
    if (!body?.refresh_token) return false;

    await secureStore.set({ key: REFRESH_KEY, value: body.refresh_token });
    cachedAccess = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    };
    return true;
  } catch {
    return false;
  }
};

export const revoke = async (): Promise<void> => {
  const token = await readRefreshToken();
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
    }).catch(() => {});
  }
  await clearRefreshToken();
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/gmailAuth.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Document the env var**

Add to `.env.example`:

```
# Android-type OAuth client ID for Gmail access (Sparkasse capture).
# Distinct from VITE_GOOGLE_WEB_CLIENT_ID, which is for Supabase sign-in.
# The consent screen must be published "In production" — while it is in
# Testing, Google expires the refresh token every 7 days.
VITE_GOOGLE_ANDROID_CLIENT_ID=
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test`

```bash
git add services/gmailAuth.ts tests/frontend/gmailAuth.test.ts .env.example package.json package-lock.json
git commit -m "feat: a Gmail grant of its own, since sign-in cannot lend one

Android signs into Supabase with an ID token, which is an identity
assertion and carries no provider token, so there is nothing to inherit
and reading Gmail needs its own PKCE grant. An Android-type client means
no secret and no server hop.

Refresh is behind a single-flight promise: one poll fans out into several
Gmail calls, and without it they race, Google rejects the losers, and a
perfectly valid grant surfaces to the user as expired.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 5: The poller

**Files:**
- Create: `services/sparkasseCapture.ts`
- Test: `tests/frontend/sparkasseCapture.test.ts`

**Interfaces:**
- Consumes: `extractPlainBody`, `decodeRfc2047` (Task 1); `parseKontoweckerEmail`, `SparkasseLine`, `looksTransactional`, `KONTOWECKER_SENDER` (Task 2); `gmailFetch`, `isAuthorized` (Task 4); `admitCapture` from `utils/advanziaQueue.ts`.
- Produces:
  ```ts
  export interface SparkasseItem {
    key: string;              // `gmail:<messageId>#<lineIndex>`
    messageId: string;
    line: SparkasseLine;
    postedAt: number;
    possibleDuplicateOf: HandledRecord | null;
  }
  export interface SparkasseStatus {
    authorized: boolean;
    lastPolledAt: number;
    lastCaptureAt: number;
    lastSuspiciousAt: number;
    pending: number;
  }
  export const readSparkassePending: () => SparkasseItem[];
  export const readSparkasseStatus: () => SparkasseStatus;
  export const pollSparkasse: () => Promise<SparkasseItem[]>;
  export const resolveSparkasseItem: (key: string) => SparkasseItem[];
  ```

**The idempotency problem is the whole point of this task.** The Advanzia native queue is destructive — `clearPending()` means a capture can never be re-offered. Gmail is not: every poll re-reads the mailbox. And `HANDLED_LIMIT` in `advanziaCapture.ts:74` caps handled records at 200, which rolls over far faster once one email contributes several lines. Relying on that alone silently resurrects dismissed expenses.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/sparkasseCapture.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gmailFetch = vi.fn();
vi.mock('../../services/gmailAuth', () => ({
  gmailFetch: (path: string) => gmailFetch(path),
  isAuthorized: async () => true,
}));

import {
  pollSparkasse,
  readSparkassePending,
  resolveSparkasseItem,
  readSparkasseStatus,
} from '../../services/sparkasseCapture';

/**
 * Gmail is a NON-destructive source, which is the whole difficulty here. The
 * Advanzia listener hands over a capture once and forgets it; every poll of
 * Gmail sees the same mailbox again. Without the watermark and the seen-set,
 * dismissing an expense would simply bring it back next time you opened the app.
 */

const b64url = (s: string): string =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_');

const message = (id: string, lines: string[], subject: string, internalDate: string) => ({
  id,
  internalDate,
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'Kontowecker <noreply@kontowecker.de>' },
      { name: 'Subject', value: subject },
    ],
    parts: [
      {
        mimeType: 'multipart/related',
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: b64url(
                [
                  'auf dem Konto *8393 wurden folgende Umsätze verbucht:',
                  ...lines,
                  'Neuer Saldo: 614,93 EUR',
                ].join('\n'),
              ),
            },
          },
        ],
      },
    ],
  },
});

const respondWith = (messages: any[]) => {
  gmailFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/messages?')) {
      return { ok: true, json: async () => ({ messages: messages.map(m => ({ id: m.id })) }) };
    }
    const id = path.split('/messages/')[1]?.split('?')[0];
    const found = messages.find(m => m.id === id);
    return found
      ? { ok: true, json: async () => found }
      : { ok: false, status: 404, json: async () => ({}) };
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('pollSparkasse', () => {
  it('turns one email into one pending item', async () => {
    respondWith([message('m1', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(1);
    expect(pending[0].key).toBe('gmail:m1#0');
    expect(pending[0].line.amount).toBe(20);
  });

  it('turns one batch email into several items with distinct keys', async () => {
    respondWith([
      message(
        'm2',
        ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR'],
        'Ihr Umsatzwecker: 2 neue Umsätze',
        '1786027523000',
      ),
    ]);
    const pending = await pollSparkasse();
    expect(pending.map(p => p.key)).toEqual(['gmail:m2#0', 'gmail:m2#1']);
  });

  it('decodes an RFC 2047 subject so the batch passes the count check', async () => {
    respondWith([
      message(
        'm3',
        ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR'],
        '=?UTF-8?Q?Ihr_Umsatzwecker=3A_2_neue_Ums=C3=A4tze?=',
        '1786027523000',
      ),
    ]);
    const pending = await pollSparkasse();
    expect(pending.every(p => p.line.kind === 'clean')).toBe(true);
  });

  it('is idempotent — re-polling the same mail admits nothing new', async () => {
    respondWith([message('m4', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    const second = await pollSparkasse();
    expect(second).toHaveLength(1);
  });

  it('does not resurrect a dismissed item on the next poll', async () => {
    respondWith([message('m5', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    resolveSparkasseItem('gmail:m5#0');
    expect(readSparkassePending()).toHaveLength(0);

    await pollSparkasse();
    expect(readSparkassePending()).toHaveLength(0);
  });

  it('still admits a genuinely new mail after the watermark advances', async () => {
    respondWith([message('m6', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();

    respondWith([
      message('m6', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000'),
      message('m7', ['NETFLIX: -12,99 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786100000000'),
    ]);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(2);
    expect(pending.some(p => p.key === 'gmail:m7#0')).toBe(true);
  });

  it('queries with an overlap behind the watermark, not at it', async () => {
    respondWith([message('m8', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    await pollSparkasse();

    const listCall = gmailFetch.mock.calls.map(c => c[0]).filter(p => p.startsWith('/messages?')).pop()!;
    const after = Number(decodeURIComponent(listCall).match(/after:(\d+)/)![1]);
    // 3 days of slack, in seconds, because mail arrives late and out of order.
    expect(after).toBeLessThanOrEqual(1786027523 - 3 * 24 * 60 * 60 + 1);
  });

  it('records incoming and settlement items but marks them unaddable', async () => {
    respondWith([
      message('m9', ['ARBEITGEBER: +2.400,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000'),
    ]);
    const pending = await pollSparkasse();
    expect(pending[0].line.kind).toBe('incoming');
  });

  it('raises the suspicious flag on Kontowecker mail that fails the gate', async () => {
    respondWith([
      message('m10', ['irgendwas 12,34 EUR'], 'Ihr Saldowecker: Kontostand', '1786027523000'),
    ]);
    await pollSparkasse();
    expect(readSparkasseStatus().lastSuspiciousAt).toBeGreaterThan(0);
    expect(readSparkassePending()).toHaveLength(0);
  });

  it('returns the existing inbox untouched when Gmail is unreachable', async () => {
    respondWith([message('m11', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();

    gmailFetch.mockResolvedValue(null);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/sparkasseCapture.test.ts`
Expected: FAIL — `Failed to resolve import "../../services/sparkasseCapture"`.

- [ ] **Step 3: Write the implementation**

Create `services/sparkasseCapture.ts`:

```ts
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

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full localStorage costs the inbox, not the mail — Gmail still has it.
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
  if (!listResponse?.ok) return readSparkassePending();

  const list = await listResponse.json().catch(() => null);
  const ids: string[] = (list?.messages ?? []).map((m: { id: string }) => m.id);

  patchStatus({ lastPolledAt: Date.now() });
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
    if (lines === null) {
      // Failed the envelope gate. If it quotes a euro amount, the wording has
      // probably changed and capture has gone quietly deaf — the one failure
      // mode that looks exactly like "no transactions this week".
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
  write(PENDING_KEY, pending);
  write(SEEN_KEY, [...seen].slice(-SEEN_LIMIT));
  write(WATERMARK_KEY, newestSeen);
  patchStatus({
    ...(captured ? { lastCaptureAt: Date.now() } : {}),
    ...(suspicious ? { lastSuspiciousAt: Date.now() } : {}),
  });

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/sparkasseCapture.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`

```bash
git add services/sparkasseCapture.ts tests/frontend/sparkasseCapture.test.ts
git commit -m "feat: poll Gmail for Kontowecker mail, idempotently

The Advanzia listener hands a capture over once and forgets it, so that
path gets idempotency for free. Gmail returns the same mailbox on every
poll, so this has to earn it — without a guard, dismissing an expense
would simply bring it back the next time the app opened.

A watermark on internalDate keeps the query small, reaching three days
behind itself because mail arrives late and out of order, and a
non-rolling seen-set makes the overlap exact. The existing handled-record
cap is 200, which is ample for one-notification-one-expense and far too
few once a single email carries several lines.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 6: The review sheet

**Files:**
- Create: `components/SparkasseReview.tsx`

**Interfaces:**
- Consumes: `SparkasseItem` (Task 5); `isAddable` (Task 2); `recallLocalMerchant`, `learnMerchant` from `services/advanziaCapture.ts`; `newId` from `utils/id.ts`; `Expense`, `ExpenseCategory` from `types.ts`.
- Produces:
  ```tsx
  export const SparkasseReview: React.FC<{
    item: SparkasseItem;
    onCancel: () => void;
    onDismiss: () => void;
    onConfirm: (expense: Expense) => Promise<void>;
  }>;
  ```
  This sheet calls `learnMerchant` itself on a successful save, so the parent
  never sees the raw counterparty. (The Advanzia sheet passes it up and lets the
  parent learn — either works; keep this one internally consistent.)

This is the forced duplicate of the module-local `ReviewSheet` at `components/AdvanziaInbox.tsx:248`, which is not exported and therefore cannot be imported. It is now the **second place in the app where a capture becomes money** — hence the explicit invariant in its header and tests that assert non-convertible states cannot produce an `Expense` at all.

Read `components/AdvanziaInbox.tsx:248-458` first and follow its markup and Tailwind classes so the two sheets look identical.

- [ ] **Step 1: Write the component**

Create `components/SparkasseReview.tsx`:

```tsx
import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { isAddable } from '../utils/sparkasseEmail';
import { recallLocalMerchant, learnMerchant } from '../services/advanziaCapture';
import { newId } from '../utils/id';
import type { SparkasseItem } from '../services/sparkasseCapture';

/**
 * Turning a captured Kartenumsatz into an expense.
 *
 * INVARIANT: this is one of exactly two places in the app where a capture
 * becomes money — the other is the ReviewSheet inside AdvanziaInbox.tsx. It is
 * duplicated rather than shared because that one is module-local and not
 * exported, and the Advanzia path is not being modified. If you change a
 * money-handling rule here, check whether the other needs it too.
 *
 * `incoming` and `settlement` items reach this sheet for READING only. They
 * have no save control at all — absent, not disabled — so there is no code path
 * from them to an Expense.
 *
 * No LLM call, unlike the Advanzia sheet. Counterparties here are creditors,
 * standing orders and PEOPLE; the merchant-guess prompt is written for card
 * acquirer descriptors and would confidently turn a person into a business,
 * which structured output cannot catch because the result is well-formed.
 */

const isoDate = (epochMs: number): string => new Date(epochMs).toISOString().split('T')[0];

export const SparkasseReview: React.FC<{
  item: SparkasseItem;
  onCancel: () => void;
  onDismiss: () => void;
  onConfirm: (expense: Expense) => Promise<void>;
}> = ({ item, onCancel, onDismiss, onConfirm }) => {
  const { line } = item;
  const remembered = recallLocalMerchant(line.counterparty);

  const [name, setName] = useState(remembered?.name ?? line.counterparty);
  const [amount, setAmount] = useState(line.amount !== null ? String(line.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(
    remembered?.category ?? ExpenseCategory.OTHER,
  );
  const [date, setDate] = useState(isoDate(item.postedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addable = isAddable(line.kind);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    const finalName = name.trim() || line.counterparty;
    try {
      await onConfirm({
        id: newId(),
        name: finalName,
        amount: value,
        category,
        date,
        isRecurring: false,
        // Keep the bank's own string, exactly as the Advanzia path keeps the
        // acquirer descriptor. It is the only audit trail back to the email.
        vendor: line.counterparty,
      });
      learnMerchant(line.counterparty, { name: finalName, category });
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/50">
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">
          {addable ? 'Umsatz prüfen' : 'Nur zur Information'}
        </h2>

        {line.kind === 'incoming' && (
          <p className="text-sm text-slate-500 mb-3">
            Geldeingang — wird nicht als Ausgabe erfasst.
          </p>
        )}
        {line.kind === 'settlement' && (
          <p className="text-sm text-slate-500 mb-3">
            Abrechnung der Advanzia-Kreditkarte. Die einzelnen Zahlungen wurden bereits
            über die Benachrichtigungen erfasst — nicht noch einmal hinzufügen.
          </p>
        )}
        {line.kind === 'flagged' && line.reason && (
          <p className="text-sm text-amber-600 dark:text-amber-500 mb-3">
            Bitte prüfen: {line.reason}
          </p>
        )}
        {item.possibleDuplicateOf && (
          <p className="text-sm text-amber-600 dark:text-amber-500 mb-3">
            Möglicherweise doppelt.
          </p>
        )}

        {/* The raw line is always visible — the parser is never the last word. */}
        <pre className="text-xs bg-slate-100 dark:bg-slate-800 rounded p-2 mb-4 whitespace-pre-wrap">
          {line.raw}
        </pre>

        {addable && (
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              Name
              <input
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Betrag (EUR)
              <input
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Kategorie
              <select
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={category}
                onChange={e => setCategory(e.target.value as ExpenseCategory)}
              >
                {Object.values(ExpenseCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Datum
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button className="flex-1 py-2 rounded border" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="flex-1 py-2 rounded border" onClick={onDismiss}>
            Verwerfen
          </button>
          {/* Absent, not disabled, for incoming and settlement. */}
          {addable && (
            <button
              className="flex-1 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Speichern…' : 'Hinzufügen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: build succeeds. (The component is not mounted yet; this proves the types line up.)

- [ ] **Step 3: Commit**

```bash
git add components/SparkasseReview.tsx
git commit -m "feat: a review sheet for Kartenumsätze, without the LLM

Duplicated rather than shared: the Advanzia ReviewSheet is module-local
and not exported, and that path is not being modified. This is now the
second place in the app where a capture becomes money, so the invariant
is written at the top of the file.

No merchant-guess call here. Counterparties on this account are creditors,
standing orders and people, and a prompt written for card acquirer
descriptors would turn a person into a business — a well-formed answer
that structured output cannot reject.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 7: The inbox

**Files:**
- Create: `components/SparkasseInbox.tsx`
- Test: `tests/frontend/SparkasseInbox.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 5, 6.
- Produces:
  ```tsx
  export const SparkasseInbox: React.FC<{
    onAddExpense: (expense: Expense) => Promise<void>;
  }>;
  ```
  Mounted in Task 8 with `onAddExpense={handleAddCaptured}` — the same handler `AdvanziaInbox` already receives at `components/Expenses.tsx:208`.

Read `components/AdvanziaInbox.tsx:1-247` first and follow its structure. Like it, this renders **nothing at all** when idle and healthy.

Note this component takes no `focusKey` — there is no notification to tap, so no deep link, so `App.tsx` stays untouched.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/SparkasseInbox.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pollSparkasse = vi.fn();
const readSparkassePending = vi.fn();
const readSparkasseStatus = vi.fn();
const resolveSparkasseItem = vi.fn();

vi.mock('../../services/sparkasseCapture', () => ({
  pollSparkasse: () => pollSparkasse(),
  readSparkassePending: () => readSparkassePending(),
  readSparkasseStatus: () => readSparkasseStatus(),
  resolveSparkasseItem: (key: string) => resolveSparkasseItem(key),
}));

// Must be a spy, not a constant: the component re-reads authorization on mount
// and overwrites whatever readSparkasseStatus said, so a hardcoded `true` here
// would make the "prompts to connect" assertion permanently unreachable.
const isAuthorized = vi.fn();
vi.mock('../../services/gmailAuth', () => ({
  isAuthorized: () => isAuthorized(),
  authorize: async () => true,
}));

import { SparkasseInbox } from '../../components/SparkasseInbox';

/**
 * The states are enforced, not decorative. An `incoming` or `settlement` item
 * must have no save control AT ALL — not a disabled one — because the whole
 * point is that no code path leads from them to an Expense.
 */

const item = (overrides: Record<string, unknown> = {}) => ({
  key: 'gmail:m1#0',
  messageId: 'm1',
  postedAt: 1786027523000,
  possibleDuplicateOf: null,
  line: {
    kind: 'clean',
    counterparty: 'EDEKA',
    amount: 20,
    raw: 'EDEKA: -20,00 EUR',
  },
  ...overrides,
});

const healthy = {
  authorized: true,
  lastPolledAt: Date.now(),
  lastCaptureAt: Date.now(),
  lastSuspiciousAt: 0,
  pending: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  isAuthorized.mockResolvedValue(true);
  readSparkasseStatus.mockReturnValue(healthy);
  readSparkassePending.mockReturnValue([]);
  pollSparkasse.mockResolvedValue([]);
});

describe('SparkasseInbox', () => {
  it('renders nothing when idle and healthy', () => {
    const { container } = render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a clean capture', async () => {
    readSparkassePending.mockReturnValue([item()]);
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/EDEKA/)).toBeInTheDocument();
  });

  it('offers no save control for an incoming item', async () => {
    readSparkassePending.mockReturnValue([
      item({ line: { kind: 'incoming', counterparty: 'ARBEITGEBER', amount: 2400, raw: 'ARBEITGEBER: +2.400,00 EUR' } }),
    ]);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: /ARBEITGEBER/i }));
    expect(screen.queryByRole('button', { name: /Hinzufügen/i })).not.toBeInTheDocument();
  });

  it('offers no save control for the Advanzia settlement', async () => {
    readSparkassePending.mockReturnValue([
      item({ line: { kind: 'settlement', counterparty: 'ADVANZIA BANK S.A.', amount: 487.32, raw: 'ADVANZIA BANK S.A.: -487,32 EUR' } }),
    ]);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: /ADVANZIA/i }));
    expect(screen.queryByRole('button', { name: /Hinzufügen/i })).not.toBeInTheDocument();
  });

  it('saves a clean capture through onAddExpense', async () => {
    readSparkassePending.mockReturnValue([item()]);
    const onAddExpense = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={onAddExpense} />);

    await user.click(await screen.findByRole('button', { name: /EDEKA/i }));
    await user.click(screen.getByRole('button', { name: /Hinzufügen/i }));

    await waitFor(() => expect(onAddExpense).toHaveBeenCalledOnce());
    expect(onAddExpense.mock.calls[0][0]).toMatchObject({ name: 'EDEKA', amount: 20 });
    expect(resolveSparkasseItem).toHaveBeenCalledWith('gmail:m1#0');
  });

  it('prompts to connect Gmail when not authorized', async () => {
    isAuthorized.mockResolvedValue(false);
    readSparkasseStatus.mockReturnValue({ ...healthy, authorized: false });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/Gmail verbinden/i)).toBeInTheDocument();
  });

  it('does not poll Gmail when there is no authorization', async () => {
    isAuthorized.mockResolvedValue(false);
    readSparkasseStatus.mockReturnValue({ ...healthy, authorized: false });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    await screen.findByText(/Gmail verbinden/i);
    expect(pollSparkasse).not.toHaveBeenCalled();
  });

  it('warns when Kontowecker mail stopped matching', async () => {
    readSparkasseStatus.mockReturnValue({ ...healthy, lastSuspiciousAt: Date.now() });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/nicht gelesen/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/SparkasseInbox.test.tsx`
Expected: FAIL — `Failed to resolve import "../../components/SparkasseInbox"`.

- [ ] **Step 3: Write the implementation**

Create `components/SparkasseInbox.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Expense } from '../types';
import { isAddable } from '../utils/sparkasseEmail';
import { authorize, isAuthorized } from '../services/gmailAuth';
import {
  pollSparkasse,
  readSparkassePending,
  readSparkasseStatus,
  resolveSparkasseItem,
  type SparkasseItem,
  type SparkasseStatus,
} from '../services/sparkasseCapture';
import { SparkasseReview } from './SparkasseReview';

/**
 * Pending Sparkasse captures, at the top of the Expenses tab.
 *
 * A sibling of AdvanziaInbox, not a replacement — the two capture paths are
 * fully parallel and share no code. Like it, this renders NOTHING when there is
 * nothing waiting and capture is healthy, so the tab is unchanged for anyone not
 * using it.
 *
 * The failure mode worth designing for is silence: an empty inbox looks exactly
 * like a broken poller. Hence "zuletzt geprüft" as evidence the thing is alive,
 * and a loud warning when Kontowecker mail arrives that no longer matches the
 * expected wording.
 */

const relativeTime = (epochMs: number): string => {
  const minutes = Math.floor((Date.now() - epochMs) / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  return `vor ${Math.floor(hours / 24)} d`;
};

const amountLabel = (item: SparkasseItem): string =>
  item.line.amount === null
    ? '—'
    : `${item.line.kind === 'incoming' ? '+' : '−'}${item.line.amount.toFixed(2)} €`;

export const SparkasseInbox: React.FC<{
  onAddExpense: (expense: Expense) => Promise<void>;
}> = ({ onAddExpense }) => {
  const [pending, setPending] = useState<SparkasseItem[]>(() => readSparkassePending());
  const [status, setStatus] = useState<SparkasseStatus>(() => readSparkasseStatus());
  const [reviewing, setReviewing] = useState<SparkasseItem | null>(null);

  const refresh = useCallback(async () => {
    const authorized = await isAuthorized();
    if (authorized) await pollSparkasse();
    setPending(readSparkassePending());
    setStatus({ ...readSparkasseStatus(), authorized });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    if (await authorize()) await refresh();
  };

  const dismiss = (key: string) => {
    setPending(resolveSparkasseItem(key));
    setReviewing(null);
  };

  const confirm = async (item: SparkasseItem, expense: Expense) => {
    await onAddExpense(expense);
    setPending(resolveSparkasseItem(item.key));
    setReviewing(null);
  };

  const needsAttention = !status.authorized || status.lastSuspiciousAt > 0;
  if (pending.length === 0 && !needsAttention) return null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Sparkasse</h2>
        {status.lastPolledAt > 0 && (
          <span className="text-xs text-slate-500">
            zuletzt geprüft {relativeTime(status.lastPolledAt)}
          </span>
        )}
      </div>

      {!status.authorized && (
        <button
          className="text-sm text-left rounded-lg bg-blue-50 dark:bg-blue-950 px-3 py-2"
          onClick={connect}
        >
          Gmail verbinden, um Umsätze automatisch zu erfassen.
        </button>
      )}

      {status.lastSuspiciousAt > 0 && (
        <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2">
          Eine Kontowecker-Mail wurde nicht gelesen — der Wortlaut hat sich
          möglicherweise geändert.
        </p>
      )}

      {pending.map(item => (
        <button
          key={item.key}
          className="text-left rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 flex justify-between items-center gap-3"
          onClick={() => setReviewing(item)}
        >
          <span className="flex flex-col">
            <span className="font-medium">{item.line.counterparty}</span>
            <span className="text-xs text-slate-500">
              {relativeTime(item.postedAt)}
              {item.line.kind === 'incoming' && ' · Geldeingang'}
              {item.line.kind === 'settlement' && ' · Kartenabrechnung'}
              {item.line.kind === 'flagged' && ' · bitte prüfen'}
              {!isAddable(item.line.kind) && ' · keine Ausgabe'}
            </span>
          </span>
          <span className="tabular-nums">{amountLabel(item)}</span>
        </button>
      ))}

      {reviewing && (
        <SparkasseReview
          item={reviewing}
          onCancel={() => setReviewing(null)}
          onDismiss={() => dismiss(reviewing.key)}
          onConfirm={expense => confirm(reviewing, expense)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/SparkasseInbox.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`

```bash
git add components/SparkasseInbox.tsx tests/frontend/SparkasseInbox.test.tsx
git commit -m "feat: a Sparkasse inbox that stays invisible until it matters

A sibling of AdvanziaInbox rather than a replacement, rendering nothing
at all when there is nothing waiting and the poller is healthy.

The failure mode worth designing against is silence: an empty inbox looks
identical to a broken poller, so 'zuletzt geprüft' is the evidence it is
alive, and Kontowecker mail that no longer matches the expected wording
says so loudly instead of being dropped.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 8: Wire it up

**Files:**
- Modify: `components/Expenses.tsx` — import line, plus one element after `<AdvanziaInbox … />` at line 207-211
- Modify: `android/app/src/main/java/com/aswinmanohar/cashflow/MainActivity.java:18`
- Modify: `android/app/src/main/AndroidManifest.xml` — one `<data>` element on the existing intent-filter

These are the only edits to existing files in the whole plan. Nothing else in these files changes.

- [ ] **Step 1: Mount the inbox**

In `components/Expenses.tsx`, add after the existing import at line 9:

```tsx
import { SparkasseInbox } from './SparkasseInbox';
```

And immediately after the closing `/>` of `<AdvanziaInbox …>` (line 211):

```tsx
      <SparkasseInbox onAddExpense={handleAddCaptured} />
```

- [ ] **Step 2: Register the native plugin**

In `MainActivity.java`, add one line beside the existing registration:

```java
        registerPlugin(AdvanziaCapturePlugin.class);
        registerPlugin(SecureStorePlugin.class);
```

- [ ] **Step 3: Register the OAuth redirect scheme**

In `android/app/src/main/AndroidManifest.xml`, find the intent-filter that already carries the `cashflow` scheme and add a second `<data>` element alongside it:

```xml
                <data android:scheme="com.aswinmanohar.cashflow" />
```

- [ ] **Step 4: Verify the web build and the full suite**

Run: `npm run build && npm test`
Expected: both succeed. Every Advanzia test still passes, unmodified.

- [ ] **Step 5: Verify the APK builds**

Run: `npm run android:apk`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add components/Expenses.tsx android/app/src/main/java/com/aswinmanohar/cashflow/MainActivity.java android/app/src/main/AndroidManifest.xml
git commit -m "feat: mount Sparkasse capture

Three one-line additions, which is the whole footprint this feature has
in existing files: the inbox under the Advanzia one, the secure-store
plugin beside the capture plugin, and the OAuth redirect scheme on the
intent-filter that already handles the capture deep link.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

### Task 9: On-device verification

**Files:** none — this task produces a written record, not code.

Everything so far is proven against fixtures. The Advanzia effort's lesson was that the device is where the design meets reality: two real defects (a restricted-settings gate and a dead deep link) only appeared there. Expect the same here, and expect the **redirect URI** to be the first thing that breaks.

- [ ] **Step 1: Install and authorize**

Run: `npm run android:run`

In the Expenses tab, tap **Gmail verbinden**. Expect the "Google hasn't verified this app" interstitial — click through it via *Advanced*.

**If authorization fails with `redirect_uri_mismatch`,** the `REDIRECT_URI` constant in `services/gmailAuth.ts` does not match what Google expects for an Android client. Check the Google Cloud console's client detail page for the exact form and correct both it and the manifest `<data>` element.

- [ ] **Step 2: Confirm a real capture**

With at least one Kontowecker mail in the mailbox, background and reopen the app. Expect the Sparkasse block to list it with the right counterparty and amount.

Check the amount against the email by eye. This is the only step that proves the QP and MIME decoding work against real Google output rather than the hand-built fixtures.

- [ ] **Step 3: Confirm the guards on real data**

- Find a `Neuer Saldo` and confirm no €614,93-style item ever appears.
- If an incoming payment is available, confirm it shows "Geldeingang" and the review sheet has **no** Hinzufügen button.
- When the monthly Advanzia direct debit lands, confirm it shows "Kartenabrechnung" and cannot be added.

- [ ] **Step 4: Confirm idempotency on the device**

Add one captured expense, then background and reopen the app twice. The item must not come back, and no duplicate expense may appear in the list.

This is the single most important on-device check: it is the property the Advanzia path got for free and this one had to build.

- [ ] **Step 5: Record what was and was not proven**

Create `.scratch/sparkasse-email-capture/verification.md` recording: what was tested, what passed, what could not be exercised (an incoming payment or the Advanzia settlement may simply not have occurred yet), and any fixture that turned out to differ from real Google output.

Follow the honesty of `.scratch/advanzia-notification-capture/map.md` — say plainly what remains unproven rather than implying full coverage.

- [ ] **Step 6: Commit**

```bash
git add .scratch/sparkasse-email-capture/verification.md
git commit -m "docs: record what the device proved about Sparkasse capture

Co-Authored-By: AswinManohar <aswinbio@gmail.com>"
```

---

## Known gaps, carried deliberately

- **`Pravallik.`** — the transport carries it verbatim, so the shortening is upstream in the banking system. One sample cannot distinguish a truncation marker from a payee actually named that, so there is **no de-truncation logic anywhere in this plan**. Revisit once several real counterparties have been seen.
- **The redirect URI form** is the one detail not verifiable from the codebase. Task 9 Step 1 is where it gets settled.
- **Other Kontowecker mail types** (balance alerts, statement notices) are unobserved. They fail the envelope gate and are ignored; if one quotes a euro amount, the suspicious flag fires. That is deliberately noisy rather than silent.
- **`Neuer Saldo` as a live balance** would feed the emergency fund's cash figure and is sitting in every mail. Out of scope — capture first.
