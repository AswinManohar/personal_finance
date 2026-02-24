# FinanceFlow Redesign Plan & Execution

## Motivation

The goal is to transition the current FinanceFlow web application into a sleek, dark mode, minimalistic design. The inspiration provided was an image of a dark UI with very high contrast (white text on dark backgrounds), sans-serif or monospace typography, and a flat design philosophy. 

## Stack Upgrade

To achieve consistent, modern, front-end architecture, the project was migrated to use **HeroUI v3**.

- **Tailwind CSS v4:** Swapped out Tailwind CDN for a bundled v4 configuration using PostCSS.
- **HeroUI v3:** Added `@heroui/react@beta`, `@heroui/styles@beta`, and `tailwind-variants` to establish our new component primitives.
- **Typescript/React Setup:** Ensured `index.css` is globally imported.

## Visual Identify

1. **Typography:** Switched the default font to `JetBrains Mono` globally. This immediately provides a highly technical, sharp, developer-like edge matching the requested sleek aesthetics. 
2. **Colors:** 
   - Forced HTML to a `<html class="dark" data-theme="dark">` state.
   - Hand-tweaked `oklch` theme variables to bring the background down to a deep charcoal (`oklch(0.15 0 0)`) and text to stark white, mimicking the sneaker e-commerce reference image exactly.

## Execution Progress

### ✅ Phase 1: Infrastructure
- Installed all packages and cleaned up the HTML head.
- Built `postcss.config.mjs` and native `index.css`.
- App is confirmed to successfully build using vite. 

### ✅ Phase 2: Shell Layout Renovation (`App.tsx`)
- **Before:** A vertical left-aligned sidebar containing heavy colored background tiles, gradients, and lucide icons.
- **After:** 
  - Restored the vertical left sidebar per user feedback for structural consistency.
  - Stripped out all bulky icons and replaced the UI with a text-driven pill menu mimicking the size-selector motif. Active tabs have a stark white background and a black toggle circle, while inactive tabs remain muted gray (`zinc-500`).
  - Eliminated the top navigation bar entirely in favor of an uninterrupted dark canvas on the right context.
  - The status tracking and user avatars were collapsed into sleek, tracking-widest uppercase metadata blocks pinned to the bottom of the sidebar.

### ⏳ Phase 3: Component Interiors Setup (Next Steps)
- Convert basic panels in components like `components/Expenses.tsx` or `components/NetWorth.tsx` to use HeroUI's `<Card>`, `<Card.Header>`, and `<Card.Body>`.
- Use `variant="solid"` and `variant="outline"` on HeroUI `<Button>`s.
- Re-theme the Recharts graphs natively rendered inside dashboard views to rely strictly on monochrome colors (whites and varying grays) to eliminate color clashing with the new dark palette.
