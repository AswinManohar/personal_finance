import React, { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { ActiveTab, Expense, InvestmentState, SavingsGoal as SavingsGoalType, FIREState, PortfolioAsset, IncomeState, Stock, NetWorthState, SavingsHistoryRecord } from './types';
import { Expenses } from './components/Expenses';
import { InvestmentCalculator } from './components/InvestmentCalculator';
import { SavingsGoal } from './components/SavingsGoal';
import { NetWorth } from './components/NetWorth';
import { FIRECalculator } from './components/FIRECalculator';
import { Portfolio } from './components/Portfolio';
import { Stocks } from './components/Stocks';
import { AIAdvisor } from './components/AIAdvisor';
import { DataManagement } from './components/DataManagement';
import { SavingsDashboard } from './components/SavingsDashboard';
import { Login } from './components/Login';
import { LayoutDashboard, PieChart, TrendingUp, Sparkles, Flame, Briefcase, BarChart4, Cloud, RefreshCw, Wallet, Settings, Menu, X, Coins, LogOut, Key, CloudOff, AlertTriangle, WifiOff } from 'lucide-react';
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
            className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
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
    return <Login onGuestEnter={handleEnterAsGuest} onSyncIdEnter={handleSyncIdLogin} />;
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
      case 'advisor': return <AIAdvisor expenses={expenses} investment={investment} goal={goal} fire={fire} portfolio={portfolio} stocks={stocks} income={income} netWorthData={netWorthData} />;
      case 'data': return <DataManagement expenses={expenses} portfolio={portfolio} stocks={stocks} income={income} investment={investment} goal={goal} fire={fire} netWorthData={netWorthData} uniqueSyncId={uniqueSyncId} lastSyncedAt={lastSyncedAt} setExpenses={setExpenses} setPortfolio={setPortfolio} setStocks={setStocks} setIncome={setIncome} setInvestment={setInvestment} setGoal={setGoal} setFire={setFire} setNetWorthData={setNetWorthData} onLogout={handleLogout} onRetryPull={performCloudPull} />;
      default: return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} />;
    }
  };

  const NavItem = ({ id, label, icon: Icon }: { id: ActiveTab; label: string; icon: any }) => (
    <button
      onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all w-full ${activeTab === id ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
    >
      <Icon size={20} />
      <span>{label}</span>
      {activeTab === id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-600"></div>}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row overflow-hidden">
      <header className="md:hidden bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between z-50 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white"><LayoutDashboard size={20} /></div>
          <h1 className="text-lg font-bold">FinanceFlow</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      <aside className={`fixed inset-0 z-40 bg-white border-r border-slate-200 w-64 flex flex-col transition-transform duration-300 transform md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 hidden md:flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-200"><LayoutDashboard size={24} /></div>
          <div><h1 className="text-xl font-black tracking-tight text-slate-900">FinanceFlow</h1><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Smart Wealth</p></div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar mt-12 md:mt-0">
          <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Main Dashboard</p>
          <NavItem id="savings" label="Savings Hub" icon={Coins} />
          <NavItem id="expenses" label="Monthly Expenses" icon={PieChart} />
          <NavItem id="networth" label="Net Worth Tracking" icon={Wallet} />
          <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8 mb-2">Investment Hub</p>
          <NavItem id="stocks" label="Stocks" icon={BarChart4} />
          <NavItem id="portfolio" label="Funds & ETFs" icon={Briefcase} />
          <NavItem id="investment" label="Growth Sim" icon={TrendingUp} />
          <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8 mb-2">Planning & AI</p>
          <NavItem id="fire" label="FIRE Analysis" icon={Flame} />
          <NavItem id="advisor" label="AI Advisor" icon={Sparkles} />
          <NavItem id="data" label="Settings" icon={Settings} />
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          {activeUserKey ? (
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
              {userMetadata?.avatar_url ? (
                <img src={userMetadata.avatar_url} alt="User" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">
                  <Key size={18} className="text-indigo-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 truncate" title={userMetadata?.full_name || userMetadata?.email || 'Sync ID User'}>
                  {userMetadata?.full_name || userMetadata?.email || 'Sync ID User'}
                </p>
                <button onClick={handleLogout} className="text-[10px] font-bold text-primary-600 hover:text-primary-800 flex items-center gap-1 mt-0.5"><LogOut size={10} /> Exit</button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0"><CloudOff size={20} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900">Guest Mode</p>
                <p className="text-[10px] text-slate-400">Local Only</p>
              </div>
            </div>
          )}

          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cloud Status</span>
              {syncStatus === 'syncing' ? <RefreshCw size={12} className="animate-spin text-primary-500" /> : <div className={`w-2 h-2 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : syncStatus === 'error' ? 'bg-red-500' : syncStatus === 'offline' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>}
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-50 rounded-lg">
                {syncStatus === 'offline' ? <WifiOff size={14} className="text-amber-500" /> : <Cloud size={14} className={syncStatus === 'success' ? 'text-emerald-500' : 'text-slate-400'} />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">
                  {syncStatus === 'success' ? 'Synced' : syncStatus === 'offline' ? 'Offline Mode' : syncStatus === 'error' ? 'Sync Error' : activeUserKey ? 'Connected' : 'Offline'}
                </p>
                <p className="text-[9px] text-slate-400 truncate max-w-[120px]">{syncStatus === 'offline' ? 'Cloud Unreachable' : lastSyncedAt || (activeUserKey ? 'Idle' : 'Not Linked')}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8 relative">
        <div className="max-w-6xl mx-auto pb-12">{renderContent()}</div>
      </main>
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-primary-100/30 blur-[100px] rounded-full opacity-50 pointer-events-none"></div>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppMain />
  </ErrorBoundary>
);

export default App;