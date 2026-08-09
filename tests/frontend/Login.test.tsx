import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The Google button used to discard signInWithGoogle's result, so any failure —
 * missing client id, misconfigured OAuth client, no network — was invisible:
 * "I click on the google account login, but nothing happens."
 */

const { signInWithGoogle } = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../services/auth', () => ({ signInWithGoogle }));

import { Login } from '../../components/Login';

beforeEach(() => vi.clearAllMocks());

describe('Login error surfacing', () => {
  it('shows the failure instead of doing nothing', async () => {
    signInWithGoogle.mockResolvedValue({ error: new Error('VITE_GOOGLE_WEB_CLIENT_ID is not set.') });
    const user = userEvent.setup();
    render(<Login onGuestEnter={() => {}} />);

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/VITE_GOOGLE_WEB_CLIENT_ID/);
  });

  it('shows nothing on success', async () => {
    signInWithGoogle.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<Login onGuestEnter={() => {}} />);

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
