# Savings Goal From Tracked Assets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the typed `goal.currentSavings` with a sum over per-asset toggles, and make Net Worth read cash from `accumulatedSavings` instead of from the goal.

**Architecture:** One `assetBreakdown()` helper in `utils/finance.ts` becomes the single definition of "what do I own", consumed by `SavingsDashboard`, `NetWorth` and `SavingsGoal`. `SavingsGoal` gains a `sources?: GoalSource[]` list; absent means all five, so goals synced from older devices need no migration. The legacy typed figure is copied into `accumulatedSavings` only when that field is empty, then cleared.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, Tailwind utility classes, local `components/ui` design system.

**Spec:** `docs/superpowers/specs/2026-08-06-savings-goal-from-assets-design.md`

## Global Constraints

- Run tests with `npx vitest run <path>`. The whole suite is `npm test`.
- `SavingsDashboard.test.tsx`, `EmergencyFund.test.tsx`, `Subscriptions.test.tsx` and `silentFailures.test.tsx` must pass **unmodified** throughout. If a change to `SavingsDashboard` requires editing them, the change is wrong.
- `NetWorthLiabilities.test.tsx` is the one existing test file this plan edits, in Task 3, because the prop it passes ceases to exist.
- Money is formatted `€` + `toLocaleString('en-US', …)`. Never introduce a second format.
- Every number entering an aggregate passes through `num()` from `utils/finance`. A single `undefined` must never render as `€NaN`.
- Stock value is `quantity * (currentPrice || buyPrice)`. `||`, never `??` — a `currentPrice` of 0 means "never fetched" in this codebase.
- Screens import UI only from `./ui`, never from `./ui/primitives` etc.
- Commit messages: lowercase conventional prefix, then a sentence saying what changed and why. End every commit with `Co-Authored-By: AswinManohar <aswinbio@gmail.com>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `types.ts` | `GoalSource` union; `SavingsGoal` gains `sources?`, deprecates `currentSavings` | 1, 4 |
| `utils/finance.ts` | `AssetBreakdown`, `ALL_GOAL_SOURCES`, `assetBreakdown`, `totalAssets`, `goalSavings` | 1 |
| `components/SavingsDashboard.tsx` | Consumes the helper; behaviour unchanged | 2 |
| `components/NetWorth.tsx` | Consumes the helper; cash stops coming from the goal | 3 |
| `components/SavingsGoal.tsx` | Derived saved-so-far, source toggles, forecast, projection | 4, 5 |
| `App.tsx` | `breakdown` memo for the goal screen; prop wiring; legacy migration | 3, 4, 5, 6 |
| `tests/frontend/finance.test.ts` | Unit tests for the helper | 1 |
| `tests/frontend/NetWorthAssets.test.tsx` | Net worth reads cash from `accumulatedSavings` | 3 |
| `tests/frontend/SavingsGoal.test.tsx` | Derivation, toggles, verdicts, projection | 4, 5 |
| `tests/frontend/goalMigration.test.tsx` | Legacy `currentSavings` rescue and clearing | 6 |

---

### Task 1: The `assetBreakdown` helper

**Files:**
- Modify: `types.ts` (append after the `SavingsGoal` interface, around line 40)
- Modify: `utils/finance.ts` (append at end of file)
- Test: `tests/frontend/finance.test.ts` (append)

**Interfaces:**
- Consumes: `num` from `utils/finance`; `NetWorthState`, `Stock`, `PortfolioAsset` from `types`.
- Produces:
  - `type GoalSource = 'cash' | 'stocks' | 'mutualFunds' | 'gold' | 'other'`
  - `interface AssetBreakdown { cash: number; stocks: number; mutualFunds: number; gold: number; other: number }`
  - `const ALL_GOAL_SOURCES: GoalSource[]`
  - `assetBreakdown(netWorthData?: Partial<NetWorthState>, stocks?: Stock[], portfolio?: PortfolioAsset[]): AssetBreakdown`
  - `totalAssets(b: AssetBreakdown): number`
  - `goalSavings(b: AssetBreakdown, sources?: GoalSource[]): number`

- [ ] **Step 1: Write the failing tests**

Append to `tests/frontend/finance.test.ts`. Also extend the existing import block at the top of that file to include the four new names.

```ts
// --- add to the existing import from '../../types' ---
// import { Expense, ExpenseCategory, Loan, Stock, PortfolioAsset, NetWorthState } from '../../types';
// --- add to the existing import from '../../utils/finance' ---
// assetBreakdown, totalAssets, goalSavings, ALL_GOAL_SOURCES,

const stock = (over: Partial<Stock>): Stock => ({
  id: 's', symbol: 'X', quantity: 0, buyPrice: 0, frequency: 'One-time', ...over,
});

const fund = (over: Partial<PortfolioAsset>): PortfolioAsset => ({
  id: 'p', name: 'f', type: 'ETF_GLOBAL', currentValue: 0, monthlyInvestment: 0,
  expectedReturn: 0, expenseRatio: 0, taxRate: 0, frequency: 'Monthly', ...over,
});

const nw = (over: Partial<NetWorthState>): Partial<NetWorthState> => ({ ...over });

describe('assetBreakdown', () => {
  it('maps each tracked asset onto its own slice', () => {
    const b = assetBreakdown(
      nw({ accumulatedSavings: 12000, goldInvestment: 5000, otherAssets: 2000 }),
      [stock({ quantity: 10, buyPrice: 100, currentPrice: 830 })],
      [fund({ currentValue: 15000 })]
    );
    expect(b).toEqual({ cash: 12000, stocks: 8300, mutualFunds: 15000, gold: 5000, other: 2000 });
  });

  it('falls back to buyPrice when currentPrice is 0 (never fetched, not worthless)', () => {
    const b = assetBreakdown({}, [stock({ quantity: 4, buyPrice: 25, currentPrice: 0 })], []);
    expect(b.stocks).toBe(100);
  });

  it('yields zeros, never NaN, for a partial netWorthData from a cloud pull', () => {
    const b = assetBreakdown({ accumulatedSavings: 300 }, [], []);
    expect(b).toEqual({ cash: 300, stocks: 0, mutualFunds: 0, gold: 0, other: 0 });
    expect(Object.values(b).some(Number.isNaN)).toBe(false);
  });

  it('survives undefined inputs entirely', () => {
    expect(assetBreakdown(undefined)).toEqual({
      cash: 0, stocks: 0, mutualFunds: 0, gold: 0, other: 0,
    });
  });
});

describe('totalAssets', () => {
  it('sums all five slices', () => {
    expect(totalAssets({ cash: 12000, stocks: 8300, mutualFunds: 15000, gold: 5000, other: 2000 }))
      .toBe(42300);
  });
});

describe('goalSavings', () => {
  const b = { cash: 12000, stocks: 8300, mutualFunds: 15000, gold: 5000, other: 2000 };

  it('counts every source when sources is absent', () => {
    expect(goalSavings(b, undefined)).toBe(42300);
    expect(goalSavings(b, ALL_GOAL_SOURCES)).toBe(42300);
  });

  it('counts nothing when the list is empty', () => {
    expect(goalSavings(b, [])).toBe(0);
  });

  it('counts only the ticked sources', () => {
    expect(goalSavings(b, ['cash', 'gold'])).toBe(17000);
    expect(goalSavings(b, ['stocks'])).toBe(8300);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: FAIL — `assetBreakdown is not a function` (or a TS resolution error on the new imports).

- [ ] **Step 3: Add `GoalSource` to `types.ts`**

Insert immediately after the `SavingsGoal` interface (currently ends at line 40):

```ts
/** A tracked asset line that a savings goal can count toward its progress. */
export type GoalSource = 'cash' | 'stocks' | 'mutualFunds' | 'gold' | 'other';
```

- [ ] **Step 4: Add the helper to `utils/finance.ts`**

Extend the existing top-of-file import to `import { Expense, GoalSource, Loan, NetWorthState, PortfolioAsset, RecurringFrequency, Stock } from '../types';`, then append at the end of the file:

```ts
/**
 * What you own, one slice per tracked asset line.
 *
 * The single definition of the asset side in this app. Net Worth and the Savings
 * Hub each used to sum this themselves, and they disagreed: the Hub read cash
 * from `accumulatedSavings` while Net Worth read it from `goal.currentSavings`.
 */
export interface AssetBreakdown {
  cash: number;
  stocks: number;
  mutualFunds: number;
  gold: number;
  other: number;
}

/** Canonical order — display order and the meaning of an absent `sources`. */
export const ALL_GOAL_SOURCES: GoalSource[] = ['cash', 'stocks', 'mutualFunds', 'gold', 'other'];

export const assetBreakdown = (
  netWorthData?: Partial<NetWorthState>,
  stocks: Stock[] = [],
  portfolio: PortfolioAsset[] = []
): AssetBreakdown => ({
  cash: num(netWorthData?.accumulatedSavings),
  // `||` not `??`: a currentPrice of 0 means "never fetched", not "worthless".
  stocks: stocks.reduce((s, x) => s + num(x.quantity) * num(x.currentPrice || x.buyPrice), 0),
  mutualFunds: portfolio.reduce((s, p) => s + num(p.currentValue), 0),
  gold: num(netWorthData?.goldInvestment),
  other: num(netWorthData?.otherAssets),
});

export const totalAssets = (b: AssetBreakdown): number =>
  b.cash + b.stocks + b.mutualFunds + b.gold + b.other;

/**
 * Saved-so-far for a goal: the slices it counts.
 *
 * An absent `sources` means all of them, so a goal synced from a device that
 * predates the field reads as "everything" without a migration.
 */
export const goalSavings = (b: AssetBreakdown, sources?: GoalSource[]): number =>
  (sources ?? ALL_GOAL_SOURCES).reduce((sum, k) => sum + b[k], 0);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: PASS, including the pre-existing loan and expense suites.

- [ ] **Step 6: Commit**

```bash
git add types.ts utils/finance.ts tests/frontend/finance.test.ts
git commit -m "$(cat <<'EOF'
feat: one definition of what you own, in finance.ts

Net Worth summed the asset side itself and so did the Savings Hub, and they
disagreed about cash. assetBreakdown is the single answer both will read.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

### Task 2: Savings Hub reads the helper

Pure refactor. The rendered numbers must not move — the existing test files are the proof.

**Files:**
- Modify: `components/SavingsDashboard.tsx:37-42` (delete local `num`), `:44-58` (asset sums), `:91` (total)

**Interfaces:**
- Consumes: `assetBreakdown`, `totalAssets`, `num` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Confirm the regression tests pass before touching anything**

Run: `npx vitest run tests/frontend/SavingsDashboard.test.tsx tests/frontend/EmergencyFund.test.tsx tests/frontend/Subscriptions.test.tsx tests/frontend/silentFailures.test.tsx`
Expected: PASS. This is the baseline; the same command must pass after Step 3 with these files untouched.

- [ ] **Step 2: Swap the import line**

Replace line 4:

```ts
import { assetBreakdown, monthlyAmount, num, totalAssets as sumAssets } from '../utils/finance';
```

`sumAssets` is aliased because the component already has a local `totalAssets` const at line 91 that stays.

- [ ] **Step 3: Replace the local `num` and the five sums**

Delete lines 37-51 (the local `num` helper and the `stockValue` / `portfolioValue` memos) and lines 55-58 (the four scalars), and put this in their place:

```ts
  // One breakdown, shared with Net Worth and the Goal screen. Memoized because
  // the stock and fund sums walk arrays on every keystroke otherwise.
  const breakdown = useMemo(
    () => assetBreakdown(netWorthData, stocks, portfolio),
    [netWorthData, stocks, portfolio]
  );
  const {
    cash, gold, stocks: stockValue, mutualFunds: portfolioValue, other: otherAssets,
  } = breakdown;
  const monthlySavings = num(netWorthData.monthlyRecurringSavings);
```

- [ ] **Step 4: Replace the total at line 91**

```ts
  const totalAssets = sumAssets(breakdown);
```

- [ ] **Step 5: Run the regression tests, unmodified**

Run: `npx vitest run tests/frontend/SavingsDashboard.test.tsx tests/frontend/EmergencyFund.test.tsx tests/frontend/Subscriptions.test.tsx tests/frontend/silentFailures.test.tsx`
Expected: PASS, with no edits to any of those four files. If one fails, the refactor changed behaviour — fix the component, not the test.

- [ ] **Step 6: Commit**

```bash
git add components/SavingsDashboard.tsx
git commit -m "$(cat <<'EOF'
refactor: the Savings Hub adds up assets via the shared helper

Same numbers, one fewer place that decides what an asset is. Its four test
files pass unmodified, which is the proof.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

### Task 3: Net worth stops reading the goal

The behaviour change. Net Worth's cash line becomes `accumulatedSavings`.

**Files:**
- Modify: `components/NetWorth.tsx:1` (import `useMemo`), `:9` (imports), `:11-25` (props), `:31-34` (sums), `:62` (snapshot), `:122-126` (asset row)
- Modify: `App.tsx:463` (stop passing `currentSavings`)
- Modify: `tests/frontend/NetWorthLiabilities.test.tsx` (the prop it passes no longer exists)
- Test: `tests/frontend/NetWorthAssets.test.tsx` (create)

**Interfaces:**
- Consumes: `assetBreakdown`, `totalAssets` from Task 1.
- Produces: `NetWorthProps` without `currentSavings`.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/NetWorthAssets.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NetWorth } from '../../components/NetWorth';
import { NetWorthState, Stock } from '../../types';

const base: NetWorthState = {
  goldInvestment: 0, otherAssets: 0, remainingLoan: 0,
  monthlyRecurringSavings: 0, accumulatedSavings: 0,
};

const renderNetWorth = (over: Partial<NetWorthState> = {}, stocks: Stock[] = []) =>
  render(
    <NetWorth
      netWorthData={{ ...base, ...over }} setNetWorthData={() => {}}
      stocks={stocks} portfolio={[]}
      history={[]} setHistory={() => {}} loans={[]}
    />
  );

describe('Net worth asset side', () => {
  it('takes cash from accumulatedSavings', () => {
    renderNetWorth({ accumulatedSavings: 12000 });
    expect(document.body.textContent).toContain('12,000');
  });

  it('sums every tracked asset line', () => {
    renderNetWorth(
      { accumulatedSavings: 12000, goldInvestment: 5000, otherAssets: 2000 },
      [{ id: 's', symbol: 'X', quantity: 10, buyPrice: 100, currentPrice: 830, frequency: 'One-time' }]
    );
    // 12,000 + 5,000 + 2,000 + 8,300
    expect(document.body.textContent).toContain('27,300');
  });

  it('renders no NaN when the cloud hands back a partial netWorthData', () => {
    render(
      <NetWorth
        netWorthData={{ accumulatedSavings: 500 } as NetWorthState} setNetWorthData={() => {}}
        stocks={[]} portfolio={[]}
        history={[]} setHistory={() => {}} loans={[]}
      />
    );
    expect(document.body.textContent).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/frontend/NetWorthAssets.test.tsx`
Expected: FAIL — TypeScript reports the required `currentSavings` prop is missing, and the €27,300 assertion does not match.

- [ ] **Step 3: Rewrite the component's asset side**

Line 1 becomes `import React, { useMemo, useState } from 'react';`

Line 9 becomes `import { assetBreakdown, num, totalAssets as sumAssets, totalLoanBalance } from '../utils/finance';`

Delete `currentSavings: number;` from the props interface (line 14) and `currentSavings,` from the destructure (line 25).

Replace lines 31-34 with:

```ts
  const breakdown = useMemo(
    () => assetBreakdown(netWorthData, stocks, portfolio),
    [netWorthData, stocks, portfolio]
  );
  const { cash, stocks: stockValue, mutualFunds: portfolioValue } = breakdown;

  const totalAssets = sumAssets(breakdown);
```

Line 62 becomes `savings_amount: cash,`

Lines 122-126 become:

```ts
    cash > 0 && {
      icon: 'account_balance_wallet',
      name: 'Cash & Savings',
      subtitle: 'Liquid savings',
      value: cash,
```

- [ ] **Step 4: Stop passing the prop from `App.tsx`**

At line 463, delete `currentSavings={goal.currentSavings}` from the `<NetWorth …>` element. Leave every other prop alone.

- [ ] **Step 5: Update the one existing test that passes the dead prop**

In `tests/frontend/NetWorthLiabilities.test.tsx`, both render calls pass `currentSavings={1000}` alongside `accumulatedSavings: 0`. Move the figure to the field that now holds it — the assertions stay exactly as they are.

```tsx
const nw: NetWorthState = { goldInvestment: 0, otherAssets: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 1000 };
```

and delete `currentSavings={1000}` from both `<NetWorth …>` elements (lines 14 and 33).

- [ ] **Step 6: Run both files to verify they pass**

Run: `npx vitest run tests/frontend/NetWorthAssets.test.tsx tests/frontend/NetWorthLiabilities.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/NetWorth.tsx App.tsx tests/frontend/NetWorthAssets.test.tsx tests/frontend/NetWorthLiabilities.test.tsx
git commit -m "$(cat <<'EOF'
fix: net worth counts your cash, not your savings goal

NetWorth read goal.currentSavings as its cash line while the Savings Hub read
accumulatedSavings, so whichever screen you touched last decided which total was
right. Both now read the same field.

Snapshots record breakdown.cash from here on; rows already stored are untouched
and mean the older thing.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

### Task 4: Saved-so-far becomes derived, with per-asset toggles

**Files:**
- Modify: `types.ts` (`SavingsGoal` interface, line 36-40)
- Modify: `components/SavingsGoal.tsx:1-54` (props, derivation), `:118-136` (the saved-so-far field), insert after `:146`
- Modify: `App.tsx:100` (default), `:462` (props)
- Test: `tests/frontend/SavingsGoal.test.tsx` (create)

**Interfaces:**
- Consumes: `AssetBreakdown`, `ALL_GOAL_SOURCES`, `goalSavings`, `num` from Task 1.
- Produces: `SavingsGoalProps { goal, setGoal, breakdown: AssetBreakdown, monthlySavings: number, onNavigate?: (tab: ActiveTab) => void, onSync? }`. Task 5 adds behaviour to the same component and uses `monthlySavings`, `remaining`, `monthsLeft` and `monthlyNeeded` from this task.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/SavingsGoal.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavingsGoal } from '../../components/SavingsGoal';
import { SavingsGoal as SavingsGoalType } from '../../types';
import { AssetBreakdown } from '../../utils/finance';

const breakdown: AssetBreakdown = {
  cash: 12000, stocks: 8300, mutualFunds: 15000, gold: 5000, other: 2000,
};

const baseGoal: SavingsGoalType = {
  targetAmount: 25000,
  targetDate: '2027-08-01',
};

const renderGoal = (over: Partial<SavingsGoalType> = {}, monthlySavings = 0) => {
  const setGoal = vi.fn();
  const onSync = vi.fn(async () => {});
  render(
    <SavingsGoal
      goal={{ ...baseGoal, ...over }}
      setGoal={setGoal}
      breakdown={breakdown}
      monthlySavings={monthlySavings}
      onSync={onSync}
      onNavigate={() => {}}
    />
  );
  return { setGoal, onSync };
};

describe('Saved so far is derived from tracked assets', () => {
  it('counts every asset when no sources are stored', () => {
    renderGoal();
    expect(document.body.textContent).toContain('€42,300');
    expect(document.body.textContent).toContain('from all tracked assets');
  });

  it('counts only the ticked sources', () => {
    renderGoal({ sources: ['cash', 'gold'] });
    expect(document.body.textContent).toContain('€17,000');
    expect(document.body.textContent).toContain('from Cash, Gold');
  });

  it('reads zero, not NaN, when nothing is ticked', () => {
    renderGoal({ sources: [] });
    expect(document.body.textContent).toContain('no assets selected');
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('offers no input for the figure — it is owned elsewhere', () => {
    renderGoal();
    expect(screen.queryByLabelText('Saved so far')).toBeNull();
  });

  it('shows progress against the target from the derived figure', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] });
    // 12,000 / 50,000
    expect(document.body.textContent).toContain('24.0%');
  });
});

describe('Choosing which assets count', () => {
  it('lists every source with its current value', () => {
    renderGoal();
    expect((screen.getByLabelText('Cash') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Mutual funds') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain('€15,000');
  });

  it('unticking a source writes the remaining list and syncs it', () => {
    const { setGoal, onSync } = renderGoal({ sources: ['cash', 'gold'] });
    fireEvent.click(screen.getByLabelText('Gold'));
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, sources: ['cash'] });
    expect(onSync).toHaveBeenCalledWith({ goal: { ...baseGoal, sources: ['cash'] } });
  });

  it('ticking a source keeps the canonical order, not click order', () => {
    const { setGoal } = renderGoal({ sources: ['gold'] });
    fireEvent.click(screen.getByLabelText('Cash'));
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, sources: ['cash', 'gold'] });
  });

  it('materialises the full list when unticking one of an absent sources field', () => {
    const { setGoal } = renderGoal();
    fireEvent.click(screen.getByLabelText('Stocks'));
    expect(setGoal).toHaveBeenCalledWith({
      ...baseGoal, sources: ['cash', 'mutualFunds', 'gold', 'other'],
    });
  });
});

describe('Target and deadline are still editable', () => {
  it('syncs a new target amount', () => {
    const { setGoal, onSync } = renderGoal();
    fireEvent.click(screen.getByText('Edit Goal'));
    fireEvent.change(screen.getByLabelText('Target amount'), { target: { value: '30000' } });
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, targetAmount: 30000 });
    expect(onSync).toHaveBeenCalledWith({ goal: { ...baseGoal, targetAmount: 30000 } });
  });

  it('syncs a new deadline', () => {
    const { setGoal } = renderGoal();
    fireEvent.click(screen.getByText('Edit Goal'));
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2028-01-01' } });
    expect(setGoal).toHaveBeenCalledWith({ ...baseGoal, targetDate: '2028-01-01' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/frontend/SavingsGoal.test.tsx`
Expected: FAIL — the component still requires `currentSavings` on the goal and renders a "Saved so far" input.

- [ ] **Step 3: Update `SavingsGoal` in `types.ts`**

Replace the interface at lines 36-40:

```ts
export interface SavingsGoal {
  targetAmount: number;
  targetDate: string; // ISO date string
  /**
   * Which tracked assets count toward this goal. Absent means all of them, so a
   * goal synced from a device that predates this field needs no migration.
   */
  sources?: GoalSource[];
  /**
   * @deprecated Was the hand-typed "saved so far". Read once by the migration in
   * App.tsx, then cleared. Never displayed.
   */
  currentSavings?: number;
}
```

- [ ] **Step 4: Rewrite the top of `components/SavingsGoal.tsx`**

Replace lines 1-54 — imports through the old `remaining` const, i.e. everything above the `deadlineLabel` at line 56 — with:

```tsx
import React, { useMemo, useState } from 'react';
import { ActiveTab, GoalSource, SavingsGoal as SavingsGoalType } from '../types';
import {
  ALL_GOAL_SOURCES, AssetBreakdown, goalSavings, num,
} from '../utils/finance';
import {
  AxisLabels, Card, ColumnChart, FieldLabel, Input, PrimaryButton, ProgressBar, ScreenTitle,
} from './ui';

interface SavingsGoalProps {
  goal: SavingsGoalType;
  setGoal: React.Dispatch<React.SetStateAction<SavingsGoalType>>;
  /** What you own, per asset line. The goal counts the slices it is pointed at. */
  breakdown: AssetBreakdown;
  /** netWorthData.monthlyRecurringSavings — what you actually put aside. */
  monthlySavings: number;
  /** Saved-so-far links out to where the underlying figures are edited. */
  onNavigate?: (tab: ActiveTab) => void;
  onSync?: (overrides?: any) => Promise<void>;
}

const SOURCE_LABELS: Record<GoalSource, string> = {
  cash: 'Cash',
  stocks: 'Stocks',
  mutualFunds: 'Mutual funds',
  gold: 'Gold',
  other: 'Other assets',
};

export const SavingsGoal: React.FC<SavingsGoalProps> = ({
  goal, setGoal, breakdown, monthlySavings, onNavigate, onSync,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const activeSources = goal.sources ?? ALL_GOAL_SOURCES;
  const saved = goalSavings(breakdown, goal.sources);

  // Months from today to the deadline. Floored at zero: a passed deadline is
  // handled by its own verdict, not by a negative month count.
  const monthsLeft = useMemo(() => {
    if (!goal.targetDate) return 0;
    const target = new Date(goal.targetDate);
    const today = new Date();
    let months = (target.getFullYear() - today.getFullYear()) * 12;
    months -= today.getMonth();
    months += target.getMonth();
    return Math.max(0, months);
  }, [goal.targetDate]);

  const targetAmount = num(goal.targetAmount);
  const remaining = Math.max(0, targetAmount - saved);
  const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : 0;

  const handleChange = (field: 'targetAmount' | 'targetDate', value: string | number) => {
    const newState = { ...goal, [field]: value };
    setGoal(newState);
    if (onSync) {
      onSync({ goal: newState });
    }
  };

  const toggleSource = (key: GoalSource) => {
    // Rebuilt from ALL_GOAL_SOURCES so the stored list keeps display order
    // rather than the order the boxes happened to be clicked in.
    const next = ALL_GOAL_SOURCES.filter(k =>
      k === key ? !activeSources.includes(k) : activeSources.includes(k)
    );
    const newState = { ...goal, sources: next };
    setGoal(newState);
    if (onSync) {
      onSync({ goal: newState });
    }
  };

  const sourceCaption =
    activeSources.length === 0
      ? 'no assets selected'
      : activeSources.length === ALL_GOAL_SOURCES.length
        ? 'from all tracked assets'
        : `from ${activeSources.map(k => SOURCE_LABELS[k]).join(', ')}`;

  const progressPct = targetAmount > 0 ? Math.min(100, (saved / targetAmount) * 100) : 0;
```

Delete the old `useState<{ monthly, monthsLeft }>` / `useEffect` block and the old `progressPct` and `remaining` consts — the code above replaces all of them. Every later reference to `result.monthly` becomes `monthlyNeeded` and `result.monthsLeft` becomes `monthsLeft`; Task 5 rewrites that whole panel anyway.

- [ ] **Step 5: Replace the saved-so-far field**

Replace lines 118-136 (the `Saved so far` label plus its `isEditing` ternary) with:

```tsx
            <div>
              <p className="text-secondary">Saved so far</p>
              <button
                onClick={() => onNavigate?.('savings')}
                className="mt-1 flex items-center gap-1 text-primary font-bold tabular-nums hover:underline"
              >
                {fmt(saved, 0)}
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
              <p className="mt-0.5 text-micro text-secondary">{sourceCaption}</p>
            </div>
```

- [ ] **Step 6: Add the source list**

Insert a new block immediately after the closing `</div>` of the Progress section (after old line 146), before the "Monthly needed" panel:

```tsx
        {/* Which assets count */}
        <div>
          <FieldLabel className="!text-micro mb-2">Counts toward this goal</FieldLabel>
          <div className="flex flex-col">
            {ALL_GOAL_SOURCES.map(key => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 py-2 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={activeSources.includes(key)}
                    onChange={() => toggleSource(key)}
                    className="w-4 h-4 accent-[#8183ff] cursor-pointer"
                  />
                  <span className="text-label font-semibold">{SOURCE_LABELS[key]}</span>
                </span>
                <span className="text-label text-secondary tabular-nums">
                  {fmt(breakdown[key], 0)}
                </span>
              </label>
            ))}
          </div>
        </div>
```

Wrapping the `<input>` in the `<label>` makes the label text the checkbox's accessible name, which is what `getByLabelText('Cash')` resolves.

- [ ] **Step 7: Wire it from `App.tsx`**

Line 100 — the default drops the typed figure:

```ts
  const [goal, setGoal] = usePersistedState<SavingsGoalType>('goal', { targetAmount: 10000, targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] });
```

Add a memo beside the other derived values, after the `usePersistedState` block (after line 105):

```ts
  // The Goal screen holds none of the asset state, so the sum is computed here
  // rather than handing it three more props. The Hub and Net Worth compute their
  // own from props they already carry.
  const breakdown = useMemo(
    () => assetBreakdown(netWorthData, stocks, portfolio),
    [netWorthData, stocks, portfolio]
  );
```

Import it: add `assetBreakdown` to the existing `utils/finance` import in `App.tsx`, or add `import { assetBreakdown } from './utils/finance';` if there is none.

Line 462 becomes:

```tsx
      case 'goal': return <SavingsGoal goal={goal} setGoal={setGoal} breakdown={breakdown} monthlySavings={netWorthData.monthlyRecurringSavings || 0} onNavigate={navigate} onSync={syncCallback} />;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/frontend/SavingsGoal.test.tsx`
Expected: PASS, all twelve.

- [ ] **Step 9: Commit**

```bash
git add types.ts components/SavingsGoal.tsx App.tsx tests/frontend/SavingsGoal.test.tsx
git commit -m "$(cat <<'EOF'
feat: saved-so-far is the assets you point the goal at

The figure was typed in and checked against nothing, on a screen whose subtitle
promised automated tracking. It is now the sum of the ticked asset lines, and
read-only — the chevron goes to the Hub, where cash is actually edited.

An absent sources list means all five, so goals synced from older devices read
as "everything" without a migration.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

### Task 5: Needed vs. actual, and a real projection

**Files:**
- Modify: `components/SavingsGoal.tsx` (the "Monthly needed" panel and the 12-month chart)
- Test: `tests/frontend/SavingsGoal.test.tsx` (append)

**Interfaces:**
- Consumes: `monthlySavings`, `remaining`, `monthsLeft`, `monthlyNeeded`, `saved`, `targetAmount` from Task 4.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing tests**

Append to `tests/frontend/SavingsGoal.test.tsx`. Note the deadline dates are chosen relative to a fixed clock so the month arithmetic is deterministic.

```tsx
describe('Monthly needed against what you actually save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('says the goal is reached when the assets already cover it', () => {
    renderGoal({ targetAmount: 10000, sources: ['cash'] }, 400);
    expect(screen.getByText(/Goal reached/)).toBeTruthy();
  });

  it('says the deadline passed rather than congratulating you', () => {
    // Target 50,000, cash 12,000, deadline already gone.
    renderGoal({ targetAmount: 50000, targetDate: '2026-01-01', sources: ['cash'] }, 400);
    expect(screen.getByText(/Deadline passed/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('On track');
  });

  it('asks for a monthly figure when none is set', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] }, 0);
    expect(screen.getByText(/No monthly savings set/)).toBeTruthy();
  });

  it('says on track when you save more than you need', () => {
    // 50,000 − 12,000 = 38,000 over 12 months → 3,167/month needed.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 4000);
    expect(screen.getByText(/On track/)).toBeTruthy();
  });

  it('names the shortfall and the date you would actually get there', () => {
    // 38,000 remaining at 400/month = 95 months → Jul 2034.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 400);
    expect(screen.getByText(/Short/)).toBeTruthy();
    expect(document.body.textContent).toContain('2034');
  });

  it('refuses to print a year in the far future', () => {
    // 38,000 remaining at 5/month = 7,600 months.
    renderGoal({ targetAmount: 50000, targetDate: '2027-08-01', sources: ['cash'] }, 5);
    expect(screen.getByText(/within 50 years/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2[0-9]{3}$/m);
  });
});

describe('The projection chart', () => {
  it('projects from today at the monthly rate, against the target', () => {
    renderGoal({ targetAmount: 50000, sources: ['cash'] }, 1000);
    const chart = screen.getByLabelText('12-month projection against target');
    expect(chart).toBeTruthy();
  });

  it('no longer renders the twelve hardcoded bars', () => {
    renderGoal();
    expect(screen.queryByText('12-Month Accumulation')).toBeNull();
  });
});
```

Add `beforeEach`, `afterEach` to the `vitest` import at the top of the file.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/frontend/SavingsGoal.test.tsx`
Expected: FAIL — the new verdicts and the labelled chart do not exist; the old "12-Month Accumulation" heading still does.

- [ ] **Step 3: Compute the verdict**

Add after `progressPct` in the component body:

```tsx
  const actualMonthly = num(monthlySavings);
  const gap = monthlyNeeded - actualMonthly;

  // Months to the target at the rate you actually save. Null past 50 years:
  // at €5/month against €38,000, a year like 2438 is noise, not information.
  const monthsAtCurrentRate =
    actualMonthly > 0 && remaining > 0 ? Math.ceil(remaining / actualMonthly) : null;
  const reachDate =
    monthsAtCurrentRate !== null && monthsAtCurrentRate <= 600
      ? new Date(new Date().setMonth(new Date().getMonth() + monthsAtCurrentRate))
      : null;
  const reachLabel = reachDate
    ? reachDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  // Exactly one of these renders, in this order. The monthsLeft check is
  // load-bearing: a passed deadline forces monthlyNeeded to 0, which would
  // otherwise make gap negative and read as "On track" while you sit short.
  const verdict: { tone: 'positive' | 'warn' | 'neutral'; headline: string; detail: string } =
    remaining === 0
      ? { tone: 'positive', headline: 'Goal reached', detail: `${fmt(saved, 0)} against a ${fmt(targetAmount, 0)} target` }
      : monthsLeft === 0
        ? { tone: 'warn', headline: 'Deadline passed', detail: `${fmt(remaining, 0)} still to go` }
        : actualMonthly === 0
          ? { tone: 'neutral', headline: 'No monthly savings set', detail: 'Add what you put aside each month on the Savings Hub' }
          : gap <= 0
            ? { tone: 'positive', headline: 'On track', detail: `${fmt(-gap, 0)} a month spare` }
            : {
                tone: 'warn',
                headline: `Short ${fmt(gap, 0)} a month`,
                detail: reachLabel
                  ? `At ${fmt(actualMonthly, 0)} a month you reach ${fmt(targetAmount, 0)} in ${reachLabel}`
                  : `At ${fmt(actualMonthly, 0)} a month you do not reach ${fmt(targetAmount, 0)} within 50 years`,
              };
```

- [ ] **Step 4: Render it in the monthly panel**

Replace the "Monthly needed" block (old lines 148-161) with:

```tsx
        {/* Monthly needed vs. what you actually save */}
        <div className="p-4 rounded-field bg-surface-container-highest/40 border border-outline-variant/12">
          <div className="flex items-center justify-between gap-3">
            <div>
              <FieldLabel className="!text-micro">Monthly needed</FieldLabel>
              <p className="mt-0.5 text-label text-secondary">
                {monthsLeft > 0 ? `to reach goal in ${monthsLeft} months` : 'deadline has passed'}
              </p>
            </div>
            <span className="text-num-sm font-bold text-primary tabular-nums flex-none">
              {fmt(monthlyNeeded, 0)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <FieldLabel className="!text-micro">You save</FieldLabel>
            <button
              onClick={() => onNavigate?.('savings')}
              className="text-body font-bold tabular-nums hover:underline"
            >
              {fmt(actualMonthly, 0)}
            </button>
          </div>

          <p
            className={`mt-3 pt-3 border-t border-outline-variant/12 text-label font-bold ${
              verdict.tone === 'positive'
                ? 'text-positive'
                : verdict.tone === 'warn'
                  ? 'text-tertiary'
                  : 'text-secondary'
            }`}
          >
            {verdict.headline}
          </p>
          <p className="mt-0.5 text-label text-secondary">{verdict.detail}</p>
        </div>
```

- [ ] **Step 5: Replace the fake chart with the projection**

Delete `miniBarHeights` (old line 61) and `currentMonth` (old line 66), and replace the "12-Month Accumulation" block (old lines 163-180) with:

```tsx
        {/* 12-month projection at your current rate */}
        <div>
          <div className="flex justify-between mb-3">
            <FieldLabel className="!text-micro">12-Month Projection</FieldLabel>
            <span className="text-micro font-bold tracking-[.08em] uppercase text-primary-container">
              ╌ {fmt(targetAmount, 0)} target
            </span>
          </div>
          <div className="h-[120px]">
            <AreaChart
              points={projectionPoints}
              baseline={new Array(13).fill(targetAmount)}
              label="12-month projection against target"
            />
          </div>
          <AxisLabels labels={projectionLabels} className="mt-2" />
        </div>
```

with these consts added beside `verdict`:

```tsx
  // Same shape as the Hub's outlookSeries, so the two screens project alike.
  const projectionPoints = Array.from({ length: 13 }, (_, i) => saved + actualMonthly * i);
  const projectionLabels = [0, 6, 12].map(offset =>
    new Date(new Date().setMonth(new Date().getMonth() + offset))
      .toLocaleDateString(undefined, { month: 'short' })
  );
```

Swap the UI import on line 4: drop `ColumnChart`, add `AreaChart`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/frontend/SavingsGoal.test.tsx`
Expected: PASS, all twenty.

- [ ] **Step 7: Commit**

```bash
git add components/SavingsGoal.tsx tests/frontend/SavingsGoal.test.tsx
git commit -m "$(cat <<'EOF'
feat: the goal screen compares what you need against what you save

It printed "monthly needed" against nothing while the app already knew the
monthly figure. It now names the gap and the date you would actually arrive.

A passed deadline gets its own verdict: monthlyNeeded is forced to zero once the
date is gone, which would otherwise read as On track while you sit short.

The twelve hardcoded bar heights are gone — the chart projects from today's
figure at your real rate, with the target as a reference line.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

### Task 6: Migrate the legacy typed figure

**Files:**
- Modify: `App.tsx` (a new effect beside the sync effects, around line 250)
- Test: `tests/frontend/goalMigration.test.tsx` (create)

**Interfaces:**
- Consumes: `num` from `utils/finance`; the deprecated `SavingsGoal.currentSavings` from Task 4.
- Produces: `migrateLegacyGoalSavings(goal, netWorthData)` exported from `utils/finance`, returning `{ goal, netWorthData } | null` — null when there is nothing to migrate.

Extracting the decision as a pure function keeps the test out of `App`'s auth-and-sync render path.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/goalMigration.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { migrateLegacyGoalSavings } from '../../utils/finance';
import { NetWorthState, SavingsGoal } from '../../types';

const nw = (over: Partial<NetWorthState> = {}): NetWorthState => ({
  goldInvestment: 0, otherAssets: 0, remainingLoan: 0,
  monthlyRecurringSavings: 0, accumulatedSavings: 0, ...over,
});

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  targetAmount: 25000, targetDate: '2027-08-01', ...over,
});

describe('Migrating the legacy typed savings figure', () => {
  it('rescues it into cash when cash is empty', () => {
    const result = migrateLegacyGoalSavings(goal({ currentSavings: 8000 }), nw());
    expect(result?.netWorthData.accumulatedSavings).toBe(8000);
    expect(result?.goal.currentSavings).toBeUndefined();
  });

  it('never overwrites a real cash figure', () => {
    const result = migrateLegacyGoalSavings(
      goal({ currentSavings: 8000 }), nw({ accumulatedSavings: 12000 })
    );
    expect(result?.netWorthData.accumulatedSavings).toBe(12000);
    expect(result?.goal.currentSavings).toBeUndefined();
  });

  it('leaves the rest of the goal alone', () => {
    const result = migrateLegacyGoalSavings(
      goal({ currentSavings: 8000, sources: ['cash'] }), nw()
    );
    expect(result?.goal.targetAmount).toBe(25000);
    expect(result?.goal.targetDate).toBe('2027-08-01');
    expect(result?.goal.sources).toEqual(['cash']);
  });

  it('does nothing when there is no legacy figure', () => {
    expect(migrateLegacyGoalSavings(goal(), nw({ accumulatedSavings: 12000 }))).toBeNull();
    expect(migrateLegacyGoalSavings(goal({ currentSavings: 0 }), nw())).toBeNull();
  });

  it('is idempotent — running it on its own output is a no-op', () => {
    const first = migrateLegacyGoalSavings(goal({ currentSavings: 8000 }), nw());
    expect(migrateLegacyGoalSavings(first!.goal, first!.netWorthData)).toBeNull();
  });

  it('does not re-copy when a stale device syncs the field back', () => {
    // Cash is already 8,000 from the first migration; the old phone pushes the
    // legacy goal again. Clear it, keep the cash.
    const result = migrateLegacyGoalSavings(
      goal({ currentSavings: 8000 }), nw({ accumulatedSavings: 8000 })
    );
    expect(result?.netWorthData.accumulatedSavings).toBe(8000);
    expect(result?.goal.currentSavings).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/frontend/goalMigration.test.tsx`
Expected: FAIL — `migrateLegacyGoalSavings is not a function`.

- [ ] **Step 3: Add the pure function to `utils/finance.ts`**

Append, and extend the top-of-file type import with `SavingsGoal`:

```ts
/**
 * Move a hand-typed `goal.currentSavings` into the cash figure that now owns it.
 *
 * Returns null when there is nothing to do, so the caller can skip the write and
 * the sync entirely. Clearing the field is what makes this idempotent: the
 * condition cannot be true twice. That matters because App.tsx replaces `goal`
 * wholesale on every cloud pull, so a phone that has not opened the app yet will
 * hand the old field back later — at which point cash is already set, the copy
 * is skipped, and the field is simply cleared again.
 */
export const migrateLegacyGoalSavings = (
  goal: SavingsGoal,
  netWorthData: NetWorthState
): { goal: SavingsGoal; netWorthData: NetWorthState } | null => {
  const legacy = num(goal.currentSavings);
  if (legacy <= 0) return null;

  const { currentSavings, ...rest } = goal;
  return {
    goal: rest,
    netWorthData:
      num(netWorthData.accumulatedSavings) === 0
        ? { ...netWorthData, accumulatedSavings: legacy }
        : netWorthData,
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/frontend/goalMigration.test.tsx`
Expected: PASS, all six.

- [ ] **Step 5: Call it from `App.tsx`**

Add `migrateLegacyGoalSavings` to the `utils/finance` import, and add this effect immediately after the auto-push effect (after line 264):

```tsx
  // A goal from before saved-so-far was derived carries a hand-typed figure. For
  // anyone who only ever recorded cash there, it is the only copy they have.
  useEffect(() => {
    const migrated = migrateLegacyGoalSavings(goal, netWorthData);
    if (!migrated) return;
    setGoal(migrated.goal);
    setNetWorthData(migrated.netWorthData);
    if (activeUserKey) {
      void triggerSync({ goal: migrated.goal, netWorthData: migrated.netWorthData });
    }
  }, [goal, netWorthData, setGoal, setNetWorthData, activeUserKey, triggerSync]);
```

The effect depends on `goal` and re-runs after its own write, but `migrateLegacyGoalSavings` returns null the second time, so it settles in one extra render rather than looping.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. Confirm specifically that `SavingsDashboard.test.tsx`, `EmergencyFund.test.tsx`, `Subscriptions.test.tsx` and `silentFailures.test.tsx` are green and were never edited: `git status` should show no modification to them across the whole branch.

- [ ] **Step 7: Commit**

```bash
git add utils/finance.ts App.tsx tests/frontend/goalMigration.test.tsx
git commit -m "$(cat <<'EOF'
feat: rescue the hand-typed savings figure into cash

For anyone who only ever recorded savings on the Goal screen, that number is the
only copy they have, and it stops being read this release. Copy it into cash when
cash is empty, never over a real figure, then clear it.

Clearing is what makes it idempotent — App replaces goal wholesale on every pull,
so an old phone will hand the field back and must not re-copy it.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
)"
```

---

## Manual verification

After Task 6, run the app and check the four things tests cannot:

1. Goal screen — untick Stocks and Mutual funds; "Saved so far" drops and the caption names Cash, Gold, Other assets. Reload; the choice survives.
2. Savings Hub — change Cash; return to the Goal screen and confirm the figure followed.
3. Net Worth — the Cash & Savings row equals the Hub's Cash, and Total Assets matches the Hub's hero figure exactly.
4. Goal screen with a monthly figure set — the projection line rises and the target line sits flat across it.
