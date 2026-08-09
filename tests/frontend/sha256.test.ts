import { describe, it, expect, afterEach } from 'vitest';
import { sha256Hex, __sha256Software } from '../../utils/sha256';

/**
 * The token hash has to match the backend's hash_integration_token() exactly, so
 * the software fallback is worthless unless it is byte-identical to WebCrypto.
 * These check it against published vectors and against crypto.subtle directly.
 */

const realCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: realCrypto,
    configurable: true,
    writable: true,
  });
});

// FIPS 180-2 / NIST published values.
const VECTORS: [string, string][] = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
];

describe('sha256 software fallback', () => {
  it.each(VECTORS)('matches the published digest for %j', (input, expected) => {
    expect(__sha256Software(input)).toBe(expected);
  });

  it('handles input that lands exactly on a block boundary', () => {
    // 56 bytes is the worst case: the length field no longer fits in the block,
    // forcing an extra one. Off-by-one padding bugs show up here or nowhere.
    for (const len of [55, 56, 57, 63, 64, 65, 119, 120, 128]) {
      const input = 'a'.repeat(len);
      expect(__sha256Software(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it.each([55, 56, 63, 64, 65, 200])(
    'agrees with crypto.subtle on a %i-byte input',
    async len => {
      const input = 'x'.repeat(len);
      const viaWebCrypto = await sha256Hex(input);
      expect(__sha256Software(input)).toBe(viaWebCrypto);
    }
  );

  it('agrees with crypto.subtle on a realistic token', async () => {
    const token = 'ff_live_' + 'a1b2c3d4e5f6'.repeat(3);
    expect(__sha256Software(token)).toBe(await sha256Hex(token));
  });

  it('hashes non-ASCII the same way (UTF-8 bytes, not code units)', async () => {
    const input = 'Kaffee €12,34 — Straße';
    expect(__sha256Software(input)).toBe(await sha256Hex(input));
  });
});

describe('sha256Hex', () => {
  it('still works when crypto.subtle is missing (plain-HTTP origin)', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
      configurable: true,
      writable: true,
    });

    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('still works when crypto is absent entirely', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});
