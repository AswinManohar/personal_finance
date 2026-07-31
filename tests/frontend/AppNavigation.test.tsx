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
      // No Supabase session; the sync id below is what gets the app past Login.
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import App from '../../App';

beforeEach(() => {
  window.localStorage.clear();
  // usePersistedState reads JSON, so the id has to be stored as JSON.
  window.localStorage.setItem('unique_sync_id', JSON.stringify('user-1'));
  pushToCloud.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

const bottomNav = () => screen.getByRole('navigation', { name: 'Primary' });
const moreSheet = () => screen.getByRole('dialog', { name: /more destinations/i });

describe('Bottom navigation', () => {
  it('offers four destinations plus More', () => {
    render(<App />);
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
    render(<App />);

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
    render(<App />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    expect(moreSheet()).toBeInTheDocument();
  });

  it('lists every destination that is not in the bottom bar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));

    for (const label of ['FIRE', 'Goals', 'Calculator', 'Statements', 'Portfolio', 'Stocks', 'Data']) {
      expect(within(moreSheet()).getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('navigates and closes when a destination is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    await user.click(within(moreSheet()).getByRole('button', { name: /^FIRE/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('FIRE Calculator')).toBeInTheDocument();
  });

  it('keeps More highlighted while a screen behind it is open', async () => {
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);

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
    const { container } = render(<App />);

    await user.click(within(bottomNav()).getByRole('button', { name: /more/i }));
    const scrim = container.querySelector('[aria-hidden="true"].absolute.inset-0');
    expect(scrim).not.toBeNull();
    await user.click(scrim as Element);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Statement import', () => {
  // Moved here from Expenses.test.tsx: Statement Review is its own destination
  // now, so the import crosses a screen boundary and can only be exercised
  // through the shell.
  it('an imported transaction reaches the Expenses screen and is pushed', async () => {
    const user = userEvent.setup();
    render(<App />);

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
