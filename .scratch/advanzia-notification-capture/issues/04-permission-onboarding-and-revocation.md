# Permission onboarding and revocation behaviour

Type: grilling
Status: resolved
Blocked by: —

## Question

[How to build the notification listener](01-notification-listener-mechanism.md) established that
this feature needs **three separate grants**, none of which can be requested in a single dialog:

1. **Notification access** — a *special* permission. No in-app dialog exists; the app can only
   launch `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` and the user must find Cashflow in a
   system list and toggle it on, past an extra system warning screen.
2. **`POST_NOTIFICATIONS`** — a normal runtime permission (targetSdk 35), needed or the
   "tap to review" notification is silently dropped.
3. **Battery-optimization exemption** — not strictly required, but recommended hardening so the
   listener isn't killed without restart.

And notification access can be **revoked at any time from system settings with no callback to
the app** — grant state must be re-checked on every resume via
`NotificationManagerCompat.getEnabledListenerPackages()`.

Decide:

- **Where onboarding lives**: a one-off setup screen the first time the feature is enabled, a
  persistent section in Settings/More, or a banner in the Expenses tab? Is the feature opt-in
  (off until you go turn it on) or does the app prompt on first launch after the update?
- **How the three grants are sequenced**: all three walked in one guided flow, or only #1 and #2
  up front with the battery exemption offered later (e.g. only if captures are observed to be
  missed)? What copy explains *why* an app is asking to read notifications?
- **Degraded states**: what the app shows when access was granted and is later revoked, or when
  #1 is granted but #2 isn't (captures happen, silently — queue fills, no notification). Does the
  pending inbox surface a "capture is off" state, and how loudly?
- **Verification affordance**: is there a way to confirm capture is actually working (e.g. the
  inbox showing a "last captured: …" timestamp), given the failure mode is silence?
- **Channel setup**: [Parsing and dedup spec](05-parsing-and-dedup-spec.md) settled on **three**
  notification channels (*Captured*, *Reminders*, *Capture health*), deliberately separated so
  muting the nags cannot silence captures or health alarms. Does onboarding explain that split,
  or just create the channels silently and let Android's per-channel settings speak for
  themselves? Note the single `POST_NOTIFICATIONS` grant covers all three — a user who denies it
  loses every guard at once, which the degraded-state answer above must account for.

## Answer

Settled by implementation rather than by grilling — the user redirected the effort to build on
2026-08-06, so these were judgment calls, flagged here as such. Built in
`components/AdvanziaInbox.tsx` on top of `AdvanziaCapturePlugin`.

**Where onboarding lives → contextual, in the Expenses tab; no setup screen.** The inbox card
renders nothing when capture is healthy and there is nothing pending, and becomes the onboarding
surface the moment something is wrong. The feature is opt-in by construction: nothing at all
happens until notification access is granted, so no first-launch prompt was added.

Rejected: a dedicated setup screen (a screen you visit once and never again is a screen you
never see when the permission is later revoked) and a first-launch prompt (asks for an alarming
permission before the user has any reason to care).

**Sequencing → by consequence, not all at once.** Each grant is surfaced only when it is the
thing actually blocking:

1. *Notification access off* → banner + "Turn on notification access", with copy that warns it
   lives in system settings and Cashflow must be found in a list. Nothing works without it, so
   this suppresses everything else.
2. *Access on but notifications denied* → separate banner + "Allow notifications". This is the
   quietest broken state of the lot: captures keep queueing while every nudge about them — the
   tap-to-review, the nag, **and the capture-health alarm** — is dropped by the OS in silence.
3. *Battery exemption* → a plain underlined link beside (1), worded as hardening rather than a
   requirement, opening the settings **list** (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`)
   rather than the direct request dialog, which would need
   `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` declared for something optional.

**Degraded states.** Status is re-read on every foreground (`visibilitychange`), never cached
from startup, because notification access can be revoked from system settings with no callback.
Revocation therefore surfaces as banner (1) on the next resume.

**Verification affordance → "Last captured 2h ago"** in the card header whenever capture is on
and has ever worked. This is the direct answer to the failure mode being silence: an empty inbox
is indistinguishable from a broken listener without it. Backed by `lastCaptureAt` in
`CaptureStore`, and paired with the Guard-2 warning driven by
`lastSuspiciousAt > lastCaptureAt`.

**Channels → created silently, not explained.** All three are registered on plugin load and on
listener connect; Android's own per-channel settings are left to speak for themselves.
Explaining a three-way channel split in onboarding costs more attention than it saves, and the
split only matters at the moment someone goes to mute something — which is exactly when
Android's UI shows it.

### Not verified

Everything here compiles and the APK builds, but **no permission flow has been exercised on the
device**. The grant screens, the revocation path, and whether the listener survives Pixel battery
management are all unverified. See the note on the map.

Resolve with `/grilling` — these are UX/behaviour decisions, not research. The concrete API
surface is already settled in ticket 01 and needs no re-litigating.
