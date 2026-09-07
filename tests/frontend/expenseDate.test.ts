import { describe, it, expect } from 'vitest';
import {
  localYmd,
  ymdFromEpoch,
  startOfWeek,
  weekBuckets,
  inRange,
  resolveExpenseDate,
  berlinYmd,
  monthBounds,
} from '../../utils/expenseDate';

// A local Date built from calendar parts, so these tests describe wall-clock
// time rather than an instant and stay correct in whatever zone CI runs in.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('localYmd', () => {
  it('reads the calendar date, not the UTC date', () => {
    // 00:30 in Berlin is still the previous day in UTC. The whole bug.
    const instant = new Date('2026-08-23T22:30:00Z');
    expect(localYmd(instant, 'Europe/Berlin')).toBe('2026-08-24');
    expect(localYmd(instant, 'UTC')).toBe('2026-08-23');
  });

  it('formats zero-padded YYYY-MM-DD', () => {
    expect(localYmd(at(2026, 1, 5))).toBe('2026-01-05');
  });
});

describe('ymdFromEpoch', () => {
  it('files a notification captured at 00:30 Berlin under that day', () => {
    const epoch = Date.parse('2026-08-23T22:30:00Z'); // Berlin 2026-08-24 00:30
    expect(ymdFromEpoch(epoch, 'Europe/Berlin')).toBe('2026-08-24');
  });

  it('is the UTC day only when UTC is what was asked for', () => {
    const epoch = Date.parse('2026-08-23T22:30:00Z');
    expect(ymdFromEpoch(epoch, 'UTC')).toBe('2026-08-23');
  });
});

describe('startOfWeek', () => {
  it('returns the Monday of the containing week', () => {
    // 2026-08-24 is a Monday; 26th is the Wednesday after it.
    expect(localYmd(startOfWeek(at(2026, 8, 26)))).toBe('2026-08-24');
  });

  it('treats Monday as already the start', () => {
    expect(localYmd(startOfWeek(at(2026, 8, 24)))).toBe('2026-08-24');
  });

  it('puts Sunday at the END of its week, not the start', () => {
    // The Sunday before Mon 24th belongs to the week starting Mon 17th.
    expect(localYmd(startOfWeek(at(2026, 8, 23)))).toBe('2026-08-17');
  });

  it('zeroes the time so it cannot drag a time-of-day into comparisons', () => {
    const s = startOfWeek(at(2026, 8, 26, 18, 31));
    expect([s.getHours(), s.getMinutes(), s.getSeconds(), s.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });
});

describe('weekBuckets', () => {
  it('returns n contiguous Monday-to-Sunday weeks, most recent last', () => {
    const weeks = weekBuckets(at(2026, 8, 24), 4);
    expect(weeks.map(w => [w.start, w.end])).toEqual([
      ['2026-08-03', '2026-08-09'],
      ['2026-08-10', '2026-08-16'],
      ['2026-08-17', '2026-08-23'],
      ['2026-08-24', '2026-08-30'],
    ]);
  });

  it('spans exactly 7 days per bucket — the shipped version counted 6', () => {
    for (const w of weekBuckets(at(2026, 8, 24), 4)) {
      const days = (Date.parse(w.end) - Date.parse(w.start)) / 86400000;
      expect(days).toBe(6); // inclusive bounds: 6 whole days between = 7 days
    }
  });

  it('still spans exactly 7 days across the DST change', () => {
    // Europe/Berlin leaves CEST on 2026-10-25. A week built with local
    // setDate arithmetic must not gain or lose an hour-induced day.
    for (const w of weekBuckets(at(2026, 10, 28), 4)) {
      const days = (Date.parse(w.end) - Date.parse(w.start)) / 86400000;
      expect(days).toBe(6);
    }
  });

  it('marks only the week containing `now` as current', () => {
    const weeks = weekBuckets(at(2026, 8, 24), 4);
    expect(weeks.map(w => w.isCurrent)).toEqual([false, false, false, true]);
  });

  it('on a Monday, this week starts today — not six days ago', () => {
    const weeks = weekBuckets(at(2026, 8, 24), 4);
    const current = weeks[weeks.length - 1];
    expect(current.start).toBe('2026-08-24');
  });
});

describe('inRange', () => {
  it('includes both bounds', () => {
    expect(inRange('2026-08-17', '2026-08-17', '2026-08-23')).toBe(true);
    expect(inRange('2026-08-23', '2026-08-17', '2026-08-23')).toBe(true);
  });

  it('excludes the day either side', () => {
    expect(inRange('2026-08-16', '2026-08-17', '2026-08-23')).toBe(false);
    expect(inRange('2026-08-24', '2026-08-17', '2026-08-23')).toBe(false);
  });
});

describe('resolveExpenseDate', () => {
  it('trusts the date column verbatim when present', () => {
    expect(resolveExpenseDate({ date: '2026-08-24', created_at: '2020-01-01T00:00:00Z' }))
      .toBe('2026-08-24');
  });

  it('derives the BERLIN date from created_at when date is absent', () => {
    expect(resolveExpenseDate({ created_at: '2026-08-23T22:30:00Z' })).toBe('2026-08-24');
  });

  it('keeps a legacy UTC-midnight row on its own day', () => {
    expect(resolveExpenseDate({ created_at: '2026-08-24T00:00:00.000Z' })).toBe('2026-08-24');
  });

  it('falls back to today rather than throwing on an unparseable created_at', () => {
    expect(resolveExpenseDate({ created_at: 'not a date' })).toBe(localYmd(new Date()));
  });

  it('falls back to today when the row carries neither field', () => {
    expect(resolveExpenseDate({})).toBe(localYmd(new Date()));
  });

  it('ignores an empty-string date rather than returning it', () => {
    expect(resolveExpenseDate({ date: '', created_at: '2026-08-23T22:30:00Z' })).toBe('2026-08-24');
  });
});

describe('berlinYmd', () => {
  it('reads a captured instant in Europe/Berlin, whatever the device zone says', () => {
    // 22:30Z on June 1 is already June 2 in Berlin. A phone set to another
    // zone (travelling, or an emulator on UTC) prefilled the review sheet with
    // the device's day, and that day was saved verbatim as `date`.
    expect(berlinYmd(Date.UTC(2026, 5, 1, 22, 30))).toBe('2026-06-02');
    expect(berlinYmd(Date.UTC(2026, 0, 31, 23, 30))).toBe('2026-02-01');
  });
});

describe('monthBounds', () => {
  it('spans the first to the last day of the calendar month', () => {
    expect(monthBounds(at(2026, 9, 15))).toEqual({ lo: '2026-09-01', hi: '2026-09-30' });
  });

  it('handles January and a 31-day month', () => {
    expect(monthBounds(at(2026, 1, 3))).toEqual({ lo: '2026-01-01', hi: '2026-01-31' });
    expect(monthBounds(at(2026, 7, 31, 23, 59))).toEqual({ lo: '2026-07-01', hi: '2026-07-31' });
  });

  it('is a February that knows about leap years', () => {
    expect(monthBounds(at(2028, 2, 10))).toEqual({ lo: '2028-02-01', hi: '2028-02-29' });
  });
});
