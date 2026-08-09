# Savings Hub Aesthetic Reform — Design Spec

**Date:** 2026-03-12
**Scope:** `components/SavingsDashboard.tsx` only
**Approach:** Option B — Typography + Color Harmony
**Layout:** Unchanged

---

## Goal

Reform the visual aesthetic of the Savings Hub page to feel sleek and internally consistent. All fonts use Inter (already set globally). The problem is inconsistent font weights (overuse of `font-black`), mismatched label styles, and a color palette that mixes sky-blue `primary` tokens with indigo throughout the page.

---

## Typography Changes

### Hierarchy System

Establish a clear, three-tier type hierarchy applied consistently across all elements:

| Role | Current | After |
|---|---|---|
| Eyebrow / small labels | `text-[10px] font-bold uppercase tracking-wider` | `text-xs font-medium uppercase tracking-wide` |
| Section / form labels | `text-sm font-bold uppercase tracking-tight` | `text-xs font-semibold uppercase tracking-wide` |
| Data values (asset cards, inputs) | `text-xl font-black` or `text-2xl font-black` | `text-xl font-bold` |
| Hero number | `text-5xl md:text-6xl font-black` | **No change** — the hero total is the one place `font-black` is intentional and earns its weight |
| Page title h2 | `text-3xl font-black` | **No change** — page-level heading, deliberately heavy |
| Chart legend values | `font-mono` | remove `font-mono`, use `font-medium` |

### Specific Elements

**Hero card (`lg:col-span-2` gradient card):**
- Eyebrow "Total Money Saved": `text-indigo-100 text-sm font-bold uppercase tracking-widest` → `text-white/55 text-xs font-medium uppercase tracking-wide`
- Sub-labels ("Market Equity", "Liquid Assets"): `text-indigo-200 text-[10px] font-bold uppercase tracking-wider` → `text-white/45 text-[10px] font-medium uppercase tracking-wide`
- Sub-values: `text-xl font-bold` → `text-lg font-semibold`
- Hero total amount (`€...`): **no change** — `text-5xl md:text-6xl font-black` stays as-is

**Page title:**
- `h2 "Savings Hub"`: `text-3xl font-black text-slate-900 tracking-tight` — **no change**, intentionally heavy as a page heading

**Asset breakdown cards (right column — Mutual Funds, Stock Equity, Gold Holdings):**
- Note: "Cash Savings" appears only in the Distribution Mix chart legend, not as a right-column card. There are exactly three right-column asset cards.
- Labels: `text-[10px] font-bold text-slate-400 uppercase tracking-widest` → `text-[10px] font-medium text-slate-400 uppercase tracking-wide`
- Values: `text-xl font-black` → `text-xl font-bold`

**Manage Liquid Cash card — form labels:**
- "Monthly Recurring Savings" and "Total Accumulated Cash" labels: `text-sm font-bold text-slate-700 uppercase tracking-tight` → `text-xs font-semibold text-slate-600 uppercase tracking-wide`

**Manage Liquid Cash card — input values:**
- Monthly Recurring Savings input: `font-black text-2xl` → `text-xl font-bold`
- Total Accumulated Cash input: `font-black text-2xl` → `text-xl font-bold`
- The `€` prefix `<span>` on each input carries `font-bold` explicitly but no size class. The `font-bold` weight is intentional — no change needed on either prefix span.

**Manage Liquid Cash card — hint text:**
- Helper text below Monthly Recurring Savings input (line 151): `text-[10px] text-slate-400 font-medium tracking-tight` — **no change** — this is description text, not a label; `tracking-wide` applies to labels only

**Manage Liquid Cash card — input focus rings:**
- Monthly Recurring Savings input: `focus:ring-emerald-500` → `focus:ring-indigo-500`
- Total Accumulated Cash input: already `focus:ring-indigo-500` — **no change needed**

**Manual Savings Entry:**
- Heading "Manual Savings Entry": `font-bold` → `font-semibold`
- Amount input field: `font-bold` — **no change** — already at the correct weight, not `font-black`
- "Add" button: `font-bold` — **no change** — CTA buttons intentionally use `font-bold`

**12-Month Outlook section:**
- Title "12-Month Outlook": `font-bold` → `font-semibold`
- "Projected Balance" value: `font-bold` → `font-semibold`
- "Net Growth" value: stays `text-emerald-600` (semantic green for positive value), weight `font-bold` → `font-semibold`

**Distribution Mix chart legend:**
- Asset names: `font-bold text-slate-600` → `font-medium text-slate-600`
- Values: remove `font-mono`, use `font-semibold text-slate-900`
- This covers all four legend entries: Mutual Funds, Stocks, Gold Holdings, Cash Savings

---

## Color Changes

### Hero Gradient
- Before: `from-indigo-600 to-blue-700`
- After: `from-indigo-600 to-violet-600`

Shifts from indigo→cold-blue to indigo→warm-violet, richer and more cohesive.

### 12-Month Outlook Card
- Background: `bg-primary-50` → `bg-indigo-50`
- Border: `border-primary-100` → `border-indigo-100`
- Calculator icon color: `text-primary-600` → `text-indigo-600`

### Monthly Recurring Savings Input Focus Ring
- `focus:ring-emerald-500` → `focus:ring-indigo-500`
- Total Accumulated Cash input is already `focus:ring-indigo-500` — no change

### Intentionally Kept
- Emerald colors for growth/positive values (Net Growth `text-emerald-600`, TrendingUp icon `bg-emerald-50 text-emerald-600`) — semantic (positive = green)
- Amber/yellow for Gold Holdings icon — semantic
- Blue for Stock Equity icon — semantic
- Indigo for accumulated cash icon — already correct

---

## Files Changed

| File | Change |
|---|---|
| `components/SavingsDashboard.tsx` | All typography and color changes described above |

No changes to `components/ui/Card.tsx`, `App.tsx`, `index.html`, or any other file.

---

## Out of Scope

- Layout restructure
- Spacing / grid changes
- Dark mode adjustments
- Any other page (Expenses, NetWorth, etc.)
- New components or features
- Page title `h2` and hero total — deliberately kept at `font-black`
- "Add" button label — deliberately kept at `font-bold`
