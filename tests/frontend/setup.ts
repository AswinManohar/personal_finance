import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// recharts needs a real layout engine; stub each used export with a pass-through
// so calculator components render their (independently-asserted) summary numbers
// without a chart canvas. Vitest checks named ESM exports against real keys, so
// these must be explicit (a Proxy won't satisfy named imports).
vi.mock('recharts', () => {
  const Empty = ({ children }: any) => children ?? null;
  const names = [
    'ResponsiveContainer', 'AreaChart', 'Area', 'LineChart', 'Line',
    'BarChart', 'Bar', 'PieChart', 'Pie', 'Cell', 'RadialBarChart', 'RadialBar',
    'XAxis', 'YAxis', 'ZAxis', 'CartesianGrid', 'Tooltip', 'Legend',
    'ReferenceLine', 'ReferenceArea', 'Label', 'LabelList',
  ];
  const exports: Record<string, any> = { __esModule: true };
  for (const n of names) exports[n] = Empty;
  return exports;
});

// crypto.randomUUID is used by the expense form; ensure it exists in jsdom.
if (!globalThis.crypto?.randomUUID) {
  // @ts-ignore
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-' + Math.random().toString(36).slice(2) };
}
