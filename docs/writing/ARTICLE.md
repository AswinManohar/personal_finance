# FinanceFlow: A Personal Finance Dashboard Built for Real Life

Managing personal finances is notoriously difficult — not because the math is hard, but because the tools are either too simple (a spreadsheet) or too complex (enterprise accounting software). FinanceFlow sits in the middle: a full-featured, self-hosted personal finance dashboard that covers everything from daily expense tracking to long-term FIRE retirement planning.

---

## What It Does

FinanceFlow is organized around nine core modules, each tackling a distinct aspect of personal financial life:

- **Expense Tracker** — Log daily expenses across categories (housing, food, transport, utilities, entertainment), with support for recurring charges and time-range filtering. Breakdowns are visualized with pie and bar charts.
- **Savings Dashboard** — An overview of your current savings situation, monthly income across dual incomes, and trajectory toward goals.
- **Savings Goals** — Set a target amount and deadline, then track progress automatically as your data updates.
- **Investment Calculator** — Project compound interest growth with configurable principal, monthly contributions, interest rate, and time horizon.
- **FIRE Calculator** — Input your current age, annual expenses, net worth, and savings rate to get your FIRE number and projected retirement age.
- **Net Worth Tracker** — Aggregate assets (savings, investments, gold, stocks) and liabilities (loans) into a single net worth figure, with historical snapshots.
- **Portfolio** — Track mutual funds, ETFs, and other holdings with expected returns, expense ratios, and tax considerations.
- **Stocks** — Monitor individual stocks and ETFs with live price fetching, tracking unrealized gains by position.
- **AI Financial Advisor** — A chat interface powered by Google Gemini that analyzes your actual financial data to give personalized, context-aware advice.

A cloud sync system backs all data to Supabase in real time, with Google OAuth for authentication — or a manual sync-key flow for users who prefer not to use OAuth. Guest mode keeps everything local-only for maximum privacy.

---

## The Tech Stack

### Frontend

The UI is built with **React 19** and **TypeScript**, bundled with **Vite 6**. Styling is handled by **Tailwind CSS** with a class-based dark mode toggle. Charts throughout the dashboard use **Recharts**, and icons come from **Lucide React**.

A custom `usePersistedState` hook handles localStorage persistence across all state slices, giving the app an offline-first feel — cloud sync is layered on top, not a dependency for basic usage.

AI advisor responses are rendered via **react-markdown**, preserving formatting from Gemini's output.

### Backend & Cloud

**Supabase** provides the entire backend infrastructure:

- **PostgreSQL** for storing financial data, expenses, income, and historical snapshots
- **Row Level Security (RLS)** policies ensure users can only ever access their own data
- **Google OAuth** via Supabase Auth for seamless sign-in

The Python backend (built on **FastAPI** and **Uvicorn**) handles supplementary tasks including bank statement parsing via **PyPDF**. It runs on Python 3.13 and connects to Supabase through the official Python SDK.

### AI Layer

The AI Advisor is powered by **Google Gemini**, accessed via the Gemini AI SDK. It uses Google Search grounding to pull real-time data — useful for stock price lookups and current market context. The advisor receives a structured summary of your financial profile before each query, making its advice genuinely personalized rather than generic.

### Infrastructure

A `Dockerfile` is included for containerized deployment. Environment configuration is managed via `.env` files. The frontend builds to a static `dist/` folder, making it deployable to any static host.

---

## Architecture Highlights

The app follows a clean separation of concerns:

- **`components/`** — Self-contained React components for each financial module
- **`services/supabaseService.ts`** — All cloud sync, authentication, and database operations live here
- **`types.ts`** — Shared TypeScript interfaces defining the data model across the entire app
- **`App.tsx`** — Top-level controller managing auth state, tab navigation, and sync orchestration

Data flows from localStorage (immediate, offline) to Supabase (persistent, synced) via explicit push/pull operations — the app never silently loses data if you're offline.

---

## Who It's For

FinanceFlow is built for people who want full visibility into their finances without handing their data to a third-party fintech app. Because it's self-hosted and backed by your own Supabase instance, you retain complete ownership of your data. The FIRE calculator and investment projections make it particularly well-suited for anyone on a path toward financial independence.

It's a side project that grew to cover real financial planning needs — and the tech stack reflects that: pragmatic choices, modern tooling, and an architecture that's easy to extend.
