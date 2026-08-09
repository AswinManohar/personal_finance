# Manual emergency fund

**Date:** 2026-08-06
**Status:** Approved, not yet implemented

## Problem

The emergency fund card on the Savings Hub derives four numbers from a single
manually-flagged input, and the chain is long enough that nobody can predict what
the card will show:

```
expense.isEssential  ─┐
expense.isRecurring  ─┼─→ monthlyAmount ─→ monthlyEssentials ─┬─→ runwayMonths ──→ "Runway"
expense.frequency    ─┘                                       │
                                                              └─→ emergencyFundTarget ─┬─→ "Target"
emergencyFund.targetMonths ───────────────────────────────────────────────────────────┤
                                                                                       └─→ monthsToTarget ─→ "Fully Funded"
netWorthData.accumulatedSavings ──────────────────────────────────────────────────────────→ progress %
netWorthData.monthlyRecurringSavings ─────────────────────────────────────────────────────→ ETA
```

Five inputs across three screens, and the whole card silently collapses to an
empty state when no expense happens to carry `isEssential`. The target is the
number a person already knows — asking them to reverse-engineer it by tagging
expenses is work in the wrong direction.

Replace the derivation with two fields.

## Decisions

Four choices were settled before design, recorded here so the reasoning survives:

1. **Depth of the cut** — both the target *and* the fund's current balance are
   entered by hand. Halfway (target only) does not work: runway still needs
   `monthlyEssentials`, so the essentials machinery would survive in the Savings
   Hub for one readout.
2. **Relationship to assets** — the fund is a *carve-out of existing Cash*, not new
   money. `totalAssets` is unchanged. The alternative (a sixth asset line) would
   double-count for anyone whose Cash figure already includes their fund, and
   silently inflate net worth.
3. **Over-allocation** — entering a fund larger than tracked Cash warns but saves.
   Blocking fights the common case of funding the account before updating the Cash
   figure. Silence would show €0 free cash with no explanation.
4. **Legacy `targetMonths`** — hard cut, no migration. See below.

## State

```ts
// types.ts
export interface EmergencyFundState {
  /** What the fund should hold, in €. Entered by hand. */
  targetAmount: number;
  /** What the fund holds today, in €. Entered by hand; a slice of accumulatedSavings. */
  currentAmount: number;
}
```

Default at `App.tsx:103` becomes `{ targetAmount: 0, currentAmount: 0 }`.

**No migration code.** Existing stored blobs are `{ targetMonths: 3 }`. Reading
`.targetAmount` off one yields `undefined`, which the component's existing `num()`
coercion turns into `0` — precisely the hard-cut behavior we want, arrived at for
free. The stale `targetMonths` key lingers in localStorage until the next write
replaces the object wholesale. The cloud pull at `App.tsx:149` behaves identically.
Dropping `targetMonths` from the interface is what makes this safe: nothing can read
it by accident afterwards.

The seeding alternative (compute `essentials × targetMonths` once, then go manual)
was rejected. It needs `expenses` to be resolved before `emergencyFund` in
`App.tsx`, creating an ordering dependency between two `usePersistedState` hooks
that have none today — the kind of coupling that holds locally and breaks on a cold
cloud pull where expenses arrive late. The cost of the hard cut is retyping one
number, once.

## Component changes

`components/SavingsDashboard.tsx`

Removed: `essentials`, `runway`, `target`, `etaMonths` (lines 60-65), `runwayLabel`
(67-70), `etaLabel` (81-84), `etaSub` (86-92), `handleTargetMonths` (94-98), and the
`ChipGroup` import — used nowhere else in the file. `EmptyState` stays; it has a
second use at line 379.

Added:

```ts
const efCurrent  = num(emergencyFund?.currentAmount);
const efTarget   = num(emergencyFund?.targetAmount);
const efPct      = pct(efCurrent, efTarget);        // pct() already guards ÷0
const freeCash   = Math.max(0, cash - efCurrent);
const efOverCash = efCurrent > cash;
```

`utils/finance.ts` — delete `emergencyFundTarget` (32-33) and `monthsToTarget`
(36-41), both unreferenced afterwards.

**`monthlyEssentials` and `runwayMonths` must stay.** `Debts.tsx:106` computes
essentials and hands them to `simulatePayoff`, which uses `runwayMonths` internally
for `breachesBuffer` and `safeAmount` (`finance.ts:82-94`) — the check that stops a
loan payoff from draining the buffer. Runway leaves the Savings Hub UI; the helper
stays alive for Debts. `monthlyAmount` and `MONTHLY_FACTORS` stay for the same
reason, plus the subscriptions list at `SavingsDashboard.tsx:73`.

## The card

```
┌─ Emergency Fund ─────────────────────┐
│  Current in fund   [€ 2192       ]   │
│  Target            [€ 6735       ]   │
│  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░  33%       │
│  €2,192 of €6,735                    │
│  €2,808 free cash outside the fund   │
└──────────────────────────────────────┘
```

Two `Input`s following the existing `handleSavingsUpdate` pattern
(`SavingsDashboard.tsx:103-111`): parse on change, set state, `onSync`. Same
`type="number"` / `prefix="€"` / `value={x || ''}` idiom as the Cash Savings Balance
field at line 321, so the card reads as native to the screen. Writing on every
keystroke matches what the sibling fields already do; consistency wins over
debouncing here.

The header keeps `SectionLabel`, loses the `ChipGroup`.

**Over-allocation notice** — when `efOverCash`, an inline box reusing the existing
critical-runway treatment (`bg-[rgba(242,107,107,0.1)]`, `border-negative/20`,
`SavingsDashboard.tsx:211-215`):

> Your emergency fund is larger than your tracked cash (€1,000). Update Cash Savings
> Balance.

The value saves regardless; `freeCash` floors at 0.

**Empty state** — when both amounts are 0, the `EmptyState icon="shield"` stays but
its copy stops pointing at the Expenses tab and asks for the two amounts instead.

**Asset Breakdown stays at four categories, Cash whole.** Splitting it into
Emergency Fund + Free Cash would mean inventing a fifth colour for a stacked bar,
legend, and donut that currently agree by construction (`SavingsDashboard.tsx:129-142`
keeps its colours literal for exactly that reason). The carve-out is already legible
on the EF card via the free-cash line, and `totalAssets` is untouched either way.
Deliberately deferred, not forgotten.

## Blast radius

| File | Change |
|---|---|
| `types.ts:124` | Replace `targetMonths` with the two amounts |
| `App.tsx:103` | New default value |
| `components/SavingsDashboard.tsx` | Card rewrite, ~35 lines out, ~30 in |
| `utils/finance.ts:32-41` | Delete two helpers |
| `tests/frontend/EmergencyFund.test.tsx` | Rewrite |
| `tests/frontend/finance.test.ts:59-75` | Delete two describe blocks |

Untouched: `DataManagement.tsx` (passes `emergencyFund` through opaquely at lines 106
and 139), `Debts.tsx`, the API, and the sync payload — `emergencyFund` is a JSON blob
end to end, so there is no schema change and no backend work.

## Testing

`tests/frontend/EmergencyFund.test.tsx` is rewritten against the new behavior:

- renders both manual amounts and the correct percentage
- computes free cash as `cash − efCurrent`
- shows the over-cash notice and floors free cash at 0 when `efCurrent > cash`
- shows the empty state when both amounts are unset
- renders without `NaN` when handed a legacy `{ targetMonths: 3 }` object

That last case is the regression that matters — it is what proves the
no-migration-code claim above, rather than leaving it as an assertion in prose.

`tests/frontend/finance.test.ts` keeps its `monthlyEssentials` and `runwayMonths`
coverage untouched, since Debts still depends on both. Only the
`emergencyFundTarget` and `monthsToTarget` describe blocks are removed.

## Out of scope

- Splitting Cash in the Asset Breakdown (see above)
- Any change to how `accumulatedSavings` itself is entered or synced
- Touching the Debts tab's use of essentials
