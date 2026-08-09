# Savings Hub Aesthetic Reform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reform the Savings Hub page typography and color palette for visual consistency — keeping the layout unchanged.

**Architecture:** All changes are Tailwind class string edits to a single component file. No new files, no new components. The dev server is the only verification tool (no unit test framework is present in the project).

**Tech Stack:** React, TypeScript, Tailwind CSS (CDN via `index.html`), Vite dev server

**Spec:** `docs/superpowers/specs/2026-03-12-savings-hub-aesthetic-reform-design.md`

---

## Chunk 1: Hero Card + Asset Breakdown Cards

### Task 1: Hero card — gradient and eyebrow label

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 67–73)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the browser to the dev server URL, navigate to the **Savings Hub** tab. Keep it open for visual verification throughout.

- [ ] **Step 2: Update the hero card gradient**

In `components/SavingsDashboard.tsx`, find line 67:

```tsx
// BEFORE
<Card className="lg:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-8 relative overflow-hidden border-none shadow-2xl shadow-indigo-200">
```

Change `to-blue-700` → `to-violet-600`:

```tsx
// AFTER
<Card className="lg:col-span-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-8 relative overflow-hidden border-none shadow-2xl shadow-indigo-200">
```

- [ ] **Step 3: Update the hero eyebrow label**

Find line 72:

```tsx
// BEFORE
<p className="text-indigo-100 text-sm font-bold uppercase tracking-widest mb-2">Total Money Saved</p>
```

Change to:

```tsx
// AFTER
<p className="text-white/55 text-xs font-medium uppercase tracking-wide mb-2">Total Money Saved</p>
```

- [ ] **Step 4: Visually verify in browser**

Check the hero card:
- Gradient now flows indigo → violet (warmer, not cold blue)
- "TOTAL MONEY SAVED" label is quieter — lighter weight and opacity, tighter tracking

---

### Task 2: Hero card — sub-labels and sub-values

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 77–83)

- [ ] **Step 1: Update hero sub-labels**

Find lines 77 and 81 (two labels: "Market Equity" and "Liquid Assets"):

```tsx
// BEFORE (both lines)
<p className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">Market Equity</p>
<p className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">Liquid Assets</p>
```

Change to:

```tsx
// AFTER
<p className="text-white/45 text-[10px] font-medium uppercase tracking-wide mb-1">Market Equity</p>
<p className="text-white/45 text-[10px] font-medium uppercase tracking-wide mb-1">Liquid Assets</p>
```

- [ ] **Step 2: Update hero sub-values**

Find lines 78 and 82 (the `€` amount values beneath each sub-label):

```tsx
// BEFORE (both lines)
<p className="text-xl font-bold">€{(portfolioValue + stockValue).toLocaleString()}</p>
<p className="text-xl font-bold">€{(netWorthData.goldInvestment + netWorthData.accumulatedSavings).toLocaleString()}</p>
```

Change to:

```tsx
// AFTER
<p className="text-lg font-semibold">€{(portfolioValue + stockValue).toLocaleString()}</p>
<p className="text-lg font-semibold">€{(netWorthData.goldInvestment + netWorthData.accumulatedSavings).toLocaleString()}</p>
```

- [ ] **Step 3: Visually verify in browser**

Check the hero card bottom section:
- Sub-labels ("MARKET EQUITY", "LIQUID ASSETS") are more subdued — `font-medium` with softer opacity
- Sub-values are slightly smaller (`text-lg`) and lighter weight (`font-semibold`) — the hero total now clearly dominates

---

### Task 3: Asset breakdown cards — labels and values

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 220–244)

There are three asset cards in the right column: Mutual Funds (line 220–225), Stock Equity (line 226–235), Gold Holdings (line 236–245).

- [ ] **Step 1: Update Mutual Funds label and value**

Find lines 220–221:

```tsx
// BEFORE
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Mutual Funds</p>
<p className="text-xl font-black text-slate-900">€{portfolioValue.toLocaleString()}</p>
```

Change to:

```tsx
// AFTER
<p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide leading-tight">Mutual Funds</p>
<p className="text-xl font-bold text-slate-900">€{portfolioValue.toLocaleString()}</p>
```

- [ ] **Step 2: Update Stock Equity label and value**

Find lines 230–231:

```tsx
// BEFORE
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Stock Equity</p>
<p className="text-xl font-black text-slate-900">€{stockValue.toLocaleString()}</p>
```

Change to:

```tsx
// AFTER
<p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide leading-tight">Stock Equity</p>
<p className="text-xl font-bold text-slate-900">€{stockValue.toLocaleString()}</p>
```

- [ ] **Step 3: Update Gold Holdings label and value**

Find lines 240–241:

```tsx
// BEFORE
<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Gold Holdings</p>
<p className="text-xl font-black text-slate-900">€{netWorthData.goldInvestment.toLocaleString()}</p>
```

Change to:

```tsx
// AFTER
<p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide leading-tight">Gold Holdings</p>
<p className="text-xl font-bold text-slate-900">€{netWorthData.goldInvestment.toLocaleString()}</p>
```

- [ ] **Step 4: Visually verify in browser**

Check the three right-column asset cards:
- Category labels ("MUTUAL FUNDS", "STOCK EQUITY", "GOLD HOLDINGS") are lighter weight, less aggressive tracking
- Euro amounts are `font-bold` instead of `font-black` — still strong, just not maximum weight

- [ ] **Step 5: Commit Chunk 1**

```bash
git add components/SavingsDashboard.tsx
git commit -m "style: reform savings hub hero card and asset card typography/color"
```

---

## Chunk 2: Manage Liquid Cash Card + Chart Legend

### Task 4: Form labels and input values

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 137–168)

- [ ] **Step 1: Update Monthly Recurring Savings label**

Find line 139:

```tsx
// BEFORE
<label className="text-sm font-bold text-slate-700 uppercase tracking-tight">Monthly Recurring Savings</label>
```

Change to:

```tsx
// AFTER
<label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Monthly Recurring Savings</label>
```

- [ ] **Step 2: Update Monthly Recurring Savings input value and focus ring**

Find line 148 (the `<input>` inside the Monthly Recurring Savings block):

```tsx
// BEFORE
className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-2xl"
```

Change to:

```tsx
// AFTER
className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-xl"
```

- [ ] **Step 3: Update Total Accumulated Cash label**

Find line 157:

```tsx
// BEFORE
<label className="text-sm font-bold text-slate-700 uppercase tracking-tight">Total Accumulated Cash</label>
```

Change to:

```tsx
// AFTER
<label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Total Accumulated Cash</label>
```

- [ ] **Step 4: Update Total Accumulated Cash input value**

Find line 166 (the `<input>` inside the Total Accumulated Cash block):

```tsx
// BEFORE
className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-black text-2xl"
```

Change to:

```tsx
// AFTER
className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-xl"
```

Note: focus ring stays `indigo-500` — it was already correct.

- [ ] **Step 5: Visually verify in browser**

Check the Manage Liquid Cash card left column:
- Both labels ("MONTHLY RECURRING SAVINGS", "TOTAL ACCUMULATED CASH") are `text-xs font-semibold` — visually quieter than before
- Input values match the asset card values: `text-xl font-bold` (same size/weight as Mutual Funds etc.)
- Focus ring on the first input is now indigo (try clicking the input to confirm)

---

### Task 5: Manual Savings Entry heading

**Files:**
- Modify: `components/SavingsDashboard.tsx` (line 174)

- [ ] **Step 1: Update Manual Savings Entry heading**

Find line 174:

```tsx
// BEFORE
<h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
```

Change to:

```tsx
// AFTER
<h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
```

- [ ] **Step 2: Visually verify in browser**

Check the "Manual Savings Entry" section heading — subtly lighter weight than before.

---

### Task 6: 12-Month Outlook card — colors and typography

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 194–209)

- [ ] **Step 1: Update Outlook card background and border**

Find line 194:

```tsx
// BEFORE
<div className="bg-primary-50 rounded-2xl p-6 border border-primary-100 flex flex-col justify-center">
```

Change to:

```tsx
// AFTER
<div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex flex-col justify-center">
```

- [ ] **Step 2: Update Calculator icon color**

Find line 196:

```tsx
// BEFORE
<div className="p-3 bg-white rounded-xl shadow-sm"><Calculator className="text-primary-600" /></div>
```

Change to:

```tsx
// AFTER
<div className="p-3 bg-white rounded-xl shadow-sm"><Calculator className="text-indigo-600" /></div>
```

- [ ] **Step 3: Update Outlook title weight**

Find line 197:

```tsx
// BEFORE
<h4 className="font-bold text-slate-900">12-Month Outlook</h4>
```

Change to:

```tsx
// AFTER
<h4 className="font-semibold text-slate-900">12-Month Outlook</h4>
```

- [ ] **Step 4: Update Projected Balance and Net Growth value weights**

Find lines 202 and 206:

```tsx
// BEFORE line 202
<span className="font-bold text-slate-900">€{(netWorthData.accumulatedSavings + (netWorthData.monthlyRecurringSavings * 12)).toLocaleString()}</span>

// BEFORE line 206
<span className="font-bold text-emerald-600">+€{(netWorthData.monthlyRecurringSavings * 12).toLocaleString()}</span>
```

Change to:

```tsx
// AFTER line 202
<span className="font-semibold text-slate-900">€{(netWorthData.accumulatedSavings + (netWorthData.monthlyRecurringSavings * 12)).toLocaleString()}</span>

// AFTER line 206
<span className="font-semibold text-emerald-600">+€{(netWorthData.monthlyRecurringSavings * 12).toLocaleString()}</span>
```

Note: `text-emerald-600` on Net Growth stays unchanged — it is a semantic green for positive values.

- [ ] **Step 5: Visually verify in browser**

Check the 12-Month Outlook card:
- Background is now indigo-tinted (was sky-blue)
- Calculator icon is indigo
- Title and row values are `font-semibold` — slightly softer than before

---

### Task 7: Distribution Mix chart legend

**Files:**
- Modify: `components/SavingsDashboard.tsx` (lines 117–125)

- [ ] **Step 1: Update legend item classes**

Find lines 121–123 inside the `.map()` rendering the legend:

```tsx
// BEFORE
<span className="font-bold text-slate-600">{item.name}</span>
...
<span className="font-mono text-slate-900">€{item.value.toLocaleString()}</span>
```

Change to:

```tsx
// AFTER
<span className="font-medium text-slate-600">{item.name}</span>
...
<span className="font-semibold text-slate-900">€{item.value.toLocaleString()}</span>
```

- [ ] **Step 2: Visually verify in browser**

Check the Distribution Mix chart legend:
- Category names are `font-medium` — lighter, reads as label not value
- Euro values are `font-semibold` — no longer monospace, visually consistent with the rest of the page

- [ ] **Step 3: Commit Chunk 2**

```bash
git add components/SavingsDashboard.tsx
git commit -m "style: reform savings hub liquid cash card and chart legend typography/color"
```

---

## Final Verification

- [ ] **Full page visual check**

With the dev server running, go through this checklist on the Savings Hub tab:

| Element | Expected |
|---|---|
| Hero gradient | Flows indigo → violet (not blue) |
| "TOTAL MONEY SAVED" eyebrow | Light weight, soft opacity, modest tracking |
| Hero sub-labels | Very light, subdued |
| Hero sub-values | `text-lg font-semibold` — clearly lighter than the big total |
| Asset card labels | `font-medium` — quiet |
| Asset card values | `font-bold` — strong but not maximum |
| Form labels | `text-xs font-semibold` — compact and restrained |
| Input values | Match asset card values (`text-xl font-bold`) |
| First input focus ring | Indigo when focused |
| Outlook card background | Indigo tint (not sky-blue) |
| Calculator icon | Indigo |
| Outlook values | `font-semibold` |
| Chart legend names | `font-medium` |
| Chart legend values | `font-semibold`, not monospace |

- [ ] **Build check**

```bash
npm run build
```

Expected: exits with no TypeScript or build errors.

- [ ] **Final commit (if not already committed in chunks)**

If you prefer a single commit over two:

```bash
git add components/SavingsDashboard.tsx
git commit -m "style: reform savings hub typography and color consistency"
```
