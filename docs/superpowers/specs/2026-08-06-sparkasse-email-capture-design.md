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
the filter key.

**Outstanding gap.** The sample above came from Gmail's *print* view, which is a
rendering, not the payload. Unknown: whether the mail carries a `text/plain`
part or is HTML-only, and the true truncation width on `Pravallik.`. The first
implementation step is pulling one raw message through the Gmail API and pinning
fixtures from it — the same move `dumpsys notification --noredact` was for
Advanzia (see `lessons/05`, §1).

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

## Architecture

One inbox, one dedup store, one review sheet. Two parsers, sharing nothing but a
shape — they read different languages of text.

```
Gmail  ──poll on resume──►  sparkasseCapture  ──►┐
                                  │              │
                            gmailAuth (PKCE)     ├──►  PendingItem[]  ──►  CaptureInbox
                                                 │      (localStorage)         │
Advanzia notification ──►  advanziaCapture  ────►┘                        ReviewSheet
       (native listener)                                                       │
                                                                        confirmed Expense
                                                                          (→ Supabase)
```

`PendingItem` gains `source: 'advanzia' | 'sparkasse'`; `parse` becomes a union
of the two outcome types. Everything downstream of that discriminant is one code
path.

Rejected alternatives: a fully parallel Sparkasse pipeline (duplicates the
review sheet — the one component that writes money — and lets the copies drift);
and a source-agnostic `CaptureSource` abstraction (designing against two
samples, one of which cannot be exercised without a real card payment).

## Components

### `utils/sparkasseEmail.ts` — new

`parseKontoweckerEmail(subject, body) → SparkasseLine[]`

Returns a **list**. Advanzia's risk was misreading one sentence; this parser's
risk is misattributing amounts across several.

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

### `services/gmailAuth.ts` — new

Self-contained PKCE flow, so the auth mess never leaks into polling.

- Chrome Custom Tab (`@capacitor/browser`, new dependency) to Google's
  authorization endpoint with `scope=gmail.readonly`, `access_type=offline`,
  `prompt=consent`, S256 challenge. `prompt=consent` is **required**: without it
  Google withholds the refresh token on re-authorization, producing a session
  that dies in an hour with no way to renew.
- Callback arrives through the **existing `appUrlOpen` listener** — the handler
  already added for `cashflow://review?key=…` — extended with a second path. No
  new native callback plumbing. *The exact custom-scheme form Google requires for
  an Android-type OAuth client must be confirmed against their docs during
  implementation.*
- **Token storage: `EncryptedSharedPreferences`, via two new methods on the
  existing Kotlin plugin.** The refresh token grants read access to the whole
  mailbox; `localStorage` survives in backups and is readable by anything in the
  WebView. ~20 lines in a class that already exists, versus a new dependency.
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

`body.data` is base64url. Prefer the `text/plain` part; fall back to stripping
the HTML one.

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

### `components/CaptureInbox.tsx` — renamed from `AdvanziaInbox.tsx`

`ReviewSheet` moves into its own file. It is already ~200 lines doing the guess,
the flags and the save — the one component that writes an expense — and it is
about to serve two sources.

- Two new flag states, `incoming` and `settlement`, both riding the **existing**
  non-convertible path (a rejected capture already has no Add button, enforced
  not decorative). Nothing new is built to make them safe.
- `source === 'sparkasse'` skips `guessMerchant` entirely: `recallLocalMerchant`,
  else raw counterparty + `Other`. The merchant map stays **shared** — the two
  formats essentially never collide, and agreement is a free correct answer.
- Raw text stays visible: matched line prominent, full email body collapsed.
  Repeating a batch email across three items buries what you are checking.
- A second health-banner block (not authorized / grant revoked / last checked N
  ago), separate from listener-notification-battery grants, because the two
  capture paths fail independently and the user needs to know which went dark.

**localStorage keys are not renamed.** `advanzia.pending` holds both sources
despite the name. A migration to `capture.*` buys tidier strings and risks losing
unreviewed expenses.

## Testing

Parser tests mirror `tests/frontend/advanziaParser.test.ts`, fixtures pinned from
**real raw messages**: single line; multi-line batch; count mismatch; `Neuer
Saldo` never captured as an amount; positive → incoming; Advanzia settlement →
non-convertible; English-formatted amount refused.

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
