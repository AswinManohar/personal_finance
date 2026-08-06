import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pollSparkasse = vi.fn();
const readSparkassePending = vi.fn();
const readSparkasseStatus = vi.fn();
const resolveSparkasseItem = vi.fn();

vi.mock('../../services/sparkasseCapture', () => ({
  pollSparkasse: () => pollSparkasse(),
  readSparkassePending: () => readSparkassePending(),
  readSparkasseStatus: () => readSparkasseStatus(),
  resolveSparkasseItem: (key: string) => resolveSparkasseItem(key),
}));

// Must be a spy, not a constant: the component re-reads authorization on mount
// and overwrites whatever readSparkasseStatus said, so a hardcoded `true` here
// would make the "prompts to connect" assertion permanently unreachable.
const isAuthorized = vi.fn();
const authorize = vi.fn();
vi.mock('../../services/gmailAuth', () => ({
  isAuthorized: () => isAuthorized(),
  authorize: () => authorize(),
}));

import { SparkasseInbox } from '../../components/SparkasseInbox';

/**
 * The states are enforced, not decorative. An `incoming` or `settlement` item
 * must have no save control AT ALL — not a disabled one — because the whole
 * point is that no code path leads from them to an Expense.
 */

const item = (overrides: Record<string, unknown> = {}) => ({
  key: 'gmail:m1#0',
  messageId: 'm1',
  postedAt: 1786027523000,
  possibleDuplicateOf: null,
  line: {
    kind: 'clean',
    counterparty: 'EDEKA',
    amount: 20,
    raw: 'EDEKA: -20,00 EUR',
  },
  ...overrides,
});

const healthy = {
  authorized: true,
  lastPolledAt: Date.now(),
  lastCaptureAt: Date.now(),
  lastSuspiciousAt: 0,
  lastPollFailedAt: 0,
  pending: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  isAuthorized.mockResolvedValue(true);
  authorize.mockResolvedValue(true);
  readSparkasseStatus.mockReturnValue(healthy);
  readSparkassePending.mockReturnValue([]);
  pollSparkasse.mockResolvedValue([]);
  // Without a return value this yields undefined, and the component sets it as
  // the pending list — a TypeError swallowed by React after the assertions.
  resolveSparkasseItem.mockReturnValue([]);
});

describe('SparkasseInbox', () => {
  it('renders nothing when idle and healthy', () => {
    const { container } = render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a clean capture', async () => {
    readSparkassePending.mockReturnValue([item()]);
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/EDEKA/)).toBeInTheDocument();
  });

  it('offers no save control for an incoming item', async () => {
    readSparkassePending.mockReturnValue([
      item({ line: { kind: 'incoming', counterparty: 'ARBEITGEBER', amount: 2400, raw: 'ARBEITGEBER: +2.400,00 EUR' } }),
    ]);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: /ARBEITGEBER/i }));
    expect(screen.queryByRole('button', { name: /Hinzufügen/i })).not.toBeInTheDocument();
  });

  it('offers no save control for the Advanzia settlement', async () => {
    readSparkassePending.mockReturnValue([
      item({ line: { kind: 'settlement', counterparty: 'ADVANZIA BANK S.A.', amount: 487.32, raw: 'ADVANZIA BANK S.A.: -487,32 EUR' } }),
    ]);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: /ADVANZIA/i }));
    expect(screen.queryByRole('button', { name: /Hinzufügen/i })).not.toBeInTheDocument();
  });

  it('saves a clean capture through onAddExpense', async () => {
    readSparkassePending.mockReturnValue([item()]);
    const onAddExpense = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={onAddExpense} />);

    await user.click(await screen.findByRole('button', { name: /EDEKA/i }));
    await user.click(screen.getByRole('button', { name: /Hinzufügen/i }));

    await waitFor(() => expect(onAddExpense).toHaveBeenCalledOnce());
    expect(onAddExpense.mock.calls[0][0]).toMatchObject({ name: 'EDEKA', amount: 20 });
    expect(resolveSparkasseItem).toHaveBeenCalledWith('gmail:m1#0');
  });

  it('prompts to connect Gmail when not authorized', async () => {
    isAuthorized.mockResolvedValue(false);
    readSparkasseStatus.mockReturnValue({ ...healthy, authorized: false });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/Gmail verbinden/i)).toBeInTheDocument();
  });

  it('does not poll Gmail when there is no authorization', async () => {
    isAuthorized.mockResolvedValue(false);
    readSparkasseStatus.mockReturnValue({ ...healthy, authorized: false });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    await screen.findByText(/Gmail verbinden/i);
    expect(pollSparkasse).not.toHaveBeenCalled();
  });

  it('warns when Kontowecker mail stopped matching', async () => {
    readSparkasseStatus.mockReturnValue({ ...healthy, lastSuspiciousAt: Date.now() });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/nicht gelesen/i)).toBeInTheDocument();
  });

  // Nothing ever resets the suspicious timestamp, so gating on "> 0" would pin
  // the warning — and the whole card — forever after a single odd mail. A
  // capture that worked afterwards is the proof it recovered.
  it('drops the warning once a capture succeeds after it', async () => {
    readSparkasseStatus.mockReturnValue({
      ...healthy,
      lastSuspiciousAt: Date.now() - 60_000,
      lastCaptureAt: Date.now(),
    });
    const { container } = render(<SparkasseInbox onAddExpense={async () => {}} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // An authorized poller that always fails leaves pending empty and nothing
  // flagged, so without this the component renders nothing and capture dies
  // unannounced.
  it('says so when the last poll could not reach Gmail', async () => {
    readSparkasseStatus.mockReturnValue({ ...healthy, lastPollFailedAt: Date.now() });
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/letzte Prüfung ist fehlgeschlagen/i)).toBeInTheDocument();
    expect(screen.getByText(/zuletzt geprüft/i)).toBeInTheDocument();
  });

  it('polls again when the app returns to the foreground', async () => {
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    await waitFor(() => expect(pollSparkasse).toHaveBeenCalledOnce());

    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(pollSparkasse).toHaveBeenCalledTimes(2));
  });

  it('keeps rendering when a poll throws instead of wedging', async () => {
    readSparkassePending.mockReturnValue([item()]);
    pollSparkasse.mockRejectedValue(new Error('network unreachable'));
    render(<SparkasseInbox onAddExpense={async () => {}} />);
    expect(await screen.findByText(/EDEKA/)).toBeInTheDocument();
  });

  it('reports a failed Gmail connection instead of doing nothing', async () => {
    isAuthorized.mockResolvedValue(false);
    authorize.mockResolvedValue(false);
    readSparkasseStatus.mockReturnValue({ ...healthy, authorized: false });
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={async () => {}} />);

    await user.click(await screen.findByRole('button', { name: /Gmail verbinden/i }));
    expect(await screen.findByText(/fehlgeschlagen/i)).toBeInTheDocument();
  });

  // The sheet's UI is German, so a comma decimal is the ordinary way to type an
  // amount; `Number('12,50')` is NaN and would reject a perfectly good input.
  it('accepts a comma decimal separator in the edited amount', async () => {
    readSparkassePending.mockReturnValue([item()]);
    const onAddExpense = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SparkasseInbox onAddExpense={onAddExpense} />);

    await user.click(await screen.findByRole('button', { name: /EDEKA/i }));
    const amount = screen.getByLabelText(/Betrag/i);
    await user.clear(amount);
    await user.type(amount, '12,50');
    await user.click(screen.getByRole('button', { name: /Hinzufügen/i }));

    await waitFor(() => expect(onAddExpense).toHaveBeenCalledOnce());
    expect(onAddExpense.mock.calls[0][0]).toMatchObject({ amount: 12.5 });
  });
});
