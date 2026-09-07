import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Undo pressed while the delete's own push is still in flight.
 *
 * `triggerSync` in App.tsx refuses to overlap itself. It used to do that by
 * returning early, which dropped the second request on the floor: the undo
 * lifted the tombstone locally, the in-flight delete then landed `deleted:
 * true` in the cloud, and the next pull took the row away again. A push that
 * arrives during a push has to run afterwards, not never.
 */

const { pushToCloud, pullFromCloud, coffee } = vi.hoisted(() => {
  const today = new Date().toISOString().slice(0, 10);
  const coffee = { id: 'c1', name: 'Coffee', amount: 3.2, category: 'Food', isRecurring: false, date: today };
  return {
    coffee,
    pushToCloud: vi.fn().mockResolvedValue(true),
    pullFromCloud: vi.fn().mockResolvedValue({
      data: { expenses: [coffee] }, deletedExpenseIds: [], updatedAt: '2026-07-31T00:00:00.000Z',
    }),
  };
});

vi.mock('../../services/supabaseService', () => ({
  pushToCloud,
  pullFromCloud,
  isNetworkError: () => false,
  signOut: vi.fn().mockResolvedValue({ error: null }),
  signInWithGoogle: vi.fn(),
  recordSavingsHistory: vi.fn().mockResolvedValue(true),
  getSavingsHistory: vi.fn().mockResolvedValue([]),
  deleteHistoryRecord: vi.fn(),
  generateIntegrationToken: vi.fn(),
  getIntegrationTokens: vi.fn().mockResolvedValue([]),
  revokeIntegrationToken: vi.fn(),
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1', user_metadata: { email: 'a@example.com' } } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

import App from '../../App';

beforeEach(() => { window.localStorage.clear(); pushToCloud.mockClear(); });
afterEach(() => { window.localStorage.clear(); });

describe('undo while the delete is still syncing', () => {
  it('pushes the restored row once the in-flight push finishes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Primary' });
    // The pull queues one automatic push-back; let it land before the test starts.
    await waitFor(() => expect(pushToCloud).toHaveBeenCalledTimes(1));

    await user.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /expenses/i }));
    await screen.findByRole('button', { name: 'Delete Coffee' });

    // Hold the delete's push open.
    let release: (v: boolean) => void = () => {};
    pushToCloud.mockImplementationOnce(() => new Promise<boolean>(res => { release = res; }));

    await user.click(screen.getByRole('button', { name: 'Delete Coffee' }));
    await waitFor(() => expect(pushToCloud).toHaveBeenCalledTimes(2));
    expect(pushToCloud.mock.calls[1][1].deletedExpenseIds).toEqual(['c1']);

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await act(async () => { release(true); });

    await waitFor(() => expect(pushToCloud).toHaveBeenCalledTimes(3));
    const restored = pushToCloud.mock.calls[2][1];
    expect(restored.expenses.map((e: { id: string }) => e.id)).toContain('c1');
    expect(restored.deletedExpenseIds).not.toContain('c1');
  });
});
