# Cashflow on Android

Label: `wayfinder:map`

## Destination

Cashflow installed and running on my Android phone as a sideloaded APK, with all 10 feature
areas usable on a phone screen — and with the Telegram → API → Life OS expense pipeline still
working exactly as it does today.

## Notes

**This map carries execution.** Wayfinder plans by default; this effort overrides that. Tickets
here may write code, and the map is done when the APK is installed and working on the phone —
not when the plan is complete.

Domain: personal finance SPA. React 19 + TypeScript + Vite, Tailwind (currently CDN), Supabase
(auth + Postgres + RLS), FastAPI backend on Railway serving both the API and the built SPA.

Skills every session should consult: `/grilling` and `/domain-modeling` when a ticket needs a
decision; `/prototype` for the navigation ticket; `superpowers:test-driven-development` for the
sync-correctness tickets, which touch data-loss paths.

Standing preferences for this effort:

- **Never break the integration contract.** `/v1/integrations/*` is consumed by Life OS on a
  schedule. Response shapes, the opaque `since` cursor, tombstone semantics and the
  "recurring expenses are one row, not materialized occurrences" rule are all load-bearing.
- **The Railway FastAPI backend is not optional.** The Telegram bot writes expenses through
  `POST /api/expenses/` using `X-Personal-Token` auth. It stays.
- Prefer changes that keep the desktop web app working identically. This is an additive effort.

### Locked decisions (from charting)

| Area | Choice |
|---|---|
| Packaging | Capacitor — keeps 100% of the React code, bundles assets in the APK for true offline |
| Mobile nav | 5 primary bottom tabs + a "More" bottom sheet (Material 3) |
| Sync | Auto-pull on foreground + timestamp guard; prompt on conflict, never silently overwrite |
| Auth | Native Google Sign-In plugin → `supabase.auth.signInWithIdToken` |
| Distribution | Sideloaded self-signed release APK, own keystore, no Play Store |
| Destructive expense sync | Fix properly — do not merely narrow the window |

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Lock the integration contract with regression tests](issues/06-lock-the-integration-contract-with-tests.md)
  — Telegram → Life OS pipeline now guarded by 24 tests (was 7); the bot write path had zero
  coverage and token scoping was bypassed by `dependency_overrides`. Guard verified by injecting
  three mutations, all caught. Surfaced that `DELETE /api/expenses/{id}` hard-deletes instead of
  tombstoning, so Life OS never learns of app-side deletes.
- [Data export and import inside the app shell](issues/10-data-export-import-in-app-shell.md)
  — Export is a **silent no-op** on Android (Capacitor registers no `DownloadListener` and refuses
  `blob:` URLs), so the buttons would look dead. Fix: `@capacitor/filesystem` write to
  `Directory.Cache` + `@capacitor/share`. Import already works via SAF. **No permissions needed.**
  Also found the CSV import destroys existing data, and there is no JSON backup — it's three CSVs.
- [Make expense push non-destructive to externally-created rows](issues/07-make-expense-push-non-destructive.md)
  — **Fixed.** Deletions now carried explicitly as `deletedExpenseIds`; set-difference removed, so a
  bot-written expense is never tombstoned. API `DELETE` soft-deletes so Life OS sees a tombstone.
  Also fixed "clear local cache" silently wiping the cloud. 9 + 2 new tests, written first and
  failing against the old code.

- [Mirror the mobile prototype in the front-end](issues/09-mobile-layout-audit.md)
  — The design arrived as artifact `9e97b65c` (390×844, every screen). Implemented across all 11
  screens on a new `components/ui` primitive set, with a 4-tab + More-sheet shell. Extracted
  reference kept at `docs/superpowers/specs/2026-07-31-mobile-design-reference.html`.
- [Bundle Tailwind and fonts at build time](issues/01-bundle-tailwind-and-fonts-at-build-time.md)
  — Tailwind compiled by PostCSS; Inter and Material Symbols self-hosted. The icon font could not be
  subset with fonttools (ligature glyphs live in GSUB, not codepoints), so Google's name-based
  subsetting API is used once via a committed script: **3.78MB → 64KB**. `dist/` now reaches no
  external host but the app's own Supabase project.
- [Scaffold the Capacitor Android shell](issues/02-scaffold-capacitor-android-shell.md)
  — `com.aswinmanohar.cashflow` on Capacitor 7 (Cap 8 needs Node 22; this box has 20). Native
  project committed, web assets bundling, keystore ignores fixed before ticket 03 can create one.
  **Blocked on a JDK 17+** — AGP refuses Java 11, and installing one needs sudo.

## Not yet specified

In-scope fog, not yet sharp enough to ticket:

- **Android back-button behaviour.** Should back pop tab history, or exit? Interacts with the
  More sheet once that exists.
- **Safe areas, status bar and notch.** The app uses `fixed` headers and a `fixed` bottom nav
  (`App.tsx:259,289,302`); insets need handling but the specifics depend on the shell.
- **App icon and splash screen.** Needs the M3 palette in `index.html` as its source.
- **Shipping v2.** Sideloading has no update channel. Manual reinstall, or something better?
- **Keystore custody.** Losing it means the app can never be updated in place; where does it live,
  and how is it backed up?
- **Offline write semantics past the guard.** What the app does when it is offline for days and
  Telegram has been writing the whole time — beyond the conflict prompt.
- **Currency and locale.** Unexamined; may or may not be an issue on a phone.

## Out of scope

- **iOS.** The destination names Android only.
- **Play Store distribution.** Ruled out at charting: needs a Play Console account, privacy policy
  and data-safety declarations, and Play App Signing would change the SHA-1 that Google Sign-In
  depends on.
- **React Native / native rewrite.** Discards ~200KB of working React components for a single-user
  app.
- **Full per-entity merge sync (CRDT-style).** The correct long-term answer for multi-writer state,
  but far larger than this effort. The timestamp guard plus non-destructive reconciliation covers
  the actual risk.
- **Restoring the AI advisor.** `components/AIAdvisor.tsx` and `services/geminiService.ts` were
  deleted before this effort began; `PROJECT_STRUCTURE.md` is stale. Not being re-added here.
