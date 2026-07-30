# Native Google Sign-In into a Supabase session

Type: task
Status: open
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
