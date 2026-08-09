# Parsing and dedup spec

Type: grilling
Status: resolved
Blocked by: —

## Question

[Verify Advanzia notifications on-device](02-verify-advanzia-notifications-on-device.md) pinned
down the real payload; this ticket turns it into a spec precise enough to implement and test.

Ground truth to work from: the only payload is a German sentence in `android.bigText`
(identical to `android.text`), no structured extras, anchored on

```
Eine Zahlung über <amount> € der Mastercard mit der Kartenendung <4 digits> an <MERCHANT> wurde erfolgreich ausgeführt.
```

with these four real fixtures: `MEGA LIMITED` / 11,89 €, `DM DROGERIE SAGT DANKE` / 1,95 €,
`REWE Bonn, Friedenspla` / 49,54 €, `Der Kaffeeladen GmbH` / 9,20 €.

Decide:

1. **The regex.** The merchant must be captured greedily between `an ` and
   ` wurde erfolgreich ausgeführt.` — `REWE Bonn, Friedenspla` proves a comma can appear inside
   it and that the acquirer truncates mid-word. How strict should the rest of the anchor be:
   match the whole sentence exactly, or anchor loosely on `über … € … an … erfolgreich` so a
   minor wording change still parses? Trade-off: strictness makes changes fail visibly (the
   agreed philosophy) but turns a harmless reword into an inbox full of raw items.
2. **Amount/locale.** German decimal comma is confirmed. Thousands-separator behaviour for
   amounts ≥ 1000 is **unverified** — assume `1.234,56` and accept both, or reject and let it
   fall to the raw path? Also: is a non-EUR / foreign-currency transaction sentence a different
   format? (Unverified — no such fixture.)
3. **Dedup.** Ticket 02 found each transaction carries a unique, stable
   `FCM-Notification:<serverId>` tag, and no re-post/update was observed
   (`mCreationTimeMs == mUpdateTimeMs` on every record). So the notification **key** is a
   natural primary dedup key, stronger than the (amount, merchant, ±minutes) heuristic agreed at
   charting. Confirm: key as primary, heuristic as backstop — and if so, what window, and does
   the backstop even earn its complexity?
4. **Pre-filter.** Skip anything with `FLAG_GROUP_SUMMARY` (Android's content-free auto-group
   summary, confirmed present). Beyond that, filter on `android.title == "Kartentransaktion"`,
   on the channel `advanzia_push_channel_01`, or not at all — i.e. does a *non*-transaction
   Advanzia notification become a raw inbox item, or get dropped silently? (Charting said raw
   inbox item; confirm that still holds now that we know marketing pushes share the channel.)
5. **Fixtures for the raw path.** Ticket 02 could not observe any decline/refund/balance/
   marketing notification. Opportunistically collect one of each via **Settings → Notifications
   → Notification history** on the phone (history is enabled) — or accept the gap explicitly and
   rely on the fail-visible design.

Resolve with `/grilling`. Output should be concrete enough to write parser tests directly
against the four fixtures above.

## Answer

Governing principle throughout: **fail closed, never silently.** Every ambiguous case either
surfaces as something you must look at, or is rejected — nothing is invented, merged away, or
dropped. Where a choice traded inbox noise against silent data corruption, noise won.

### 1. Two-field model: the title gates, the body alarms

`android.title` and the body are treated as separate signals, because marketing pushes share the
channel `advanzia_push_channel_01` and would otherwise flood the inbox.

| Title | Body | Outcome |
|---|---|---|
| `Kartentransaktion` | strict pattern matches | **Pending expense**, normal prefill |
| `Kartentransaktion` | strict fails, no negative marker | **Pending expense flagged "needs checking — unrecognised wording"** (tier 2, below) |
| `Kartentransaktion` | contains a negative marker | **Rejected** — raw inbox item, never becomes an expense |
| anything else | — | **Ignored**, not shown … *unless* it trips Guard 2 (§5) |
| any (`FLAG_GROUP_SUMMARY` set) | — | **Skipped** — Android's content-free auto-group summary |

Rejected alternatives: routing *everything* from the package to the inbox (marketing noise trains
you to ignore the inbox, defeating its purpose); and a separate quiet "other notifications" list
(a second list nobody reads).

### 2. Tiered body parsing with a reject-list

The trap this defends against: declines and refunds almost certainly *also* carry the title
`Kartentransaktion`. A loose regex that grabs `über <amount> € … an <merchant>` would record a
**declined** payment as a real expense, or a **refund** as a charge with the sign inverted.

**Tier 0 — reject-list, checked first.** If the body contains any of `abgelehnt`, `Gutschrift`,
`storniert`, `fehlgeschlagen`, `rückerstattet` (case-insensitive), the notification is rejected
outright — raw inbox item, never eligible to become an expense in either tier.
**This list is provisional** — see §7.

**Tier 1 — strict.** The full sentence, anchored on both `Eine Zahlung` and
`wurde erfolgreich ausgeführt`:

```
Eine Zahlung über <AMOUNT> € der Mastercard mit der Kartenendung <4 digits> an <MERCHANT> wurde erfolgreich ausgeführt.
```

`<MERCHANT>` is captured **greedily between `an ` and ` wurde erfolgreich ausgeführt.`** — the
fixture `REWE Bonn, Friedenspla` contains a comma and is truncated mid-word by the acquirer, so
punctuation must never be treated as a delimiter. Card ending is captured as metadata; any
4-digit value is accepted (a replacement card changes it).

**Tier 2 — loose, flagged.** Only reached when tier 0 passes and tier 1 fails. Extract amount,
merchant and card independently, prefill the review sheet, and mark the item
**"needs checking — unrecognised wording"**. It cannot be confirmed without being opened. This is
the visible signal that Advanzia changed their copy.

Neither tier ever auto-saves an expense.

### 3. Amount and currency: fail closed on anything not unambiguously German EUR

The risk being closed off is a **1000× silent error**: if an amount were ever English-style
`1,234.56` and parsed with German rules (strip dots, comma→dot), it would yield `1.23456`.

The amount **must** match German formatting with exactly two decimals, and the `€` symbol **must**
be present:

```
\d{1,3}(\.\d{3})*,\d{2}   |   \d+,\d{2}
```

- `11,89` ✓ · `1.234,56` ✓ (→ 1234.56) · `1,234.56` ✗ · `25,00 USD` ✗ · `11,8` ✗
- Anything failing this drops to **tier 2 (needs checking)** rather than being coerced.
- Thousands-separator and foreign-currency wording are **unverified** — no fixture ≥ €1000 and no
  non-EUR transaction was captured. The pattern assumes nothing beyond what was observed; the
  cost of being wrong is a manual touch, not a corrupted figure.

### 4. Dedup: notification key only; fuzzy matching demoted to a flag

The charted (amount, merchant, ±minutes) **auto-merge is dropped.** Two legitimate €1,95
purchases at the same DM minutes apart is ordinary behaviour, and auto-merge would silently
delete one — a silent failure, the exact thing this design exists to prevent. The duplicate it
guarded against (a re-push under a fresh serverId) is hypothetical: ticket 02 observed zero
re-posts and a unique `FCM-Notification:<id>` per transaction.

Dedup is therefore **key-based, at two points, both phone-local** (no `Expense` schema change, no
new Supabase column — the pending queue stays phone-only as charted):

1. **Queue append** — refuse a notification key already present in the queue.
2. **Handled-key set** — a local set of keys already confirmed or dismissed, stored beside the
   queue, so an interrupted drain (read succeeded, `clearPending` didn't) cannot resurrect an item.

The fuzzy match survives **only as a flag**: a new capture matching a recently-handled
(amount + merchant) within minutes shows **"possible duplicate of X"** in the review sheet. You
decide. Nothing is ever dropped on its say-so.

### 5. Two health guards, on separate channels

**Guard 1 — unconfirmed pendings (your inattention).** A single nag per item, **4 hours** after
capture, fired once and not repeated.

**Guard 2 — silent capture failure (the app's blind spot).** The residual hole in §1 is Advanzia
renaming the title, which would make the gate swallow every transaction silently. Detection is
**content-based and immediate**, not a slow counter: when a notification is ignored by the title
gate, check whether its body contains a `€` and a German amount. If so it *looks transactional but
our gate rejected it* → alert at once: "An Advanzia notification looked like a transaction but
wasn't recognised — tap to see it."

Rejected alternative: counting ignored notifications over a week — fires falsely when you simply
don't use the card, and is slow. Guard 2's accepted false positive is marketing that quotes a
price ("Nur 4,99 € pro Monat!"); that costs one dismissal.

**Three notification channels**, so muting one never blinds another:

| Channel | Contents |
|---|---|
| *Captured* | the primary per-transaction "tap to review" notification |
| *Reminders* | Guard 1 nags |
| *Capture health* | Guard 2 alarms — rare, important, must not be mutable alongside nags |

This exists because a per-item nag on a heavy shopping day invites muting; without the split,
muting the nags would silence captures and health alarms too.

### 6. Test corpus

Tier 1 must parse all four ticket-02 fixtures exactly:

| Body | → amount | → merchant | → card |
|---|---|---|---|
| `Eine Zahlung über 11,89 € … Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.` | `11.89` | `MEGA LIMITED` | `9520` |
| `… über 1,95 € … an DM DROGERIE SAGT DANKE …` | `1.95` | `DM DROGERIE SAGT DANKE` | `9520` |
| `… über 49,54 € … an REWE Bonn, Friedenspla …` | `49.54` | `REWE Bonn, Friedenspla` | `9520` |
| `… über 9,20 € … an Der Kaffeeladen GmbH …` | `9.20` | `Der Kaffeeladen GmbH` | `9520` |

Plus negative cases: the content-free `AUTOGROUP_SUMMARY`; a `1,234.56` amount (must not parse);
a synthetic `abgelehnt` sentence (must reject, not become an expense).

### 7. Accepted gap: the reject-list is unverified

No decline, refund, balance or marketing notification was observable (ticket 02), and checking
notification history was **declined in favour of shipping the list as provisional**. So the tier-0
markers in §2 are informed guesses at German banking wording, not observed strings.

Residual risk: a refund whose wording uses none of those markers could reach tier 2. It would
arrive **flagged "needs checking"** and cannot be confirmed unseen — so the failure mode is you
noticing an odd item, not a corrupted expense. Correct the list against the first real
non-transaction notification that appears.
