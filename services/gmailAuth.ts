import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Gmail authorization, kept entirely separate from app sign-in.
 *
 * The app signs into Supabase on Android with `signInWithIdToken`
 * (services/auth.ts), which yields an identity assertion and NO provider token.
 * There is therefore nothing to inherit: reading Gmail needs its own OAuth
 * grant, and this module is all of it. Nothing else in the app knows that
 * tokens exist.
 *
 * `gmail.readonly` is a Google *restricted* scope. The consent screen must be
 * published (In production, unverified) — while it sits in Testing, Google
 * expires the refresh token every 7 days.
 *
 * PKCE with an Android-type client, so there is no client secret and no server
 * hop. The refresh token goes to EncryptedSharedPreferences via SecureStore,
 * never localStorage.
 */

interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const secureStore = registerPlugin<SecureStorePlugin>('SecureStore');

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
const REFRESH_KEY = 'gmail.refresh_token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Custom-scheme callback, in the form Google documents for Android clients: the
 * scheme is the package name, which is what the authorization endpoint checks
 * against the client's registration. An Android client has no configurable
 * redirect list, so this is validated by convention rather than by lookup — get
 * the scheme wrong and it fails as `redirect_uri_mismatch`.
 *
 * Caught by its own intent-filter in AndroidManifest.xml, not the capture deep
 * link's — that one pins android:host="review" and would never match.
 */
const REDIRECT_URI = 'com.aswinmanohar.cashflow:/oauth2redirect';

/** In-memory only. Short-lived, and losing it on restart costs one refresh. */
let cachedAccess: { token: string; expiresAt: number } | null = null;
/** Single-flight guard: see the concurrent-refresh test. */
let refreshInFlight: Promise<string | null> | null = null;

export const __resetForTests = (): void => {
  cachedAccess = null;
  refreshInFlight = null;
};

const randomVerifier = (): string => {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const challengeFor = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const readRefreshToken = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { value } = await secureStore.get({ key: REFRESH_KEY });
    return value ?? null;
  } catch {
    return null;
  }
};

const clearRefreshToken = async (): Promise<void> => {
  cachedAccess = null;
  try {
    await secureStore.remove({ key: REFRESH_KEY });
  } catch {
    // Nothing useful to do — the next call re-reads and finds it gone or not.
  }
};

export const isAuthorized = async (): Promise<boolean> =>
  (await readRefreshToken()) !== null;

/**
 * Exchanges the stored refresh token for an access token.
 *
 * Behind a single-flight promise: a poll fans out into several Gmail calls, and
 * without this each one would race to refresh. Google rejects the losers, and
 * the user sees "authorization expired" on a perfectly good grant.
 */
const refresh = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<string | null> => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        // invalid_grant means the user revoked access, or Google expired the
        // token because the consent screen was left in Testing. Either way the
        // stored token is dead and keeping it would loop forever.
        const body = await response.json().catch(() => ({}));
        if (body?.error === 'invalid_grant') await clearRefreshToken();
        return null;
      }

      const body = await response.json();
      cachedAccess = {
        token: body.access_token,
        // 60s of slack so a token cannot expire mid-request.
        expiresAt: Date.now() + (body.expires_in - 60) * 1000,
      };
      return cachedAccess.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

export const accessToken = async (): Promise<string | null> => {
  if (cachedAccess && cachedAccess.expiresAt > Date.now()) return cachedAccess.token;
  return refresh();
};

/**
 * A Gmail API call with the bearer token attached.
 *
 * Returns null when there is no usable authorization, so callers branch on a
 * value rather than catching. On a 401 it refreshes once and retries — exactly
 * once, because a second 401 means something other than staleness.
 */
export const gmailFetch = async (path: string): Promise<Response | null> => {
  let token = await accessToken();
  if (!token) return null;

  // A dropped network throws rather than resolving, and the contract above is
  // that callers branch on a value. Letting it escape would reject pollSparkasse
  // and leave the inbox component wedged mid-refresh.
  const call = async (bearer: string): Promise<Response | null> => {
    try {
      return await fetch(`${GMAIL_BASE}${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
    } catch {
      return null;
    }
  };

  let response = await call(token);
  if (response?.status === 401) {
    cachedAccess = null;
    token = await refresh();
    if (!token) return null;
    response = await call(token);
  }
  return response;
};

/**
 * Opens Google's consent screen and stores the resulting refresh token.
 *
 * `prompt=consent` is NOT optional: without it Google withholds the refresh
 * token on any re-authorization, leaving a session that dies in an hour with no
 * way to renew and no error to explain it.
 *
 * The callback is caught with this module's OWN appUrlOpen listener. App.tsx
 * already has one for the capture deep link; Capacitor supports several, so the
 * two coexist and neither file needs to know about the other.
 */
export const authorize = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform() || !CLIENT_ID) return false;

  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);

  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');

  const code = await new Promise<string | null>(resolve => {
    let settled = false;
    void App.addListener('appUrlOpen', ({ url }) => {
      if (settled || !url.startsWith(REDIRECT_URI)) return;
      settled = true;
      const value = new URL(url).searchParams.get('code');
      void Browser.close().catch(() => {});
      resolve(value);
    }).then(handle => {
      // Best effort: if the user backs out of the custom tab there is no event
      // at all, so the promise would otherwise hang for the life of the app.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          void handle.remove();
          resolve(null);
        }
      }, 5 * 60 * 1000);
    });

    void Browser.open({
      url:
        `${AUTH_ENDPOINT}?` +
        new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: 'code',
          scope: GMAIL_SCOPE,
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
    });
  });

  if (!code) return false;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!response.ok) return false;

    const body = await response.json();
    if (!body?.refresh_token) return false;

    await secureStore.set({ key: REFRESH_KEY, value: body.refresh_token });
    cachedAccess = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    };
    return true;
  } catch {
    return false;
  }
};

export const revoke = async (): Promise<void> => {
  const token = await readRefreshToken();
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
    }).catch(() => {});
  }
  await clearRefreshToken();
};
