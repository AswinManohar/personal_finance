# Manual Emergency Fund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emergency fund card's derived-from-expenses arithmetic with two hand-entered amounts.

**Architecture:** `EmergencyFundState` changes from `{ targetMonths }` to `{ targetAmount, currentAmount }`, both entered by hand in the Savings Hub. The fund is treated as a carve-out of `netWorthData.accumulatedSavings`, so `totalAssets` is untouched and free cash is derived as `cash − currentAmount`. Everything the card used to compute from `monthlyEssentials` — runway, target, funded ETA — leaves the Savings Hub UI.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Vitest + Testing Library (happy-dom).

**Spec:** `docs/superpowers/specs/2026-08-06-manual-emergency-fund-design.md`

## Global Constraints

- Test command is `npm test` (`vitest run`). Single file: `npx vitest run tests/frontend/<file>`.
- Frontend tests live in `tests/frontend/**/*.test.{ts,tsx}` — that glob is the only thing vitest picks up.
- **Do not delete `monthlyEssentials`, `runwayMonths`, `monthlyAmount`, or `MONTHLY_FACTORS` from `utils/finance.ts`.** `Debts.tsx:106` feeds essentials to `simulatePayoff`, which uses `runwayMonths` for `breachesBuffer`/`safeAmount`. Only `emergencyFundTarget` and `monthsToTarget` are dead.
- Do not change `totalAssets` (`SavingsDashboard.tsx:101`) or add the fund to `assetCategories`. The Asset Breakdown stays at four categories with Cash whole — deliberately out of scope.
- Currency is euro throughout; use the file's existing `fmt()` helper, never a raw `toLocaleString`.
- Every commit message ends with `Co-Authored-By: AswinManohar <aswinbio@gmail.com>`. Do not add a Claude trailer.
- No backend, API, or schema work. `emergencyFund` is an opaque JSON blob in the sync payload.

---

### Task 1: Two hand-entered amounts replace the derived card

**Files:**
- Modify: `types.ts:124-126`
- Modify: `App.tsx:103`
- Modify: `components/SavingsDashboard.tsx` — imports (3-8), derived block (60-98), `efPct` (170), card JSX (191-238)
- Test: `tests/frontend/EmergencyFund.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EmergencyFundState { targetAmount: number; currentAmount: number }`, and the component-local `efCurrent`, `efTarget`, `efPct`, `cash` bindings that Task 2 builds on.

The type change and the component rewrite must land together: the moment `targetMonths` leaves the interface, `SavingsDashboard.tsx:61` stops compiling. Do not try to split them.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/frontend/EmergencyFund.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { NetWorthState, EmergencyFundState } from '../../types';

const noopSync = async () => {};

const renderHub = (
  emergencyFund: EmergencyFundState = { currentAmount: 2192, targetAmount: 6735 },
  netWorthData: Partial<NetWorthState> = { accumulatedSavings: 5000 }
) =>
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={netWorthData as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
      expenses={[]}
      emergencyFund={emergencyFund}
      setEmergencyFund={() => {}}
    />
  );

describe('Emergency fund card', () => {
  it('renders both amounts as editable fields', () => {
    renderHub();
    const current = screen.getByLabelText('Current emergency fund amount') as HTMLInputElement;
    const target = screen.getByLabelText('Emergency fund target amount') as HTMLInputElement;
    expect(current.value).toBe('2192');
    expect(target.value).toBe('6735');
  });

  it('shows progress toward the manual target (2192 / 6735 = 33%)', () => {
    renderHub();
    expect(document.body.textContent).toContain('€2,192 of €6,735');
    expect(document.body.textContent).toContain('33%');
  });

  it('no longer asks the user to tag essential expenses', () => {
    renderHub();
    expect(document.body.textContent).not.toContain('Essential');
  });

  it('shows an empty state when neither amount is set', () => {
    renderHub({ currentAmount: 0, targetAmount: 0 });
    expect(screen.getByText(/Enter what your emergency fund holds/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('does not divide by zero when only the current amount is set', () => {
    renderHub({ currentAmount: 2192, targetAmount: 0 });
    expect(document.body.textContent).not.toContain('NaN');
    expect(document.body.textContent).toContain('0%');
  });

  it('degrades to zeros on legacy { targetMonths } state without migration code', () => {
    renderHub({ targetMonths: 3 } as unknown as EmergencyFundState);
    expect(screen.getByText(/Enter what your emergency fund holds/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('still renders for legacy callers without the new props', () => {
    render(
      <SavingsDashboard
        portfolio={[]} stocks={[]}
        netWorthData={{ accumulatedSavings: 300 } as NetWorthState}
        setNetWorthData={() => {}} onSync={noopSync}
      />
    );
    expect(document.body.textContent).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx`

Expected: FAIL. TypeScript rejects `currentAmount`/`targetAmount` on `EmergencyFundState`, and `getByLabelText('Current emergency fund amount')` finds no element.

- [ ] **Step 3: Change the state shape**

In `types.ts`, replace lines 124-126:

```ts
export interface EmergencyFundState {
  /** What the fund should hold, in €. Entered by hand. */
  targetAmount: number;
  /** What the fund holds today, in €. Entered by hand; a slice of accumulatedSavings. */
  currentAmount: number;
}
```

In `App.tsx:103`, change the default:

```tsx
  const [emergencyFund, setEmergencyFund] = usePersistedState<EmergencyFundState>('emergency_fund', { targetAmount: 0, currentAmount: 0 });
```

No migration branch anywhere. A stored `{ targetMonths: 3 }` reads back as `undefined` for both new keys, and the component's `num()` coercion turns that into `0` — which is the intended hard cut. The last test in Step 1 pins this.

- [ ] **Step 4: Fix the imports in `components/SavingsDashboard.tsx`**

Line 4 — only `monthlyAmount` survives (the subscriptions list at line 74 still needs it):

```tsx
import { monthlyAmount } from '../utils/finance';
```

Lines 5-8 — drop `ChipGroup`, which has no other use in the file. Keep everything else:

```tsx
import {
  AreaChart, AxisLabels, Card, Donut, Dot, EmptyState, FieldLabel, Input, ListRow,
  Pill, PrimaryButton, ProgressBar, SectionLabel, StackedBar, StatBlock, FormError,
} from './ui';
```

- [ ] **Step 5: Replace the derived block**

Delete `components/SavingsDashboard.tsx` lines 60-98 in full — that is `essentials`, `runway`, `target`, `etaMonths`, `runwayLabel`, `etaLabel`, `etaSub`, and `handleTargetMonths`, plus their comments. Put this in their place:

```tsx
  // Emergency fund. Both figures are typed in; nothing is inferred from the
  // expense list. The fund is a carve-out of accumulatedSavings rather than a
  // separate asset, so totalAssets below is deliberately untouched.
  const efCurrent = num(emergencyFund?.currentAmount);
  const efTarget = num(emergencyFund?.targetAmount);

  const handleEmergencyFund = (
    field: 'currentAmount' | 'targetAmount',
    value: string
  ) => {
    const next: EmergencyFundState = {
      targetAmount: efTarget,
      currentAmount: efCurrent,
      [field]: parseFloat(value) || 0,
    };
    setEmergencyFund?.(next);
    onSync({ emergencyFund: next });
  };
```

- [ ] **Step 6: Repoint `efPct`**

`efPct` must stay where it is (line 170 in the original numbering), because `pct` is not defined until line 169. Change only its arguments:

```tsx
  const efPct = pct(efCurrent, efTarget);
```

`pct` already returns 0 when the total is 0, which is what keeps the target-unset case off `NaN`.

- [ ] **Step 7: Replace the card JSX**

Replace `components/SavingsDashboard.tsx` lines 191-238 (the whole `{/* ── Emergency fund & runway ── */}` `<Card>`) with:

```tsx
      {/* ── Emergency fund ── */}
      <Card>
        <SectionLabel className="mb-4">Emergency Fund</SectionLabel>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <FieldLabel className="mb-2">Current In Fund</FieldLabel>
            <Input
              type="number"
              prefix="€"
              aria-label="Current emergency fund amount"
              value={emergencyFund?.currentAmount || ''}
              onChange={e => handleEmergencyFund('currentAmount', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <FieldLabel className="mb-2">Target</FieldLabel>
            <Input
              type="number"
              prefix="€"
              aria-label="Emergency fund target amount"
              value={emergencyFund?.targetAmount || ''}
              onChange={e => handleEmergencyFund('targetAmount', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {efCurrent === 0 && efTarget === 0 ? (
          <EmptyState icon="shield">
            Enter what your emergency fund holds today and what you want it to hold.
          </EmptyState>
        ) : (
          <>
            <ProgressBar percent={efPct} className="mb-2" />
            <p className="text-label text-secondary tabular-nums">
              {fmt(efCurrent)} of {fmt(efTarget)} ({Math.min(100, Math.round(efPct))}%)
            </p>
          </>
        )}
      </Card>
```

The `value={emergencyFund?.currentAmount || ''}` idiom (rather than `efCurrent`) matches the sibling fields at lines 285 and 321 and keeps the box blank instead of showing a `0` the user has to clear.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx`

Expected: PASS, 7 tests.

- [ ] **Step 9: Run the full suite**

Run: `npm test`

Expected: PASS except `tests/frontend/finance.test.ts`, which still exercises `emergencyFundTarget` and `monthsToTarget`. Those helpers are still present at this point, so it should pass too. If anything else fails, it is a real regression — stop and investigate rather than adjusting the test.

- [ ] **Step 10: Commit**

```bash
git add types.ts App.tsx components/SavingsDashboard.tsx tests/frontend/EmergencyFund.test.tsx
git commit -F - <<'EOF'
feat: the emergency fund is two numbers you type, not four we infer

The card derived runway, target, and a funded ETA from whichever expenses
happened to carry isEssential, so the target — the one number a person already
knows — could only be set by reverse-engineering it through expense tags, and
the whole card collapsed into an empty state when nothing was tagged.

Now: what the fund holds, and what it should hold.

Legacy {targetMonths: 3} needs no migration branch. Reading .targetAmount off it
yields undefined, num() turns that into 0, and 0/0 renders the empty state —
the hard cut, arrived at for free. Dropping targetMonths from the interface is
what makes that safe, and a test pins it rather than trusting the argument.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
```

---

### Task 2: Free cash and the over-allocation warning

**Files:**
- Modify: `components/SavingsDashboard.tsx` — derived block (after `efTarget`), card JSX
- Test: `tests/frontend/EmergencyFund.test.tsx` (append one describe block)

**Interfaces:**
- Consumes: `efCurrent`, `efTarget`, `cash`, `fmt()` from Task 1.
- Produces: nothing consumed downstream.

This is what makes the carve-out visible. Without it, choosing "slice of Cash" over "separate asset" has no observable effect anywhere in the UI.

- [ ] **Step 1: Write the failing tests**

Append to `tests/frontend/EmergencyFund.test.tsx`:

```tsx
describe('Emergency fund as a carve-out of cash', () => {
  it('shows free cash as the remainder of tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    expect(document.body.textContent).toContain('€2,808 free cash outside the fund');
  });

  it('warns and floors free cash at zero when the fund exceeds tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 1000 });
    expect(screen.getByText(/larger than your tracked cash/)).toBeTruthy();
    expect(document.body.textContent).toContain('€1,000');
    expect(document.body.textContent).toContain('€0 free cash outside the fund');
  });

  it('stays quiet when the fund fits inside tracked cash', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    expect(screen.queryByText(/larger than your tracked cash/)).toBeNull();
  });

  it('does not touch total tracked assets', () => {
    renderHub({ currentAmount: 2192, targetAmount: 6735 }, { accumulatedSavings: 5000 });
    // Cash is the only asset here, so the hero total is the cash figure itself —
    // the fund is a slice of it, never an addition to it.
    expect(document.body.textContent).toContain('€5,000');
    expect(document.body.textContent).not.toContain('€7,192');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx`

Expected: the four new tests FAIL on missing "free cash outside the fund" text; the seven from Task 1 still PASS.

- [ ] **Step 3: Add the two derived values**

In `components/SavingsDashboard.tsx`, directly after the `efTarget` line from Task 1:

```tsx
  // Free cash floors at zero: the fund is allowed to exceed tracked cash (the
  // usual cause is a stale Cash figure, not a wrong fund), and a negative
  // remainder would be a stranger reading than a warned zero.
  const freeCash = Math.max(0, cash - efCurrent);
  const efOverCash = efCurrent > cash;
```

- [ ] **Step 4: Render them**

In the non-empty branch of the card, put the warning above the progress bar and the free-cash line below the "of" line:

```tsx
        ) : (
          <>
            {efOverCash && (
              <div className="mb-4 p-3 rounded-field bg-[rgba(242,107,107,0.1)] border border-negative/20">
                <p className="text-label font-bold text-negative">
                  Your emergency fund is larger than your tracked cash ({fmt(cash)}). Update Cash
                  Savings Balance.
                </p>
              </div>
            )}
            <ProgressBar percent={efPct} className="mb-2" />
            <p className="text-label text-secondary tabular-nums">
              {fmt(efCurrent)} of {fmt(efTarget)} ({Math.min(100, Math.round(efPct))}%)
            </p>
            <p className="mt-1 text-label text-secondary tabular-nums">
              {fmt(freeCash)} free cash outside the fund
            </p>
          </>
        )}
```

The warning box reuses the exact treatment the old critical-runway notice used, so it needs no new tokens.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx`

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add components/SavingsDashboard.tsx tests/frontend/EmergencyFund.test.tsx
git commit -F - <<'EOF'
feat: show the fund as a slice of cash, and say so when it cannot be

The fund is a carve-out of accumulatedSavings rather than a sixth asset line,
which keeps totalAssets honest for anyone whose cash figure already includes
their fund. That choice was invisible until now, so the card names the
remainder: free cash outside the fund.

Entering more than tracked cash warns but still saves. Blocking would fight the
ordinary case of funding the account before updating the cash figure, and the
disagreement is nearly always a stale cash number rather than a wrong fund.
Free cash floors at zero; a negative remainder reads worse than a warned zero.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
```

---

### Task 3: Delete the dead helpers

**Files:**
- Modify: `utils/finance.ts:32-41`
- Modify: `tests/frontend/finance.test.ts:4-5, 59-75`

**Interfaces:**
- Consumes: the fact that Task 1 removed the last call sites.
- Produces: nothing.

Separate from Task 1 because it is reversible on its own judgement — a reviewer might want these kept — and because deleting them before the card compiles would break the build.

- [ ] **Step 1: Confirm they are unreferenced**

Run: `grep -rn "emergencyFundTarget\|monthsToTarget" --include=*.ts --include=*.tsx . | grep -v node_modules`

Expected: hits only in `utils/finance.ts` and `tests/frontend/finance.test.ts`. **If any other file appears, stop** — Task 1 was left incomplete.

- [ ] **Step 2: Delete the helpers**

In `utils/finance.ts`, delete lines 32-41 — the `emergencyFundTarget` const and the `monthsToTarget` const with its doc comment.

Leave `monthlyEssentials` (25-26) and `runwayMonths` (28-30) exactly as they are. `Debts.tsx:106` and `simulatePayoff` still depend on both.

- [ ] **Step 3: Delete their tests**

In `tests/frontend/finance.test.ts`, delete lines 59-75 — the `describe('emergencyFundTarget', ...)` and `describe('monthsToTarget', ...)` blocks.

Then trim the import at lines 4-5 to drop the two removed names, keeping the rest:

```ts
import {
  monthlyAmount, monthlyEssentials, runwayMonths,
```

Keep the `monthlyEssentials` and `runwayMonths` describe blocks at lines 35-57. Deleting them would leave the Debts buffer check uncovered.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expected: PASS, with no reference errors from `finance.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add utils/finance.ts tests/frontend/finance.test.ts
git commit -F - <<'EOF'
refactor: drop the two emergency fund helpers nothing calls now

emergencyFundTarget and monthsToTarget existed only to feed the Savings Hub
card that now takes typed numbers instead.

monthlyEssentials and runwayMonths stay, with their tests. Debts hands
essentials to simulatePayoff, which uses runway for breachesBuffer and
safeAmount — the check that stops a loan payoff draining the cash buffer.
Runway left the Savings Hub UI, not the codebase.

Co-Authored-By: AswinManohar <aswinbio@gmail.com>
EOF
```

---

## Verification

After Task 3, confirm by hand:

1. `npm test` — full suite green.
2. `npm run build` — TypeScript compiles with no unused-import or missing-property errors.
3. `npm run dev`, open the Savings Hub:
   - The card shows two empty boxes and the shield empty state on a fresh profile.
   - Typing a current amount and a target fills the progress bar and the "of" line.
   - Setting Cash Savings Balance below the fund raises the red notice and shows €0 free cash.
   - **Total Tracked Assets does not move** when the emergency fund changes. This is the single most important check — it is what separates a carve-out from a double-count.
