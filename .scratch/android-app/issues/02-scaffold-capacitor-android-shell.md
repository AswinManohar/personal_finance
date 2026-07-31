# Scaffold the Capacitor Android shell

Type: task
Status: blocked
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

**A JDK 17+.** The Android Gradle plugin refuses Java 11:

```
Android Gradle plugin requires Java 17 to run. You are currently using Java 11.
```

Only OpenJDK 8 and 11 are installed. `openjdk-17-jdk-headless` is available from apt but installing
it needs sudo, so it is left to a human. Everything else is in place: Android SDK at
`~/Android/Sdk` with platform 35, `local.properties` written, Gradle 8.11.1 downloaded and running.

Once the JDK is there, `npm run android:apk` should produce
`android/app/build/outputs/apk/debug/app-debug.apk`.

Auth is expected to be broken until ticket 04 — that is by design.
