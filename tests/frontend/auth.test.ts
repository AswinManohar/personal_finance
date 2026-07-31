import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Platform branching for sign-in. The web must keep the redirect flow and must
 * never pull in native code; Android must use signInWithIdToken, because
 * `window.location.origin` in a WebView is not a reachable HTTPS origin and
 * Google blocks OAuth in plain WebViews anyway.
 */

const { isNativePlatform, signInWithOAuth, signInWithIdToken, supaSignOut, login, logout, initialize } =
  vi.hoisted(() => ({
    isNativePlatform: vi.fn(),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signInWithIdToken: vi.fn().mockResolvedValue({ error: null }),
    supaSignOut: vi.fn().mockResolvedValue({ error: null }),
    login: vi.fn().mockResolvedValue({ result: { idToken: 'google-id-token' } }),
    logout: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));
vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize, login, logout },
}));
vi.mock('../../services/supabaseService', () => ({
  supabase: { auth: { signInWithOAuth, signInWithIdToken, signOut: supaSignOut } },
}));

import { signInWithGoogle, signOut } from '../../services/auth';

beforeEach(() => vi.clearAllMocks());

describe('sign-in branching', () => {
  it('uses the redirect flow on the web and never touches the native plugin', async () => {
    isNativePlatform.mockReturnValue(false);

    await signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledOnce();
    expect(signInWithIdToken).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('exchanges a native Google ID token for a Supabase session on Android', async () => {
    isNativePlatform.mockReturnValue(true);

    await signInWithGoogle();

    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(signInWithIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', token: 'google-id-token' })
    );
  });

  it('surfaces an error rather than throwing when the plugin returns no token', async () => {
    isNativePlatform.mockReturnValue(true);
    login.mockResolvedValueOnce({ result: {} });

    const { error } = await signInWithGoogle();

    expect(error).toBeTruthy();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('signs out of Supabase only, on the web', async () => {
    isNativePlatform.mockReturnValue(false);
    await signOut();
    expect(supaSignOut).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs out of Google as well, on Android', async () => {
    isNativePlatform.mockReturnValue(true);
    await signOut();
    expect(logout).toHaveBeenCalledOnce();
    expect(supaSignOut).toHaveBeenCalledOnce();
  });

  it('still signs out of Supabase when the native sign-out fails', async () => {
    // Otherwise a Google-side failure strands the user signed in.
    isNativePlatform.mockReturnValue(true);
    logout.mockRejectedValueOnce(new Error('no account'));

    const { error } = await signOut();

    expect(supaSignOut).toHaveBeenCalledOnce();
    expect(error).toBeNull();
  });
});
