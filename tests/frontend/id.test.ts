import { describe, it, expect, afterEach } from 'vitest';
import { newId } from '../../utils/id';

/**
 * Regression tests for a bug that lost every "add" on a phone.
 *
 * `crypto.randomUUID()` is a secure-context-only API. Over a plain-HTTP LAN
 * origin — http://192.168.x.x:5173, exactly how the app gets tested from a
 * phone — it is undefined, so every add handler threw
 * `TypeError: crypto.randomUUID is not a function` before it could call
 * setState, and the row silently never appeared.
 *
 * The old test setup polyfilled randomUUID onto globalThis, which meant the
 * whole suite passed against code that could not run in the browser it was
 * being tested from. These tests deliberately take the API away instead.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: realCrypto,
    configurable: true,
    writable: true,
  });
});

/** Replace globalThis.crypto for one test. */
const withCrypto = (value: unknown) => {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
};

describe('newId', () => {
  it('produces a v4 uuid in a normal secure context', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('still produces a v4 uuid when randomUUID is missing (plain-HTTP origin)', () => {
    // getRandomValues is NOT secure-context gated, so it survives where
    // randomUUID does not. This is the case that was crashing.
    withCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    expect(newId()).toMatch(UUID_V4);
  });

  it('still produces an id when the whole crypto object is missing', () => {
    withCrypto(undefined);
    expect(newId()).toMatch(UUID_V4);
  });

  it('does not repeat itself', () => {
    withCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });

  it('uses crypto.randomUUID when it is available', () => {
    withCrypto({ randomUUID: () => '11111111-2222-4333-8444-555555555555' });
    expect(newId()).toBe('11111111-2222-4333-8444-555555555555');
  });
});
