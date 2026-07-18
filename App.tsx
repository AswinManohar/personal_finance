import React, { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { ActiveTab, Expense, InvestmentState, SavingsGoal as SavingsGoalType, FIREState, PortfolioAsset, IncomeState, Stock, NetWorthState, SavingsHistoryRecord, EmergencyFundState, Loan } from './types';
import { Expenses } from './components/Expenses';
import { InvestmentCalculator } from './components/InvestmentCalculator';
import { SavingsGoal } from './components/SavingsGoal';
import { NetWorth } from './components/NetWorth';
import { FIRECalculator } from './components/FIRECalculator';
import { Portfolio } from './components/Portfolio';
import { Stocks } from './components/Stocks';
import { DataManagement } from './components/DataManagement';
import { SavingsDashboard } from './components/SavingsDashboard';
import { Debts } from './components/Debts';
import { Login } from './components/Login';
import { AlertTriangle } from 'lucide-react';
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
    console.error("Cashflow Critical Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-surface-container-high text-negative rounded-3xl flex items-center justify-center mb-6">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-2">Application Crash</h1>
          <p className="text-on-surface-variant max-w-md mb-8">Cashflow encountered a critical error.</p>
          <button
            onClick={() => { window.localStorage.clear(); window.location.href = window.location.origin; }}
            className="bg-primary text-background px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-all"
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

const tabs = [
  { id: 'savings' as ActiveTab, label: 'Savings Hub' },
  { id: 'expenses' as ActiveTab, label: 'Expenses' },
  { id: 'goal' as ActiveTab, label: 'Goals' },
  { id: 'investment' as ActiveTab, label: 'Calculator' },
  { id: 'fire' as ActiveTab, label: 'FIRE' },
  { id: 'networth' as ActiveTab, label: 'Net Worth' },
  { id: 'debts' as ActiveTab, label: 'Debts' },
  { id: 'portfolio' as ActiveTab, label: 'Portfolio' },
  { id: 'stocks' as ActiveTab, label: 'Stocks' },
  { id: 'data' as ActiveTab, label: 'Data' },
];

const mobileBottomTabs: { id: ActiveTab; label: string; icon: string }[] = [
  { id: 'savings', label: 'Savings', icon: 'savings' },
  { id: 'expenses', label: 'Expenses', icon: 'receipt_long' },
  { id: 'fire', label: 'FIRE', icon: 'local_fire_department' },
  { id: 'networth', label: 'Net Worth', icon: 'account_balance' },
  { id: 'debts', label: 'Debts', icon: 'credit_card' },
  { id: 'data', label: 'Data', icon: 'database' },
];

const AppMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('savings');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'offline'>('idle');
  const [uniqueSyncId, setUniqueSyncId] = usePersistedState<string | null>('unique_sync_id', null);
  const [isGuest, setIsGuest] = useState(() => window.localStorage.getItem('isGuest') === 'true');
  const [userMetadata, setUserMetadata] = useState<any>(null);

  // Persisted State
  const [expenses, setExpenses] = usePersistedState<Expense[]>('expenses', []);
  const [income, setIncome] = usePersistedState<IncomeState>('income', { salaryMe: 0, salaryPartner: 0 });
  const [investment, setInvestment] = usePersistedState<InvestmentState>('investment', { initialPrincipal: 5000, monthlyContribution: 500, annualInterestRate: 7, yearsToGrow: 10 });
  const [goal, setGoal] = usePersistedState<SavingsGoalType>('goal', { targetAmount: 10000, currentSavings: 1000, targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] });
  const [netWorthData, setNetWorthData] = usePersistedState<NetWorthState>('networth', { goldInvestment: 0, otherAssets: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 0 });
  const [history, setHistory] = usePersistedState<SavingsHistoryRecord[]>('savings_history', []);
  const [fire, setFire] = usePersistedState<FIREState>('fire', { currentAge: 30, annualExpenses: 30000, currentNetWorth: 50000, annualSavings: 12000, annualReturn: 7, withdrawalRate: 4 });
  const [emergencyFund, setEmergencyFund] = usePersistedState<EmergencyFundState>('emergency_fund', { targetMonths: 3 });
  const [loans, setLoans] = usePersistedState<Loan[]>('loans', []);
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
        if (data.emergencyFund) setEmergencyFund(data.emergencyFund);
        if (data.loans) setLoans(data.loans);
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
  }, [activeUserKey, setExpenses, setPortfolio, setStocks, setIncome, setInvestment, setGoal, setFire, setNetWorthData, setHistory, setEmergencyFund, setLoans]);

  const triggerSync = useCallback(async (overrides?: any) => {
    if (!activeUserKey || syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      const payload = {
        expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans,
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
  }, [activeUserKey, expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans]);

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
      case 'savings': return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} expenses={expenses} emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund} />;
      case 'investment': return <InvestmentCalculator investment={investment} setInvestment={setInvestment} onSync={syncCallback} />;
      case 'goal': return <SavingsGoal goal={goal} setGoal={setGoal} onSync={syncCallback} />;
      case 'networth': return <NetWorth netWorthData={netWorthData} setNetWorthData={setNetWorthData} currentSavings={goal.currentSavings} stocks={stocks} portfolio={portfolio} syncKey={activeUserKey || undefined} history={history} setHistory={setHistory} onSync={syncCallback} />;
      case 'debts': return <Debts loans={loans} setLoans={setLoans} netWorthData={netWorthData} expenses={expenses} onSync={syncCallback} />;
      case 'fire': return <FIRECalculator state={fire} setState={setFire} onSync={syncCallback} />;
      case 'portfolio': return <Portfolio assets={portfolio} setAssets={setPortfolio} onSync={syncCallback} />;
      case 'stocks': return <Stocks stocks={stocks} setStocks={setStocks} onSync={syncCallback} />;
      case 'data': return <DataManagement expenses={expenses} portfolio={portfolio} stocks={stocks} income={income} investment={investment} goal={goal} fire={fire} netWorthData={netWorthData} emergencyFund={emergencyFund} loans={loans} uniqueSyncId={uniqueSyncId} lastSyncedAt={lastSyncedAt} setExpenses={setExpenses} setPortfolio={setPortfolio} setStocks={setStocks} setIncome={setIncome} setInvestment={setInvestment} setGoal={setGoal} setFire={setFire} setNetWorthData={setNetWorthData} setEmergencyFund={setEmergencyFund} setLoans={setLoans} onLogout={handleLogout} onRetryPull={performCloudPull} />;
      default: return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} expenses={expenses} emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body">
      {/* Fixed Top Nav - desktop */}
      <header className="fixed top-0 w-full z-50 justify-between items-center px-8 h-14 bg-[#1a1b20] border-b border-[#464554]/15 hidden md:flex">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold text-[#e3e2e7] tracking-widest uppercase">Cashflow</span>
          <nav className="flex gap-6 items-center">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id
                  ? "text-[#c1c1ff] border-b-2 border-[#c1c1ff] pb-1 font-semibold text-sm"
                  : "text-[#ccc5c0] hover:text-[#e3e2e7] transition-colors text-sm"
                }
              >{tab.label}</button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => triggerSync()} className="p-2 rounded-full hover:bg-[#38393d] transition-all duration-200 text-[#c1c1ff]">
            <span className="material-symbols-outlined">sync</span>
          </button>
          {userMetadata?.avatar_url ? (
            <img src={userMetadata.avatar_url} alt="User" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#292a2e] flex items-center justify-center text-[#ccc5c0] text-xs font-bold">
              {isGuest ? 'G' : 'U'}
            </div>
          )}
          <button onClick={handleLogout} className="text-[#ccc5c0] hover:text-[#e3e2e7] text-xs transition-colors">Exit</button>
        </div>
      </header>

      {/* Mobile header - simple top bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-14 bg-[#1a1b20] border-b border-[#464554]/15 md:hidden">
        <span className="text-base font-bold text-[#e3e2e7] tracking-widest uppercase">Cashflow</span>
        <button onClick={() => triggerSync()} className="p-2 rounded-full hover:bg-[#38393d] text-[#c1c1ff]">
          <span className="material-symbols-outlined text-sm">sync</span>
        </button>
      </header>

      {/* Main content - with top padding for fixed nav, bottom padding for mobile bottom nav */}
      <main className="pt-14 pb-20 md:pb-8 min-h-screen">
        <div className="max-w-[1600px] mx-auto">{renderContent()}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#1a1b20] h-16 flex items-center justify-around z-50 px-4 border-t border-[#464554]/10">
        {mobileBottomTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5"
          >
            <span
              className={`material-symbols-outlined text-xl ${activeTab === tab.id ? 'text-[#c1c1ff]' : 'text-[#ccc5c0] opacity-70'}`}
            >{tab.icon}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-tighter ${activeTab === tab.id ? 'text-[#c1c1ff]' : 'text-[#ccc5c0] opacity-70'}`}
            >{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Ambient glows */}
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#c1c1ff]/5 blur-[120px] rounded-full pointer-events-none z-[-1]"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-[#eec060]/5 blur-[100px] rounded-full pointer-events-none z-[-1]"></div>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppMain />
  </ErrorBoundary>
);

export default App;
