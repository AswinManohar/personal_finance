# FinanceFlow (Cashflow)

FinanceFlow is a comprehensive personal finance dashboard designed to help you track expenses, project legitimate investment growth, calculate savings goals, and receive AI-powered financial advice. It combines manual tracking with intelligent insights to give you a complete picture of your financial health.

## 🚀 Features

- **📊 Expense Tracking**: Log and categorize monthly expenses (Housing, Food, Transport, etc.) to understand your spending habits.
- **💰 Savings Goals**: Set target amounts and dates for your savings goals and track your progress.
- **📈 Investment Projections**: Visualize compound interest growth based on your monthly contributions and expected returns.
- **🔥 FIRE Calculator**: Estimate your Financial Independence, Retire Early (FIRE) number and timeline.
- **🏦 Net Worth Tracker**: Monitor your total net worth by aggregating assets (savings, investments, gold) and liabilities (loans).
- **🤖 AI Financial Advisor**: Get personalized, holistic financial advice powered by Google Gemini AI, analyzing your unique financial data.
- **☁️ Cloud Sync**: Securely sync your data across devices using Supabase, with support for Google OAuth and Guest Mode.
- **📉 Live Stock Prices**: Fetch real-time stock and ETF prices to keep your portfolio value up-to-date.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS (CDN), Lucide React (Icons)
- **Charts**: Recharts
- **Backend/Auth**: Supabase (Auth, Database)
- **AI**: Google Gemini AI SDK
- **Language**: TypeScript, Python (for data processing scripts)

## 📦 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/AswinManohar/personal_finance.git
    cd personal_finance
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env.local` file in the root directory and add your API keys:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key
    ```
    *Note: Supabase configuration is currently hardcoded in `services/supabaseService.ts` for this demo/personal version.*

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    

## 🏗️ Project Structure

For a detailed breakdown of the project directory and architecture, please refer to [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).

## 🧩 Key Components

- **`App.tsx`**: Main application controller handling navigation and state persistence.
- **`AIAdvisor.tsx`**: Interface for the Gemini-powered financial assistant.
- **`Expenses.tsx`**: Core module for managing daily and recurring expenses.
- **`FIRECalculator.tsx`**: Specialized calculator for retirement planning.
- **`Portfolio.tsx` & `Stocks.tsx`**: Tools for tracking market investments.
- **`supabaseService.ts`**: Handles all data synchronization and authentication logic.

## 🤝 Contributing

This is a personal project. Feel free to fork and modify for your own use!

## 📄 License

[MIT License](LICENSE)
