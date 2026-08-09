# Verify Advanzia notifications on-device

Type: task
Status: resolved
Blocked by: —

## Question

Pin down, on the actual phone, the ground truth the parser will run against. Screenshots show
the human-visible rendering; the listener sees `Notification` extras, which can differ.

To capture (HITL — needs the phone, likely via `adb shell dumpsys notification --noredact`
while an Advanzia notification is live, or a notification-log app):

1. **Package name** of the Advanzia Android app (settings → app info, or `dumpsys`).
2. **Extras structure** of a transaction notification: what's in `EXTRA_TITLE`
   ("Kartentransaktion") vs `EXTRA_TEXT` vs `EXTRA_BIG_TEXT` — and whether the full sentence
   ("Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde
   erfolgreich ausgeführt.") arrives untruncated in `EXTRA_BIG_TEXT`.
3. **Grouping behaviour**: whether Advanzia posts a group summary notification (the "5 ˄" stack
   in the screenshot) that would look like a duplicate/garbled event to the listener, and how
   individual children are keyed (`notification key`, `when` timestamp).
4. **Re-post behaviour**: whether a single transaction ever updates/re-posts the same
   notification (same key, multiple `onNotificationPosted` calls).
5. **Other notification types** Advanzia sends (declines, refunds, balance, marketing) — one
   example each if available, so the "raw unparsed inbox item" path has real fixtures.

## Answer format

Paste the relevant `dumpsys` fragments (redact card numbers beyond the last 4 if any appear)
plus the package name. These become parser test fixtures.

## Answer

Captured 2026-08-06 from the live notification shade via
`adb shell dumpsys notification --noredact` on **Pixel 6 Pro (raven)**, with 4 Advanzia
transaction notifications posted 2026-08-05 still undismissed.

### 1. Package → `com.advanzia.mobile`

App `versionName=3.2.1`, uid `10286`, installed 2023-08-19. Notification channel:
`advanzia_push_channel_01` (user-visible name "Push notifications", `mImportance=4` / HIGH).
Delivery is **FCM push** — every transaction arrives as a distinct push, tagged
`FCM-Notification:<serverId>` with `id=0` always. Full key shape:

```
key=0|com.advanzia.mobile|0|FCM-Notification:18666216|10286
```

### 2. Extras → full sentence in BOTH `android.text` and `android.bigText`, untruncated

Verbatim record (card ending 9520 kept — it is already only the last 4):

```
NotificationRecord(0x081a8407: pkg=com.advanzia.mobile user=UserHandle{0} id=0
  tag=FCM-Notification:18666216 importance=4
  Notification(channel=advanzia_push_channel_01 flags=AUTO_CANCEL vis=PRIVATE))
    when=1785953222585/1785953222585
    timeout=PT72H
    extras={
        android.title=String (Kartentransaktion)
        android.template=String (android.app.Notification$BigTextStyle)
        android.text=String (Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.)
        android.bigText=String (Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.)
        android.subText=null
        android.largeIcon=null
        androidx.core.app.extra.COMPAT_TEMPLATE=String (androidx.core.app.NotificationCompat$BigTextStyle)
    }
```

Findings:

- `android.title` is **always** `Kartentransaktion` for these — a usable cheap pre-filter, but
  see the caveat in §5 (other message types may reuse or differ from it; unverified).
- `android.text` and `android.bigText` are **byte-identical** and carry the complete sentence.
  The "…" seen in the notification shade is purely collapsed-view rendering, not data loss.
  Recommendation: read `android.bigText`, fall back to `android.text`. Never parse the shade text.
- **There are no structured extras** — no amount, merchant, or currency fields. The sentence is
  the only payload, so regex over it is unavoidable.
- `when` (epoch ms, e.g. `1785953222585` = 2026-08-05 20:07:02 CEST) is the post time and is the
  right source for the expense date. Decoded `when` values matched the screenshot's relative
  times ("14h", "16h") exactly, confirming it is not a server-side or booking timestamp.
- `timeout=PT72H` — Advanzia auto-cancels these after 72h. Irrelevant to capture (the listener
  fires at post time and the queue is persisted natively), but it means the shade is *not* a
  reliable archive to re-scrape later.

### 3. Grouping → Android's AUTO-group, not Advanzia's; summary is content-free and must be skipped

The "5 ˄" stack in the screenshot is **Android's automatic grouping**, not something Advanzia
posts. The system synthesises a summary under the app's package:

```
NotificationRecord(0x0e4f2c88: pkg=com.advanzia.mobile id=0
  tag=0|com.advanzia.mobile|g:Aggregate_AlertingSection
  flags=AUTO_CANCEL|LOCAL_ONLY|GROUP_SUMMARY|AUTOGROUP_SUMMARY|SILENT
  groupKey=0|com.advanzia.mobile|g:Aggregate_AlertingSection)
    extras={
        android.reduced.images=Boolean (true)
        android.appInfo=ApplicationInfo (ApplicationInfo{12f2a46 com.advanzia.mobile})
        android.showWhen=Boolean (true)
    }
```

- The summary has **no `android.title`, no `android.text`, no `android.bigText`** — nothing to
  parse. It would otherwise land in the inbox as a bogus "unparsed" item on every 4th+ posting.
- The listener **will** receive it (`onNotificationPosted` fires for it) and must skip it:
  `(sbn.getNotification().flags & Notification.FLAG_GROUP_SUMMARY) != 0`.
- Children carry `groupKey=…g:Aggregate_AlertingSection` but **no** group flags of their own;
  they are ordinary standalone notifications. Group membership is recorded in the dump as:
  ```
  0|com.advanzia.mobile|g:Aggregate_AlertingSection
      0|com.advanzia.mobile|0|FCM-Notification:11732867|10286
      0|com.advanzia.mobile|0|FCM-Notification:11030321|10286
      0|com.advanzia.mobile|0|FCM-Notification:12016662|10286
      0|com.advanzia.mobile|0|FCM-Notification:18666216|10286
  ```

### 4. Re-post → none observed; the FCM tag is a stable per-transaction identity

For all four records `mCreationTimeMs == mUpdateTimeMs` (e.g. `1785953222590` / `1785953222590`),
i.e. each was posted once and never updated. Each transaction carries its own unique
`FCM-Notification:<serverId>` tag, so the **notification key is a natural dedup primary key** —
stronger than the (amount, merchant, time-window) heuristic agreed at charting. Recommendation:
dedup on key first, keep the heuristic as a backstop for the case where the bank re-pushes the
same transaction under a fresh serverId.

One transaction visible in the original screenshot (11,50 € India Express,
`FCM-Notification:12408409`) had been dismissed by capture time and is absent from the live
records while still appearing in the dump's intercept log — a reminder that **dismissal removes
the notification**, so capture must happen at post time, not by scraping.

### 5. Other notification types → NOT OBSERVED; only `Kartentransaktion` successes were available

The shade contained only successful card transactions. No decline, refund, balance, or marketing
notification was present, so this sub-question is **unresolved** — there are no fixtures for the
raw-unparsed path beyond the group summary.

This is a known gap, not a blocker: it is exactly the case the charted "fail visibly" decision
covers (unknown Advanzia notifications become raw inbox items rather than being dropped). It can
be closed opportunistically — notification history is enabled on the device
(`settings get secure notification_history_enabled` → `1`), so past non-transaction Advanzia
notifications may be readable via **Settings → Notifications → Notification history** on the
phone; the on-disk store (`/data/system_ce/0/notification_history`) needs root and is not
readable over adb.

### Real merchant-string fixtures (the important surprise)

All four captured sentences, verbatim — these are the parser's test corpus:

| Amount | Merchant string as sent | Posted (CEST) |
|---|---|---|
| `11,89 €` | `MEGA LIMITED` | 2026-08-05 20:07:02 |
| `1,95 €` | `DM DROGERIE SAGT DANKE` | 2026-08-05 17:48:25 |
| `49,54 €` | `REWE Bonn, Friedenspla` | 2026-08-05 17:41:55 |
| `9,20 €` | `Der Kaffeeladen GmbH` | 2026-08-05 17:15:30 |

Two consequences that were not visible from the screenshots:

1. **`REWE Bonn, Friedenspla` is truncated by the acquirer**, mid-word, at 22 chars — and it
   **contains a comma**. Any regex that treats punctuation as a merchant delimiter breaks here.
   The merchant must be captured greedily as everything between `an ` and
   ` wurde erfolgreich ausgeführt.`.
2. Merchant strings are raw card-network descriptors (`MEGA LIMITED`,
   `DM DROGERIE SAGT DANKE`), which independently confirms the charting decision to have Gemini
   propose a human-readable name — and confirms the learned merchant map should key on the raw
   string, which is stable per merchant even when truncated.

Anchor pattern for the parser (locale note: German decimal comma; thousands separator behaviour
for amounts ≥ 1000 is **unverified** — no such transaction was captured):

```
Eine Zahlung über <amount> € der Mastercard mit der Kartenendung <4 digits> an <MERCHANT> wurde erfolgreich ausgeführt.
```

Full dump retained for this session at
`…/scratchpad/notif-dump.txt` (session-scoped; not committed).
