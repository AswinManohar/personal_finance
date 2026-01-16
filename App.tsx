import React, { useState, useEffect } from 'react';
import { ActiveTab, Expense, InvestmentState, SavingsGoal as SavingsGoalType, FIREState, PortfolioAsset, IncomeState, Stock, GoogleSheetsState } from './types';
import { Expenses } from './components/Expenses';
import { InvestmentCalculator } from './components/InvestmentCalculator';
import { SavingsGoal } from './components/SavingsGoal';
import { FIRECalculator } from './components/FIRECalculator';
import { Portfolio } from './components/Portfolio';
import { Stocks } from './components/Stocks';
import { AIAdvisor } from './components/AIAdvisor';
import { DataManagement } from './components/DataManagement';
import { LayoutDashboard, PieChart, TrendingUp, PiggyBank, Sparkles, Flame, Briefcase, BarChart4, Database } from 'lucide-react';

// Helper hook for local storage persistence
function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(error);
    }
  }, [key, state]);

  return [state, setState];
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');

  // Persisted State
  const [expenses, setExpenses] = usePersistedState<Expense[]>('expenses', []);
  
  const [income, setIncome] = usePersistedState<IncomeState>('income', {
    salaryMe: 0,
    salaryPartner: 0
  });

  const [investment, setInvestment] = usePersistedState<InvestmentState>('investment', {
    initialPrincipal: 5000,
    monthlyContribution: 500,
    annualInterestRate: 7,
    yearsToGrow: 10
  });

  const [goal, setGoal] = usePersistedState<SavingsGoalType>('goal', {
    targetAmount: 10000,
    currentSavings: 1000,
    targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  });

  const [fire, setFire] = usePersistedState<FIREState>('fire', {
    currentAge: 30,
    annualExpenses: 30000,
    currentNetWorth: 50000,
    annualSavings: 12000,
    annualReturn: 7,
    withdrawalRate: 4
  });

  const [portfolio, setPortfolio] = usePersistedState<PortfolioAsset[]>('portfolio', []);
  const [stocks, setStocks] = usePersistedState<Stock[]>('stocks', []);
  const [sheetState, setSheetState] = usePersistedState<GoogleSheetsState>('sheets', { spreadsheetId: '' });

  const clearAllData = () => {
    localStorage.clear();
    setExpenses([]);
    setIncome({ salaryMe: 0, salaryPartner: 0 });
    setInvestment({ initialPrincipal: 5000, monthlyContribution: 500, annualInterestRate: 7, yearsToGrow: 10 });
    setGoal({ targetAmount: 10000, currentSavings: 1000, targetDate: '' });
    setFire({ currentAge: 30, annualExpenses: 30000, currentNetWorth: 50000, annualSavings: 12000, annualReturn: 7, withdrawalRate: 4 });
    setPortfolio([]);
    setStocks([]);
    setSheetState({ spreadsheetId: '' });
    window.location.reload();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'expenses':
        return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} />;
      case 'investment':
        return <InvestmentCalculator investment={investment} setInvestment={setInvestment} />;
      case 'savings':
        return <SavingsGoal goal={goal} setGoal={setGoal} />;
      case 'fire':
        return <FIRECalculator state={fire} setState={setFire} />;
      case 'portfolio':
        return <Portfolio assets={portfolio} setAssets={setPortfolio} />;
      case 'stocks':
        return <Stocks stocks={stocks} setStocks={setStocks} />;
      case 'advisor':
        return <AIAdvisor expenses={expenses} investment={investment} goal={goal} fire={fire} portfolio={portfolio} stocks={stocks} income={income} />;
      case 'data':
        return <DataManagement 
                  expenses={expenses} 
                  portfolio={portfolio} 
                  stocks={stocks}
                  sheetState={sheetState}
                  setExpenses={setExpenses} 
                  setPortfolio={setPortfolio} 
                  setStocks={setStocks}
                  setSheetState={setSheetState}
                  clearAllData={clearAllData}
               />;
      default:
        return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} />;
    }
  };

  const NavItem = ({ id, label, icon: Icon }: { id: ActiveTab; label: string; icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
        activeTab === id
          ? 'bg-white text-primary-600 shadow-sm'
          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white">
                <LayoutDashboard size={20} />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-700 to-primary-500 hidden sm:block">
                FinanceFlow
              </h1>
            </div>
            
            <nav className="flex space-x-1 bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-[calc(100vw-80px)] sm:max-w-none no-scrollbar">
              <NavItem id="expenses" label="Expenses" icon={PieChart} />
              <NavItem id="investment" label="Invest" icon={TrendingUp} />
              <NavItem id="stocks" label="Stocks" icon={BarChart4} />
              <NavItem id="portfolio" label="Portfolio" icon={Briefcase} />
              <NavItem id="savings" label="Goals" icon={PiggyBank} />
              <NavItem id="fire" label="FIRE" icon={Flame} />
              <NavItem id="advisor" label="Advisor" icon={Sparkles} />
              <NavItem id="data" label="Data" icon={Database} />
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-in fade-in duration-500 slide-in-from-bottom-4">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;