# Native Google Sign-In into a Supabase session

Type: task
Status: blocked
Blocked by: 02, 03

## Question

Replace the browser redirect flow with native Google Sign-In on Android.

Today `signInWithGoogle` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: {
redirectTo: window.location.origin } })` (`services/supabaseService.ts:250-255`). Inside a
Capacitor WebView, `window.location.origin` is not a reachable HTTPS origin and Google blocks
OAuth in plain WebViews regardless.

On Android the flow becomes: native plugin returns a Google **ID token** → hand it to
`supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })`.

Must resolve:

- Which plugin, and how nonce handling works — Supabase validates the nonce, and getting this
  wrong fails in a way that looks like an invalid token.
- Platform branching: desktop web must keep using `signInWithOAuth` untouched. Where does the
  branch live so the web build does not pull in native code?
- Session persistence across app restarts, and what happens when the refresh token expires while
  offline.
- Sign-out on both paths.

This is the gate for everything else: RLS is `auth.uid()::text = user_key` on every table
(`SUPABASE_SECURITY.sql`), so with no real session the app has no data at all.

Done when signing in on the device yields a Supabase session whose `user.id` matches the desktop
one, and a pull returns the same data.

## Answer

**Code complete, unverified on a device.** No APK has been built yet (ticket 02 is still waiting on
a JDK 21), so nothing here has run on real hardware. Treat the device flow as untested.

### Plugin

`@capgo/capacitor-social-login@7.20.0`. The obvious candidate,
`@codetrix-studio/capacitor-google-auth`, peers on `@capacitor/core ^6` and its newest publish is a
release candidate — wrong generation for Capacitor 7.

### Where the branch lives

`services/auth.ts` is the only entry point the app calls. Web keeps `signInWithOAuth` byte for byte;
native goes to `signInWithIdToken`. `services/nativeGoogleAuth.ts` holds everything that touches the
plugin and is reached solely through `await import()`.

Verified in the build output: the main bundle contains **zero** references to `SocialLogin`, and the
native path is a separate **0.9 KB** chunk that a browser never fetches. `tests/frontend/auth.test.ts`
covers both directions plus the failure modes.

### Which client ID

The **web** client ID, via `VITE_GOOGLE_WEB_CLIENT_ID` (see `.env.example`) — not the Android one.
The plugin mints a token whose *audience* is that client, and Supabase's Google provider already
trusts it, so **no new Authorized Client ID is needed in Supabase**. The Android OAuth client still
has to exist in Google Cloud because Google keys the native sign-in on (package name, signing SHA-1),
but it is not the audience. That collapses one of ticket 03's steps.

### Nonce

**Deliberately not used yet.** Supabase accepts an ID token with no nonce claim, and a mismatched
nonce fails as "invalid token" — indistinguishable from a misconfigured OAuth client, which is the
worst possible thing to be debugging on a first device run. The plumbing is in place
(`NativeGoogleToken.nonce` flows through to `signInWithIdToken`); turn it on once the plain flow is
confirmed.

### Sign-out

Both halves. Skipping the Google side leaves the account selected, so the next sign-in silently
reuses it and sign-out looks broken. A native failure is logged and swallowed so it cannot strand the
user in a signed-in state.

### Still needed (ticket 03, human-in-the-loop)

1. An Android OAuth client in the existing Google Cloud project for `com.aswinmanohar.cashflow` +
   the signing SHA-1.
2. `VITE_GOOGLE_WEB_CLIENT_ID` filled in.

### Not addressed

Session persistence across restarts and refresh-token expiry while offline. `persistSession` and
`autoRefreshToken` are already on in the Supabase client, but the offline-expiry path is untested and
remains open.
