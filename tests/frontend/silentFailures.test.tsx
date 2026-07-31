import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stocks } from '../../components/Stocks';
import { Portfolio } from '../../components/Portfolio';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { NetWorthState } from '../../types';

vi.mock('../../services/supabaseService', () => ({
  recordSavingsHistory: vi.fn(), getSavingsHistory: vi.fn().mockResolvedValue([]),
  deleteHistoryRecord: vi.fn(),
}));

/**
 * A sweep, not a single bug. Four separate defects this session — randomUUID,
 * the expense form, Google sign-in, the loan form — were all the same shape: an
 * action that failed, changed nothing, and said nothing. These pin the
 * remaining forms so the pattern cannot come back quietly.
 */
describe('No form fails silently', () => {
  it('Stocks: says which field is missing', async () => {
    const user = userEvent.setup();
    render(<Stocks stocks={[]} setStocks={() => {}} />);

    await user.click(screen.getByRole('button', { name: /add position/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ticker symbol/i);

    await user.type(screen.getByLabelText(/symbol/i), 'ASML');
    await user.click(screen.getByRole('button', { name: /add position/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/how many shares/i);
  });

  it('Stocks: rejects a zero quantity rather than adding a worthless row', async () => {
    const user = userEvent.setup();
    const setStocks = vi.fn();
    render(<Stocks stocks={[]} setStocks={setStocks} />);

    await user.type(screen.getByLabelText(/symbol/i), 'ASML');
    await user.type(screen.getByLabelText(/quantity/i), '0');
    await user.click(screen.getByRole('button', { name: /add position/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(setStocks).not.toHaveBeenCalled();
  });

  it('Portfolio: refuses a fund with no name and explains why', async () => {
    const user = userEvent.setup();
    const setAssets = vi.fn();
    render(<Portfolio assets={[]} setAssets={setAssets} />);

    await user.click(screen.getByRole('button', { name: /add fund/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(setAssets).not.toHaveBeenCalled();
  });

  it('Portfolio: refuses a fund with neither a value nor a contribution', async () => {
    const user = userEvent.setup();
    const setAssets = vi.fn();
    render(<Portfolio assets={[]} setAssets={setAssets} />);

    await user.type(screen.getByLabelText(/fund name/i), 'Empty Fund');
    await user.click(screen.getByRole('button', { name: /add fund/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/current value|monthly/i);
    expect(setAssets).not.toHaveBeenCalled();
  });

  it('Savings quick-add: explains a non-positive amount', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn().mockResolvedValue(undefined);
    render(
      <SavingsDashboard
        portfolio={[]} stocks={[]}
        netWorthData={{ accumulatedSavings: 100 } as NetWorthState}
        setNetWorthData={() => {}} onSync={onSync}
      />
    );

    await user.type(screen.getByLabelText(/amount to add/i), '0');
    await user.click(screen.getByRole('button', { name: 'ADD' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(onSync).not.toHaveBeenCalled();
  });
});
