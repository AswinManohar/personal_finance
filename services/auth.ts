import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseService';

/**
 * Sign-in, branched by platform.
 *
 * The web keeps the redirect flow untouched. Android cannot use it at all:
 * `window.location.origin` inside a Capacitor WebView is not a reachable HTTPS
 * origin, and Google refuses OAuth in plain WebViews regardless. There the
 * native plugin returns a Google **ID token**, which goes to
 * `signInWithIdToken`.
 *
 * The native module is behind `await import()` so the web bundle never pulls it
 * in — the branch is what keeps `npm run build` free of native code.
 *
 * RLS is `auth.uid()::text = user_key` on every table, so without a real session
 * the app has no data at all. This is the gate for everything on the phone.
 */

/**
 * The **web** OAuth client ID, not the Android one.
 *
 * The plugin asks Google for a token whose audience is this client, and Supabase
 * validates the audience against the Google provider it already has configured.
 * Using the web client here means Supabase needs no new Authorized Client ID —
 * the Android OAuth client still has to exist in Google Cloud (it is keyed on
 * package name + signing SHA-1) but it is not what the token is minted for.
 */
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

export const isNative = (): boolean => Capacitor.isNativePlatform();

export class MissingGoogleClientIdError extends Error {
  constructor() {
    super(
      'VITE_GOOGLE_WEB_CLIENT_ID is not set. Native Google Sign-In cannot run ' +
        'without the Google *web* OAuth client ID — see .env.example.'
    );
    this.name = 'MissingGoogleClientIdError';
  }
}

/** Called once at startup. A no-op on the web. */
export const initAuth = async (): Promise<void> => {
  if (!isNative()) return;
  if (!WEB_CLIENT_ID) throw new MissingGoogleClientIdError();
  const { initNativeGoogle } = await import('./nativeGoogleAuth');
  await initNativeGoogle(WEB_CLIENT_ID);
};

export const signInWithGoogle = async (): Promise<{ error: unknown | null }> => {
  try {
    if (!isNative()) {
      // Unchanged from before: desktop and mobile web use the redirect flow.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      return { error: null };
    }

    if (!WEB_CLIENT_ID) throw new MissingGoogleClientIdError();

    const { nativeGoogleIdToken } = await import('./nativeGoogleAuth');
    const { idToken, nonce } = await nativeGoogleIdToken(WEB_CLIENT_ID);

    // `nonce` is the RAW value; Supabase hashes it and compares against the
    // token's claim. Omitted entirely when the plugin did not use one — passing
    // a nonce the token does not carry fails as "invalid token", which is a
    // deeply unhelpful way to find out.
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      ...(nonce ? { nonce } : {}),
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[Cashflow] Google sign-in failed:', err);
    return { error: err };
  }
};

/**
 * Signs out of Supabase, and of Google too when native.
 *
 * Skipping the native half leaves the Google account still selected, so the next
 * sign-in silently reuses it and "sign out" looks broken.
 */
export const signOut = async (): Promise<{ error: unknown | null }> => {
  try {
    if (isNative()) {
      const { nativeGoogleSignOut } = await import('./nativeGoogleAuth');
      // Best-effort: a failure here must not block the Supabase sign-out, or the
      // user is stuck signed in.
      await nativeGoogleSignOut().catch(err =>
        console.warn('[Cashflow] native Google sign-out failed:', err)
      );
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[Cashflow] sign-out failed:', err);
    return { error: err };
  }
};
