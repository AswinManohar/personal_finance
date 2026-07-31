# Bundle Tailwind and fonts at build time

Type: task
Status: resolved
Blocked by: —

## Question

`index.html` loads Tailwind from `https://cdn.tailwindcss.com`, Inter from Google Fonts, and
Material Symbols from Google Fonts — all at runtime. Capacitor bundles web assets inside the APK
so the app opens offline, which those three CDN dependencies defeat: with no network the app
renders unstyled and every icon becomes a text fallback.

Move all three into the build:

- Tailwind as a real PostCSS/Vite dependency, with the entire `tailwind.config` currently inlined
  in `index.html` (the full M3 colour token set, `fontFamily`, `borderRadius`) moved to a config
  file with no visual change.
- Inter self-hosted and bundled.
- Material Symbols self-hosted and bundled, preserving the `font-variation-settings` used by
  `.material-symbols-outlined`.

Done when a production build renders identically to today with the network disabled, and no
request to any external host remains in `dist/`.

Note the custom `<style>` block in `index.html` (`.tabular-nums`, `.no-scrollbar`, the body
background) also needs a home.

## Answer

**Done.** Tailwind is compiled by PostCSS; Inter and Material Symbols are bundled.

### Changes

- **`tailwind.config.js`** — the whole inlined config moved out of `index.html` verbatim (M3
  colour set, the prototype type scale, radii, `fontFamily`). Gained `content` globs, and the
  `keyframes`/`animation` that were hand-written `@keyframes` in the old `<style>` block.
  `@tailwindcss/forms` is kept because the CDN was loaded with `?plugins=forms`.
- **`postcss.config.js`**, **`styles/index.css`** — the CSS entry, imported by `index.tsx`. Holds
  the `@tailwind` directives, the `.material-symbols-outlined` rules, `.tabular-nums`,
  `.no-scrollbar`, and the phone-shell classes (`.app-shell`, `.app-header-safe`, `.app-nav-safe`,
  `.app-sheet-safe`, `.app-scroll`) that had no home outside `index.html`.
- **`index.html`** is now 19 lines: no CDN script, no font links, no inline config, no `<style>`.

### Fonts

- **Inter** via `@fontsource-variable/inter` — one variable file per subset, ~218KB total.
- **Material Symbols** is the interesting one. The npm package ships a **3.78MB** variable font for
  ~2500 icons; this app renders ~34. fonttools cannot subset it cleanly: the glyphs are reached
  through GSUB ligatures, not codepoints, so keeping the 27 characters an icon name is spelled with
  keeps essentially the whole font. Google's CSS API subsets by icon name server-side, so
  `scripts/fetch-icon-font.sh` fetches that once and the result is committed —
  **64KB, a 60× reduction**. The script carries the icon list plus a few common spares, because a
  missing glyph renders as its own literal name.

### Where the font lives

`styles/fonts/`, referenced relatively so Vite fingerprints it into `dist/assets/`. The first
attempt put it in `public/`, which lands at `dist/fonts/` — and `api/main.py` mounts `dist/assets`,
not `dist`, so the Railway-served desktop app would have 404'd on every icon.

### Verified

`dist/` contains no reference to any external host except the app's own Supabase project.
`npm run build` succeeds; 111 frontend tests pass; the FastAPI-served build returns 200 for
`index.html`, the CSS, the JS and the icon font.

### Left open

Screenshots of the running app could not be captured — `Page.captureScreenshot` times out against
this page through the browser tooling, while the console and DOM text extraction respond normally.
The compiled CSS was verified by asserting the generated utilities exist in `dist/assets/*.css`
instead. A human should eyeball it once.
