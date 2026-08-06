import { describe, it, expect, vi, beforeEach } from 'vitest';

const gmailFetch = vi.fn();
vi.mock('../../services/gmailAuth', () => ({
  gmailFetch: (path: string) => gmailFetch(path),
  isAuthorized: async () => true,
}));

import {
  pollSparkasse,
  readSparkassePending,
  resolveSparkasseItem,
  readSparkasseStatus,
} from '../../services/sparkasseCapture';

/**
 * Gmail is a NON-destructive source, which is the whole difficulty here. The
 * Advanzia listener hands over a capture once and forgets it; every poll of
 * Gmail sees the same mailbox again. Without the watermark and the seen-set,
 * dismissing an expense would simply bring it back next time you opened the app.
 */

const b64url = (s: string): string =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_');

const message = (id: string, lines: string[], subject: string, internalDate: string) => ({
  id,
  internalDate,
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'Kontowecker <noreply@kontowecker.de>' },
      { name: 'Subject', value: subject },
    ],
    parts: [
      {
        mimeType: 'multipart/related',
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: b64url(
                [
                  'auf dem Konto *8393 wurden folgende Umsätze verbucht:',
                  ...lines,
                  'Neuer Saldo: 614,93 EUR',
                ].join('\n'),
              ),
            },
          },
        ],
      },
    ],
  },
});

const respondWith = (messages: any[]) => {
  gmailFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/messages?')) {
      return { ok: true, json: async () => ({ messages: messages.map(m => ({ id: m.id })) }) };
    }
    const id = path.split('/messages/')[1]?.split('?')[0];
    const found = messages.find(m => m.id === id);
    return found
      ? { ok: true, json: async () => found }
      : { ok: false, status: 404, json: async () => ({}) };
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('pollSparkasse', () => {
  it('turns one email into one pending item', async () => {
    respondWith([message('m1', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(1);
    expect(pending[0].key).toBe('gmail:m1#0');
    expect(pending[0].line.amount).toBe(20);
  });

  it('turns one batch email into several items with distinct keys', async () => {
    respondWith([
      message(
        'm2',
        ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR'],
        'Ihr Umsatzwecker: 2 neue Umsätze',
        '1786027523000',
      ),
    ]);
    const pending = await pollSparkasse();
    expect(pending.map(p => p.key)).toEqual(['gmail:m2#0', 'gmail:m2#1']);
  });

  it('decodes an RFC 2047 subject so the batch passes the count check', async () => {
    respondWith([
      message(
        'm3',
        ['EDEKA: -20,00 EUR', 'STADTWERKE: -85,50 EUR'],
        '=?UTF-8?Q?Ihr_Umsatzwecker=3A_2_neue_Ums=C3=A4tze?=',
        '1786027523000',
      ),
    ]);
    const pending = await pollSparkasse();
    expect(pending.every(p => p.line.kind === 'clean')).toBe(true);
  });

  it('is idempotent — re-polling the same mail admits nothing new', async () => {
    respondWith([message('m4', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    const second = await pollSparkasse();
    expect(second).toHaveLength(1);
  });

  it('does not resurrect a dismissed item on the next poll', async () => {
    respondWith([message('m5', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    resolveSparkasseItem('gmail:m5#0');
    expect(readSparkassePending()).toHaveLength(0);

    await pollSparkasse();
    expect(readSparkassePending()).toHaveLength(0);
  });

  it('still admits a genuinely new mail after the watermark advances', async () => {
    respondWith([message('m6', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();

    respondWith([
      message('m6', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000'),
      message('m7', ['NETFLIX: -12,99 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786100000000'),
    ]);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(2);
    expect(pending.some(p => p.key === 'gmail:m7#0')).toBe(true);
  });

  it('queries with an overlap behind the watermark, not at it', async () => {
    respondWith([message('m8', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();
    await pollSparkasse();

    const listCall = gmailFetch.mock.calls.map(c => c[0]).filter(p => p.startsWith('/messages?')).pop()!;
    const after = Number(decodeURIComponent(listCall).match(/after:(\d+)/)![1]);
    // 3 days of slack, in seconds, because mail arrives late and out of order.
    expect(after).toBeLessThanOrEqual(1786027523 - 3 * 24 * 60 * 60 + 1);
  });

  it('records incoming and settlement items but marks them unaddable', async () => {
    respondWith([
      message('m9', ['ARBEITGEBER: +2.400,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000'),
    ]);
    const pending = await pollSparkasse();
    expect(pending[0].line.kind).toBe('incoming');
  });

  it('raises the suspicious flag on Kontowecker mail that fails the gate', async () => {
    respondWith([
      message('m10', ['irgendwas 12,34 EUR'], 'Ihr Saldowecker: Kontostand', '1786027523000'),
    ]);
    await pollSparkasse();
    expect(readSparkasseStatus().lastSuspiciousAt).toBeGreaterThan(0);
    expect(readSparkassePending()).toHaveLength(0);
  });

  it('returns the existing inbox untouched when Gmail is unreachable', async () => {
    respondWith([message('m11', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);
    await pollSparkasse();

    gmailFetch.mockResolvedValue(null);
    const pending = await pollSparkasse();
    expect(pending).toHaveLength(1);
  });

  it('does not advance the seen-set or watermark when the inbox write fails', async () => {
    respondWith([message('m12', ['EDEKA: -20,00 EUR'], 'Ihr Umsatzwecker: 1 neuer Umsatz', '1786027523000')]);

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'sparkasse.pending') {
        throw new Error('quota exceeded');
      }
      return originalSetItem(key, value);
    });

    try {
      await pollSparkasse();
      expect(localStorage.getItem('sparkasse.seen')).toBeNull();
      expect(localStorage.getItem('sparkasse.watermark')).toBeNull();
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
