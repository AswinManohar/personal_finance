# PRODUCT REQUIREMENTS DOCUMENT
## Cashflow — Aesthetic Front-End Redesign
### AI Design Agent Brief

| | |
|---|---|
| **Version** | 1.0 — Initial Release |
| **Status** | Draft — Design Review |
| **Date** | March 2026 |
| **Author** | Product Owner |
| **Audience** | Design Agent |

---

## 1. Executive Summary

### DESIGN VISION

Cashflow is a personal finance dashboard for one. It tracks savings, expenses, investments, FIRE progress, net worth, and portfolio holdings — all in one place. The current interface works but feels generic: inconsistent spacing, flat typography, and colours that carry no personality.

The goal of this redesign is to make Cashflow feel like a premium, private financial instrument — calm, confident, and precise. Think of the aesthetic as a dark Bloomberg terminal that went to therapy: data-dense where it needs to be, breathing room where it earns it.

| | |
|---|---|
| **App Name** | Cashflow |
| **Aesthetic Direction** | Sleek minimalism — dark glass, warm whites, one accent |
| **Font** | Inter (all weights) |
| **Platform** | Desktop-first, fully responsive to mobile |
| **Navigation** | Top nav (desktop) · Bottom nav (mobile) |
| **Charts** | Simplified, elegant — clean lines over dense labels |
| **Dark Mode** | Default and only mode |

---

## 2. Design System

This section defines the foundational tokens every screen must use. There should be no deviation without explicit justification.

### 2.1 Colour Palette

The palette is built on a dark warm-charcoal base. It is not pure black — it has a faint cool-neutral cast that reads as sophisticated rather than oppressive. Surfaces layer on top of the base using subtle lightness steps, not borders or heavy shadows.

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#0E0F13` | Page background — the deepest layer |
| `bg-surface` | `#16181F` | Cards, panels, input fields |
| `bg-elevated` | `#1E2029` | Hover states, nested cards, modals |
| `border-subtle` | `#2A2C35` | Dividers, card outlines (1px only) |
| `text-primary` | `#F0EDE8` | Headings, primary labels — warm white, not pure |
| `text-secondary` | `#8A8580` | Supporting text, metadata, units |
| `text-muted` | `#52504D` | Placeholder text, disabled states |
| `accent` | `#6C6EF5` | Primary accent — soft indigo/violet; CTAs, active states, highlights |
| `accent-dim` | `#2E2F6A` | Accent backgrounds (badges, pills, subtle fills) |
| `positive` | `#3DD68C` | Gains, targets met, upward trends |
| `negative` | `#F26B6B` | Losses, overspending, downward trends |
| `neutral-data` | `#5A8FF5` | Neutral chart data (not good/bad) |
| `gold` | `#D4A84B` | Gold asset class only |

**Rule:** Do not introduce new colours outside this palette. All data visualisations must use only `accent`, `positive`, `negative`, `neutral-data`, and `gold` — mixed at reduced opacity where multiple series appear together.

### 2.2 Typography

All type is Inter. The scale is deliberate: large numbers command attention, labels stay quiet.

| Role | Size | Weight | Colour | Notes |
|---|---|---|---|---|
| Page title | 22px | 600 | `text-primary` | One per screen |
| Section heading | 14px | 600 | `text-primary` | All-caps, 0.08em letter-spacing |
| Card metric (large) | 32–40px | 700 | `text-primary` | The hero number on any card |
| Card metric (medium) | 20px | 600 | `text-primary` | Supporting figures |
| Body / labels | 14px | 400 | `text-secondary` | Default text weight |
| Caption / metadata | 12px | 400 | `text-muted` | Timestamps, footnotes |
| Button text | 14px | 500 | Depends on button type | |
| Input text | 14px | 400 | `text-primary` | |

**Rule:** Never use font sizes below 12px. Never use font weights below 400 for rendered text. Currency amounts always use tabular-nums (`font-variant-numeric: tabular-nums`).

### 2.3 Spacing

All spacing is on a base-4 grid. Common values:

- `4px` — tight intra-component gap (icon to label)
- `8px` — small gap within a card row
- `12px` — between card sub-elements
- `16px` — standard card internal padding
- `20px` — card padding on larger surfaces
- `24px` — between cards in a grid
- `32px` — section separation within a page
- `48px` — between major page sections

**Rule:** Never use arbitrary spacing values. Every gap must map to a multiple of 4.

### 2.4 Card Anatomy

Cards are the primary surface unit. Every card follows this anatomy:

- **Background:** `bg-surface`, 12px border-radius
- **Border:** 1px `border-subtle` (no shadow — the background separation carries the elevation)
- **Padding:** 20px on all sides (16px on mobile)
- **Header row:** Section heading (left) + optional action/icon (right), 16px bottom margin
- **Content zone:** Free, defined per card type
- **No drop shadows.** The dark layering system replaces shadow-based depth.

### 2.5 Interactive Elements

**Primary button:** `accent` background, `text-primary` label, 8px border-radius, 14px font-500, 40px height, 16px horizontal padding. Hover: `accent` at 85% opacity.

**Ghost button:** 1px `border-subtle` border, transparent background, `text-secondary` label. Hover: `bg-elevated` fill.

**Input field:** `bg-surface` background, 1px `border-subtle` border, 8px border-radius, 40px height, 14px text. Focus: `accent` 1px border. No floating labels — always use a label above the field.

**Toggle / switch:** Off state in `bg-elevated`, on state in `accent`.

---

## 3. Navigation Design

### 3.1 Desktop — Top Navigation Bar

The top bar spans full width and sits flush with the top of the viewport. It is always visible — it does not scroll away.

**Layout:** App logo/wordmark (left) · Tab links (centre or left-of-centre) · User avatar + sync status indicator (right).

**Tab link anatomy:**
- Label: 14px, weight-500, `text-secondary` by default
- Active state: `text-primary` with a 2px `accent` underline or a subtle `accent-dim` pill background
- Hover: `text-primary`, no underline
- Icons optional — if used, 16px, same colour as label, 6px gap between icon and label
- No heavy backgrounds or borders on tab items — the active indicator alone signals selection

**Height:** 56px. Background: `bg-base` with a 1px `border-subtle` bottom edge.

**Tab order (left to right):** Savings Hub · Expenses · Goals · Calculator · FIRE · Net Worth · Portfolio · Stocks · Data

### 3.2 Mobile — Bottom Navigation Bar

On viewports below 768px the top tabs collapse and a bottom navigation bar appears.

**Layout:** Fixed to bottom of viewport, full width, 5 primary destinations visible (with a "More" item for the rest if needed).

**Item anatomy:** Icon (24px) stacked above label (10px, weight-500). Active: `accent` icon and label colour. Inactive: `text-muted`.

**Height:** 64px. Background: `bg-surface` with 1px `border-subtle` top edge. Safe area padding applied on iOS.

**Visible 5:** Savings Hub · Expenses · FIRE · Net Worth · More (expands the rest).

---

## 4. Screen Inventory

The following 10 screens require design. For each screen the brief defines: the purpose, the layout structure, each card/module's visual behaviour, and the data visualisation approach. No screen should require scrolling to access its primary information on a standard 1440px desktop viewport.

---

### S-01 — Login

**Purpose:** Entry point. Single call to action. Minimal by design — this screen should feel like opening a vault, not a SaaS product.

**Layout:** Full-viewport centred single column. No sidebar. No header bar on this screen.

**Background:** `bg-base`. Place a very subtle radial gradient centred on the viewport — deep `accent-dim` at the origin fading to `bg-base` — large enough that it reads as ambient light, not a shape.

**Content block (centred, max-width 400px):**
- App logo or wordmark at top — clean, no decoration
- 32px gap
- Headline: "Your money, clearly." — 28px, weight-600, `text-primary`
- Subtext: One line, 14px, `text-secondary`
- 40px gap
- Three auth options stacked vertically, 12px gap between:
  1. **Continue with Google** — ghost button, full width, Google icon left-aligned inside the button
  2. **Use Sync ID** — ghost button, full width, key icon left-aligned
  3. **Continue as Guest** — text link only, 12px, `text-muted`, centred, no button chrome
- No other content, no marketing text, no feature list

---

### S-02 — Savings Hub

**Purpose:** The main dashboard. The user lands here after login. Gives a one-glance picture of total wealth, monthly savings rate, and asset breakdown.

**Layout:** 2-column grid on desktop (left column ~60%, right column ~40%). Consistent 24px gutter. No horizontal scroll.

**Row 1 — Hero strip (full width, single card):**
This is the first thing the eye lands on. It contains one large number: total assets under tracking. Layout is horizontal: large metric on the left, a subtle 12-month area sparkline on the right (no axes, no labels — the shape alone communicates trajectory). Below the large number: a small percentage delta (month-on-month) in `positive` or `negative` colour. Label: "Total Tracked Assets" in 12px `text-muted` above the number.

**Row 2 — Left column, Asset Breakdown card:**
A horizontal stacked bar showing proportional breakdown of: Mutual Funds · Stocks · Gold · Cash (and any other categories). Each segment uses a distinct colour from the data palette. Below the bar: a legend row with coloured dots, category name, and value — all in 14px, one line per category. Values right-aligned. No pie chart.

**Row 2 — Right column, Monthly Savings card:**
Shows this month's recurring savings total. One large number. Below it: a small 3-item row showing the three largest contributing categories with mini bar indicators. Compact — this card should feel informational, not dense.

**Row 3 — Left column, 12-Month Outlook card:**
A clean area chart. X-axis: months (abbreviated, 12px `text-muted`). Y-axis: value labels on left (3–4 gridlines only, `border-subtle` dashed). Area fill: `accent` at 15% opacity. Line: `accent` solid 1.5px. No data point dots unless hovered. Hover shows a floating tooltip: date + value — `bg-elevated` background, 8px radius, no border.

**Row 3 — Right column, Distribution Mix card:**
A donut chart (not pie). Centre label: total savings amount in 20px weight-600. Chart uses 3–4 `accent`/data-palette colours. Legend below the chart: two columns, coloured dot + label + percentage. Clean, no 3D effects, no shadows on chart elements.

**Chart rules for this screen:** All charts must use the same x-axis label style. No chart legends inside the chart boundary — always below. Tooltips only on hover, never static.

---

### S-03 — Expenses

**Purpose:** Log and review daily/recurring spending. Understand where money goes.

**Layout:** 3-column grid on desktop: left column (30%) for input/log, centre column (40%) for breakdown, right column (30%) for trends.

**Left column — Log Expense card:**
A compact form. Fields: Amount (large, prominent — 32px input), Category (select dropdown with icons per category), Description (text, optional), Date (defaults to today), Frequency toggle (One-time / Recurring). Below the fields: one primary "Add Expense" button full width. Below that: a "Recent" list — last 5 entries, each row showing category icon + description + amount + date in a single tight row. Amounts right-aligned.

**Left column — Income card (below Log Expense):**
Two rows: My Income and Partner Income. Each row: label (left) + current amount (right) + small edit pencil icon that activates an inline edit field. Clean, minimal — no dedicated form for this.

**Centre column — Expense Breakdown card:**
A donut chart (same style as S-02). Centre: total spend for the selected period. Legend below: category rows with coloured dot, name, amount, and percentage bar (thin, full-width within the legend cell). Time range selector above the chart: pill buttons — 7D · 30D · 90D · All. Active pill: `accent-dim` background, `accent` text. Inactive: `bg-elevated`, `text-muted`.

**Right column — Trends card:**
A grouped bar chart. X-axis: weeks or months depending on selected range. Y-axis: spend amount. One bar per time period per category, up to 5 categories (others grouped into "Other"). Bars use data palette colours. Hover tooltip: period + category + amount.

**Right column — Recurring Expenses card (below Trends):**
A clean list. Each row: frequency badge (pill — Weekly/Monthly/etc. in `accent-dim`), description, amount (right-aligned). Add Recurring button at top-right of card header. Rows are tappable to edit inline.

---

### S-04 — Savings Goals

**Purpose:** Set and track a single savings goal with a deadline.

**Layout:** Single centred column, max-width 640px. Simple — this is the least data-dense screen.

**Goal Card (full width):**
- Target amount: large metric (32px, weight-700)
- Deadline: 14px `text-secondary` below
- Progress bar: full-width, 8px height, `bg-elevated` background, `accent` fill, rounded ends. Fill percentage matches current savings ÷ target. No jagged or segmented progress — smooth single fill.
- Below bar: two values in a row — "Saved so far" (left, `positive`) and "Remaining" (right, `text-secondary`)
- Monthly required savings to hit the deadline: a single callout row — label in `text-muted`, value in `text-primary` weight-600
- Edit Goal button (ghost, right-aligned in card header)

**If no goal is set:** The card shows a large empty state — a thin dashed border card, centred icon (target icon), and a single "Set a Goal" primary button. No ghost content.

**Monthly Progress mini chart (below goal card):**
A 12-bar column chart showing savings per month (last 12 months). Goal line: horizontal dashed `accent` line at the monthly required value. Bars: `neutral-data` for below-goal months, `positive` for at-or-above-goal months.

---

### S-05 — Investment Calculator

**Purpose:** Project compound interest growth given principal, monthly contributions, rate, and time horizon.

**Layout:** 2-column on desktop. Left column (35%): inputs. Right column (65%): output chart + summary.

**Left column — Inputs card:**
Four labelled inputs stacked vertically: Initial Principal · Monthly Contribution · Annual Interest Rate (%) · Time Horizon (years). Each input: label above (12px `text-muted`), input field below. All fields use number inputs. At the bottom: a "Calculate" button (primary) — though ideally results update live on input change without needing a button click.

**Right column — Projection chart:**
A large area chart spanning the full card width. X-axis: years. Y-axis: portfolio value. Two stacked fills: contributions in `neutral-data` at 20% opacity, interest/growth in `accent` at 20% opacity, with a combined `accent` line on top. This visually separates "what you put in" from "what the market added." Hover: tooltip with year, contributions total, interest total, and final value.

**Right column — Summary row (below chart):**
Three stat cards in a row inside the card: Final Value · Total Contributed · Total Interest Earned. Each stat card: label in 12px `text-muted`, value in 20px weight-600. Use `positive` colour on "Total Interest Earned" to make the gain feel rewarding.

---

### S-06 — FIRE Calculator

**Purpose:** Calculate the FIRE number and projected age of financial independence.

**Layout:** 2-column on desktop. Left column (35%): inputs. Right column (65%): projection + summary.

**Left column — Inputs card:**
Labelled inputs stacked: Annual Expenses · Current Savings · Monthly Savings · Expected Return (%) · Withdrawal Rate (%) · Current Age. Clean vertical stack, same input style as S-05.

**Right column — 60-Year Projection card:**
An area chart showing portfolio value over time. The x-axis shows age (or years). A vertical dashed `accent` line marks the FIRE date — where the portfolio first reaches the FIRE number. To the left of the line: accumulation phase in `neutral-data` fill. To the right: drawdown phase in `positive` fill (slightly different shade). The crossover point is visually prominent.

**Right column — FIRE Summary row (below chart):**
Three stat cards: FIRE Number · Years to FIRE · Age at FIRE. Same style as S-05 summary. "Age at FIRE" uses `positive` colour if achievable before 65, `negative` if not (no judgment copy — just colour signal).

---

### S-07 — Net Worth Tracker

**Purpose:** Track total net worth as the sum of assets minus liabilities, with historical snapshots.

**Layout:** 2-column on desktop. Top row: full-width hero. Below: left (40%) for breakdown, right (60%) for history chart.

**Top row — Net Worth Hero card (full width):**
Large central metric: current net worth. Two supporting figures in a row below: Total Assets (in `positive`) · Total Liabilities (in `negative`). A small month-on-month delta badge next to the net worth number: `positive` or `negative` coloured pill with an up/down arrow and percentage.

**Left column — Asset & Liability Breakdown cards:**
Two stacked cards: Assets and Liabilities. Each card: a clean list of line items (Savings, Investments, Gold, Cash under Assets; Loans under Liabilities). Each row: icon + label (left) + amount (right). Section total at the bottom of each card, weight-600. Add/edit pencil icon in each card header for inline editing.

**Right column — Historical Net Worth chart:**
An area chart. X-axis: snapshot dates (not fixed intervals — whatever dates snapshots were taken). Y-axis: net worth. Area fill: `accent` at 12% opacity. Line: `accent` solid 1.5px. Each data point shown as a small dot (4px, `accent` fill). On hover: tooltip with date, net worth, and assets/liabilities split. Below chart: a "Save Snapshot" primary button — takes a snapshot of the current figures.

---

### S-08 — Portfolio

**Purpose:** Track mutual funds and ETFs — holdings, expected returns, fees, and monthly investment schedule.

**Layout:** Full-width table + summary strip above.

**Summary strip (top, full-width card):**
Three inline stats: Total Portfolio Value · Weighted Average Expected Return (%) · Total Monthly Investment. Same stat-card style as S-05 and S-06.

**Holdings Table card (below summary):**
A clean data table. Columns: Fund Name · Type (ETF/MF) · Expense Ratio · Expected Return · Tax Rate · Monthly Investment · Current Value · Gain/Loss. Each row: fund name in `text-primary` weight-500, all other cells in 14px `text-secondary`. The Gain/Loss column: coloured `positive` or `negative` based on sign. Alternating row backgrounds: `bg-surface` and `bg-elevated` (very subtle — 1 step). No thick borders — only `border-subtle` 1px horizontal lines between rows. Add Fund button in the card header, right-aligned (ghost button style). Clicking a row expands inline to show the edit form for that fund — no separate modal.

---

### S-09 — Stocks

**Purpose:** Track individual stock holdings — buy price, current price, quantity, unrealised gains.

**Layout:** Same as S-08 — summary strip + full-width table.

**Summary strip:** Total Stocks Value · Total Unrealised Gain/Loss · Number of Holdings.

**Holdings Table:** Columns: Ticker · Company Name · Quantity · Buy Price · Current Price · Unrealised Gain (₹ and %) · Value. The Unrealised Gain column: coloured `positive` or `negative`. Ticker displayed in `accent` colour as a monospace-style pill (background `accent-dim`) to make it scannable. Row expand on click shows edit form inline. "Add Stock" ghost button in card header.

---

### S-10 — Data Management

**Purpose:** Cloud sync (push/pull), export/import data, view and delete savings history snapshots.

**Layout:** Single column, max-width 720px, centred.

**Cloud Sync card:**
Two action rows: Push to Cloud and Pull from Cloud. Each row: icon (left) · label and sub-description (centre) · action button (right, ghost). A sync status indicator below both rows: coloured dot (green = in sync, amber = unsynced changes, red = error) + timestamp of last sync in 12px `text-muted`.

**Export / Import card:**
Two rows: Export Data (downloads JSON) and Import Data (file picker). Same row layout as above. Import row: shows a warning caption in `text-muted` below: "Importing will overwrite your current local data."

**Savings History card:**
A list of saved snapshots. Each row: date (left) + net worth at snapshot (right) + delete icon (far right, `text-muted`, becomes `negative` on hover). Rows are sorted newest-first. If more than 10 snapshots exist, paginate — show 10 per page with simple Previous / Next ghost buttons at the bottom of the card.

---

## 5. UX Design Principles

### DESIGN NORTH STAR
This is a personal finance tool for one user. It should feel like a high-quality instrument, not a product. Every screen should communicate: *you are in control.*

### 5.1 Data Clarity Over Decoration
Numbers are the product. Typography hierarchy, not colour or decoration, should make the important number on any card immediately obvious. The eye should always know where to land first.

### 5.2 One Primary Action Per Screen
Each screen has one thing the user is most likely here to do. That action is always visible without scrolling. Secondary actions are present but visually subordinate.

### 5.3 No Redundant Chrome
No page titles that repeat what the nav tab already says. No card headers that are just "Overview." No tooltips on obvious controls. If an element does not carry information or enable an action, remove it.

### 5.4 Calm Colour Use
Colour communicates meaning only — not decoration. `positive` and `negative` are reserved for financial direction. `accent` is reserved for the primary interactive element on any given surface. A screen with no errors and no gains/losses should be almost monochrome.

### 5.5 Consistent Motion
If transitions are used (tab switching, card expand, tooltip appear): 150–200ms ease-out only. No bounces, no spring physics, no slide-in animations on data. Data appears; it does not perform.

---

## 6. Component Inventory

The following reusable components must be designed as consistent units. Design all instances of each component from the same base, with variation only where explicitly defined.

| Component | Variants |
|---|---|
| Card | Default, Elevated (modal/nested) |
| Stat block | Large (hero number), Medium (summary strip), Small (inline) |
| Primary button | Default, Hover, Disabled |
| Ghost button | Default, Hover, Disabled |
| Input field | Default, Focus, Error |
| Select dropdown | Default, Open, Disabled |
| Time range pills | 2-option, 4-option |
| Progress bar | Standard (goal), Mini (inline) |
| Data table row | Default, Hover, Expanded |
| Area chart | With dual fill, With FIRE crossover line |
| Bar chart | Single series, Grouped |
| Donut chart | With centre label, With legend below |
| Tooltip | Data point hover |
| Sync status dot | In-sync, Unsynced, Error |
| Frequency badge pill | Weekly, Bi-weekly, Monthly, Quarterly, Yearly |

---

## 7. Out of Scope

The following are outside the brief and must not be designed in this sprint:

- Any AI advisor or chat interface (previously removed from the app)
- Onboarding flow / first-run experience
- Notification or alert system
- Mobile app (native iOS or Android)
- Light mode variant
- Any new features not currently present in the existing app

---

## 8. Open Questions for Design Review

These decisions must be resolved before final mockups are approved:

1. **Accent colour:** Soft indigo `#6C6EF5` is proposed. Should this be adjusted to a warmer tone (teal, sage green) given the financial context, or does the cool violet reinforce the premium, calm feel?

2. **Number formatting:** Should currency values display with INR symbol (₹) or plain numerals with a unit label (e.g. "12.4L")? Lakh/crore formatting vs full digits?

3. **Empty states:** When a module has no data (e.g. no stocks added), should the empty state use a subtle illustration, an icon, or pure text with a CTA? Define a single consistent treatment.

4. **Data table density:** S-08 (Portfolio) and S-09 (Stocks) have many columns. On 1280px viewports some columns may need to be hidden or collapsed. Decide which columns are secondary and can be shown on expand/hover.

5. **Chart colour assignment:** Which asset categories map to which data palette colours? The mapping should be fixed and consistent across all screens (e.g. Mutual Funds always in `accent`, Gold always in `gold`).

---

*Cashflow Design PRD v1.0 · For design agent use only*
