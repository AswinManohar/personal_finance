import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { parseAdvanziaBody } from '../../utils/advanziaNotification';
import type { PendingItem } from '../../services/advanziaCapture';

/**
 * The inbox is the last thing standing between a parsed notification and a
 * number in the user's finances, so these tests are mostly about what it
 * refuses to do: never add a declined or refunded transaction, never hide a
 * capture the parser was unsure about, never merge a possible duplicate away,
 * and never stay silent when capture has stopped working.
 */

const { state } = vi.hoisted(() => ({
  state: {
    pending: [] as PendingItem[],
    status: {
      listenerEnabled: true,
      notificationsEnabled: true,
      lastCaptureAt: 0,
      lastSuspiciousAt: 0,
      queued: 0,
    },
    guess: undefined as { name: string; category: string } | undefined,
    learned: [] as { merchant: string; memory: { name: string; category: string } }[],
    resolved: [] as string[],
  },
}));

vi.mock('../../services/advanziaCapture', () => ({
  readPending: () => state.pending,
  drainPending: vi.fn(async () => state.pending),
  getCaptureStatus: vi.fn(async () => state.status),
  guessMerchant: vi.fn(async () => state.guess),
  recallLocalMerchant: vi.fn(() => undefined),
  learnMerchant: vi.fn((merchant: string, memory: any) => {
    state.learned.push({ merchant, memory });
  }),
  resolvePending: vi.fn((key: string) => {
    state.resolved.push(key);
    state.pending = state.pending.filter(p => p.key !== key);
    return state.pending;
  }),
  openListenerSettings: vi.fn(async () => {}),
  openBatterySettings: vi.fn(async () => {}),
  requestNotificationPermission: vi.fn(async () => true),
  captureKeyFromUrl: () => null,
}));

import { AdvanziaInbox } from '../../components/AdvanziaInbox';

const BODIES = {
  mega: 'Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde erfolgreich ausgeführt.',
  declined: 'Eine Zahlung über 11,89 € der Mastercard mit der Kartenendung 9520 an MEGA LIMITED wurde abgelehnt.',
  reworded: 'Zahlung über 49,54 € mit Kartenendung 9520 an REWE Bonn, Friedenspla durchgeführt.',
};

const item = (over: Partial<PendingItem> & { body?: string } = {}): PendingItem => {
  const body = over.body ?? BODIES.mega;
  return {
    key: '0|com.advanzia.mobile|0|FCM-Notification:1|10286',
    gate: 'transaction',
    body,
    postedAt: Date.now() - 60_000,
    parse: parseAdvanziaBody(body),
    possibleDuplicateOf: null,
    ...over,
  } as PendingItem;
};

beforeEach(() => {
  state.pending = [];
  state.status = { listenerEnabled: true, notificationsEnabled: true, lastCaptureAt: 0, lastSuspiciousAt: 0, queued: 0 };
  state.guess = undefined;
  state.learned = [];
  state.resolved = [];
  vi.clearAllMocks();
});

describe('AdvanziaInbox', () => {
  it('stays completely out of the way when there is nothing to review', async () => {
    const { container } = render(<AdvanziaInbox onAddExpense={vi.fn()} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('lists a captured transaction with its merchant and amount', async () => {
    state.pending = [item()];
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText('MEGA LIMITED')).toBeInTheDocument();
    expect(screen.getByText('€11.89')).toBeInTheDocument();
  });

  it('says so when notification access is off, because the failure is silence', async () => {
    state.status = { ...state.status, listenerEnabled: false };
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText(/no transactions are being captured/i)).toBeInTheDocument();
  });

  /**
   * The quietest broken state: captures keep queueing, and every notification
   * about them is dropped by the OS without a word.
   */
  it('offers to fix notifications being denied while capture still works', async () => {
    state.status = { ...state.status, listenerEnabled: true, notificationsEnabled: false };
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText(/can’t notify you about them/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /allow notifications/i })).toBeInTheDocument();
  });

  it('shows when capture last worked, since an empty inbox proves nothing', async () => {
    state.status = { ...state.status, lastCaptureAt: Date.now() - 3_600_000 };
    state.pending = [item()];
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText(/Last captured 1h ago/i)).toBeInTheDocument();
  });

  it('warns when a notification looked transactional but was not recognised', async () => {
    state.status = { ...state.status, lastCaptureAt: 1000, lastSuspiciousAt: 2000 };
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText(/Capture may need updating/i)).toBeInTheDocument();
  });

  it('confirms a capture into a real expense and remembers the merchant', async () => {
    state.pending = [item()];
    state.guess = { name: 'Mega Store', category: 'Entertainment' };
    const onAddExpense = vi.fn().mockResolvedValue(undefined);
    render(<AdvanziaInbox onAddExpense={onAddExpense} />);

    await userEvent.click(await screen.findByText('MEGA LIMITED'));
    await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveValue(11.89));
    await userEvent.click(screen.getByRole('button', { name: /add expense/i }));

    await waitFor(() => expect(onAddExpense).toHaveBeenCalledTimes(1));
    const expense = onAddExpense.mock.calls[0][0];
    expect(expense).toMatchObject({
      name: 'Mega Store',
      amount: 11.89,
      category: 'Entertainment',
      // The raw acquirer descriptor is kept as the vendor even though the
      // display name was cleaned up, so the original is never lost.
      vendor: 'MEGA LIMITED',
      isRecurring: false,
    });
    // Only a confirmation teaches the map — a guess alone must not.
    expect(state.learned).toEqual([
      { merchant: 'MEGA LIMITED', memory: { name: 'Mega Store', category: 'Entertainment' } },
    ]);
    expect(state.resolved).toContain(item().key);
  });

  it('falls back to the raw descriptor when the merchant lookup fails', async () => {
    state.pending = [item()];
    state.guess = undefined; // offline, signed out, or the LLM is down
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    await userEvent.click(await screen.findByText('MEGA LIMITED'));
    await waitFor(() => expect(screen.getByLabelText('Description')).toHaveValue('MEGA LIMITED'));
    expect(screen.getByText(/Couldn’t look up/i)).toBeInTheDocument();
  });

  /**
   * A declined payment is not an expense. The capture is still shown — dropping
   * it silently is what this design exists to avoid — but there is no way to
   * turn it into one.
   */
  it('shows a declined transaction but offers no way to add it', async () => {
    state.pending = [item({ body: BODIES.declined })];
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText('Not an expense')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/wurde abgelehnt/i));
    expect(screen.queryByRole('button', { name: /add expense/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('flags a reworded notification as needing a check, but still prefills it', async () => {
    state.pending = [item({ body: BODIES.reworded })];
    render(<AdvanziaInbox onAddExpense={vi.fn()} />);

    expect(await screen.findByText('Needs checking')).toBeInTheDocument();
    await userEvent.click(screen.getByText('REWE Bonn, Friedenspla'));
    expect(screen.getByText(/Unrecognised wording/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue(49.54);
  });

  /**
   * Two identical purchases minutes apart is ordinary. The old auto-merge rule
   * would have deleted one of them; this must flag and still allow both.
   */
  it('flags a possible duplicate without preventing the save', async () => {
    state.pending = [item({
      possibleDuplicateOf: {
        key: 'older', amount: 11.89, merchant: 'MEGA LIMITED', postedAt: Date.now() - 120_000,
      },
    })];
    render(<AdvanziaInbox onAddExpense={vi.fn().mockResolvedValue(undefined)} />);

    expect(await screen.findByText('Possible duplicate')).toBeInTheDocument();
    await userEvent.click(screen.getByText('MEGA LIMITED'));
    expect(screen.getByText(/Save it anyway if you really bought two/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeEnabled();
  });

  /**
   * Regression, found on the device: the deep-link listener used to live in
   * this component, so tapping a capture notification did nothing unless the
   * Expenses tab already happened to be mounted — Capacitor logged
   * "No listeners found for event appUrlOpen" and the tap was swallowed. App
   * now owns the listener and hands the key down through this prop.
   */
  it('opens the review sheet for a key handed down from a notification tap', async () => {
    state.pending = [item()];
    const onFocusHandled = vi.fn();
    render(
      <AdvanziaInbox
        onAddExpense={vi.fn()}
        focusKey={item().key}
        onFocusHandled={onFocusHandled}
      />,
    );

    // The sheet, not just the list row — the raw notification body only renders
    // inside the review sheet.
    expect(await screen.findByText(/wurde erfolgreich ausgeführt/i)).toBeInTheDocument();
    expect(onFocusHandled).toHaveBeenCalled();
  });

  it('ignores a focus key whose capture is not in the inbox', async () => {
    state.pending = [item()];
    render(<AdvanziaInbox onAddExpense={vi.fn()} focusKey="no-such-key" />);

    await screen.findByText('MEGA LIMITED');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses a capture without creating an expense', async () => {
    state.pending = [item()];
    const onAddExpense = vi.fn();
    render(<AdvanziaInbox onAddExpense={onAddExpense} />);

    await userEvent.click(await screen.findByText('MEGA LIMITED'));
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onAddExpense).not.toHaveBeenCalled();
    expect(state.resolved).toContain(item().key);
  });
});
