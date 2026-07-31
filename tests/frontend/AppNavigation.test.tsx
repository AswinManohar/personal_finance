import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Shell-level tests: the bottom bar, the More sheet, and the destinations that
 * only exist once those two work.
 *
 * These render the real App rather than a harness, because the thing under test
 * *is* the wiring — which screen a nav press reaches, and whether an import made
 * on one screen shows up on another.
 */

const { importedExpense, report } = vi.hoisted(() => {
  const importedExpense = {
    id: 'e-imported', name: 'Lieferando', amount: 28.9, category: 'Food',
    isRecurring: false, date: '2026-06-05',
  };
  const tx = {
    date: '2026-06-05', description: 'Lieferando', amount: 28.9,
    category: 'Food', direction: 'debit' as const,
  };
  return {
    importedExpense,
    report: {
      transactions: [tx],
      flags: [],
      crosscheck: { missing_in_app: [tx], missing_on_statement: [], amount_mismatch: [] },
      redaction_preview: { masked_counts: {} },
      totals: { statement_spend: 28.9, flagged_spend: 0, coverage_pct: 0 },
    },
  };
});

vi.mock('../../services/statementReview', () => ({
  reviewStatement: vi.fn().mockResolvedValue(report),
  importTransaction: vi.fn().mockResolvedValue(importedExpense),
}));

const { pushToCloud, pullFromCloud } = vi.hoisted(() => ({
  pushToCloud: vi.fn().mockResolvedValue(true),
  pullFromCloud: vi.fn().mockResolvedValue({ data: {}, updatedAt: '2026-07-31T00:00:00.000Z' }),
}));

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
      // A real session is now the only way past Login — the Sync ID text box is
      // gone, because it wrote straight into user_key with no auth.uid() behind it.
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1', user_metadata: { email: 'a@example.com' } } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import App from '../../App';

beforeEach(() => {
  window.localStorage.clear();
  pushToCloud.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

/**
 * Renders and waits for the session check to resolve. App now gates the first
 * render on getSession() so a cold start does not flash the login screen, which
 * means the shell is not present synchronously.
 */
const renderApp = async () => {
  render(<App />);
  await screen.findByRole('navigation', { name: 'Primary' });
};

const bottomNav = () => screen.getByRole('navigation', { name: 'Primary' });
const moreSheet = () => screen.getByRole('dialog', { name: /more destinations/i });

describe('Bottom navigation', () => {
  it('offers four destinations plus More', async () => {
    await renderApp();
    const nav = within(bottomNav());
    expect(nav.getAllByRole('button')).toHaveLength(5);
    // Queried by accessible name, which is what proves the decorative icon
    // ligatures ("receipt_long") stay out of the label.
    for (const name of ['Savings', 'Expenses', 'Net Worth', 'Debts', 'More']) {
      expect(nav.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('switches screens and marks the current one', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /debts/i }));

    expect(await screen.findByText('Payoff Order (Avalanche)')).toBeInTheDocument();
    expect(within(bottomNav()).getByRole('button', { name: /debts/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});

describe('More sheet', () => {
  it('is closed until More is pressed', async () => {
    const user = userEvent.setup();
    await renderApp();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    expect(moreSheet()).toBeInTheDocument();
  });

  it('lists every destination that is not in the bottom bar', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));

    for (const label of ['FIRE', 'Goals', 'Calculator', 'Statements', 'Portfolio', 'Stocks', 'Data']) {
      expect(within(moreSheet()).getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('navigates and closes when a destination is chosen', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    await user.click(within(moreSheet()).getByRole('button', { name: /^FIRE/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('FIRE Calculator')).toBeInTheDocument();
  });

  it('keeps More highlighted while a screen behind it is open', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    await user.click(within(moreSheet()).getByRole('button', { name: /^Goals/i }));

    await waitFor(() =>
      expect(within(bottomNav()).getByRole('button', { name: /more/i })).toHaveAttribute(
        'aria-current',
        'page'
      )
    );
  });

  it('closes on Escape without navigating', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(bottomNav()).getByRole('button', { name: /savings/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('closes on a scrim tap', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    // By test id, not by class: the scrim is aria-hidden and therefore invisible
    // to role queries, and a class-based selector picked up the shell's
    // decorative overlay the moment that also became an aria-hidden inset-0 div.
    await user.click(screen.getByTestId('more-sheet-scrim'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Statement import', () => {
  // Moved here from Expenses.test.tsx: Statement Review is its own destination
  // now, so the import crosses a screen boundary and can only be exercised
  // through the shell.
  it('an imported transaction reaches the Expenses screen and is pushed', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    await user.click(within(moreSheet()).getByRole('button', { name: /^Statements/i }));

    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText(/statement pdf/i), file);
    await user.click(screen.getByRole('button', { name: /review statement/i }));
    await user.click(await screen.findByRole('button', { name: /add to expenses/i }));

    // The push carries the appended expense, so the row is not merely local.
    await waitFor(() =>
      expect(pushToCloud).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ expenses: expect.arrayContaining([importedExpense]) })
      )
    );

    await user.click(within(bottomNav()).getByRole('button', { name: /expenses/i }));
    expect(await screen.findByText('Lieferando')).toBeInTheDocument();
  });
});

describe('Automatic sync', () => {
  // "automatically upload to cloud, dont need to manual push button" — after a
  // pull, anything that exists only on this device is pushed back up without a
  // human involved. This is what reconciles a backlog created while sync was
  // broken (the is_essential outage) or while offline.
  it('pushes local-only expenses back up after the login pull', async () => {
    window.localStorage.setItem('expenses', JSON.stringify([{
      id: 'local-only', name: 'Added while sync was broken', amount: 12,
      category: 'Food', isRecurring: false, date: '2026-07-30',
    }]));

    await renderApp();

    await waitFor(() =>
      expect(pushToCloud).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          expenses: expect.arrayContaining([
            expect.objectContaining({ id: 'local-only' }),
          ]),
        })
      )
    );
  });
});

describe('Cloud is the source of truth', () => {
  // "I want all data and data visualization to be pulled from cloud and I don't
  // want local data. So when I cleared recent expense cache, all the data viz
  // disappeared." localStorage is a cache of the last pull, never a source —
  // rendering it before the cloud answers is what made an empty cache look
  // like total data loss.
  it('does not render cached figures before the cloud has answered', async () => {
    window.localStorage.setItem('expenses', JSON.stringify([
      { id: 'cached', name: 'Stale cached row', amount: 999, category: 'Food', isRecurring: false, date: '2026-07-01' },
    ]));
    let release!: (v: any) => void;
    pullFromCloud.mockReturnValueOnce(new Promise(res => { release = res; }));

    render(<App />);

    expect(await screen.findByText(/loading your data/i)).toBeInTheDocument();
    expect(screen.queryByText('Stale cached row')).not.toBeInTheDocument();

    release({ data: {}, deletedExpenseIds: [], updatedAt: '2026-07-31T00:00:00.000Z' });
    await screen.findByRole('navigation', { name: 'Primary' });
  });

  it('offers a retry instead of showing zeroes when the pull fails', async () => {
    pullFromCloud.mockRejectedValueOnce(new Error('column user_expenses.is_essential does not exist'));

    render(<App />);

    expect(await screen.findByText(/could not reach the cloud/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has been lost/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // Critically: no dashboard behind it presenting €0 as a real figure.
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('recovers when the retry succeeds', async () => {
    const user = userEvent.setup();
    pullFromCloud.mockRejectedValueOnce(new Error('network down'));

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });
});
