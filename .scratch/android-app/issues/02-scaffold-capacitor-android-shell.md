# Scaffold the Capacitor Android shell

Type: task
Status: resolved
Blocked by: —

## Question

Stand up Capacitor over the existing Vite build so `npm run build` produces web assets that sync
into a native Android project and run on a device.

Decisions this ticket must settle and record, because later tickets depend on them:

- **`applicationId`** (e.g. `com.aswinmanohar.cashflow`) — the OAuth client registration in
  "Choose applicationId, create keystore, and register the Android OAuth client" needs this exact
  string, and it can never change afterwards without re-registering.
- App display name and Capacitor `webDir` / `server` config.
- Where the Android project lives in the repo, and what gets committed vs gitignored.
- How the Supabase URL and anon key reach the bundled app — today they come from the Vite build
  environment; confirm that still holds when assets are bundled rather than served by Railway.

Done when a debug build installs on a real device and the app loads its own bundled assets, with
no dependency on the Railway-hosted SPA for the frontend. Auth is expected to be broken at this
point — that is a later ticket.

The desktop web build served by FastAPI (`api/main.py` mounts `dist/`) must keep working
unchanged.

## Answer

**Scaffolded, not yet built.** The native project exists and the web assets bundle into it; the
Gradle build cannot run on this machine yet — see "Blocked on" below.

### Decisions settled (later tickets depend on these)

| Decision | Value | Note |
|---|---|---|
| `applicationId` | `com.aswinmanohar.cashflow` | **Change it now or not at all.** Ticket 03 registers the Android OAuth client against this exact string plus the signing SHA-1. |
| App display name | `Cashflow` | `android/app/src/main/res/values/strings.xml` |
| `webDir` | `dist` | The same Vite output FastAPI serves, so one `npm run build` feeds web and APK |
| `server.url` | **unset, deliberately** | Pointing it at Railway would make the app a thin browser over the network and defeat offline use |
| Android project location | `android/` at the repo root | Committed; Capacitor's generated `.gitignore` excludes build output, `local.properties`, the copied web assets and the generated config |
| Capacitor version | **7.6.8**, not 8 | Capacitor 8's CLI requires Node ≥22; this machine has Node 20.12.2. Cap 7 needs only Node ≥20. Worth revisiting after a Node upgrade. |
| `minSdk` / `target` / `compileSdk` | 23 / 35 / 35 | Capacitor 7 defaults; compileSdk 35 matches the installed platform |

### Supabase credentials

They are **literals** in `services/supabaseService.ts`, not build-time env vars, so they survive
bundling with no extra configuration — the question the ticket raised is answered: nothing to do.
The anon key is a public credential; row-level security is what scopes access.

### Also done here

`android/.gitignore` shipped with `*.jks` / `*.keystore` **commented out**, meaning a keystore would
have been committed. Uncommented now, before ticket 03 creates one — a signing key in the history
cannot be removed by deleting the file later.

### npm scripts

`android:sync` (build + copy), `android:open`, `android:run`, `android:apk`, `icons:fetch`.

### Blocked on

**A JDK 21.** Two separate floors, discovered one after the other:

1. AGP refuses Java 11 — *"Android Gradle plugin requires Java 17 to run"*. That message is AGP's
   own minimum and is easy to mistake for the whole requirement.
2. With JDK 17 installed, the build gets further and then fails on
   `:capacitor-android:compileDebugJavaWithJavac > error: invalid source release: 21`. Capacitor 7
   generates `android/app/capacitor.build.gradle` with
   `sourceCompatibility JavaVersion.VERSION_21`, so its own library needs a 21 toolchain.

So: `sudo apt install openjdk-21-jdk-headless` (21.0.11 is in the Ubuntu 22.04 repos), then
`sudo update-alternatives --config java`. Dropping to Capacitor 6 would work on JDK 17 but is a
generation behind and would need redoing.

Everything else is in place: Android SDK at `~/Android/Sdk` with platform 35, `local.properties`
written, Gradle 8.11.1 running, an AVD (`Medium_Phone_API_36`) already defined.

### native-run cannot find the SDK

`npx cap run android` shells out to `native-run`, which resolves the SDK from `$ANDROID_HOME`, then
`$ANDROID_SDK_ROOT`, then a per-platform default — and on Linux that default is `~/Android/sdk`,
**lowercase** (`native-run/dist/android/utils/sdk/index.js:15`). Android Studio installs to
`~/Android/Sdk`, and Linux is case-sensitive, so the default never matches and it throws
`ERR_SDK_NOT_FOUND`. It does not read `android/local.properties` — that is Gradle-only.

The `android:run` script now sets `ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"`, respecting an
existing value if one is exported.

Once the JDK is there, `npm run android:apk` should produce
`android/app/build/outputs/apk/debug/app-debug.apk`.

Auth is expected to be broken until ticket 04 — that is by design.

## Verified on the emulator (2026-07-31)

JDK 21 installed by the human; AGP bumped to 8.9.1 / compileSdk 36 (androidx.browser 1.9.0,
pulled in by the social-login plugin, demanded both). `assembleDebug` produces a 7.7MB APK.
Installed on `Medium_Phone_API_36` and screenshotted: the bundled assets render — Inter, the
Material Symbols subset (real glyphs, not name fallbacks), the full Savings Hub, the 4+More
bottom nav, safe-area respected. Guest mode, fully offline, no Railway dependency. Auth broken
as expected until tickets 03/04's console work.
