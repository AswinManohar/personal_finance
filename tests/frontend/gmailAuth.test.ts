import { describe, it, expect, vi, beforeEach } from 'vitest';

const secureStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => secureStore,
}));

vi.mock('@capacitor/browser', () => ({
  Browser: { open: vi.fn(), close: vi.fn() },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

import { gmailFetch, isAuthorized, revoke, __resetForTests } from '../../services/gmailAuth';

/**
 * The refresh path is the part worth testing hardest. A stampede of parallel
 * refreshes would have Google reject all but one, and the losers would surface
 * to the user as "authorization expired" on a grant that is perfectly valid.
 */

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
  secureStore.get.mockResolvedValue({ value: 'stored-refresh-token' });
  secureStore.set.mockResolvedValue(undefined);
  secureStore.remove.mockResolvedValue(undefined);
});

describe('isAuthorized', () => {
  it('is true when a refresh token is stored', async () => {
    await expect(isAuthorized()).resolves.toBe(true);
  });

  it('is false when there is none', async () => {
    secureStore.get.mockResolvedValue({ value: null });
    await expect(isAuthorized()).resolves.toBe(false);
  });
});

describe('gmailFetch', () => {
  it('returns null rather than throwing when never authorized', async () => {
    secureStore.get.mockResolvedValue({ value: null });
    await expect(gmailFetch('/messages')).resolves.toBeNull();
  });

  it('refreshes once and attaches the token', async () => {
    const fetchMock = vi.fn()
      // token endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'fresh', expires_in: 3600 }),
      })
      // gmail call
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const response = await gmailFetch('/messages');
    expect(response!.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.Authorization).toBe('Bearer fresh');
  });

  it('refreshes exactly once for concurrent callers', async () => {
    let tokenCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        tokenCalls++;
        return { ok: true, json: async () => ({ access_token: 'fresh', expires_in: 3600 }) };
      }
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([gmailFetch('/a'), gmailFetch('/b'), gmailFetch('/c')]);
    expect(tokenCalls).toBe(1);
  });

  it('refreshes and retries once on a 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'stale', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'fresh2', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const response = await gmailFetch('/messages');
    expect(response!.status).toBe(200);
    const [, init] = fetchMock.mock.calls[3];
    expect(init.headers.Authorization).toBe('Bearer fresh2');
  });

  it('drops the stored token when the grant is revoked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(gmailFetch('/messages')).resolves.toBeNull();
    expect(secureStore.remove).toHaveBeenCalled();
  });
});

describe('revoke', () => {
  it('clears the stored token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await revoke();
    expect(secureStore.remove).toHaveBeenCalled();
  });
});
