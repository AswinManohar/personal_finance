# Review sheet and pending inbox

Type: task
Status: resolved
Blocked by: —

> **Retyped `prototype` → `task` on 2026-08-06** at the user's direction: "it is not a prototype,
> once you have a plan, just implement and test it." No `?variant=` switcher, no throwaway
> branch — the UI decisions below are made with judgment and built directly, in the idiom of
> `components/Expenses.tsx` and `components/ui/`.

## Question

How should the pending-expense inbox and the review sheet look and behave inside the Expenses
tab? Build it, covering:

1. **Inbox placement**: a badge/section in the Expenses tab listing pending items — parsed ones
   (amount, merchant, relative time) and raw unparsed ones (notification text) — with dismiss.
2. **Review sheet**: opens from a pending item (and from the Cashflow notification's deep link),
   prefilled with name, amount, date, vendor, guessed category; category is the field most
   likely to be corrected, so it gets the least-friction control. Save adds a normal expense
   and teaches the merchant map; dismiss discards the pending item.
3. **Guess states**: what the sheet shows while the Gemini guess for an unseen merchant is
   in-flight, when it lands, and when it failed/offline (fallback `Other`, merchant string as
   name).
4. **Empty/edge states**: empty inbox, an unparsed raw item's sheet (no prefill — manual entry
   or dismiss).
5. **Flag states introduced by [Parsing and dedup spec](05-parsing-and-dedup-spec.md)** — these
   are load-bearing, not decoration, because each one exists to stop a silent failure:
   - **"needs checking — unrecognised wording"** (tier-2 parse): prefilled but must not be
     confirmable without being opened. How does the inbox row and the sheet signal that?
   - **"possible duplicate of X"**: shown when a capture fuzzy-matches a recently-handled one.
     The user decides; nothing is auto-merged. How is the counterpart X surfaced for comparison?
   - **rejected / raw item** (negative marker hit, e.g. a suspected refund or decline): visible
     in the inbox but *never* convertible to an expense. Distinguish it from a dismissible one.
   - **Guard-2 alarm** ("a notification looked transactional but wasn't recognised") — where does
     tapping it land, given there is no parsed item to review?

Resolution = agreed look/behaviour (screens or a stub in a throwaway branch), linked from this
ticket as an asset. Existing UI idiom: Material-3-flavoured Tailwind, dark (`#121317`), bottom
tabs + sheets from the android-app effort.

## Answer

Built, not prototyped. `components/AdvanziaInbox.tsx`, mounted at the top of the Expenses tab
(`components/Expenses.tsx`), with `tests/frontend/AdvanziaInbox.test.tsx` covering it.

**Inbox placement.** A `Card` at the top of the Expenses tab that **renders nothing at all**
when there is nothing pending and capture is healthy — the tab is byte-identical for anyone not
using the feature. Each row shows merchant (or raw text when unparsed), relative time, amount or
`—`, and its flags as `Pill`s.

**Review sheet.** Bottom sheet on phones, centred dialog on desktop, matching `MoreSheet`'s
idiom. Opens from a row or from a `cashflow://review?key=…` notification tap. Prefills amount,
description, category, date; keeps the raw acquirer descriptor as `vendor` so the original is
never lost even when the display name is cleaned up. The **raw notification text is always
shown** — when the parser was unsure it is the only trustworthy record of what the bank said.
Saving goes through the same path as a manual add and only then reaches the cloud.

**Guess states.** Learned map first (instant, offline); LLM only for an unseen descriptor;
"Looking up …" while in flight; on failure the raw descriptor becomes the name with "Couldn't
look up … — fill it in yourself and it'll be remembered". Only a *confirmation* teaches the map,
never an unaccepted guess.

**The four flag states, all load-bearing:**

| State | Inbox | Sheet |
|---|---|---|
| `rejected` (decline/refund) | `Not an expense` | Explains the marker; **no Add button exists at all** — only Dismiss |
| `loose` | `Needs checking` | "Unrecognised wording, so these fields were guessed" — prefilled but must be opened |
| `suspicious` (failed title gate) | `Unrecognised` | "Capture may need updating — check the wording above" |
| possible duplicate | `Possible duplicate` | Names the counterpart with amount and time; save stays enabled — "Save it anyway if you really bought two" |

**Guard-2 alarm landing.** It deep-links like any capture; the suspicious item is in the inbox
with its raw text, so there is something to look at even though nothing parsed.

**Health surface** (this ticket's fourth question, and ticket 04's "verification affordance"):
because the failure mode is silence, an empty inbox proves nothing — so the header states
"Last captured 2h ago" whenever capture is on and has ever worked.

Deviation from the ticket as written: no `?variant=` switcher and no throwaway branch — the user
retyped this from `prototype` to `task` mid-session.

### Bug found on the device: the deep link was dead

The first build put the `appUrlOpen` listener inside `AdvanziaInbox`, to avoid touching
`App.tsx`. That was a bad trade and the phone proved it: the app opens on the **Savings** tab, so
the inbox was not mounted, no listener was ever registered, and firing
`cashflow://review?key=…` produced

    Capacitor/AppPlugin: Notifying listeners for event appUrlOpen
    Capacitor/AppPlugin: No listeners found for event appUrlOpen

i.e. tapping a capture notification did **nothing at all** unless you already happened to be
looking at the Expenses tab. No test caught it, because in jsdom the component under test is
always mounted.

Fixed by moving the listener to `App.tsx`, which owns tab state: it parses the key, calls
`navigate('expenses')`, and passes the key down through `Expenses` to the inbox as `focusKey`.
Verified on-device — with the inbox unmounted, the listener is registered, the event is
delivered to it, and `AdvanziaCapture` plugin calls appear as the Expenses tab mounts.
Regression covered by two tests in `tests/frontend/AdvanziaInbox.test.tsx`.
