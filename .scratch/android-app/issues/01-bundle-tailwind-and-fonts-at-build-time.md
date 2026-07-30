# Bundle Tailwind and fonts at build time

Type: task
Status: open
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
