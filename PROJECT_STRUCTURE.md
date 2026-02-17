# Project Structure: Personal Finance

## 📁 Project Overview

**Name:** `cashflow` (FinanceFlow)
**Description:** A comprehensive financial planning dashboard to track monthly expenses, project investment growth, calculate savings goals, and receive AI-powered financial advice.
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS (CDN) + Supabase + Google Gemini AI

---

## 🗂️ Directory Tree

```
personal_finance/
├── 📄 index.html                  # HTML entry point (Tailwind CDN, Inter font, Vite module entry)
├── 📄 index.tsx                   # React app bootstrap (ReactDOM.createRoot)
├── 📄 App.tsx                     # Main application component (336 lines)
├── 📄 types.ts                    # Shared TypeScript interfaces & enums (100 lines)
├── 📄 vite.config.ts              # Vite config (port 3000, Gemini API key injection)
├── 📄 tsconfig.json               # TypeScript config (ES2022, bundler module resolution)
├── 📄 package.json                # Node dependencies & scripts
├── 📄 package-lock.json           # Lockfile
├── 📄 metadata.json               # App metadata
├── 📄 pyproject.toml              # Python project config (Python ≥3.13, no deps yet)
├── 📄 main.py                     # Python entry point (minimal)
├── 📄 .env.local                  # Environment variables (GEMINI_API_KEY)
├── 📄 .gitignore
├── 📄 .python-version             # Python version pin
├── 📄 README.md
├── 📄 GOOGLE_AUTH_SETUP.md        # Google OAuth setup guide
├── 📄 SUPABASE_SECURITY.sql       # Supabase Row Level Security policies
│
├── components/                    # React UI components
│   ├── 📄 AIAdvisor.tsx           # AI financial advisor (Gemini-powered) — 4.6 KB
│   ├── 📄 DataManagement.tsx      # Cloud sync import/export — 16.6 KB
│   ├── 📄 Expenses.tsx            # Expense tracker with categories — 22.2 KB
│   ├── 📄 FIRECalculator.tsx      # FIRE (Financial Independence) calculator — 10.2 KB
│   ├── 📄 InvestmentCalculator.tsx # Compound interest projections — 7.1 KB
│   ├── 📄 Login.tsx               # Auth (Google OAuth + Sync ID + Guest) — 9.4 KB
│   ├── 📄 NetWorth.tsx            # Net worth tracker — 9.3 KB
│   ├── 📄 Portfolio.tsx           # Mutual funds / ETFs portfolio — 14.2 KB
│   ├── 📄 SavingsDashboard.tsx    # Savings overview dashboard — 13.4 KB
│   ├── 📄 SavingsGoal.tsx         # Goal-based savings — 5.6 KB
│   ├── 📄 Stocks.tsx              # Individual stocks tracker — 10.9 KB
│   └── ui/
│       └── 📄 Card.tsx            # Reusable Card component
│
├── services/                      # Backend service integrations
│   ├── 📄 supabaseService.ts      # Supabase client, CRUD, cloud sync, Google Auth (237 lines)
│   └── 📄 geminiService.ts        # Google Gemini AI — stock prices + financial advice (114 lines)
│
├── notebooks/
│   └── 📄 test_bankstatements.ipynb  # Jupyter notebook for bank statement parsing
│
├── dist/                          # Production build output
│   ├── index.html
│   └── assets/
│       └── index-D0MoWY2d.js
│
├── .venv/                         # Python virtual environment
├── node_modules/                  # Node.js dependencies
└── .agent/                        # Agent skills & workflows config
```

---

## 🏛️ Architecture Details

### **Entry Flow**
```
index.html → index.tsx → <App /> (App.tsx)
```

### **`App.tsx` — Core Application**

| Component | Purpose |
|:---|:---|
| `ErrorBoundary` | Global error catching with fallback UI |
| `usePersistedState` | Custom hook for localStorage persistence |
| `AppMain` | Main controller — authentication state, tab navigation, cloud sync |
| `NavItem` | Tab navigation renderer |

**Navigation Tabs (`ActiveTab`):**
`expenses` · `savings` · `investment` · `networth` · `fire` · `portfolio` · `stocks` · `advisor` · `data`

### **`types.ts` — Shared Types**

| Type/Interface | Purpose |
|:---|:---|
| `Expense` | Expense record with category, recurring flag, date |
| `ExpenseCategory` | Enum: Housing, Food, Transport, Utilities, Entertainment, Other |
| `IncomeState` | Dual income (user + partner) |
| `InvestmentState` | Compound growth parameters |
| `SavingsGoal` | Target amount, date, current progress |
| `NetWorthState` | Gold, loans, recurring & accumulated savings |
| `SavingsHistoryRecord` | Timestamped financial snapshot |
| `FIREState` | FIRE calculator inputs (age, expenses, net worth, returns) |
| `PortfolioAsset` | Fund/ETF with expense ratio, tax rate, frequency |
| `Stock` | Individual stock holding |
| `CalculationResult` | Month-by-month projection data |
| `SupabaseSyncState` | Cloud sync state |

### **Services Layer**

| Service | Key Functions |
|:---|:---|
| `supabaseService.ts` | `pushToCloud`, `pullFromCloud`, `recordSavingsHistory`, `getSavingsHistory`, `deleteHistoryRecord`, `signInWithGoogle`, `signOut`, `isNetworkError` |
| `geminiService.ts` | `getStockPrices` (Gemini + Google Search grounding), `getFinancialAdvice` (holistic AI analysis) |

### **Dependencies**

| Package | Version | Purpose |
|:---|:---|:---|
| `react` / `react-dom` | ^19.2.3 | UI framework |
| `recharts` | ^3.6.0 | Data visualization / charts |
| `@google/genai` | ^1.37.0 | Gemini AI SDK |
| `@supabase/supabase-js` | ^2.45.0 | Backend-as-a-Service (auth, DB) |
| `lucide-react` | ^0.562.0 | Icon library |
| `react-markdown` | ^10.1.0 | Markdown rendering (AI advisor output) |
| `vite` | ^6.2.0 | Build tool & dev server |
| `typescript` | ~5.8.2 | Type safety |

### **Backend (Supabase Tables)**

Based on the service code, the app uses these Supabase tables:
- **`user_finances`** — General financial data blob (JSON) per user
- **`user_expenses`** — Normalized expense records (`name`, `amount`, `category`, `is_recurring`)
- **`user_income`** — Income tracking (`salary_me`, `salary_partner`)
- **`user_savings_history`** — Timestamped net worth snapshots

### **Authentication**
- **Google OAuth** via Supabase Auth
- **Sync ID** (manual key-based login)
- **Guest mode** (local-only, no cloud sync)

---

## 🔧 Scripts

```bash
npm run dev      # Start Vite dev server on port 3000
npm run build    # Production build → dist/
npm run preview  # Preview production build
```
