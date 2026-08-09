# Emergency Fund & Runway + Debt Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (a) an Emergency Fund & Runway card to the Savings Hub driven by an "essential" flag on recurring expenses, and (b) a Debts tab tracking individual loans with avalanche ordering and a lump-sum payoff simulator that guards liquidity.

**Architecture:** All money math lives in a new pure module `utils/finance.ts` (unit-tested without DOM). UI state follows the existing pattern: `usePersistedState` in `App.tsx`, prop-drilled to components, synced via the `user_finances` JSON blob (new keys `loans`, `emergencyFund` need **no** DB migration). Only the per-expense `isEssential` flag touches a relational table (`user_expenses`) and needs one SQL migration.

**Tech Stack:** React 19 + TypeScript + Tailwind (existing theme tokens), Vitest + React Testing Library (happy-dom), Supabase JS client. **No new npm dependencies.**

## Global Constraints

- No new npm packages; no new tables — `loans` and `emergencyFund` ride inside the `user_finances.data` JSON blob.
- The ONLY schema change is `user_expenses.is_essential boolean not null default false` (Task 3). It must be run manually in the Supabase SQL editor **before** the Task 3 code is deployed, otherwise `pushToCloud` will error with "column does not exist". Local tests do not need it.
- Currency format everywhere: `'€' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })` (matches `SavingsDashboard.tsx:119-121`).
- Every aggregate must be NaN-safe: coerce with the `num()` helper (pattern from `SavingsDashboard.tsx:24-27`) — cloud-synced state can omit any key.
- Styling: reuse existing dark-theme tokens only (`bg-surface-container-low`, `bg-surface-container-lowest`, `text-on-surface`, `text-secondary`, `text-on-surface-variant`, `bg-primary`, `text-primary`, accents `text-[#F26B6B]` (red) and `text-[#3DD68C]` (green)). Cards are `bg-surface-container-low p-6 rounded-xl`.
- Tests live in `tests/frontend/`, run with `npx vitest run` from the repo root. `tests/frontend/setup.ts` already polyfills `crypto.randomUUID` and mocks recharts.
- Components receive an optional `onSync?: (overrides?: any) => Promise<void>` and call it with the changed slice, e.g. `onSync({ loans: updated })` — follow this pattern (see `Expenses.tsx:62-64`).
- Commits use conventional prefixes (`feat:`, `test:`) matching the repo's history.
- After each task, run the FULL suite (`npx vitest run`) — existing tests in `Expenses.test.tsx`, `InvestmentCalculator.test.tsx`, `SavingsDashboard.test.tsx` must stay green. New props on existing components must therefore be **optional with defaults**.

---

### Task 1: Types + runway/emergency-fund math (`utils/finance.ts`)

**Files:**
- Modify: `types.ts`
- Create: `utils/finance.ts`
- Test: `tests/frontend/finance.test.ts`

**Interfaces:**
- Consumes: `Expense`, `RecurringFrequency` from `types.ts`.
- Produces (used by Tasks 2–7):
  - `Loan { id: string; name: string; balance: number; interestRate: number; monthlyPayment: number; lender?: string }`
  - `EmergencyFundState { targetMonths: number }`
  - `Expense.isEssential?: boolean`
  - `ActiveTab` union gains `'debts'`
  - `num(v: unknown): number`
  - `monthlyAmount(e: Expense): number`
  - `monthlyEssentials(expenses: Expense[]): number`
  - `runwayMonths(liquidCash: number, essentialsPerMonth: number): number | null`
  - `emergencyFundTarget(essentialsPerMonth: number, targetMonths: number): number`
  - `monthsToTarget(current: number, target: number, monthlyContribution: number): number | null`

- [ ] **Step 1: Add the new types to `types.ts`**

In `types.ts`, add `isEssential?: boolean;` to the `Expense` interface (after `vendor?: string;`):

```ts
export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  isRecurring: boolean;
  recurringFrequency?: RecurringFrequency;
  date: string; // ISO date string
  vendor?: string;
  isEssential?: boolean; // counts toward runway / emergency-fund target
}
```

Append at the end of the file:

```ts
export interface Loan {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // annual nominal %, e.g. 7.5
  monthlyPayment: number;
  lender?: string;
}

export interface EmergencyFundState {
  targetMonths: number; // 3–6 months of essential costs
}
```

And extend the `ActiveTab` union (last line of the file):

```ts
export type ActiveTab = 'expenses' | 'savings' | 'investment' | 'networth' | 'fire' | 'portfolio' | 'stocks' | 'data' | 'goal' | 'debts';
```

- [ ] **Step 2: Write the failing tests**

Create `tests/frontend/finance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Expense, ExpenseCategory } from '../../types';
import {
  monthlyAmount, monthlyEssentials, runwayMonths,
  emergencyFundTarget, monthsToTarget,
} from '../../utils/finance';

const exp = (over: Partial<Expense>): Expense => ({
  id: 'x', name: 'e', amount: 0, category: ExpenseCategory.OTHER,
  isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01',
  ...over,
});

describe('monthlyAmount', () => {
  it('normalizes each frequency to a monthly figure', () => {
    expect(monthlyAmount(exp({ amount: 100, recurringFrequency: 'weekly' }))).toBeCloseTo(433.33, 1);
    expect(monthlyAmount(exp({ amount: 100, recurringFrequency: 'bi-weekly' }))).toBeCloseTo(216.67, 1);
    expect(monthlyAmount(exp({ amount: 1500, recurringFrequency: 'monthly' }))).toBe(1500);
    expect(monthlyAmount(exp({ amount: 300, recurringFrequency: 'quarterly' }))).toBeCloseTo(100, 5);
    expect(monthlyAmount(exp({ amount: 1200, recurringFrequency: 'yearly' }))).toBeCloseTo(100, 5);
  });
  it('returns 0 for one-time expenses', () => {
    expect(monthlyAmount(exp({ amount: 500, isRecurring: false }))).toBe(0);
  });
  it('treats a recurring expense without frequency as monthly', () => {
    expect(monthlyAmount(exp({ amount: 50, recurringFrequency: undefined }))).toBe(50);
  });
  it('is NaN-safe', () => {
    expect(monthlyAmount(exp({ amount: undefined as any }))).toBe(0);
  });
});

describe('monthlyEssentials', () => {
  it('sums only essential expenses, normalized to monthly', () => {
    const expenses = [
      exp({ amount: 1500, isEssential: true }),               // rent
      exp({ amount: 745, isEssential: true }),                // home loans
      exp({ amount: 30 }),                                    // streaming, not essential
      exp({ amount: 999, isEssential: true, isRecurring: false }), // one-off, ignored
    ];
    expect(monthlyEssentials(expenses)).toBe(2245);
  });
  it('returns 0 for empty input', () => {
    expect(monthlyEssentials([])).toBe(0);
  });
});

describe('runwayMonths', () => {
  it('divides liquid cash by monthly essentials (€2,192 / €2,245 ≈ 0.98)', () => {
    expect(runwayMonths(2192, 2245)).toBeCloseTo(0.976, 2);
  });
  it('returns null when essentials are unknown/zero', () => {
    expect(runwayMonths(2192, 0)).toBeNull();
  });
});

describe('emergencyFundTarget', () => {
  it('multiplies essentials by target months (6 × €2,245 = €13,470)', () => {
    expect(emergencyFundTarget(2245, 6)).toBe(13470);
  });
});

describe('monthsToTarget', () => {
  it('rounds up the months needed at the given contribution', () => {
    // (13470 - 2192) / 2900 = 3.89 → 4 months, matching the advisory conversation
    expect(monthsToTarget(2192, 13470, 2900)).toBe(4);
  });
  it('returns 0 when already funded', () => {
    expect(monthsToTarget(15000, 13470, 2900)).toBe(0);
  });
  it('returns null when there is no contribution', () => {
    expect(monthsToTarget(2192, 13470, 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: FAIL — `Cannot find module '../../utils/finance'` (or equivalent resolve error).

- [ ] **Step 4: Implement `utils/finance.ts`**

```ts
import { Expense, Loan, RecurringFrequency } from '../types';

/** Coerce any value to a finite number; invalid input becomes 0. */
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MONTHLY_FACTORS: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,
  'bi-weekly': 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Monthly-normalized cost of a recurring expense; 0 for one-time expenses. */
export const monthlyAmount = (e: Expense): number => {
  if (!e.isRecurring) return 0;
  const factor = MONTHLY_FACTORS[e.recurringFrequency || 'monthly'] ?? 1;
  return num(e.amount) * factor;
};

/** Sum of essential recurring expenses per month. */
export const monthlyEssentials = (expenses: Expense[]): number =>
  expenses.filter(e => e.isEssential).reduce((sum, e) => sum + monthlyAmount(e), 0);

/** Months of essential costs covered by liquid cash; null when essentials are unknown. */
export const runwayMonths = (liquidCash: number, essentialsPerMonth: number): number | null =>
  essentialsPerMonth > 0 ? num(liquidCash) / essentialsPerMonth : null;

export const emergencyFundTarget = (essentialsPerMonth: number, targetMonths: number): number =>
  num(essentialsPerMonth) * num(targetMonths);

/** Whole months until target at the given contribution; 0 if funded, null if no contribution. */
export const monthsToTarget = (current: number, target: number, monthlyContribution: number): number | null => {
  const gap = num(target) - num(current);
  if (gap <= 0) return 0;
  if (num(monthlyContribution) <= 0) return null;
  return Math.ceil(gap / num(monthlyContribution));
};
```

(`Loan` is imported now so Task 2 only appends functions; if the linter flags it as unused at this point, that is acceptable for one commit — or defer the import to Task 2.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Run the full suite, then commit**

Run: `npx vitest run` — all existing tests still pass.

```bash
git add types.ts utils/finance.ts tests/frontend/finance.test.ts
git commit -m "feat: add runway and emergency fund math helpers"
```

---

### Task 2: Loan math (avalanche + payoff simulation)

**Files:**
- Modify: `utils/finance.ts`
- Test: `tests/frontend/finance.test.ts` (append)

**Interfaces:**
- Consumes: `Loan` from `types.ts`, `num`/`runwayMonths` from Task 1.
- Produces (used by Tasks 5–7):
  - `monthlyInterest(loan: Loan): number`
  - `totalLoanBalance(loans: Loan[]): number`
  - `sortByAvalanche(loans: Loan[]): Loan[]`
  - `PayoffSimulation { amountApplied: number; newBalance: number; newLiquidCash: number; monthlyInterestSaved: number; newRunwayMonths: number | null; breachesBuffer: boolean; safeAmount: number }`
  - `simulatePayoff(loan: Loan, amount: number, liquidCash: number, essentialsPerMonth: number): PayoffSimulation`

- [ ] **Step 1: Append the failing tests to `tests/frontend/finance.test.ts`**

Add to the imports: `monthlyInterest, totalLoanBalance, sortByAvalanche, simulatePayoff` (from `'../../utils/finance'`) and `Loan` (from `'../../types'`). Append:

```ts
const sparkasse: Loan = { id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 };
const dispo: Loan = { id: 'l2', name: 'Dispo', balance: 1200, interestRate: 11, monthlyPayment: 50 };

describe('loan math', () => {
  it('computes monthly interest (€36k @ 7.5% → €225/month)', () => {
    expect(monthlyInterest(sparkasse)).toBeCloseTo(225, 5);
  });
  it('sums balances', () => {
    expect(totalLoanBalance([sparkasse, dispo])).toBe(37200);
  });
  it('avalanche-sorts by rate descending without mutating input', () => {
    const input = [sparkasse, dispo];
    const sorted = sortByAvalanche(input);
    expect(sorted.map(l => l.id)).toEqual(['l2', 'l1']);
    expect(input.map(l => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('simulatePayoff', () => {
  it('flags a payoff that leaves less than one month of essentials', () => {
    // cash €38,000, essentials €2,245/month, pay full €36,000 → €2,000 left
    const sim = simulatePayoff(sparkasse, 36000, 38000, 2245);
    expect(sim.amountApplied).toBe(36000);
    expect(sim.newLiquidCash).toBe(2000);
    expect(sim.monthlyInterestSaved).toBeCloseTo(225, 5);
    expect(sim.breachesBuffer).toBe(true);
    expect(sim.safeAmount).toBe(35755); // 38,000 − 2,245
  });
  it('accepts a partial payoff that preserves the buffer', () => {
    const sim = simulatePayoff(sparkasse, 33000, 38000, 2245);
    expect(sim.newBalance).toBe(3000);
    expect(sim.newLiquidCash).toBe(5000);
    expect(sim.monthlyInterestSaved).toBeCloseTo(206.25, 2);
    expect(sim.breachesBuffer).toBe(false);
  });
  it('caps the payment at the loan balance', () => {
    const sim = simulatePayoff(dispo, 5000, 38000, 2245);
    expect(sim.amountApplied).toBe(1200);
    expect(sim.newBalance).toBe(0);
  });
  it('never flags a breach when essentials are unknown', () => {
    const sim = simulatePayoff(sparkasse, 36000, 38000, 0);
    expect(sim.breachesBuffer).toBe(false);
    expect(sim.newRunwayMonths).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: FAIL — `monthlyInterest` is not exported.

- [ ] **Step 3: Append the implementation to `utils/finance.ts`**

```ts
/** Interest a loan accrues per month at its current balance. */
export const monthlyInterest = (loan: Loan): number =>
  num(loan.balance) * (num(loan.interestRate) / 100) / 12;

export const totalLoanBalance = (loans: Loan[]): number =>
  loans.reduce((sum, l) => sum + num(l.balance), 0);

/** Highest interest rate first — the order they should be paid off in. */
export const sortByAvalanche = (loans: Loan[]): Loan[] =>
  [...loans].sort((a, b) => num(b.interestRate) - num(a.interestRate));

export interface PayoffSimulation {
  amountApplied: number;
  newBalance: number;
  newLiquidCash: number;
  monthlyInterestSaved: number;
  newRunwayMonths: number | null;
  breachesBuffer: boolean; // payoff would leave < 1 month of essentials in cash
  safeAmount: number;      // largest payment that keeps a 1-month buffer
}

export const simulatePayoff = (
  loan: Loan, amount: number, liquidCash: number, essentialsPerMonth: number,
): PayoffSimulation => {
  const amountApplied = Math.min(num(amount), num(loan.balance));
  const newLiquidCash = num(liquidCash) - amountApplied;
  const newRunway = runwayMonths(newLiquidCash, num(essentialsPerMonth));
  return {
    amountApplied,
    newBalance: num(loan.balance) - amountApplied,
    newLiquidCash,
    monthlyInterestSaved: amountApplied * (num(loan.interestRate) / 100) / 12,
    newRunwayMonths: newRunway,
    breachesBuffer: newRunway !== null && newRunway < 1,
    safeAmount: Math.max(0, Math.min(num(loan.balance), num(liquidCash) - num(essentialsPerMonth))),
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/finance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/finance.ts tests/frontend/finance.test.ts
git commit -m "feat: add loan math helpers (avalanche sort, payoff simulation)"
```

---

### Task 3: Essential flag — Expenses form, badge, and cloud sync

**Files:**
- Modify: `components/Expenses.tsx`
- Modify: `services/supabaseService.ts:140-179` (push) and `:196-220` (pull)
- Create: `supabase/migrations/20260714_add_is_essential.sql`
- Test: `tests/frontend/EssentialFlag.test.tsx`

**Interfaces:**
- Consumes: `Expense.isEssential` from Task 1.
- Produces: expenses created through the form carry `isEssential: boolean`; `pushToCloud`/`pullFromCloud` round-trip the flag via the `is_essential` column.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/EssentialFlag.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Expenses } from '../../components/Expenses';

const baseIncome = { salaryMe: 0, salaryPartner: 0 };

const renderForm = (setExpenses = vi.fn()) => {
  render(
    <Expenses expenses={[]} setExpenses={setExpenses} income={baseIncome} setIncome={() => {}} />
  );
  return setExpenses;
};

// The first "0.00" input in the DOM is the Log Expense amount field
// (the salary inputs share the placeholder but render later).
const amountInput = () => screen.getAllByPlaceholderText('0.00')[0];

describe('Essential expense flag', () => {
  it('adds an expense with isEssential=true when the toggle is on', () => {
    const setExpenses = renderForm();
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly Groceries'), { target: { value: 'Rent' } });
    fireEvent.click(screen.getByText('Non-essential'));
    expect(screen.getByText('Essential')).toBeTruthy();
    fireEvent.click(screen.getByText('Add Expense'));
    expect(setExpenses).toHaveBeenCalledTimes(1);
    const added = setExpenses.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: 'Rent', amount: 1500, isEssential: true });
  });

  it('defaults to non-essential', () => {
    const setExpenses = renderForm();
    fireEvent.change(amountInput(), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly Groceries'), { target: { value: 'Netflix' } });
    fireEvent.click(screen.getByText('Add Expense'));
    expect(setExpenses.mock.calls[0][0][0].isEssential).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontend/EssentialFlag.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Non-essential`.

- [ ] **Step 3: Add the toggle to the Expenses form**

In `components/Expenses.tsx`:

1. Add state next to the other form state (after line 31, `newRecurringFrequency`):

```tsx
const [newIsEssential, setNewIsEssential] = useState(false);
```

2. In `handleAdd` (line 48), add `isEssential: newIsEssential,` to the `newExpense` object (after `recurringFrequency: ...`), and add `setNewIsEssential(false);` to the reset block at the end of `handleAdd`.

3. Insert a toggle after the Frequency block (the `{newIsRecurring && (...)}` conditional ending around line 274), before the Add Expense button. The label says "Priority" so the toggle text `Essential`/`Non-essential` stays unique for tests:

```tsx
{/* Essential toggle */}
<div className="flex flex-col gap-2">
  <label className="text-xs text-secondary ml-1">Priority</label>
  <div
    className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 cursor-pointer"
    onClick={() => setNewIsEssential(!newIsEssential)}
  >
    <span className="text-xs text-on-surface">{newIsEssential ? 'Essential' : 'Non-essential'}</span>
    <div className={`w-8 h-4 rounded-full relative transition-colors ${newIsEssential ? 'bg-[#3DD68C]/40' : 'bg-outline-variant/30'}`}>
      <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${newIsEssential ? 'left-5 bg-[#3DD68C]' : 'left-1 bg-secondary'}`}></div>
    </div>
  </div>
</div>
```

4. Show a badge in the Recurring list. Replace (around line 528-531):

```tsx
<span className="text-sm font-medium text-on-surface">{expense.name}</span>
<span className={`text-[10px] py-0.5 px-2 ${freqColor} rounded-full w-fit font-bold uppercase tracking-tighter`}>
  {expense.recurringFrequency || 'monthly'}
</span>
```

with:

```tsx
<span className="text-sm font-medium text-on-surface">{expense.name}</span>
<div className="flex gap-1">
  <span className={`text-[10px] py-0.5 px-2 ${freqColor} rounded-full w-fit font-bold uppercase tracking-tighter`}>
    {expense.recurringFrequency || 'monthly'}
  </span>
  {expense.isEssential && (
    <span className="text-[10px] py-0.5 px-2 bg-[#3DD68C]/10 text-[#3DD68C] rounded-full w-fit font-bold uppercase tracking-tighter">
      Essential
    </span>
  )}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frontend/EssentialFlag.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Round-trip the flag through Supabase**

In `services/supabaseService.ts`:

1. In `pushToCloud`, inside the `records = expenses.map(...)` object (after `recurring_frequency: ...`, line ~171), add:

```ts
is_essential: !!e.isEssential,
```

2. In `pullFromCloud`, change the `user_expenses` select (line 199) to include the column:

```ts
supabase.from('user_expenses').select('id, name, amount, category, vendor, is_recurring, recurring_frequency, is_essential, created_at').eq('user_key', userKey).eq('deleted', false),
```

3. In the expense mapping (line ~211), add after `recurringFrequency: ...`:

```ts
isEssential: !!e.is_essential,
```

- [ ] **Step 6: Create the SQL migration**

Create `supabase/migrations/20260714_add_is_essential.sql`:

```sql
-- Run in the Supabase SQL editor BEFORE deploying the is_essential sync code.
alter table public.user_expenses
  add column if not exists is_essential boolean not null default false;
```

**Manual step for the repo owner:** paste this into the Supabase SQL editor and run it. The default means old clients keep working unchanged.

- [ ] **Step 7: Run the full suite, then commit**

Run: `npx vitest run` — all green (existing `Expenses.test.tsx` must not break; the new toggle is additive).

```bash
git add components/Expenses.tsx services/supabaseService.ts supabase/migrations/20260714_add_is_essential.sql tests/frontend/EssentialFlag.test.tsx
git commit -m "feat: essential-expense flag with cloud sync"
```

---

### Task 4: Emergency Fund & Runway card on the Savings Hub

**Files:**
- Modify: `components/SavingsDashboard.tsx`
- Modify: `App.tsx` (state, pull, push payload, props at the `'savings'` and `default` cases)
- Modify: `components/DataManagement.tsx` (payload + pull must carry `emergencyFund`, or a Data-tab push would wipe it from the cloud blob)
- Test: `tests/frontend/EmergencyFund.test.tsx`

**Interfaces:**
- Consumes: `monthlyEssentials`, `runwayMonths`, `emergencyFundTarget`, `monthsToTarget` (Task 1); `EmergencyFundState`.
- Produces: `SavingsDashboard` accepts optional `expenses?: Expense[]`, `emergencyFund?: EmergencyFundState`, `setEmergencyFund?: (next: EmergencyFundState) => void`. App persists `emergencyFund` under localStorage key `'emergency_fund'` and syncs it in the blob under key `emergencyFund`.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/EmergencyFund.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsDashboard } from '../../components/SavingsDashboard';
import { Expense, ExpenseCategory, NetWorthState } from '../../types';

const noopSync = async () => {};

const essentialExpenses: Expense[] = [
  { id: '1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: '2', name: 'Home loans', amount: 745, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: '3', name: 'Streaming', amount: 30, category: ExpenseCategory.ENTERTAINMENT, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01' },
];

const renderHub = (expenses: Expense[] = essentialExpenses) =>
  render(
    <SavingsDashboard
      portfolio={[]}
      stocks={[]}
      netWorthData={{ accumulatedSavings: 2192, monthlyRecurringSavings: 2900 } as NetWorthState}
      setNetWorthData={() => {}}
      onSync={noopSync}
      expenses={expenses}
      emergencyFund={{ targetMonths: 3 }}
      setEmergencyFund={() => {}}
    />
  );

describe('Emergency fund & runway card', () => {
  it('shows runway in weeks and a critical warning when below one month', () => {
    renderHub();
    // €2,192 / €2,245 ≈ 0.98 months → ~4 weeks
    expect(screen.getByText('~4 weeks')).toBeTruthy();
    expect(screen.getByText(/Critical: less than one month/)).toBeTruthy();
  });

  it('computes the target from essential expenses only (3 × €2,245 = €6,735)', () => {
    renderHub();
    expect(document.body.textContent).toContain('€6,735');
  });

  it('projects the funded ETA from the monthly savings target', () => {
    renderHub();
    // ceil((6,735 − 2,192) / 2,900) = 2
    expect(document.body.textContent).toContain('~2 months');
  });

  it('shows guidance instead of NaN when no essentials are marked', () => {
    renderHub([]);
    expect(screen.getByText(/Mark your recurring expenses/)).toBeTruthy();
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx`
Expected: FAIL — `~4 weeks` not found (props silently ignored).

- [ ] **Step 3: Implement the card in `SavingsDashboard.tsx`**

1. Extend the imports:

```tsx
import { NetWorthState, PortfolioAsset, Stock, Expense, EmergencyFundState } from '../types';
import { monthlyEssentials, runwayMonths, emergencyFundTarget, monthsToTarget } from '../utils/finance';
```

2. Extend the props interface and destructuring (defaults keep legacy callers working):

```tsx
interface SavingsDashboardProps {
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  netWorthData: NetWorthState;
  setNetWorthData: React.Dispatch<React.SetStateAction<NetWorthState>>;
  onSync: (overrides?: any) => Promise<void>;
  expenses?: Expense[];
  emergencyFund?: EmergencyFundState;
  setEmergencyFund?: (next: EmergencyFundState) => void;
}
```

```tsx
export const SavingsDashboard: React.FC<SavingsDashboardProps> = ({
  portfolio, stocks, netWorthData, setNetWorthData, onSync,
  expenses = [], emergencyFund, setEmergencyFund,
}) => {
```

3. After the existing `monthlySavings` computation (line ~43), add:

```tsx
// Emergency fund & runway
const targetMonths = emergencyFund?.targetMonths ?? 3;
const essentials = monthlyEssentials(expenses);
const runway = runwayMonths(cash, essentials);
const target = emergencyFundTarget(essentials, targetMonths);
const etaMonths = monthsToTarget(cash, target, monthlySavings);

const runwayLabel =
  runway === null ? '—'
  : runway < 1 ? `~${Math.round(runway * 4.345)} weeks`
  : `${runway.toFixed(1)} months`;

const etaLabel = (() => {
  if (etaMonths === null) return '—';
  if (etaMonths === 0) return 'Funded';
  const d = new Date();
  d.setMonth(d.getMonth() + etaMonths);
  return `~${etaMonths} month${etaMonths === 1 ? '' : 's'} (${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})`;
})();

const handleTargetMonths = (m: number) => {
  const next: EmergencyFundState = { targetMonths: m };
  setEmergencyFund?.(next);
  onSync({ emergencyFund: next });
};
```

4. Insert this section immediately after the Row 1 Hero `</section>` (before the `{/* ── Row 2 Left ... */}` comment):

```tsx
{/* ── Emergency Fund & Runway ── */}
<section className="col-span-12">
  <div className="bg-surface-container-low p-6 rounded-xl">
    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
      <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">
        Emergency Fund &amp; Runway
      </h2>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">Target</span>
        <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-full">
          {[3, 4, 5, 6].map(m => (
            <button
              key={m}
              onClick={() => handleTargetMonths(m)}
              className={`px-3 py-1 text-[10px] font-bold rounded-full tabular-nums transition-colors ${
                targetMonths === m ? 'bg-surface-container-highest text-primary' : 'text-secondary hover:text-on-surface'
              }`}
            >
              {m}M
            </button>
          ))}
        </div>
      </div>
    </div>

    {essentials <= 0 ? (
      <p className="text-secondary text-sm italic">
        Mark your recurring expenses as "Essential" in the Expenses tab to track your runway and emergency fund target.
      </p>
    ) : (
      <>
        {runway !== null && runway < 1 && (
          <div className="mb-6 p-3 bg-[#F26B6B]/10 border border-[#F26B6B]/20 rounded-lg">
            <p className="text-[#F26B6B] text-xs font-bold">
              Critical: less than one month of essential costs in cash.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Runway</p>
            <p className="text-2xl font-bold text-on-surface tabular-nums tracking-tight">{runwayLabel}</p>
            <p className="text-xs text-secondary mt-1">{fmt(essentials)} essential costs / month</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">
              Emergency Fund · {fmt(target)} target
            </p>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden my-3">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, target > 0 ? (cash / target) * 100 : 0)}%` }}
              />
            </div>
            <p className="text-xs text-secondary tabular-nums">
              {fmt(cash)} of {fmt(target)} ({target > 0 ? Math.min(100, Math.round((cash / target) * 100)) : 0}%)
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Fully Funded</p>
            <p className="text-2xl font-bold text-on-surface tabular-nums tracking-tight">{etaLabel}</p>
            <p className="text-xs text-secondary mt-1">
              {monthlySavings > 0 ? `at ${fmt(monthlySavings)} / month` : 'set a monthly savings target'}
            </p>
          </div>
        </div>
      </>
    )}
  </div>
</section>
```

Note: `fmt` and `cash` already exist in the component (`SavingsDashboard.tsx:41,119`) — do not redefine them. Both are declared before the JSX `return`, so the new section can use them as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/EmergencyFund.test.tsx tests/frontend/SavingsDashboard.test.tsx`
Expected: PASS — both the new tests and the pre-existing hub tests.

- [ ] **Step 5: Wire `emergencyFund` through `App.tsx`**

1. Add `EmergencyFundState` to the type import on line 2.
2. After the `fire` state (line 104), add:

```tsx
const [emergencyFund, setEmergencyFund] = usePersistedState<EmergencyFundState>('emergency_fund', { targetMonths: 3 });
```

3. In `performCloudPull` (after `if (data.history) setHistory(data.history);`, line 133), add:

```tsx
if (data.emergencyFund) setEmergencyFund(data.emergencyFund);
```

and add `setEmergencyFund` to the `useCallback` dependency array (line 149).

4. In `triggerSync` (line 158), change the payload line to:

```tsx
const payload = {
  expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund,
  ...overrides
};
```

and add `emergencyFund` to the dependency array (line 176).

5. Update BOTH `SavingsDashboard` usages (the `'savings'` case, line 236, and the `default` case, line 244) to add:

```tsx
expenses={expenses} emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund}
```

- [ ] **Step 6: Carry `emergencyFund` through `DataManagement.tsx`**

Without this, the Data tab's "push" would omit `emergencyFund` and `pushToCloud` would overwrite the blob without it.

1. Add to the type import: `EmergencyFundState`.
2. In `DataManagementProps`, after `netWorthData: NetWorthState;` add `emergencyFund: EmergencyFundState;`, and with the other setters add `setEmergencyFund: (data: EmergencyFundState) => void;`. Add both to the component's destructured props.
3. `handleCloudSyncPush` payload (line 91):

```tsx
const payload = { expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund };
```

4. `handleCloudSyncPull`, after `if (data.netWorthData) setNetWorthData(data.netWorthData);` (line 123):

```tsx
if (data.emergencyFund) setEmergencyFund(data.emergencyFund);
```

5. In `App.tsx` `'data'` case (line 243), add `emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund}` to the `<DataManagement ... />` props.

- [ ] **Step 7: Run the full suite, then commit**

Run: `npx vitest run`
Expected: PASS across all files.

```bash
git add components/SavingsDashboard.tsx components/DataManagement.tsx App.tsx tests/frontend/EmergencyFund.test.tsx
git commit -m "feat: emergency fund & runway card on savings hub"
```

---

### Task 5: Debts tab — loan CRUD + avalanche table

**Files:**
- Create: `components/Debts.tsx`
- Modify: `App.tsx` (loans state, pull, payload, desktop + mobile nav, render case)
- Modify: `components/DataManagement.tsx` (carry `loans` in payload/pull)
- Test: `tests/frontend/Debts.test.tsx`

**Interfaces:**
- Consumes: `Loan`, `monthlyInterest`, `sortByAvalanche`, `totalLoanBalance`, `num` (Tasks 1–2).
- Produces: `Debts` component with props `{ loans: Loan[]; setLoans: React.Dispatch<React.SetStateAction<Loan[]>>; expenses?: Expense[]; netWorthData: NetWorthState; onSync?: (overrides?: any) => Promise<void> }`. App persists `loans` under localStorage key `'loans'`, syncs blob key `loans`. Loan rows carry `data-testid="loan-row"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/Debts.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Debts } from '../../components/Debts';
import { Loan, NetWorthState } from '../../types';

const loans: Loan[] = [
  { id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 },
  { id: 'l2', name: 'Dispo', balance: 1200, interestRate: 11, monthlyPayment: 50 },
];

const nw = { accumulatedSavings: 38000 } as NetWorthState;

describe('Debts tab', () => {
  it('orders loans by interest rate (avalanche) and marks the top one', () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} />);
    const rows = screen.getAllByTestId('loan-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Dispo');
    expect(rows[0].textContent).toContain('PAY FIRST');
    expect(rows[1].textContent).toContain('Sparkasse Loan');
  });

  it('shows per-loan monthly interest and totals', () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} />);
    expect(document.body.textContent).toContain('€225'); // 36k @ 7.5%
    expect(document.body.textContent).toContain('€11');  // 1.2k @ 11%
    expect(document.body.textContent).toContain('€37,200'); // total balance
  });

  it('adds a loan through the form', () => {
    const setLoans = vi.fn();
    render(<Debts loans={[]} setLoans={setLoans} netWorthData={nw} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Car Loan'), { target: { value: 'Car Loan' } });
    fireEvent.change(screen.getByPlaceholderText('Remaining balance'), { target: { value: '8000' } });
    fireEvent.change(screen.getByPlaceholderText('Annual rate %'), { target: { value: '4.9' } });
    fireEvent.change(screen.getByPlaceholderText('Monthly payment'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Add Loan'));
    expect(setLoans).toHaveBeenCalledTimes(1);
    expect(setLoans.mock.calls[0][0][0]).toMatchObject({ name: 'Car Loan', balance: 8000, interestRate: 4.9, monthlyPayment: 250 });
  });

  it('shows an empty state with no loans', () => {
    render(<Debts loans={[]} setLoans={() => {}} netWorthData={nw} />);
    expect(screen.getByText(/No loans tracked yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/Debts.test.tsx`
Expected: FAIL — cannot resolve `../../components/Debts`.

- [ ] **Step 3: Create `components/Debts.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { Loan, Expense, NetWorthState } from '../types';
import { Trash2 } from 'lucide-react';
import { monthlyInterest, sortByAvalanche, totalLoanBalance, num } from '../utils/finance';

interface DebtsProps {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  netWorthData: NetWorthState;
  expenses?: Expense[];
  onSync?: (overrides?: any) => Promise<void>;
}

export const Debts: React.FC<DebtsProps> = ({ loans, setLoans, netWorthData, expenses = [], onSync }) => {
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newPayment, setNewPayment] = useState('');
  const [newLender, setNewLender] = useState('');

  const sorted = useMemo(() => sortByAvalanche(loans), [loans]);
  const totalBalance = totalLoanBalance(loans);
  const totalMonthlyInterest = loans.reduce((s, l) => s + monthlyInterest(l), 0);

  const fmt = (n: number) =>
    '€' + num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleAdd = async () => {
    const balance = parseFloat(newBalance);
    const rate = parseFloat(newRate);
    if (!newName || isNaN(balance) || balance <= 0 || isNaN(rate) || rate < 0) return;
    const loan: Loan = {
      id: crypto.randomUUID(),
      name: newName,
      balance,
      interestRate: rate,
      monthlyPayment: parseFloat(newPayment) || 0,
      lender: newLender || undefined,
    };
    const updated = [...loans, loan];
    setLoans(updated);
    if (onSync) await onSync({ loans: updated });
    setNewName(''); setNewBalance(''); setNewRate(''); setNewPayment(''); setNewLender('');
  };

  const handleDelete = async (id: string) => {
    const updated = loans.filter(l => l.id !== id);
    setLoans(updated);
    if (onSync) await onSync({ loans: updated });
  };

  return (
    <div className="px-8 py-8 max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* ── Add Loan form ── */}
      <section className="lg:col-span-4">
        <div className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
          <div>
            <h2 className="text-on-surface font-semibold text-sm uppercase tracking-wider">Add Loan</h2>
            <p className="text-secondary text-xs opacity-70">Track each debt individually</p>
          </div>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Car Loan"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors" />
          <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)}
            placeholder="Remaining balance"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
          <div className="grid grid-cols-2 gap-4">
            <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)}
              placeholder="Annual rate %"
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
            <input type="number" value={newPayment} onChange={e => setNewPayment(e.target.value)}
              placeholder="Monthly payment"
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors" />
          </div>
          <input type="text" value={newLender} onChange={e => setNewLender(e.target.value)}
            placeholder="Lender (optional)"
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-colors" />
          <button onClick={handleAdd}
            className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold py-4 rounded-lg shadow-lg hover:opacity-90 transition-all active:scale-[0.98]">
            Add Loan
          </button>
        </div>
      </section>

      {/* ── Avalanche table ── */}
      <section className="lg:col-span-8 space-y-6">
        <div className="bg-surface-container-low p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase">Payoff Order (Avalanche)</h2>
            <span className="text-secondary text-[10px] font-bold uppercase tracking-widest">{loans.length} active</span>
          </div>

          {sorted.length === 0 ? (
            <p className="text-secondary text-sm italic text-center py-8">
              No loans tracked yet. Add your first loan to see the payoff order.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((loan, i) => (
                <div key={loan.id} data-testid="loan-row"
                  className="bg-surface-container-high/40 p-4 rounded-xl flex items-center justify-between gap-4 group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-on-surface truncate">{loan.name}</p>
                      {i === 0 && (
                        <span className="text-[10px] py-0.5 px-2 bg-[#F26B6B]/10 text-[#F26B6B] rounded-full font-bold uppercase tracking-tighter shrink-0">
                          PAY FIRST
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary/60">
                      {loan.lender ? `${loan.lender} · ` : ''}{num(loan.interestRate)}% · {fmt(loan.monthlyPayment)}/month
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-bold tabular-nums text-on-surface">{fmt(loan.balance)}</p>
                      <p className="text-[10px] text-[#F26B6B] font-bold tabular-nums">{fmt(monthlyInterest(loan))}/mo interest</p>
                    </div>
                    <button onClick={() => handleDelete(loan.id)}
                      className="opacity-0 group-hover:opacity-100 text-secondary hover:text-[#F26B6B] transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loans.length > 0 && (
            <div className="mt-6 pt-4 border-t border-outline-variant/10 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Total Debt</p>
                <p className="text-lg font-bold text-on-surface tabular-nums">{fmt(totalBalance)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Interest Cost / Month</p>
                <p className="text-lg font-bold text-[#F26B6B] tabular-nums">{fmt(totalMonthlyInterest)}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
```

(`expenses` is accepted now but only used by the Task 6 simulator.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/Debts.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire loans through `App.tsx` and `DataManagement.tsx`**

In `App.tsx`:
1. Add `Loan` to the type import (line 2) and `import { Debts } from './components/Debts';` with the other component imports.
2. After the `emergencyFund` state, add:

```tsx
const [loans, setLoans] = usePersistedState<Loan[]>('loans', []);
```

3. `performCloudPull`: add `if (data.loans) setLoans(data.loans);` next to the other setters, and `setLoans` to the dependency array.
4. `triggerSync`: add `loans` to the payload object and to the dependency array.
5. Desktop nav `tabs` (line 70): insert after the `networth` entry:

```tsx
{ id: 'debts' as ActiveTab, label: 'Debts' },
```

6. Mobile nav `mobileBottomTabs` (line 82): insert after the `networth` entry:

```tsx
{ id: 'debts', label: 'Debts', icon: 'credit_card' },
```

7. `renderContent` switch: add before `case 'fire'`:

```tsx
case 'debts': return <Debts loans={loans} setLoans={setLoans} netWorthData={netWorthData} expenses={expenses} onSync={syncCallback} />;
```

In `components/DataManagement.tsx` (same pattern as Task 4 Step 6):
1. Props: `loans: Loan[];` and `setLoans: (data: Loan[]) => void;` (import `Loan`), destructure both.
2. Push payload: add `loans`.
3. Pull: `if (data.loans) setLoans(data.loans);`
4. `App.tsx` `'data'` case: add `loans={loans} setLoans={setLoans}`.

- [ ] **Step 6: Run the full suite, then commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add components/Debts.tsx components/DataManagement.tsx App.tsx tests/frontend/Debts.test.tsx
git commit -m "feat: debts tab with avalanche-ordered loan tracker"
```

---

### Task 6: Lump-sum payoff simulator with liquidity guard

**Files:**
- Modify: `components/Debts.tsx`
- Test: `tests/frontend/Debts.test.tsx` (append)

**Interfaces:**
- Consumes: `simulatePayoff`, `monthlyEssentials`, `runwayMonths` (Tasks 1–2); `netWorthData.accumulatedSavings` as liquid cash; `expenses` for essentials.
- Produces: simulator UI with `data-testid="payoff-loan-select"` and `data-testid="payoff-amount-input"`.

- [ ] **Step 1: Append the failing tests to `tests/frontend/Debts.test.tsx`**

Append (reuses the `loans` and `nw` fixtures; add `Expense, ExpenseCategory` to the types import):

```tsx
import { Expense, ExpenseCategory } from '../../types';

const essentials: Expense[] = [
  { id: 'e1', name: 'Rent', amount: 1500, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
  { id: 'e2', name: 'Home loans', amount: 745, category: ExpenseCategory.HOUSING, isRecurring: true, recurringFrequency: 'monthly', date: '2026-07-01', isEssential: true },
];

describe('Payoff simulator', () => {
  const setup = () => {
    render(<Debts loans={loans} setLoans={() => {}} netWorthData={nw} expenses={essentials} />);
    fireEvent.change(screen.getByTestId('payoff-loan-select'), { target: { value: 'l1' } });
  };

  it('warns when a payoff would leave less than one month of essentials', () => {
    setup();
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '36000' } });
    // €38,000 − €36,000 = €2,000 < €2,245 essentials
    expect(screen.getByText(/Leaves less than one month of essentials/)).toBeTruthy();
    expect(document.body.textContent).toContain('€35,755'); // max safe payoff
  });

  it('shows savings and new runway for a buffer-safe payoff', () => {
    setup();
    fireEvent.change(screen.getByTestId('payoff-amount-input'), { target: { value: '33000' } });
    expect(screen.queryByText(/Leaves less than one month/)).toBeNull();
    expect(document.body.textContent).toContain('€206');    // interest saved / month
    expect(document.body.textContent).toContain('€5,000');  // cash after payoff
    expect(document.body.textContent).toContain('2.2 months'); // new runway
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/frontend/Debts.test.tsx`
Expected: FAIL — `payoff-loan-select` testid not found.

- [ ] **Step 3: Add the simulator to `components/Debts.tsx`**

1. Extend the finance import:

```tsx
import { monthlyInterest, sortByAvalanche, totalLoanBalance, num, monthlyEssentials, simulatePayoff } from '../utils/finance';
```

2. Add state and computations inside the component (after `handleDelete`):

```tsx
const [payoffLoanId, setPayoffLoanId] = useState('');
const [payoffAmount, setPayoffAmount] = useState('');

const liquidCash = num(netWorthData.accumulatedSavings);
const essentialsPerMonth = monthlyEssentials(expenses);
const selectedLoan = loans.find(l => l.id === payoffLoanId) || sorted[0];
const payAmount = parseFloat(payoffAmount);
const sim = selectedLoan && !isNaN(payAmount) && payAmount > 0
  ? simulatePayoff(selectedLoan, payAmount, liquidCash, essentialsPerMonth)
  : null;
```

3. Add this section inside the right column (`lg:col-span-8`), after the avalanche-table card:

```tsx
{/* ── Payoff simulator ── */}
{loans.length > 0 && (
  <div className="bg-surface-container-low p-6 rounded-xl">
    <h2 className="text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-2">Lump-Sum Payoff Simulator</h2>
    <p className="text-xs text-secondary mb-4 tabular-nums">
      Liquid cash: {fmt(liquidCash)}
      {essentialsPerMonth > 0 ? ` · essentials ${fmt(essentialsPerMonth)}/month` : ''}
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <select
        data-testid="payoff-loan-select"
        value={selectedLoan?.id || ''}
        onChange={e => setPayoffLoanId(e.target.value)}
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface focus:outline-none appearance-none cursor-pointer"
      >
        {sorted.map(l => (
          <option key={l.id} value={l.id}>{l.name} ({fmt(l.balance)})</option>
        ))}
      </select>
      <input
        data-testid="payoff-amount-input"
        type="number"
        value={payoffAmount}
        onChange={e => setPayoffAmount(e.target.value)}
        placeholder="Amount to pay off"
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface tabular-nums focus:outline-none focus:border-primary transition-colors"
      />
    </div>

    {sim && (
      <>
        {sim.breachesBuffer && (
          <div className="mb-4 p-3 bg-[#F26B6B]/10 border border-[#F26B6B]/20 rounded-lg">
            <p className="text-[#F26B6B] text-xs font-bold">
              Leaves less than one month of essentials in cash. Max safe payoff: {fmt(sim.safeAmount)}.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Cash After Payoff</p>
            <p className="text-lg font-bold text-on-surface tabular-nums">{fmt(sim.newLiquidCash)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">Interest Saved / Month</p>
            <p className="text-lg font-bold text-[#3DD68C] tabular-nums">{fmt(sim.monthlyInterestSaved)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium mb-1">New Runway</p>
            <p className="text-lg font-bold text-on-surface tabular-nums">
              {sim.newRunwayMonths === null ? '—' : `${sim.newRunwayMonths.toFixed(1)} months`}
            </p>
          </div>
        </div>
      </>
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/Debts.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite, then commit**

Run: `npx vitest run`

```bash
git add components/Debts.tsx tests/frontend/Debts.test.tsx
git commit -m "feat: lump-sum payoff simulator with liquidity guard"
```

---

### Task 7: Net Worth liabilities driven by tracked loans

**Files:**
- Modify: `components/NetWorth.tsx`
- Modify: `App.tsx:239` (pass `loans` to `NetWorth`)
- Test: `tests/frontend/NetWorthLiabilities.test.tsx`

**Interfaces:**
- Consumes: `Loan`, `totalLoanBalance` (Tasks 1–2).
- Produces: `NetWorth` accepts optional `loans?: Loan[]` (default `[]`). When loans exist, they REPLACE `netWorthData.remainingLoan` as the liabilities figure (net worth, debt ratio, snapshot `total_liabilities`, hero display).

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/NetWorthLiabilities.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetWorth } from '../../components/NetWorth';
import { Loan, NetWorthState } from '../../types';

const nw: NetWorthState = { goldInvestment: 0, otherAssets: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 0 };
const loans: Loan[] = [{ id: 'l1', name: 'Sparkasse Loan', balance: 36000, interestRate: 7.5, monthlyPayment: 500 }];

const renderNetWorth = (loanList: Loan[] = loans) =>
  render(
    <NetWorth
      netWorthData={nw} setNetWorthData={() => {}}
      currentSavings={1000} stocks={[]} portfolio={[]}
      history={[]} setHistory={() => {}}
      loans={loanList}
    />
  );

describe('Net worth liabilities from loans', () => {
  it('uses the sum of tracked loans as total liabilities', () => {
    renderNetWorth();
    expect(document.body.textContent).toContain('36,000');
    // assets €1,000 − liabilities €36,000 → negative
    expect(screen.getByText('Liabilities exceed assets')).toBeTruthy();
  });

  it('falls back to remainingLoan when no loans are tracked', () => {
    render(
      <NetWorth
        netWorthData={{ ...nw, remainingLoan: 500 }} setNetWorthData={() => {}}
        currentSavings={1000} stocks={[]} portfolio={[]}
        history={[]} setHistory={() => {}}
        loans={[]}
      />
    );
    expect(screen.getByText('Assets exceed liabilities')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frontend/NetWorthLiabilities.test.tsx`
Expected: FAIL — first test: `'36,000'` not in the document (the unknown `loans` prop is ignored, liabilities remain 0 → "Assets exceed liabilities").

- [ ] **Step 3: Implement in `components/NetWorth.tsx`**

1. Imports: add `Loan` to the types import; add `import { totalLoanBalance } from '../utils/finance';`.
2. Props: add `loans?: Loan[];` to `NetWorthProps`; destructure with default `loans = []`.
3. After `portfolioValue` (line 25), add:

```tsx
const totalLiabilities = loans.length > 0 ? totalLoanBalance(loans) : netWorthData.remainingLoan;
```

4. Replace every liabilities read of `netWorthData.remainingLoan` with `totalLiabilities`:
   - line 28: `const netWorth = totalAssets - totalLiabilities;`
   - line 48 (snapshot): `total_liabilities: totalLiabilities,`
   - line 119: `const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;`
   - line 224 (hero): `-€{fmt(totalLiabilities)}`
   - line 333 (liability card amount): `-€{fmt(totalLiabilities)}`

   Keep the `remainingLoan` input (line 322-328) untouched — it remains the manual fallback.
5. Under the Remaining Loan input (after the closing `</div>` of the input wrapper, line ~329), add:

```tsx
{loans.length > 0 && (
  <p className="text-[10px] text-secondary/50 mt-1">
    Using {loans.length} loan{loans.length !== 1 ? 's' : ''} from the Debts tab
  </p>
)}
```

6. In `App.tsx` `'networth'` case (line 239), add `loans={loans}` to the `<NetWorth ... />` props.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/frontend/NetWorthLiabilities.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite, then commit**

Run: `npx vitest run`
Expected: PASS across all files.

```bash
git add components/NetWorth.tsx App.tsx tests/frontend/NetWorthLiabilities.test.tsx
git commit -m "feat: net worth liabilities driven by tracked loans"
```

---

## Post-plan verification (manual, after Task 7)

1. Run the Supabase migration from Task 3 in the SQL editor (if not already done).
2. `npm run dev` → mark a recurring expense Essential → Savings Hub shows runway/target; add two loans in Debts → avalanche order + simulator; Net Worth hero shows the loan total; press the header sync button, reload, confirm loans/emergencyFund/isEssential survive a pull.
