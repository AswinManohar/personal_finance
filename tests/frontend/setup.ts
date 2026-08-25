import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The recharts stub that used to live here is gone: charts are now hand-rolled
// SVG in components/ui/charts.tsx, which renders fine under happy-dom. No
// component imports recharts any more, so the dependency itself is dead weight
// in package.json and can be dropped.

// There used to be a crypto.randomUUID polyfill here. It was removed because it
// was actively harmful: randomUUID is secure-context-only, so it is missing over
// a plain-HTTP LAN origin (how the app gets opened from a phone), and every add
// handler threw there. Polyfilling it globally meant the suite passed against
// code that could not run in the browser it was being tested from.
//
// Id generation now goes through utils/id.ts, which falls back to
// crypto.getRandomValues — not secure-context gated. See tests/frontend/id.test.ts.

// localStorage has to be installed by hand, and the reason is worth recording
// because the symptom points at the wrong thing.
//
// Node 22+ defines its own `localStorage` getter on globalThis, which returns
// undefined unless the process was started with --localstorage-file. Vitest 2's
// happy-dom adapter chooses what to copy off its Window with
//
//   if (k in global) return KEYS.includes(k);
//
// and its KEYS list predates that Node change. So `localStorage` now reads as
// "already global", is skipped, and Node's undefined stub is what tests get.
// Every test touching storage dies on `localStorage.clear()` — which looks like
// a broken test, not a broken environment.
//
// Reaching for happy-dom's own instance does not work either: vitest sets
// `window === globalThis`, so there is no Window object here to borrow one from.
// happy-dom exports the Storage class itself, so construct one — this is the
// same implementation the environment would have provided.
//
// Removable once vitest reaches v3, whose KEYS list includes localStorage.
import { Storage } from 'happy-dom';

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (globalThis as any)[key] === 'undefined') {
    Object.defineProperty(globalThis, key, {
      value: new Storage(),
      configurable: true,
      writable: true,
    });
  }
}
