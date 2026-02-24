import React, { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { ActiveTab, Expense, InvestmentState, SavingsGoal as SavingsGoalType, FIREState, PortfolioAsset, IncomeState, Stock, NetWorthState, SavingsHistoryRecord } from './types';
import { Expenses } from './components/Expenses';
import { InvestmentCalculator } from './components/InvestmentCalculator';
import { SavingsGoal } from './components/SavingsGoal';
import { NetWorth } from './components/NetWorth';
import { FIRECalculator } from './components/FIRECalculator';
import { Portfolio } from './components/Portfolio';
import { Stocks } from './components/Stocks';
import { DataManagement } from './components/DataManagement';
import { SavingsDashboard } from './components/SavingsDashboard';
import { Login } from './components/Login';
import { RefreshCw, AlertTriangle, Menu, X, Sun, Moon } from 'lucide-react';
import { pullFromCloud, pushToCloud, isNetworkError, supabase, signOut } from './services/supabaseService';

// Global Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("FinanceFlow Critical Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Application Crash</h1>
          <p className="text-slate-500 max-w-md mb-8">FinanceFlow encountered a critical error.</p>
          <button
            onClick={() => { window.localStorage.clear(); window.location.href = window.location.origin; }}
            className="btn-pulse bg-slate-900 text-black dark:text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            Reset App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Helper hook for local storage persistence
function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) { }
  }, [key, state]);

  return [state, setState];
}

const AppMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('savings');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'offline'>('idle');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [uniqueSyncId, setUniqueSyncId] = usePersistedState<string | null>('unique_sync_id', null);
  const [isDarkMode, setIsDarkMode] = usePersistedState<boolean>('theme_dark', true);
  const [isGuest, setIsGuest] = useState(() => window.localStorage.getItem('isGuest') === 'true');
  const [userMetadata, setUserMetadata] = useState<any>(null);

  // Persisted State
  const [expenses, setExpenses] = usePersistedState<Expense[]>('expenses', []);
  const [income, setIncome] = usePersistedState<IncomeState>('income', { salaryMe: 0, salaryPartner: 0 });
  const [investment, setInvestment] = usePersistedState<InvestmentState>('investment', { initialPrincipal: 5000, monthlyContribution: 500, annualInterestRate: 7, yearsToGrow: 10 });
  const [goal, setGoal] = usePersistedState<SavingsGoalType>('goal', { targetAmount: 10000, currentSavings: 1000, targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] });
  const [netWorthData, setNetWorthData] = usePersistedState<NetWorthState>('networth', { goldInvestment: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 0 });
  const [history, setHistory] = usePersistedState<SavingsHistoryRecord[]>('savings_history', []);
  const [fire, setFire] = usePersistedState<FIREState>('fire', { currentAge: 30, annualExpenses: 30000, currentNetWorth: 50000, annualSavings: 12000, annualReturn: 7, withdrawalRate: 4 });
  const [portfolio, setPortfolio] = usePersistedState<PortfolioAsset[]>('portfolio', []);
  const [stocks, setStocks] = usePersistedState<Stock[]>('stocks', []);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const pullInProgressRef = useRef(false);
  const syncInProgressRef = useRef(false);

  // The active key is just the Unique Sync ID now
  const activeUserKey = uniqueSyncId;

  const performCloudPull = useCallback(async () => {
    if (!activeUserKey || pullInProgressRef.current) return;

    pullInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      const { data, updatedAt } = await pullFromCloud(activeUserKey);

      if (data) {
        if (data.expenses) setExpenses(data.expenses);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.stocks) setStocks(data.stocks);
        if (data.income) setIncome(data.income);
        if (data.investment) setInvestment(data.investment);
        if (data.goal) setGoal(data.goal);
        if (data.fire) setFire(data.fire);
        if (data.netWorthData) setNetWorthData(data.netWorthData);
        if (data.history) setHistory(data.history);
      }

      setLastSyncedAt(updatedAt ? new Date(updatedAt).toLocaleString() : new Date().toLocaleString());
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err: any) {
      if (isNetworkError(err)) {
        setSyncStatus('offline');
      } else {
        console.error("Cloud pull error:", err);
        setSyncStatus('error');
      }
    } finally {
      pullInProgressRef.current = false;
    }
  }, [activeUserKey, setExpenses, setPortfolio, setStocks, setIncome, setInvestment, setGoal, setFire, setNetWorthData, setHistory]);

  const triggerSync = useCallback(async (overrides?: any) => {
    if (!activeUserKey || syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      const payload = {
        expenses, portfolio, stocks, income, investment, goal, fire, netWorthData,
        ...overrides
      };
      await pushToCloud(activeUserKey, payload);
      setSyncStatus('success');
      setLastSyncedAt(new Date().toLocaleString());
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err: any) {
      if (isNetworkError(err)) {
        setSyncStatus('offline');
      } else {
        console.error("Cloud push error:", err);
        setSyncStatus('error');
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [activeUserKey, expenses, portfolio, stocks, income, investment, goal, fire, netWorthData]);

  useEffect(() => {
    if (activeUserKey) performCloudPull();
  }, [activeUserKey, performCloudPull]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [isDarkMode]);

  const handleLogout = async () => {
    await signOut();
    setUniqueSyncId(null);
    setIsGuest(false);
    window.localStorage.clear();
    window.location.reload();
  };

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUniqueSyncId(session.user.id);
        setUserMetadata(session.user.user_metadata);
        setIsGuest(false);
      }
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUniqueSyncId(session.user.id);
        setUserMetadata(session.user.user_metadata);
        setIsGuest(false);
        window.localStorage.removeItem('isGuest');
      } else if (_event === 'SIGNED_OUT') {
        setUniqueSyncId(null);
        setUserMetadata(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [setUniqueSyncId]);

  const handleEnterAsGuest = () => {
    setIsGuest(true);
    setUniqueSyncId(null);
    window.localStorage.setItem('isGuest', 'true');
  };

  const handleSyncIdLogin = (id: string) => {
    setUniqueSyncId(id);
    setIsGuest(false);
    window.localStorage.removeItem('isGuest');
  };

  if (!uniqueSyncId && !isGuest) {
    return (
      <>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-4 right-4 z-[99] p-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-black dark:bg-white/80 dark:bg-black/80 backdrop-blur-md text-zinc-800 dark:text-zinc-200 shadow-xl transition-all hover:scale-105">
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <Login onGuestEnter={handleEnterAsGuest} onSyncIdEnter={handleSyncIdLogin} />
      </>
    );
  }

  const renderContent = () => {
    const syncCallback = activeUserKey ? triggerSync : undefined;
    switch (activeTab) {
      case 'expenses': return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} onSync={syncCallback} />;
      case 'savings': return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} />;
      case 'investment': return <InvestmentCalculator investment={investment} setInvestment={setInvestment} onSync={syncCallback} />;
      case 'networth': return <NetWorth netWorthData={netWorthData} setNetWorthData={setNetWorthData} currentSavings={goal.currentSavings} stocks={stocks} portfolio={portfolio} syncKey={activeUserKey || undefined} history={history} setHistory={setHistory} onSync={syncCallback} />;
      case 'fire': return <FIRECalculator state={fire} setState={setFire} onSync={syncCallback} />;
      case 'portfolio': return <Portfolio assets={portfolio} setAssets={setPortfolio} onSync={syncCallback} />;
      case 'stocks': return <Stocks stocks={stocks} setStocks={setStocks} onSync={syncCallback} />;
      case 'data': return <DataManagement expenses={expenses} portfolio={portfolio} stocks={stocks} income={income} investment={investment} goal={goal} fire={fire} netWorthData={netWorthData} uniqueSyncId={uniqueSyncId} lastSyncedAt={lastSyncedAt} setExpenses={setExpenses} setPortfolio={setPortfolio} setStocks={setStocks} setIncome={setIncome} setInvestment={setInvestment} setGoal={setGoal} setFire={setFire} setNetWorthData={setNetWorthData} onLogout={handleLogout} onRetryPull={performCloudPull} />;
      default: return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} />;
    }
  };

  const NavItem = ({ id, label }: { id: ActiveTab; label: string }) => (
    <button
      onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }}
      className={`px-4 py-3 w-full text-left text-sm uppercase tracking-widest transition-all duration-300 flex items-center gap-4 ${activeTab === id
        ? 'bg-black dark:bg-white text-white dark:text-black rounded-sm font-bold'
        : 'text-zinc-500 hover:text-black dark:hover:text-black dark:text-white font-normal'
        }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${activeTab === id ? 'bg-white dark:bg-black' : 'bg-transparent'}`}></div>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-transparent text-foreground flex flex-col md:flex-row overflow-hidden font-mono selection:bg-black dark:selection:bg-white selection:text-white dark:selection:text-black">
      <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-4 right-4 z-[99] p-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-black dark:bg-white/80 dark:bg-black/80 backdrop-blur-md text-zinc-800 dark:text-zinc-200 shadow-xl transition-all hover:scale-105">
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <header className="md:hidden border-b border-zinc-200 dark:border-zinc-900 h-16 px-4 flex items-center justify-between z-50 sticky top-0 bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-black dark:bg-white rounded-full"></div>
          <h1 className="text-lg font-bold tracking-widest uppercase">FINANCEFLOW</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-black dark:text-white">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      <aside className={`fixed inset-0 z-40 bg-zinc-50 dark:bg-zinc-950/80 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-900 w-72 flex flex-col transition-transform duration-300 transform md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-8 hidden md:flex items-center gap-3">
          <div className="w-2 h-2 bg-black dark:bg-white rounded-full"></div>
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase">FINANCEFLOW</h1>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Smart Wealth</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto no-scrollbar mt-12 md:mt-0">
          <p className="px-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">Main Dashboard</p>
          <NavItem id="savings" label="Savings" />
          <NavItem id="expenses" label="Expenses" />
          <NavItem id="networth" label="Net Worth" />

          <p className="px-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-8 mb-4">Investment Hub</p>
          <NavItem id="stocks" label="Stocks" />
          <NavItem id="portfolio" label="Funds" />
          <NavItem id="investment" label="Growth" />

          <p className="px-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-8 mb-4">Planning & Settings</p>
          <NavItem id="fire" label="FIRE" />
          <NavItem id="data" label="Data" />
        </nav>

        <div className="p-8 border-t border-zinc-200 dark:border-zinc-900 space-y-4 text-xs mt-auto">
          {activeUserKey ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-black dark:text-white truncate uppercase tracking-widest" title={userMetadata?.full_name || 'Sync ID User'}>
                  {userMetadata?.full_name || 'Sync ID User'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={handleLogout} className="text-[10px] font-bold text-zinc-500 hover:text-black dark:hover:text-black dark:text-white uppercase tracking-widest transition-colors">Exit</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">Guest Mode</p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1">Local Only</p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Sync</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'success' ? 'bg-black dark:bg-white' : syncStatus === 'syncing' ? 'bg-zinc-400 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-zinc-700'}`}></div>
            </div>
            <p className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
              {syncStatus === 'success' ? 'Synced' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'error' ? 'Error' : activeUserKey ? 'Connected' : 'Offline'}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto w-full mx-auto p-4 md:p-8 lg:p-12 relative">
        <div className="max-w-5xl mx-auto pb-12">{renderContent()}</div>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppMain />
  </ErrorBoundary>
);

export default App;