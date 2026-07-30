import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/supabaseService', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'jwt-123' } },
      }),
    },
  },
}));

import { reviewStatement, importTransaction } from '../../services/statementReview';

const tx = { date: '2026-06-01', description: 'REWE', amount: 54.3,
             category: 'Food', direction: 'debit' as const };

describe('reviewStatement', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [tx] }),
    }) as any;
  });

  it('POSTs multipart form with bearer token', async () => {
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await reviewStatement(file, true, 'bank');
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/statements/review');
    expect(init.headers.Authorization).toBe('Bearer jwt-123');
    const form = init.body as FormData;
    expect(form.get('redact')).toBe('true');
    expect(form.get('statement_type')).toBe('bank');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('surfaces the backend error message', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false, status: 422,
      json: async () => ({ detail: { code: 'PDF_UNREADABLE', message: 'no text layer' } }),
    });
    const file = new File([new Uint8Array([1])], 'stmt.pdf', { type: 'application/pdf' });
    await expect(reviewStatement(file, true, 'bank')).rejects.toThrow('no text layer');
  });
});

describe('importTransaction', () => {
  it('POSTs the mapped expense to /api/expenses/', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
    await importTransaction(tx);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/expenses/');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ name: 'REWE', amount: 54.3, category: 'Food',
                                 created_at: '2026-06-01' });
  });
});
