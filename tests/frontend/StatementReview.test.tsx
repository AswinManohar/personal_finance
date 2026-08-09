import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const { tx, report, importedExpense } = vi.hoisted(() => {
  const tx = { date: '2026-06-05', description: 'Lieferando', amount: 28.9,
               category: 'Food', direction: 'debit' as const };
  const report = {
    transactions: [tx],
    flags: [{ transaction: tx, flag_type: 'impulse', reason: 'Third delivery this week',
              severity: 'medium', monthly_saving_estimate: 60 }],
    crosscheck: { missing_in_app: [tx], missing_on_statement: [], amount_mismatch: [] },
    redaction_preview: { masked_counts: { iban: 1 } },
    totals: { statement_spend: 28.9, flagged_spend: 28.9, coverage_pct: 0 },
  };
  const importedExpense = {
    id: 'e-imported', name: 'Lieferando', amount: 28.9, category: 'Food',
    isRecurring: false, date: '2026-06-05',
  };
  return { tx, report, importedExpense };
});

vi.mock('../../services/statementReview', () => ({
  reviewStatement: vi.fn().mockResolvedValue(report),
  importTransaction: vi.fn().mockResolvedValue(importedExpense),
}));

import { reviewStatement, importTransaction } from '../../services/statementReview';
import { StatementReview } from '../../components/StatementReview';

describe('StatementReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads with redaction on by default and renders flags + crosscheck', async () => {
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    await waitFor(() => expect(reviewStatement).toHaveBeenCalledWith(file, true, 'bank'));
    expect(await screen.findByText(/third delivery this week/i)).toBeInTheDocument();
    expect(screen.getByText(/missing in app/i)).toBeInTheDocument();
  });

  it('one-click import calls the service then onImported with the created expense', async () => {
    const onImported = vi.fn();
    render(<StatementReview onImported={onImported} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add to expenses/i }));
    await waitFor(() => expect(importTransaction).toHaveBeenCalledWith(tx));
    expect(onImported).toHaveBeenCalledWith(importedExpense);
  });

  it('shows a friendly error when review fails', async () => {
    (reviewStatement as any).mockRejectedValueOnce(new Error('no text layer'));
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    expect(await screen.findByText(/no text layer/i)).toBeInTheDocument();
  });

  it('shows an error and leaves the row unimported when import fails', async () => {
    const onImported = vi.fn();
    (importTransaction as any).mockRejectedValueOnce(new Error('network down'));
    render(<StatementReview onImported={onImported} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add to expenses/i }));

    expect(await screen.findByText(/import failed.*network down/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to expenses/i })).toBeInTheDocument();
    expect(screen.queryByText(/^added$/i)).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('importing one of two identical missing_in_app rows only marks that row Added', async () => {
    const dupReport = {
      ...report,
      crosscheck: { missing_in_app: [tx, tx], missing_on_statement: [], amount_mismatch: [] },
    };
    (reviewStatement as any).mockResolvedValueOnce(dupReport);
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));

    const addButtons = await screen.findAllByRole('button', { name: /add to expenses/i });
    expect(addButtons).toHaveLength(2);
    await userEvent.click(addButtons[0]);

    await waitFor(() => expect(importTransaction).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/^added$/i)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /add to expenses/i })).toHaveLength(1);
  });

  it('running a new review clears stale "Added" state from a previous report', async () => {
    render(<StatementReview onImported={vi.fn()} />);
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/statement pdf/i), file);
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));

    // Import the only missing_in_app row -> index 0 marked Added.
    await userEvent.click(await screen.findByRole('button', { name: /add to expenses/i }));
    expect(await screen.findByText(/^added$/i)).toBeInTheDocument();

    // Re-run the review (e.g. a fresh statement). Row 0 in the new report is
    // a different, never-imported transaction — it must not inherit the
    // stale "Added" mark from the previous report's index 0.
    await userEvent.click(screen.getByRole('button', { name: /review statement/i }));
    expect(await screen.findByRole('button', { name: /add to expenses/i })).toBeInTheDocument();
    expect(screen.queryByText(/^added$/i)).not.toBeInTheDocument();
  });
});
