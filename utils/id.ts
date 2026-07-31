/**
 * Generates the client-side ids for expenses, loans, holdings and imported rows.
 *
 * Exists because `crypto.randomUUID()` is a **secure-context-only** API. Served
 * over a plain-HTTP LAN origin — `http://192.168.x.x:5173`, which is how the app
 * gets opened from a phone during development — it is simply not defined, and
 * every add handler threw `TypeError: crypto.randomUUID is not a function`
 * before reaching setState. The row never appeared and nothing surfaced in the
 * UI to say why.
 *
 * `crypto.getRandomValues()` is *not* secure-context gated, so it is available
 * in exactly the places `randomUUID` is not, and is the right fallback.
 *
 * Contexts this has to work in:
 *   - https (Railway) and localhost dev  → randomUUID
 *   - Capacitor WebView (androidScheme https) → randomUUID
 *   - plain-HTTP LAN IP                  → getRandomValues
 */

/** RFC 4122 version 4, formatted from 16 random bytes. */
const format = (bytes: Uint8Array): string => {
  // Version and variant bits, per RFC 4122 §4.4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20, 32)
  );
};

export const newId = (): string => {
  const c: Crypto | undefined = globalThis.crypto;

  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
    return format(bytes);
  }

  // Last resort. Not cryptographically strong, but these ids only have to be
  // unique within one user's data, and the alternative is throwing.
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return format(bytes);
};
