import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The recharts stub that used to live here is gone: charts are now hand-rolled
// SVG in components/ui/charts.tsx, which renders fine under happy-dom. No
// component imports recharts any more, so the dependency itself is dead weight
// in package.json and can be dropped.

// crypto.randomUUID is used by the expense form; ensure it exists in jsdom.
if (!globalThis.crypto?.randomUUID) {
  // @ts-ignore
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-' + Math.random().toString(36).slice(2) };
}
