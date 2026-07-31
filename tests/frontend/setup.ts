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
