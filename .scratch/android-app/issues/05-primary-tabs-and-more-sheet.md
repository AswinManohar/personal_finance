# Which 5 tabs are primary, and how the More sheet behaves

Type: prototype
Status: open
Blocked by: —

## Question

The desktop nav has 10 destinations — Savings Hub, Expenses, Goals, Calculator, FIRE, Net Worth,
Debts, Portfolio, Stocks, Data (`App.tsx:71-82`) — but the mobile bottom nav only lists 6
(`App.tsx:84-91`). **Goals, Calculator, Portfolio and Stocks are unreachable on a phone today**,
which directly contradicts the destination's "all 10 feature areas usable".

Decision taken at charting: 5 primary bottom tabs + a "More" bottom sheet holding the rest.

This ticket settles:

- **Which 5** earn a bottom-bar slot. Frequency of use on a phone should decide, not desktop
  layout. Note today's mobile 6 already differ from any obvious "top 5".
- What the More sheet looks like and how it dismisses.
- Whether the sheet shows the remaining 5 only, or all 10 for muscle-memory.
- Whether the active tab is reflected when it lives inside More.
- Whether desktop navigation changes at all (default: no).

Human-in-the-loop — build a rough prototype to react to rather than deciding on paper. Link the
prototype from the answer.

The M3 colour tokens in `index.html` and the existing `material-symbols-outlined` icons are the
design vocabulary; each new destination needs an icon chosen.
