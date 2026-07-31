import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * The Android half of sign-in. Imported dynamically by services/auth.ts, and
 * only when running natively, so none of this reaches the web bundle.
 */

let initialised = false;

export const initNativeGoogle = async (webClientId: string): Promise<void> => {
  if (initialised) return;
  await SocialLogin.initialize({
    google: {
      // The *web* client id: it determines the audience of the ID token, and
      // Supabase's Google provider already trusts that client. The Android
      // OAuth client still has to exist in Google Cloud — Google keys the
      // sign-in on (package name, signing SHA-1) — but it is not the audience.
      webClientId,
    },
  });
  initialised = true;
};

export interface NativeGoogleToken {
  idToken: string;
  /** Raw nonce, when one was used. Supabase hashes it and compares the claim. */
  nonce?: string;
}

export const nativeGoogleIdToken = async (
  webClientId: string
): Promise<NativeGoogleToken> => {
  await initNativeGoogle(webClientId);

  const result = await SocialLogin.login({
    provider: 'google',
    // No nonce on purpose, for now. Supabase accepts an ID token with no nonce
    // claim, and a mismatched nonce fails as "invalid token" — indistinguishable
    // from a misconfigured client, which is the single most confusing way for
    // this to break on first run. Turn it on once the plain flow is confirmed
    // working on a device, by passing `nonce` here AND through to Supabase.
    options: {},
  });

  const idToken = (result as any)?.result?.idToken;
  if (!idToken) {
    throw new Error(
      'Google sign-in returned no idToken. Usually means the Android OAuth ' +
        'client is missing, or its SHA-1 does not match the certificate this ' +
        'build was signed with.'
    );
  }

  return { idToken };
};

export const nativeGoogleSignOut = async (): Promise<void> => {
  await SocialLogin.logout({ provider: 'google' });
};
