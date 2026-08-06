# Advanzia notification → expense capture

Label: `wayfinder:map`

## Destination

Advanzia card-transaction notifications are captured on the Android phone and turn into
confirmed expenses in Cashflow: parsed, queued, reviewed and saved.

## Notes

**This map carries execution.** Wayfinder plans by default; this effort overrides that as of
2026-08-06, at the user's direction, after tickets 01/02/05 had settled the mechanism, the
payload and the parsing spec. Tickets here may write code, and the map is done when capture
works on the phone — not when the plan is complete. Ticket 03 was retyped `prototype` → `task`
at the same moment: no UI variants, build it.

**Correction to a charting decision — Gemini is gone.** Charting locked "Gemini call at review
time in the WebView", but `services/geminiService.ts` no longer exists; the app's LLM is now
**OpenAI, server-side**, in `api/statement_review/` (extractor/reviewer), reached through the
FastAPI backend. The merchant guess therefore goes to a **backend endpoint** using the existing
OpenAI client, not to Gemini from the WebView. The intent of the decision is preserved — guess
at review time, native does no networking, offline falls back to `Other`.

Domain: personal finance SPA packaged as a Capacitor Android app (`com.aswinmanohar.cashflow`,
see `.scratch/android-app/` — the effort that put it on the phone). React 19 + TypeScript +
Vite, Supabase (auth + Postgres + RLS), FastAPI on Railway. Expenses sync through
`services/supabaseService.ts`; cloud is the source of truth, localStorage is a cache.

Skills to consult per ticket: `/research` for the listener-mechanism ticket;
`/prototype` for the review-sheet ticket; `/grilling` + `/domain-modeling` if a resolution
re-opens a decision.

Standing preferences for this effort:

- **The native layer stays dumb**: capture + notify only. Parsing beyond the regex, guessing,
  and all UX live in the WebView/TypeScript.
- **Fail visibly, never silently**: unparseable Advanzia notifications become raw inbox items,
  not dropped events (matches the repo's recent "sweep silent failures" direction).
- Don't touch the Telegram → `POST /api/expenses/` (`X-Personal-Token`) pipeline or the
  `/v1/integrations/*` contract — this feature is additive, phone-side only.

### Locked decisions (from charting)

| Area | Choice |
|---|---|
| Capture | Native `NotificationListenerService` inside the Cashflow app + Capacitor bridge — no Tasker/webhook, no separate app |
| Confirmation | Pending-expense inbox in the Expenses tab + a Cashflow notification per capture; tap opens a prefilled review sheet (name, amount, date, vendor, category); save = normal synced expense |
| Category/name guess | Hybrid: learned merchant→category map first; **LLM** (category + human-readable name) for unseen merchants; `Other` as offline fallback; confirmations feed the map. ~~Gemini~~ → OpenAI via a backend endpoint, see Notes |
| Guess timing | At review time, from the WebView — native side never does networking |
| Pending queue + merchant map | Phone-local only; only confirmed expenses enter Supabase-synced data |
| Notification filter | Parse only the known success pattern ("Eine Zahlung über X € … an MERCHANT wurde erfolgreich ausgeführt"); any card ending accepted (kept as metadata); all other Advanzia notifications land as raw unparsed inbox items |
| Dedup | Queue-level only: (amount, merchant, ± a few minutes). No statement-crosscheck integration |
| Defaults | `isRecurring: false`, EUR, date = notification timestamp |

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How to build the notification listener](issues/01-notification-listener-mechanism.md) — custom `@CapacitorPlugin` + Kotlin `NotificationListenerService` (no maintained plugin exists); pending queue as a JSON-array `SharedPreferences` file written by the service and exposed only via the plugin's `getPending()`/`clearPending()`, drained on app resume with an optional live `notifyListeners` event; tap-notification deep link rides Capacitor's built-in `appUrlOpen` via a custom `cashflow://` URI-scheme intent-filter; permission via `ACTION_NOTIFICATION_LISTENER_SETTINGS` + `NotificationManagerCompat.getEnabledListenerPackages()`.
- [Verify Advanzia notifications on-device](issues/02-verify-advanzia-notifications-on-device.md) — package `com.advanzia.mobile`, channel `advanzia_push_channel_01`, FCM-pushed with unique `FCM-Notification:<id>` tags; the full German sentence arrives untruncated in `android.bigText` with no structured extras, so regex is unavoidable; the shade's "5 ˄" stack is Android's own content-free `AUTOGROUP_SUMMARY` which must be skipped; no re-posts observed, so the notification key is a stronger dedup key than the agreed heuristic; four real merchant fixtures captured, one of them (`REWE Bonn, Friedenspla`) acquirer-truncated and containing a comma. Non-transaction notification types remain unobserved.
- [Parsing and dedup spec](issues/05-parsing-and-dedup-spec.md) — title `Kartentransaktion` gates, body regex alarms, other titles ignored; tiered parsing (reject-list → strict → loose-but-flagged "needs checking"), never auto-saving, guarding against declines/refunds being read as charges; amounts fail closed unless unambiguously German EUR (no 1000× misparse); the charted fuzzy auto-merge is **dropped** for silently deleting genuine repeat purchases — dedup is notification-key-based and phone-local, fuzzy match demoted to a "possible duplicate" flag; two health guards (4h single nag per unconfirmed item; immediate alarm when an ignored notification looks transactional) on three separate notification channels so muting one never blinds another. Reject-list wording is provisional and unverified.

- [Review sheet and pending inbox](issues/03-review-sheet-and-inbox-prototype.md) — built as `components/AdvanziaInbox.tsx` at the top of the Expenses tab, rendering nothing at all when idle and healthy; bottom sheet on phones / dialog on desktop, always showing the raw notification text, keeping the acquirer descriptor as `vendor`; the four flag states are enforced, not decorative — a rejected capture has no Add button at all, a loose one must be opened, a possible duplicate stays saveable.
- [Permission onboarding and revocation behaviour](issues/04-permission-onboarding-and-revocation.md) — contextual banners in the inbox rather than a setup screen, surfaced per blocking grant (notification access → notifications → battery as optional hardening); status re-read on every foreground so revocation shows up; "Last captured 2h ago" as the evidence capture works, since an empty inbox otherwise looks identical to a broken listener. Decided by judgment during the build, and **not yet exercised on the device**.

## Not yet specified

- **On-device verification** — partially done 2026-08-06 on the Pixel 6 Pro. **Verified:**
  notification access granted and the service *bound* (`INotificationListener$Stub$Proxy`);
  `POST_NOTIFICATIONS` granted; all three channels created with the intended importances
  (health 4, captured 3, reminders 2); the plugin registers and `getPending`/`getStatus` answer;
  the `cashflow://` deep link resolves to MainActivity, reaches a listener, and switches to the
  Expenses tab; the inbox correctly renders *nothing* when idle and healthy. Two real defects
  found and fixed — the restricted-settings gate (ticket 01) and the dead deep link (ticket 03).
  **Still unproven, and only a real card payment can prove it:** that an actual Advanzia
  notification is captured, parsed and queued; that the "tap to review" notification opens the
  sheet on a live capture; that the listener survives being killed; that the 4-hour nag fires.

<!-- The learned merchant-map schema and guess prompt graduated during the build: utils/merchantMemory.ts
     and api/routers/merchants.py. Not a decision that needed its own ticket in the end. -->

## Out of scope

- **Statement-crosscheck dedup** — monthly statement import stays an occasional manual check;
  decided during charting, not on this route.
- **One-tap confirm from the notification** (accept the guess without opening the app) —
  explicitly deferred until category guessing proves trustworthy.
- **Syncing the pending queue or merchant map to the cloud** — phone-only for now; merchant-map
  sync is a possible later comfort, not this effort.
- **iOS** — no iOS notification-listener equivalent exists anyway.
- **Tasker/MacroDroid webhook path** — rejected at charting in favour of in-app capture.
- **Device telemetry to Logfire** — ruled out 2026-08-06. Logfire traces the backend, so the only
  production event it can see is a first-sighting merchant guess; every on-device decision
  (a decline rejected, a drop to the flagged tier, a Guard-2 fire, a merchant recalled from the
  learned map) never contacts the server and is therefore dark. Closing that would mean the phone
  reporting capture outcomes to a new endpoint — which cuts against "phone-local, only confirmed
  expenses reach the cloud" and would put spending history in a trace store. Declined; the
  synthetic runner (`evals/run_synthetic.py`) spans the inference step instead, so the parsing
  behaviour is observable where it is being exercised deliberately rather than continuously.
