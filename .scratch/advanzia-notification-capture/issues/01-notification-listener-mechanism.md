# How to build the notification listener

Type: research
Status: resolved
Blocked by: —

## Question

What is the right mechanism for a `NotificationListenerService` in this Capacitor 7 Android app,
and how does captured data get persisted and handed to the WebView?

Specifically:

1. **Plugin vs custom.** Is there a maintained Capacitor community plugin for reading *other
   apps'* notifications (not push, not local notifications) that fits Capacitor 7 / the repo's
   Android target — or is a small custom plugin (Kotlin service + `@CapacitorPlugin` bridge) the
   honest answer? Survey what exists (e.g. anything wrapping `NotificationListenerService`),
   its maintenance state, and what a custom one entails.
2. **Background lifecycle.** The listener must catch notifications while the Cashflow app is not
   running. Confirm how `NotificationListenerService` behaves when the hosting app process is
   dead (the system starts/binds it), what Android 13+/14 restrictions apply, and whether
   battery optimization can kill it on Pixel devices.
3. **Persistence + handoff.** Captured events must survive until the WebView next runs. Where
   should the native side write the pending queue (SharedPreferences as JSON? a small SQLite/
   Room store? a file in app storage that the Capacitor `Filesystem`/`Preferences` plugin can
   also read?) and how does the WebView learn about new items — plugin method polled on app
   resume, plugin event when both are alive, or both? Recommend one concrete shape.
4. **Posting the Cashflow notification.** The capture should trigger a local "tap to review"
   notification with a deep link that opens the app on the review sheet. Confirm how a native
   service posts this and how the tap intent reaches the WebView (Capacitor `App` plugin
   `appUrlOpen` / launch intent extras).
5. **Permission flow.** How the special "Notification access" grant works (Settings intent
   `ACTION_NOTIFICATION_LISTENER_SETTINGS`), how to detect whether it's granted, and any
   Play-store-irrelevant caveats (this app is sideloaded — Play policy does not constrain us).

Deliverable: a recommendation (plugin or custom, storage shape, handoff mechanism) with enough
concrete API references that an implementation plan can be written without re-researching.

## Answer

### 1. Plugin vs custom → custom plugin

No maintained Capacitor community plugin exists for reading *other apps'* notifications. The one
that comes up in every search, [`capacitor-notificationlistener`](https://www.npmjs.com/package/capacitor-notificationlistener)
([GitHub: Alone2/capacitor-notificationlistener](https://github.com/Alone2/capacitor-notificationlistener)),
is:

- **Archived** (read-only, archived 2024-08-30 per GitHub) with only 2 stars / 2 open issues —
  effectively a dead one-person side project.
- Registered via the **pre-`@CapacitorPlugin` legacy API** (`this.init(savedInstanceState, new
  ArrayList<Class<? extends Plugin>>() {{ add(NotificationListenerPlugin.class); }})` in
  `MainActivity.java`) — this is the Capacitor 2/early-3 bridge-registration pattern, incompatible
  with Capacitor 7's `@CapacitorPlugin`-annotated, auto-discovered plugin model. It would need a
  rewrite, not a drop-in install.
- Its own README states: *"This plugin is quite old and untested for newer versions. It will
  probably not work with current versions of Android."*
- Explicitly does **not** handle running while the app is backgrounded/killed — "does not support
  running in the background by design, allowing you to choose your preferred method of running in
  the background yourself" — which is precisely the hard part this ticket needs solved, so even a
  working fork wouldn't remove the real work.

No other maintained candidate turned up (Cordova-era `cordova-plugin-android-notification-listener`
style plugins likewise show no Capacitor-7-era activity). Capacitor's own official plugins
(`@capacitor/local-notifications`, `@capacitor/push-notifications`) are for notifications *this*
app originates, not for reading a third-party app's postings, so they don't apply here.

**Recommendation: a small custom Capacitor 7 plugin** — a Kotlin `NotificationListenerService`
subclass plus a `@CapacitorPlugin`-annotated bridge class in
`android/app/src/main/java/com/aswinmanohar/cashflow/`. This repo currently has zero custom native
code beyond the stock `MainActivity extends BridgeActivity` (`android/app/src/main/java/com/aswinmanohar/cashflow/MainActivity.java`),
so this will be the first custom plugin in the project — follow the official Capacitor "Custom
Native Android Code" / plugin guide: [Capacitor Android Custom Code](https://capacitorjs.com/docs/android/custom-code)
and [Capacitor Plugin creation guide](https://capacitorjs.com/docs/plugins/android) for the
`@CapacitorPlugin`/`Plugin`/`PluginCall` scaffolding. Note: a **local (non-npm) plugin is not
auto-discovered** — `MainActivity.java` needs one explicit line before `super.onCreate()`:
```java
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdvanziaListenerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```
(verbatim pattern per [Capacitor: Custom Native Android Code](https://capacitorjs.com/docs/android/custom-code)). This is the one required edit to the current bare `MainActivity extends BridgeActivity {}`.

### 2. Background lifecycle → system-bound service; survives app-dead, needs battery-exemption hardening

`NotificationListenerService` is declared in the manifest with
`android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"` and an intent-filter
for action `android.service.notification.NotificationListenerService`
([API reference](https://developer.android.com/reference/android/service/notification/NotificationListenerService)).
Once the user grants notification access, Android's `NotificationManagerService` **binds to it
directly** — the same privileged "system-bound service" category as `AccessibilityService` /
`InputMethodService` / `VoiceInteractionService`. Because the *system*, not the app, initiates the
bind, this is exempt from the Android 8+ (API 26) background-start limits that block apps from
starting their own components while backgrounded: if the Cashflow process is dead when a
notification posts, the OS starts the process to deliver the binding and callback, exactly as it
does for any bound service. This is standard, well-documented Android behavior for listener-class
services, not something specific to this app.

Lifecycle contract: wait for `onListenerConnected()` before calling any listener method;
`onNotificationPosted(StatusBarNotification, RankingMap)` fires per notification. If the binding
drops, `onListenerDisconnected()` fires and the *only* safe call at that point is
`requestRebind(ComponentName)` to ask the system to reattempt the bind — call it defensively from
`onListenerDisconnected()`.

Caveats to plan around:
- No NLS-specific new restriction was found in Android 13 or 14's behavior-change notes beyond the
  general background-execution limits described above (which don't apply here since binding is
  system-initiated). Android 13's real notification-relevant change is `POST_NOTIFICATIONS`
  runtime permission — that governs *posting* notifications (relevant to sub-Q4), not listening.
- In practice, developers report `NotificationListenerService` occasionally gets killed under
  memory pressure or aggressive OEM battery managers and sometimes fails to auto-restart (see
  [XDA: "NotificationListenerService gets killed but not restarted"](https://xdaforums.com/t/notificationlistenerservice-gets-killed-but-not-restarted.2722627/)).
  Stock Pixel/AOSP "Adaptive Battery" is comparatively lenient versus Xiaomi/Huawei/Samsung skins,
  but is not immune — the "Restricted" App Standby bucket can still throttle a backgrounded app.
  Since this is sideloaded (Play policy irrelevant per the ticket), the pragmatic mitigation is to
  request the battery-optimization exemption for the app (`Settings > Apps > Cashflow > Battery >
  Unrestricted`, or programmatically via `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) as part of
  the permission-onboarding flow, plus the `requestRebind()` defensive call above.

### 3. Persistence + handoff → SharedPreferences JSON array, behind the plugin's own API; poll-on-resume + live event, both

Repo context: no `@capacitor/preferences` dependency exists (`package.json` has `@capacitor/filesystem`
but not Preferences), and there is no existing native persistence code — this is greenfield. Given
the ticket's "native layer stays dumb" constraint and realistic volume (a handful of card
transactions a day, not a high-throughput stream), the concrete recommendation:

- **Storage**: a dedicated Android `SharedPreferences` file (e.g.
  `context.getSharedPreferences("advanzia_pending_queue", MODE_PRIVATE)`), holding one JSON-array
  string value serialized with `org.json.JSONArray` (no new dependency — `org.json` ships in the
  Android SDK). Each queue entry: `{id, rawText, parsed: {amount, merchant, cardSuffix} | null,
  postedAt}`. Writes must be synchronized (`synchronized` block around read-modify-write) since the
  `NotificationListenerService` can receive `onNotificationPosted` calls back-to-back. This is
  simpler than adding Room/SQLite for what's a low-volume, append-then-drain queue, and it keeps
  the native side "dumb" — no schema migrations, no query logic, just serialize/append/clear.
- **Boundary**: the SharedPreferences file is written by the `NotificationListenerService` and read
  only through the custom plugin's own methods (`getPending()` → `JSObject`/array, `clearPending(ids:
  string[])`) — never exposed to Capacitor's generic `@capacitor/preferences` plugin (which uses its
  own separate `"CapacitorStorage"` prefs file/namespace and isn't installed here anyway; no reason
  to add it). Using the same on-disk file as the hand-off point between the Service and the Plugin
  bridge class also decouples them: the Service can write successfully even before the Activity/
  Bridge/Plugin instance exists (e.g. woken by the system while the app's UI was never opened), and
  the Plugin just reads whatever accumulated when it's next asked.
- **Handoff mechanism — both, as the ticket allows**: when both are alive, the plugin calls
  `notifyListeners("pendingItemAdded", data)` (per [Capacitor Android Plugin Guide](https://capacitorjs.com/docs/plugins/android):
  `notifyListeners()` on the Java/Kotlin plugin → JS `MyPlugin.addListener('eventName', cb)`) for a
  live UI nudge — but this only fires if a JS listener is currently attached, which is never true
  while the app is dead, so it cannot be the source of truth. The source of truth is **poll-on-
  resume**: on app foreground (`@capacitor/app`'s `resume` event, or simply on the Expenses tab's
  mount/focus), the WebView calls the plugin's `getPending()` method once to drain whatever
  accumulated natively, renders it into the pending inbox, then calls `clearPending(ids)` once
  those items are safely represented client-side. This matches the pattern Capacitor's own `App`
  plugin uses for `getLaunchUrl()` (pull current state on demand) layered with an optional live
  event, and is the "both" option the ticket explicitly permits.

### 4. Posting the Cashflow notification → NotificationCompat from the service; custom URI scheme intent-filter → Capacitor's built-in `appUrlOpen`

Posting: the service (or the plugin, whichever ends up owning notification construction — either
way it's native/Kotlin, not WebView) builds the "tap to review" notification with
`androidx.core.app.NotificationCompat.Builder` — standard API, ships with the AndroidX core library
already implied by `@capacitor/android`. Because `targetSdkVersion = 35` in this repo
(`android/variables.gradle`), Android 13's `POST_NOTIFICATIONS` runtime permission applies: the app
must declare `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` and request
it at runtime (`ActivityCompat.requestPermissionsCompat` or via a Capacitor permission call) before
this notification will actually display — otherwise the OS silently drops it. This request belongs
in the same onboarding flow as the notification-listener grant (sub-Q5), since both are needed for
this feature to work at all.

Tap → WebView handoff: the cleanest path is Capacitor's **already-built-in** deep-link handling —
`BridgeActivity`/`Bridge` inspects `onNewIntent()` for an `ACTION_VIEW` intent carrying a `data` URI
and, when found, fires the `appUrlOpen` JS event automatically
([`App.addListener('appUrlOpen', ...)`](https://capacitorjs.com/docs/apis/app), payload
`{ url: string }`). Concretely:
- Add a **custom URI scheme** intent-filter to the existing `MainActivity` entry in
  `android/app/src/main/AndroidManifest.xml` (which today only has the LAUNCHER filter) — e.g.
  `<intent-filter><action android:name="android.intent.action.VIEW"/><category
  android:name="android.intent.category.DEFAULT"/><category
  android:name="android.intent.category.BROWSABLE"/><data android:scheme="cashflow"/></intent-filter>`.
  A custom scheme (vs. Android App Links / `https` + `assetlinks.json`) is the right choice here —
  App Links need a verified web-hosted association file, which is unnecessary ceremony for a
  sideloaded personal app.
- The notification's `PendingIntent` targets `MainActivity` with
  `Intent.ACTION_VIEW` and `data = Uri.parse("cashflow://review/<pendingId>")`; build it with
  `PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE)` —
  `FLAG_IMMUTABLE` (or `FLAG_MUTABLE`) is **mandatory** on every `PendingIntent` once targeting
  Android 12/API 31+ ([Android 12 behavior changes](https://developer.android.com/about/versions/12/behavior-changes-12)); `FLAG_IMMUTABLE` is correct here since nothing needs to mutate this intent (no inline reply/bubble).
  `android:launchMode="singleTask"` is already set on `MainActivity`, so re-tapping routes through
  the existing activity instance via `onNewIntent` rather than spawning a duplicate.
- JS side: `App.addListener('appUrlOpen', ({url}) => { /* parse cashflow://review/<id>, open the
  review sheet */ })` — no custom plugin event needed for the tap path at all, since this rides
  entirely on Capacitor's existing App-plugin machinery.

### 5. Permission flow → `ACTION_NOTIFICATION_LISTENER_SETTINGS` + `getEnabledListenerPackages`, no Play caveats apply

Notification access is a **special permission**, not a manifest/runtime permission — it cannot be
requested via a normal permission dialog. The user must be sent to system settings:
`startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))` (constant documented on
[`android.provider.Settings`](https://developer.android.com/reference/android/provider/Settings#ACTION_NOTIFICATION_LISTENER_SETTINGS)),
which opens the "Notification access" screen where the user finds and toggles Cashflow on
individually (there is no per-app deep link into that screen pre-Android 13; from API 30+ you can
pass `Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME` to preselect the app on some OEMs, but
this isn't guaranteed — treat the plain settings-screen launch as the reliable baseline).

Detecting grant state: `androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(context)`
returns a `Set<String>` of package names that currently have an enabled listener component; check
`.contains(context.packageName)` ([AndroidX reference](https://developer.android.com/reference/androidx/core/app/NotificationManagerCompat))
— this is the standard, still-current API (not the unrelated `NotificationManager.isNotificationPolicyAccessGranted()`,
which governs Do Not Disturb policy access, a different special permission entirely). Call this
on every app resume/onboarding-screen mount to reflect revocation, since the user can turn the
toggle off at any time from system settings with no callback to the app.

Play-store caveats: none apply — this is explicitly a sideloaded app per the ticket. The only
things worth flagging as *not* Play-policy issues but still real Android behavior: (a) notification
access is a sensitive permission Android surfaces with an extra confirmation dialog/warning copy in
the settings UI itself (system-level friction, unavoidable, same for every app); (b) some OEMs
(not stock Pixel) additionally gate "autostart"/"background activity" toggles alongside battery
optimization — worth a one-line mention in onboarding copy but not a Pixel-specific concern for
this device.
