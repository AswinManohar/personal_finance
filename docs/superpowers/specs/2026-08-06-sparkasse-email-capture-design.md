# Sparkasse email capture

**Date:** 2026-08-06
**Status:** Approved, not yet implemented

## Problem

Advanzia card transactions are captured on the phone and become reviewable
expenses. Everything paid from the Sparkasse current account — direct debits,
standing orders, transfers, girocard payments — is still typed in by hand.

Sparkasse's *Kontowecker* service already emails a notification for every
booking. That mail lands in Gmail. The signal exists; nothing reads it.

Reuse the pipeline that already works: parse → queue → review → confirmed
expense. Only the *source* is new.

## Ground truth

One real message, captured 2026-08-06:

```
From:    Kontowecker <noreply@kontowecker.de>
Subject: Ihr Umsatzwecker: 1 neuer Umsatz

Guten Tag,

auf dem Konto *8393 wurden folgende Umsätze verbucht:

Pravallik.: -1,00 EUR

Neuer Saldo: 614,93 EUR

Mit freundlichen Grüßen
Ihre Sparkasse
```

This is **not** shaped like an Advanzia notification, and four differences drive
the whole design:

| | Advanzia | Kontowecker |
|---|---|---|
| Transactions per event | exactly 1 | **N** — "1 neuer Umsatz" implies "3 neue Umsätze" |
| Direction | always a charge | **signed** — `-1,00` is out, a positive is money in |
| Counterparty | acquirer descriptor (`REWE Bonn, Friedenspla`) | often a **person** (`Pravallik.`), truncated |
| Decoy field | — | `Neuer Saldo: 614,93 EUR` — a balance a loose regex would read as an amount |

Sender is `noreply@kontowecker.de`, not a `sparkasse.de` domain. That address is
the filter key. The raw source shows `dkim=pass` (`d=kontowecker.de`),
`spf=pass` and `dmarc=pass` with **`p=REJECT`** — the domain publishes DMARC
reject, so a forged `From:` cannot realistically land in the inbox. That makes
the sender gate a stronger guarantee than a From-header check usually is.

### What the raw source settled

The `Show original` payload (captured 2026-08-06) resolved the format questions
and produced three corrections:

- **MIME tree is nested.** `multipart/mixed` → `multipart/related` →
  `text/plain; charset=UTF-8`. A flat
  `payload.parts.find(p => p.mimeType === 'text/plain')` finds **nothing**; the
  text part lives at `payload.parts[0].parts[0]`. The part walker must recurse.
- **`Content-Transfer-Encoding: quoted-printable`.** `Umsätze` arrives as
  `Ums=C3=A4tze`. Gmail's `body.data` is base64url of the *raw* part body, so
  base64-decoding leaves the quoted-printable intact. Beyond mangled umlauts,
  the danger is QP **soft line breaks**: a trailing `=` continues a line, so a
  counterparty long enough to push past 76 characters is split in two and the
  line regex silently stops matching. QP must be decoded and soft breaks joined
  **before** splitting into lines.
- **The subject needs RFC 2047 decoding.** This sample's subject is plain ASCII
  only because "1 neuer Umsatz" happens to be. The plural is "Umsätze", so a
  batch email arrives roughly as
  `=?UTF-8?Q?Ihr_Umsatzwecker=3A_2_neue_Ums=C3=A4tze?=` — meaning an
  undecoded subject regex would fail on **every multi-transaction email**,
  which is precisely what the count check exists to protect.

No `text/html` part exists in this message. The HTML fallback survives anyway as
a safety net: a `multipart/related` wrapper around a single text part is a
strong hint that other Kontowecker mail types do carry HTML with inline images.

**Outstanding gap.** The true nature of `Pravallik.` is still unknown. The
transport is not truncating it — the plain-text part carries it verbatim — so
whatever shortening happened is upstream in the banking system, and one sample
cannot distinguish a truncation marker from a payee literally named that. More
samples needed before trusting any de-truncation logic.

## Decisions

Settled before design, recorded so the reasoning survives:

1. **Capture runs in the app, not on a server.** The WebView reads Gmail
   directly and feeds the existing phone-local inbox. This preserves the
   standing invariant that only *confirmed* expenses reach Supabase. The
   rejected alternative — a Google Apps Script POSTing to a new backend
   endpoint — is ~30 lines against ~250 and works with the phone off, but puts
   unreviewed captures in Postgres.
2. **A separate Google authorization, published unverified.** Android signs in
   via `signInWithIdToken` (`services/auth.ts:72`), which yields an identity
   assertion and no `provider_token`. There is nothing to inherit, so Gmail
   access needs its own PKCE flow. `gmail.readonly` is a Google *restricted*
   scope; while the consent screen sits in **Testing**, Google expires the
   refresh token every 7 days. Pushing to **Production unverified** removes that
   expiry at the cost of a one-time warning interstitial. Full verification
   means a CASA assessment — not proportionate for one user.
3. **Money in is visible but never convertible.** `IncomeState` (`types.ts:24`)
   is `{ salaryMe, salaryPartner }` — static config, no transaction ledger — so
   a positive amount has nowhere to land. It renders as a read-and-dismiss item
   with no Add button, matching how Advanzia treats a rejected capture. Dropping
   positives silently was rejected against the standing "fail visibly" rule;
   booking them as negative expenses was rejected because one mis-tap turns a
   salary payment into a category-wrecking refund.
4. **No LLM for Sparkasse counterparties.** `/api/merchants/guess` is prompted
   for card acquirer descriptors and will confidently turn `Pravallik.` into a
   business — a failure `output_type=MerchantGuess` cannot catch, because
   "Pravallik GmbH" is a structurally valid answer. Sparkasse items use the
   learned `merchantMemory` map only, falling back to the raw string with
   category `Other`. Side benefit: no person's name leaves the phone.
5. **The Advanzia settlement must never be addable.** The Advanzia Mastercard is
   direct-debited from this same account, so Kontowecker fires monthly for the
   full statement total. Adding it would double-count every purchase the
   listener already captured individually.
6. **No working code is modified.** Directed 2026-08-06, overriding an earlier
   plan to rename `AdvanziaInbox.tsx` → `CaptureInbox.tsx`, extract `ReviewSheet`
   into its own file, and widen `PendingItem` with a `source` discriminant. The
   Advanzia path captures real money and is exercised on a device that cannot be
   fully simulated; the value of touching it is tidiness, and the cost is a
   regression nobody would notice until an expense went missing. See
   *Consequences* below — this decision is not free.

## Architecture

Two fully parallel pipelines, sharing only **pure functions imported read-only**.
Every Sparkasse file is new. Nothing in the Advanzia path changes.

```
Gmail  ──poll on resume──►  sparkasseCapture ──►  sparkasse.pending  ──►  SparkasseInbox
              │                    │                (localStorage)             │
        gmailAuth (PKCE)           │                                    SparkasseReview
                                   │                                           │
                    imports (read-only):                              confirmed Expense
                      parseGermanAmount ── utils/advanziaNotification.ts   (→ Supabase)
                      admitCapture ─────── utils/advanziaQueue.ts
                      recallLocalMerchant ─ services/advanziaCapture.ts
                      learnMerchant

Advanzia notification ──►  advanziaCapture  ──►  advanzia.pending  ──►  AdvanziaInbox
       (native listener)                          (localStorage)      (UNTOUCHED)
```

The shared imports are all exported already and all pure or storage-local, so
importing them is not a modification. `parseGermanAmount` in particular must be
reused rather than re-implemented: it is the 1000× misparse guard
(`lessons/05`, §2), and a second copy is a second chance to get it wrong.

Sparkasse gets its own `SparkasseLine` type and its own storage keys —
`sparkasse.pending`, `sparkasse.handled`, `sparkasse.watermark`,
`sparkasse.seen` — rather than widening `PendingItem`. The learned merchant map
stays **shared** at `advanzia.merchants` via the existing exported helpers: it is
read-and-append, the two string formats essentially never collide, and agreement
is a free correct answer.

### The two unavoidable wiring points

A feature cannot exist without being mounted. Exactly two existing files gain one
line each, and nothing else in them changes:

1. the Expenses tab renders `<SparkasseInbox />` beneath the Advanzia one;
2. `MainActivity` calls `registerPlugin(SecureStorePlugin.class)`.

Both are additive one-liners. If even these are unacceptable, the feature cannot
ship and the Apps Script route becomes the only option.

### Consequences of the no-touch constraint

Stated plainly so nobody is surprised later:

- **The review sheet is duplicated.** `ReviewSheet` is a module-local `const` at
  `components/AdvanziaInbox.tsx:248`, not an export, so it cannot be imported. A
  second one must be written. It is the component that turns a capture into an
  `Expense`, so there will now be two places where money enters the app, free to
  drift apart. This is the real cost of decision 6.
- **The Expenses tab shows two inboxes**, each with its own health banners,
  rather than one merged list sorted by time.
- **Dedup is per-pipeline.** Acceptable, because the two sources genuinely never
  see the same transaction — except the Advanzia settlement, which decision 5
  already makes non-convertible.

A later consolidation is a clean, separately-reviewable refactor once the
Sparkasse path has proven itself on real mail. It is deliberately not this
effort.

Also rejected: a source-agnostic `CaptureSource` abstraction — designing against
two samples, one of which cannot be exercised without a real card payment.

## Components

### `utils/sparkasseEmail.ts` — new

`parseKontoweckerEmail(subject, body) → SparkasseLine[]`

Returns a **list**. Advanzia's risk was misreading one sentence; this parser's
risk is misattributing amounts across several.

The caller passes an **already-decoded** subject and body — see
`utils/mimeDecode.ts`. Passing raw MIME in here would make the parser silently
wrong rather than loudly broken.

- **Envelope gate.** Sender must be `noreply@kontowecker.de`; subject must match
  `\d+ neue[rn]? (Umsatz|Umsätze)`. Anything else is ignored. Guard-2 equivalent:
  mail from that sender that quotes a EUR amount but fails the gate raises the
  health alarm — it means the wording changed and capture has gone deaf.
- **Line extraction.** Only lines matching
  `^(.+?):\s*([+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*EUR$`, between the
  `verbucht:` header and the `Neuer Saldo:` line. `Neuer Saldo` is excluded **by
  label**, not by position, so reordering cannot promote a balance to an expense.
- **Count check.** The subject states the count. Disagreement drops *every* line
  to the flagged tier: a batch where one line failed to parse is exactly where
  silent partial success loses a real expense.
- **Sign.** `-` yields `direction: 'out'`. `+` *and unsigned* yield
  `direction: 'in'` — ambiguity fails toward not creating spending.
- **Settlement reject.** A counterparty matching Advanzia yields
  `kind: 'settlement'`, non-convertible.
- **Amount.** Reuses `parseGermanAmount` from `advanziaNotification.ts`
  unchanged; it already refuses anything not unambiguously German EUR, which is
  the 1000× guard (`lessons/05`, §2).

Dedup key: `gmail:<messageId>#<lineIndex>`. The message ID is Gmail's own
identity, so re-polling is exactly idempotent; the line index disambiguates
within a batch and is stable because the body never changes. This flows into
`admitCapture` (`utils/advanziaQueue.ts`) unmodified.

### `utils/mimeDecode.ts` — new

Three pure functions, split out because each one is a silent-corruption risk and
each deserves its own tests. All three come directly from the raw source.

- `findPart(payload, mimeType)` — **recursive** descent of the MIME tree. The
  sample nests `multipart/mixed` → `multipart/related` → `text/plain`, so a flat
  scan of `payload.parts` finds nothing. Prefers `text/plain`; falls back to
  `text/html` with tags stripped.
- `decodeQuotedPrintable(text)` — `=XX` hex escapes to UTF-8, and **soft line
  breaks joined first**. The joining order is not cosmetic: a trailing `=`
  continues a line, so a counterparty long enough to push past 76 characters
  arrives split in two and the line regex silently stops matching. Join, then
  decode, then split into lines.
- `decodeRfc2047(header)` — `=?UTF-8?Q?…?=` and `?B?` forms. Required for the
  subject, because the plural "Umsätze" is non-ASCII: without this, **every
  multi-transaction email** fails the count check, which is the exact case the
  count check exists to protect.

### `services/gmailAuth.ts` — new

Self-contained PKCE flow, so the auth mess never leaks into polling.

- Chrome Custom Tab (`@capacitor/browser`, new dependency) to Google's
  authorization endpoint with `scope=gmail.readonly`, `access_type=offline`,
  `prompt=consent`, S256 challenge. `prompt=consent` is **required**: without it
  Google withholds the refresh token on re-authorization, producing a session
  that dies in an hour with no way to renew.
- Callback arrives through the **existing `appUrlOpen` listener** — the handler
  already added for `cashflow://review?key=…`. Under decision 6 that handler is
  not edited: `gmailAuth` attaches its **own** `appUrlOpen` listener via
  `@capacitor/app` and ignores any URL that is not its callback path. Capacitor
  supports multiple listeners on the event, so the two coexist without either
  knowing about the other. *The exact custom-scheme form Google requires for an
  Android-type OAuth client must be confirmed against their docs during
  implementation.*
- **Token storage: `EncryptedSharedPreferences`, in a new standalone
  `SecureStorePlugin` Kotlin class.** The refresh token grants read access to the
  whole mailbox; `localStorage` survives in backups and is readable by anything
  in the WebView. Decision 6 rules out adding methods to the existing
  `AdvanziaCapture` plugin, so this is a new file plus the one `registerPlugin`
  line noted above. Rejected: `@capacitor/preferences`, which is plain
  `SharedPreferences` with no encryption at rest.
- Refresh lazily on 401, behind a **single-flight promise** so parallel calls
  cannot stampede the token endpoint.

### `services/sparkasseCapture.ts` — new

Mirrors `advanziaCapture.ts`'s `drainPending` role; called from the same resume
hook. Polling on resume only — no timer.

Gmail API v1, called as plain REST (no `googleapis` SDK — it is Node-oriented
and heavy for two `fetch` calls):

```
GET /gmail/v1/users/me/messages?q=from:noreply@kontowecker.de after:<watermark>
GET /gmail/v1/users/me/messages/<id>?format=full
```

`body.data` is base64url of the *raw* part body, so it is still
quoted-printable after base64-decoding. The pipeline is
base64url → `findPart` → `decodeQuotedPrintable` → `parseKontoweckerEmail`, with
the subject through `decodeRfc2047` first.

**Idempotency needs its own machinery here.** The native queue is *destructive* —
`clearPending()` means a capture can never be re-offered. Gmail is not: every
poll re-reads the mailbox. And `HANDLED_LIMIT` (`advanziaCapture.ts:74`) caps
handled records at 200, which rolls over much faster once one email contributes
several lines. Relying on it alone would silently resurrect dismissed expenses in
a busy month. So the poller carries two guards — the same composite-cursor shape
as `api/routers/integrations.py`:

- a **watermark** on `internalDate`, queried as `after:` minus a deliberate
  **3-day** overlap, because mail can be delivered late and out of order;
- a **non-rolling seen-message-id set**, which covers everything in that overlap.

The watermark keeps the query small; the set makes re-polling exact. Neither is
trusted alone. New keys: `sparkasse.watermark`, `sparkasse.seen`.

Rejected: `users.watch` + Pub/Sub push. Better mechanism — instant, no wasted
polls — but it needs a public HTTPS receiver, which means the backend, which
means unreviewed captures on the server. Contradicts decision 1.

### `components/SparkasseInbox.tsx` — new

A sibling of `AdvanziaInbox.tsx`, not a replacement. Rendered beneath it in the
Expenses tab, and — following the existing convention — renders **nothing at all**
when idle and healthy.

Deliberately modelled on the Advanzia inbox's behaviour rather than sharing its
code, since decision 6 rules out extracting anything:

- Four item states, mirroring the Advanzia flag tiers:

  | State | Add button | Behaviour |
  |---|---|---|
  | `clean` — an outgoing line that parsed strictly | **yes, one tap** | prefilled name, amount, date, category; the everyday case |
  | `flagged` — count mismatch or a loose line | yes, **after opening** | must be reviewed in the sheet before it can be saved, never addable straight from the list |
  | `incoming` — positive amount | **none** | read-and-dismiss only |
  | `settlement` — Advanzia direct debit | **none** | read-and-dismiss only |

  For the two non-convertible states the Add button is **absent, not disabled** —
  the same structural enforcement the Advanzia inbox uses for a rejected capture.
- Nothing ever saves itself. Every state, including `clean`, requires a tap.
  This matches the Advanzia rule that no capture auto-becomes an expense.
- No `guessMerchant` call, per decision 4: `recallLocalMerchant` against the shared
  map, else raw counterparty with category `Other`.
- Raw text always visible — matched line prominent, full email body collapsed.
  Repeating a batch email across three items buries what you are checking.
- Its own health-banner block (not authorized / grant revoked / last checked N
  ago), because the two capture paths fail independently and the user needs to
  know *which* went dark.

### `components/SparkasseReview.tsx` — new

The forced duplicate of `ReviewSheet`, which is module-local at
`components/AdvanziaInbox.tsx:248` and cannot be imported. Takes a
`SparkasseLine`, produces an `Expense` through the same `onAddExpense` prop the
Advanzia inbox already receives, and calls `learnMerchant` on confirm so the
shared map improves from both sources.

Since this is now the second place in the app where a capture becomes money, it
carries the invariant explicitly in a header comment, and its tests assert the
non-convertible states cannot produce an `Expense` — not merely that the button
is hidden.

## Testing

Parser tests mirror `tests/frontend/advanziaParser.test.ts`, fixtures pinned from
**real raw messages**: single line; multi-line batch; count mismatch; `Neuer
Saldo` never captured as an amount; positive → incoming; Advanzia settlement →
non-convertible; English-formatted amount refused.

`mimeDecode` gets its own tests, one per silent-corruption mode: the nested
`mixed → related → plain` tree from the real sample resolves; a QP soft line
break rejoins so a >76-character counterparty still matches; an RFC 2047 subject
(`=?UTF-8?Q?…Ums=C3=A4tze?=`) passes the count check that its undecoded form
would fail.

One regression test guards decision 6 rather than any behaviour: the Advanzia
suite must pass **unchanged**, with no edits to its files. If a Sparkasse change
requires touching an Advanzia test, the isolation has been broken.

Idempotency gets dedicated tests — the property the native path got for free and
this one must earn: re-polling admits nothing new; the overlap window is covered
by the seen-set; a message on the exact boundary is not dropped.

`gmailAuth`: parallel 401s trigger exactly one token call; 401 → refresh → retry.

No eval work — there is no LLM in this path. `evals/run_synthetic.py` stays
Advanzia's.

## Failure behaviour

Everything visible, nothing silent:

- revoked grant, expired token → banner with a re-authorize button;
- Gmail 5xx/429 → back off; the banner goes stale rather than pretending;
- unparseable line → flagged tier, never dropped;
- timestamps from Gmail's `internalDate`, not the device clock.

## Out of scope

- **`Neuer Saldo` as a live account balance.** It would feed the emergency fund's
  cash figure directly, and it is sitting right there in every mail. Deliberately
  not this effort — capture first.
- **iOS** — no path exists for the Advanzia half either.
- **Pub/Sub push** — see `sparkasseCapture.ts` above.
- **Backfilling historical Kontowecker mail** — the watermark starts at first
  authorization.
- **Touching the Telegram → `POST /api/expenses/` pipeline or the
  `/v1/integrations/*` contract.** This feature is additive and phone-side.
