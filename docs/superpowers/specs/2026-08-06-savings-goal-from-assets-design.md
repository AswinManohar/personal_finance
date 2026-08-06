# Savings goal funded from tracked assets

**Date:** 2026-08-06
**Status:** Approved, not yet implemented

## Problem

`goal.currentSavings` is a number you type into the Goal screen and nothing else
touches. The app already knows what you own — cash, stocks, mutual funds, gold,
other assets — and never once consults it when telling you how close you are to
your goal. The screen's own subtitle claims "Automated tracking for your primary
milestone" while `SavingsGoal.tsx:126` asks you to key the figure in by hand.

Worse, the number has quietly become a second definition of *cash*:

```
netWorthData.accumulatedSavings ──→ SavingsDashboard.tsx:87  totalAssets
                                    (portfolio + stocks + gold + CASH + other)

goal.currentSavings ─────────────→ NetWorth.tsx:34           totalAssets
                                    (CURRENTSAVINGS + stocks + portfolio + gold + other)
```

Two numbers, both standing for cash, edited on different screens, never
reconciled. Whichever you last touched decides which of the two totals is right,
and nothing in the UI admits the other exists.

Replace the typed figure with a sum over the assets you choose.

## Decisions

Five choices were settled before design, recorded here so the reasoning survives:

1. **What counts** — a per-asset toggle, not all-or-nothing and not per-asset
   amounts. Amounts earmarked line-by-line ("€5,000 of my €12,000 cash") are
   precise on the day you type them and stale by the next deposit; the app has no
   way to notice they've drifted.
2. **Default** — every source ticked. A goal reads as progress against everything
   you own until you say otherwise.
3. **Editing** — "Saved so far" is read-only and links to where the underlying
   figure lives. Writing back (type €18,000, watch €1,000 land in Cash) keeps the
   field typeable but lets a stock price silently overwrite what you just entered.
   A manual override that pins the number reintroduces the stale second source of
   truth this spec exists to remove.
4. **Liabilities** — assets only. Loans are not a source and are not subtracted.
   A savings goal asks whether you have put €25,000 aside; an outstanding car loan
   does not undo that you have. Net worth remains the screen that nets them off.
   Consequence: with every source ticked, "Saved so far" equals Total Tracked
   Assets on the dashboard exactly, which is the point — two screens, one number.
5. **Legacy `currentSavings`** — migrated, not cut. It is the only place some
   users have recorded a cash figure at all.

## State

```ts
// types.ts
export type GoalSource = 'cash' | 'stocks' | 'mutualFunds' | 'gold' | 'other';

export interface SavingsGoal {
  targetAmount: number;
  targetDate: string; // ISO date string
  /**
   * Which tracked assets count toward this goal. Absent means all of them, so a
   * goal synced from a device that predates this field reads as "everything"
   * without a migration.
   */
  sources?: GoalSource[];
  /**
   * @deprecated Was the typed "saved so far". Read once by the migration below,
   * then cleared. Never displayed.
   */
  currentSavings?: number;
}
```

`sources` needs no sync work: `App.tsx:192` already pushes `goal` wholesale, and
`App.tsx:145` already replaces it wholesale on pull.

The default at `App.tsx:99` drops `currentSavings` and leaves `sources` unset.

## Derivation

One helper in `utils/finance.ts`, beside `totalLoanBalance` and
`monthlyEssentials`. Three screens consume it; none computes asset values itself.

`App.tsx` calls it once inside a `useMemo` and passes the result to all three, so
the sum happens once per render and `SavingsGoal` does not need `stocks`,
`portfolio` and `netWorthData` handed to it just to add five numbers.

```ts
export interface AssetBreakdown {
  cash: number; stocks: number; mutualFunds: number; gold: number; other: number;
}

export const ALL_GOAL_SOURCES: GoalSource[] =
  ['cash', 'stocks', 'mutualFunds', 'gold', 'other'];

export const assetBreakdown = (
  netWorthData: Partial<NetWorthState>, stocks: Stock[], portfolio: PortfolioAsset[]
): AssetBreakdown => ({
  cash:        num(netWorthData?.accumulatedSavings),
  stocks:      stocks.reduce((s, x) => s + num(x.quantity) * num(x.currentPrice || x.buyPrice), 0),
  mutualFunds: portfolio.reduce((s, p) => s + num(p.currentValue), 0),
  gold:        num(netWorthData?.goldInvestment),
  other:       num(netWorthData?.otherAssets),
});

export const totalAssets = (b: AssetBreakdown): number =>
  b.cash + b.stocks + b.mutualFunds + b.gold + b.other;

/** Saved-so-far: the ticked slices. Absent sources means all of them. */
export const goalSavings = (b: AssetBreakdown, sources?: GoalSource[]): number =>
  (sources ?? ALL_GOAL_SOURCES).reduce((sum, k) => sum + b[k], 0);
```

Two deliberate details:

- `currentPrice || buyPrice`, not `??`. In this codebase a `currentPrice` of 0
  means "never fetched", not "worthless" — the existing sums at
  `SavingsDashboard.tsx:45` and `NetWorth.tsx:31` both rely on that.
- Every field passes through `num()`. `NetWorth.tsx:31-34` skips it today, so one
  undefined key from a partial cloud pull renders the whole net worth as `€NaN`.

`monthlyRecurringSavings` is deliberately **not** a source. It is a flow, not a
balance; the money it describes lands in Cash, so counting it as a sixth slice
would double it.

## Screens

### Goal (`components/SavingsGoal.tsx`)

Gains three props: `breakdown: AssetBreakdown`, `monthlySavings: number` (the one
field it needs from `netWorthData`, not the whole object), and `onNavigate`.

**Saved so far** stops being an `<Input>` and becomes a row: the derived figure, a
caption naming what is in it, and a chevron navigating to the savings dashboard,
where the real Cash figure is edited. The caption lists the ticked sources ("from
Cash, Stocks, Gold") except when all five are ticked, where it reads "from all
tracked assets" rather than running to two lines.

**Counts toward this goal** is a new list beneath the progress bar — five rows,
each a checkbox, a label, and that asset's current value. Toggling writes
`goal.sources` through the existing `handleChange` path at `SavingsGoal.tsx:42`,
so it persists and syncs on the same keystroke as everything else. Ticking zero
sources is allowed: €0, 0%, caption reads "no assets selected". The emergency-fund
work established that this app warns rather than blocks.

Edit mode ("Edit Goal") now covers **target amount and deadline only**.

**Monthly needed vs. actual.** The screen computes `monthlyNeeded` today
(`SavingsGoal.tsx:32`) and displays it against nothing, while the app already
knows what you put aside each month. Given

```ts
saved         = goalSavings(breakdown, goal.sources)
remaining     = Math.max(0, goal.targetAmount - saved)
monthsLeft    = months from today to targetDate, floored at 0   // existing, line 22-29
monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : 0      // existing, line 32
actualMonthly = num(monthlySavings)                              // netWorthData.monthlyRecurringSavings
gap           = monthlyNeeded - actualMonthly
```

exactly one verdict renders, in priority order:

| Condition | Reads |
|---|---|
| `remaining === 0` | **Goal reached** — no gap line, no forecast |
| `monthsLeft <= 0` | **Deadline passed** — €X still to go |
| `actualMonthly === 0` | **No monthly savings set** › links to the dashboard field |
| `gap <= 0` | **On track** — €X/month spare |
| `gap > 0` | **Short €X/month** — at €400 you reach €25,000 in Mar 2028, 7 months past your deadline |

The `monthsLeft <= 0` row is load-bearing, not defensive. A passed deadline
already forces `monthlyNeeded` to 0 at line 32, which makes `gap` negative and
would otherwise congratulate you with **On track** while you sit short of a
target whose date has gone.

The projected date is `ceil(remaining / actualMonthly)` months from today. Beyond
600 months it stops computing a date and reads "not within 50 years": at €5/month
against €25,000, a year like 2438 is noise, not information.

**Projection chart.** `miniBarHeights` at `SavingsGoal.tsx:61` — twelve hardcoded
bar heights — is deleted. `AreaChart` replaces it:

```ts
points   = Array.from({ length: 13 }, (_, i) => saved + actualMonthly * i)
baseline = new Array(13).fill(goal.targetAmount)   // the target reference line
```

`charts.tsx:63-65` already folds `baseline` into the min/max, so the target line
is always in frame with no change to the chart component. The series mirrors
`outlookSeries` at `SavingsDashboard.tsx:134`, so the two screens project
identically. With no monthly savings set the line is flat — the honest picture,
not a broken chart.

### Net worth (`components/NetWorth.tsx`)

`line 34` becomes `totalAssets(assetBreakdown(netWorthData, stocks, portfolio))`,
so its cash line stops being your goal and starts being your cash. The
`currentSavings` prop is removed from the component and from `App.tsx:456`.

One consequence to accept: the snapshot at `line 62` records
`savings_amount: currentSavings` today and becomes `breakdown.cash`. Existing
history rows are untouched, but rows recorded from here on mean something
slightly different from rows recorded before.

### Savings dashboard (`components/SavingsDashboard.tsx`)

Lines 44-57 and 87 are replaced by the helper. Pure refactor — same numbers, same
render. Its `assetCategories` and `distCategories` read the breakdown's fields.

## Migration

In `App.tsx`, keyed on the legacy value being present:

```
if (num(goal.currentSavings) > 0) {
  if (num(netWorthData.accumulatedSavings) === 0)
    accumulatedSavings = goal.currentSavings   // rescue: cash was only ever on the Goal screen
  clear goal.currentSavings                    // always
  sync once, carrying both overrides
}
```

A real Cash figure is never overwritten. Clearing the legacy field is what makes
this idempotent — the condition cannot be true twice. That matters because
`App.tsx:145` replaces `goal` wholesale on every pull, so a phone that has not
opened the app yet will hand the old field back later; when it does, cash is
already non-zero, the copy is skipped, and the field is cleared again.

## Testing

TDD throughout. Four groups:

**`tests/frontend/finance.test.ts`** (extend) — `assetBreakdown` against a partial
`netWorthData` (the `€NaN` case), `currentPrice: 0` falling back to `buyPrice`,
`goalSavings` with `undefined` / `[]` / a subset, `totalAssets`.

**`tests/frontend/SavingsGoal.test.tsx`** (new) — saved-so-far renders the sum of
ticked sources and exposes no input; toggling a source changes it and fires
`onSync`; target and deadline still edit and sync; each of the five verdicts,
including a passed deadline with money still to go reading **Deadline passed**
rather than **On track**; projection points.

**`tests/frontend/goalMigration.test.tsx`** (new) — cash 0 + legacy 8000 → cash
8000, legacy cleared; cash 12000 + legacy 8000 → cash untouched, legacy cleared;
a second run changes nothing; a pull re-delivering the legacy field does not
re-copy.

**Regression** — `SavingsDashboard.test.tsx` passes **unmodified**. That is the
proof the helper extraction is behaviour-preserving, and the reason to refactor
the dashboard rather than leave it summing on its own.

## Out of scope

- Multiple savings goals. The screen has always held one.
- Editing Cash, Gold or Other from the Goal screen. It links out instead.
- Any change to how `monthlyRecurringSavings` is entered.
