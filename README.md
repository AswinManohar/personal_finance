# Cashflow

A personal finance app for tracking what you spend, what you own, and what you owe — with a
statement-review pipeline that reads a bank PDF and checks it against what you already logged.

It runs as a web app and as an Android app (Capacitor) off the same React codebase, backed by a
FastAPI service and Supabase.

## What it does

| Screen | Purpose |
|---|---|
| Savings Hub | Total assets, emergency-fund runway, distribution mix |
| Expenses | Log one-time and recurring spending, flag essentials |
| Net Worth | Assets against liabilities |
| Debts | Payoff ordering and simulation |
| FIRE | Financial-independence projection |
| Goals | Goal-based savings tracking |
| Calculator | Compound-growth projections |
| Statement Review | Upload a bank statement PDF and get it cross-checked |
| Portfolio / Stocks | Holdings that feed Total Assets |
| Data | Sync, export, integration tokens, account |

Beyond the screens:

- **Statement review.** A PDF goes through parse → redact → extract → cross-check → report.
  Redaction is local, deterministic, and runs *before* any LLM call — `api/statement_review/redactor.py`
  is the privacy boundary. Only redacted text ever leaves the process.
- **Merchant naming.** Card-network descriptors (`DM DROGERIE SAGT DANKE`, `REWE Bonn, Friedenspla`)
  are resolved to a readable name and category by a Pydantic AI agent with a structured output type,
  so the model cannot return an unlisted category. The phone asks once per unseen merchant and caches
  the answer locally.
- **Transaction capture.** Advanzia push notifications are read by a native Android listener and
  drained into a review inbox; Sparkasse Kontowecker emails are pulled from Gmail. Both are idempotent —
  a dismissed capture does not come back.
- **Integration feeds.** Read-only `/v1/*` endpoints (expenses, savings history, income) for external
  aggregators, authenticated by a per-user token you generate and revoke yourself.

## Stack

- **Frontend** — React 19, TypeScript, Vite, Tailwind CSS, Recharts, Lucide
- **Mobile** — Capacitor 7 (Android, `com.aswinmanohar.cashflow`)
- **Backend** — FastAPI on Python 3.13, served by Gunicorn + Uvicorn workers, dependencies via `uv`
- **Data & auth** — Supabase (Postgres + Auth), row-level security keyed on `auth.uid()::text = user_key`
- **AI** — OpenAI via Pydantic AI, traced with Logfire (optional)
- **Deploy** — Docker multi-stage build on Railway; FastAPI also serves the built SPA

## Getting started

Requires Node 20+, Python 3.13, [uv](https://docs.astral.sh/uv/), and optionally
[just](https://github.com/casey/just).

```bash
git clone git@github.com:AswinManohar/personal_finance.git
cd personal_finance
npm install
uv sync
cp .env.example .env    # fill in what you need — see below
```

Run both halves together:

```bash
just start        # FastAPI on :8000, Vite on :5173
```

Or separately with `just api` and `just web`.

### Environment

Supabase URL and anon key are compiled into `services/supabaseService.ts`. Everything else is
optional and read from `.env` — see `.env.example` for the full annotated list.

| Variable | Needed for |
|---|---|
| `OPENAI_API_KEY` | Statement review and merchant guessing |
| `OPENAI_MODEL` | Overrides the default model |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Backend Supabase access. Every table has RLS on and the backend scopes queries itself, so it needs the service-role key; `SUPABASE_KEY` (anon) alone returns nothing |
| `REDACT_NAMES` | Extra names for the statement redactor to mask |
| `LOGFIRE_TOKEN` | Tracing; without it instrumentation is a no-op |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Google sign-in on Android |
| `VITE_GOOGLE_ANDROID_CLIENT_ID` | Gmail access for Sparkasse capture |
| `VITE_API_BASE_URL` | Backend origin for the Android build |

Without an OpenAI key the app still runs; the statement-review and merchant-guess paths are what stop
working.

## Android

```bash
npm run android:sync    # build the web bundle and copy it into the Android project
npm run android:run     # build, sync and launch on a device or emulator
npm run android:apk     # assemble a debug APK
```

Sign-in differs by platform: the web uses the OAuth redirect flow, Android cannot (Google refuses
OAuth in plain WebViews) and instead exchanges a native Google ID token via `signInWithIdToken`.
`services/auth.ts` holds that branch, and the native module is dynamically imported so the web bundle
never pulls it in.

`docs/ANDROID.md` has the full build story — JDK and SDK versions, `local.properties`, release
signing — and the four places a fork edits to make notification capture read its own bank rather
than Advanzia, plus how to change the merchant-guess prompt.

## Tests

```bash
npm test              # vitest — tests/frontend
npx tsc --noEmit      # typecheck
uv run pytest         # backend — tests/
```

Evals for the merchant-guess agent live in `evals/` and run through `pydantic-evals`.

CI (`.github/workflows/ci-cd.yml`) runs backend tests, typecheck and frontend tests on every PR into
`main` and on pushes to `main`/`dev`. A push to `main` that passes deploys to Railway.

## Architecture

`docs/ARCHITECTURE.md` is the system map: the layers, the three ways a caller authenticates, how
an expense from any producer ends up in `user_expenses`, and the two automated paths in detail.

- **Bank statements** go through `api/statement_review/`: `pypdf` reads the text layer, a
  deterministic regex redactor masks IBANs, card and account numbers, phones, balances, addresses
  and names, and only that masked text reaches OpenAI. Extraction uses a typed structured output
  that is validated and retried; a second model call flags avoidable spend against the user's own
  income and 90-day baseline; a model-free cross-check matches statement debits to logged expenses
  on amount and date and reports what is missing on either side.
- **Real-time capture** has two sources. Advanzia card notifications are read by a deliberately
  dumb Android `NotificationListenerService` that writes raw text to a queue; the TypeScript side
  drains it on resume, parses the German sentence fail-closed (strict, loose, or rejected), dedups
  on the notification key, asks the backend's Pydantic AI agent once per unseen merchant, and
  puts the result in a review inbox. Sparkasse Kontowecker emails are polled from Gmail with a
  watermark plus seen-set so a dismissed line never returns. Nothing reaches the cloud until the
  user confirms it.

## Layout

```
App.tsx                  Root component, tab routing, persisted state, cloud sync
components/              One file per screen, plus shell/ (nav) and ui/ (primitives)
services/                Supabase, auth, Gmail, notification capture, API base
utils/                   Pure logic — finance math, parsers, merge, dedup, hashing
api/                     FastAPI app
  routers/               expenses, statements, merchants, integrations
  statement_review/      parser, redactor, extractor, reviewer, crosscheck, pipeline
  dependencies.py        Auth: Supabase JWT, personal token, integration token
android/                 Capacitor project; the notification listener lives in app/src/main/java
tests/                   pytest suites; tests/frontend holds the vitest suites
evals/                   Agent evals and synthetic fixtures
supabase/migrations/     SQL migrations (docs/RUN-*.sql are the step-by-step runbooks)
docs/                    ARCHITECTURE, DATABASE, ANDROID, lessons/, writing/, plans and specs
```

## Deployment

The Dockerfile builds the frontend in a Node stage, installs Python dependencies from `uv.lock` in a
`python:3.13-slim` stage, and copies `dist/` into the backend image. FastAPI serves `/api/*` and
`/v1/*`, then falls through to the SPA for everything else. `/health` is a zero-dependency health
check, wired to Railway's health check in `railway.json`.

## Status

This is a personal project, built for one household's finances. No license file, no support promised —
fork it if it's useful to you.
