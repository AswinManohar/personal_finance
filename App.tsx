import React, { useState, useEffect, useCallback, useMemo, useRef, Component, ErrorInfo, ReactNode } from 'react';
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
import { StatementReview } from './components/StatementReview';
import { BottomNav } from './components/shell/BottomNav';
import { MoreSheet } from './components/shell/MoreSheet';
import { Toast, useToast } from './components/shell/Toast';
import { ALL_DESTINATIONS } from './components/shell/navigation';
import { mergePulledExpenses } from './utils/mergeExpenses';
import { assetBreakdown, num } from './utils/finance';
import { captureKeyFromUrl } from './services/advanziaCapture';
import { Capacitor } from '@capacitor/core';
import { AlertTriangle } from 'lucide-react';
import { pullFromCloud, pushToCloud, isNetworkError, supabase } from './services/supabaseService';
import { signOut, initAuth } from './services/auth';
import { startNativeShell } from './services/nativeShell';

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

const AppMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('savings');
  const [moreOpen, setMoreOpen] = useState(false);
  const { message: toastMessage, toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'offline'>('idle');
  // The user key is the Supabase user id and nothing else. There used to be a
  // "Sync ID" text box that wrote straight into user_key — which was not access
  // control: anyone holding the string got the data, and RLS could not help
  // because that path had no auth.uid() at all.
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isGuest, setIsGuest] = useState(() => window.localStorage.getItem('isGuest') === 'true');
  const [userMetadata, setUserMetadata] = useState<any>(null);

  // Persisted State
  const [expenses, setExpenses] = usePersistedState<Expense[]>('expenses', []);
  const [income, setIncome] = usePersistedState<IncomeState>('income', { salaryMe: 0, salaryPartner: 0 });
  const [investment, setInvestment] = usePersistedState<InvestmentState>('investment', { initialPrincipal: 5000, monthlyContribution: 500, annualInterestRate: 7, yearsToGrow: 10 });
  const [goal, setGoal] = usePersistedState<SavingsGoalType>('goal', { targetAmount: 10000, targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] });
  const [netWorthData, setNetWorthData] = usePersistedState<NetWorthState>('networth', { goldInvestment: 0, otherAssets: 0, remainingLoan: 0, monthlyRecurringSavings: 0, accumulatedSavings: 0 });
  const [history, setHistory] = usePersistedState<SavingsHistoryRecord[]>('savings_history', []);
  const [fire, setFire] = usePersistedState<FIREState>('fire', { currentAge: 30, annualExpenses: 30000, currentNetWorth: 50000, annualSavings: 12000, annualReturn: 7, withdrawalRate: 4 });
  const [emergencyFund, setEmergencyFund] = usePersistedState<EmergencyFundState>('emergency_fund', { targetAmount: 0, currentAmount: 0 });
  const [loans, setLoans] = usePersistedState<Loan[]>('loans', []);
  // Deletions must be carried explicitly to the cloud. Absence from `expenses`
  // is not proof of deletion — the Telegram bot writes rows this client has not
  // pulled yet. Persisted so a delete survives a reload before the next sync.
  const [deletedExpenseIds, setDeletedExpenseIds] = usePersistedState<string[]>('deleted_expense_ids', []);
  const [portfolio, setPortfolio] = usePersistedState<PortfolioAsset[]>('portfolio', []);
  const [stocks, setStocks] = usePersistedState<Stock[]>('stocks', []);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // The Goal screen holds none of the asset state, so the sum is computed here
  // rather than handing it three more props. The Hub and Net Worth compute their
  // own from props they already carry.
  const breakdown = useMemo(
    () => assetBreakdown(netWorthData, stocks, portfolio),
    [netWorthData, stocks, portfolio]
  );

  const pullInProgressRef = useRef(false);
  const syncInProgressRef = useRef(false);
  // Bumped after each successful pull; the effect below pushes once per bump.
  const [autoPushQueued, setAutoPushQueued] = useState(0);
  // The cloud is the source of truth. Until the first pull lands we do not know
  // what the numbers are, and localStorage is only a cache of the last pull —
  // rendering it as fact is how "cleared cache" turned into "everything gone".
  const [firstPull, setFirstPull] = useState<'pending' | 'done' | 'failed'>('pending');

  const activeUserKey = sessionUserId;

  const performCloudPull = useCallback(async () => {
    if (!activeUserKey || pullInProgressRef.current) return;

    pullInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      const { data, deletedExpenseIds: cloudTombstones, updatedAt } = await pullFromCloud(activeUserKey);

      if (data) {
        // Merge rather than replace. `data.expenses` being empty means the cloud
        // holds nothing, not that this device should throw away what it has —
        // anything added here and not yet pushed would be lost. Rows the cloud
        // has positively tombstoned are dropped; rows it has never seen stay.
        if (data.expenses) {
          setExpenses(prev => mergePulledExpenses(prev, data.expenses, cloudTombstones));
        }
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.stocks) setStocks(data.stocks);
        if (data.income) setIncome(data.income);
        if (data.investment) setInvestment(data.investment);
        if (data.goal) setGoal(data.goal);
        if (data.fire) setFire(data.fire);
        if (data.netWorthData) setNetWorthData(data.netWorthData);
        if (data.history) setHistory(data.history);
        // Normalised on the way in, so the state always matches the declared
        // shape. This is not migration: a legacy { targetMonths } payload
        // carries nothing forward — it degrades to zeros, by design.
        if (data.emergencyFund) setEmergencyFund({
          targetAmount: num(data.emergencyFund.targetAmount),
          currentAmount: num(data.emergencyFund.currentAmount),
        });
        if (data.loans) setLoans(data.loans);
      }

      setLastSyncedAt(updatedAt ? new Date(updatedAt).toLocaleString() : new Date().toLocaleString());
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
      // Queue a push-back. Anything that exists only on this device — an
      // expense added while sync was broken, changes made offline — gets
      // uploaded without anyone having to know a Push button exists. Deferred
      // one render so the payload carries the merged state, not the pre-pull
      // closure.
      setAutoPushQueued(q => q + 1);
      setFirstPull('done');
    } catch (err: any) {
      if (isNetworkError(err)) {
        setSyncStatus('offline');
        // Offline still shows the cache, but only once something has been
        // pulled at least once in this install — otherwise there is nothing
        // trustworthy to show.
        setFirstPull(prev => (prev === 'done' ? 'done' : 'failed'));
        toast('Offline — showing last synced data');
      } else {
        console.error("Cloud pull error:", err);
        setSyncStatus('error');
        setFirstPull(prev => (prev === 'done' ? 'done' : 'failed'));
        // Say it out loud. A silent failed pull is indistinguishable from
        // "you have no data", which on a fresh phone install reads as loss.
        toast(`Sync failed: ${err?.message ?? 'unknown error'}`);
      }
    } finally {
      pullInProgressRef.current = false;
    }
  }, [activeUserKey, toast, setExpenses, setPortfolio, setStocks, setIncome, setInvestment, setGoal, setFire, setNetWorthData, setHistory, setEmergencyFund, setLoans]);

  const triggerSync = useCallback(async (overrides?: any) => {
    if (!activeUserKey || syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      const payload = {
        expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans,
        deletedExpenseIds,
        ...overrides
      };
      await pushToCloud(activeUserKey, payload);
      // Only drop the tombstone log once the server has accepted it, so a failed
      // or offline sync retries the deletion rather than losing it.
      const pushedDeletions: string[] = payload.deletedExpenseIds || [];
      if (pushedDeletions.length > 0) {
        setDeletedExpenseIds(prev => prev.filter(id => !pushedDeletions.includes(id)));
      }
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
  }, [activeUserKey, expenses, portfolio, stocks, income, investment, goal, fire, netWorthData, emergencyFund, loans, deletedExpenseIds, setDeletedExpenseIds]);

  // Returns the resulting log synchronously so the caller can pass it straight
  // into onSync without waiting for the state update to land.
  const recordExpenseDeletion = useCallback((id: string): string[] => {
    const next = deletedExpenseIds.includes(id) ? deletedExpenseIds : [...deletedExpenseIds, id];
    setDeletedExpenseIds(next);
    return next;
  }, [deletedExpenseIds, setDeletedExpenseIds]);

  // The other half of recordExpenseDeletion, for undo. Dropping the id is what
  // lets the next push upsert the row again — pushToCloud skips anything still
  // in this log, and the delete it is reversing was soft.
  const restoreExpenseDeletion = useCallback((id: string): string[] => {
    const next = deletedExpenseIds.filter(x => x !== id);
    setDeletedExpenseIds(next);
    return next;
  }, [deletedExpenseIds, setDeletedExpenseIds]);

  const navigate = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setMoreOpen(false);
  }, []);

  /**
   * Statement Review is its own destination now, so the import lands here
   * rather than inside Expenses. Appends optimistically — same pattern as
   * Expenses' own handleAdd — so the row appears without waiting for a pull.
   */
  const handleStatementImport = useCallback((imported: Expense) => {
    setExpenses(prev => {
      const next = [...prev, imported].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      if (activeUserKey) void triggerSync({ expenses: next });
      return next;
    });
    toast(`Imported ${imported.name}`);
  }, [setExpenses, triggerSync, activeUserKey, toast]);

  useEffect(() => {
    if (activeUserKey) performCloudPull();
  }, [activeUserKey, performCloudPull]);

  // The push half of automatic sync. Runs after the render that follows a
  // successful pull, so triggerSync's closure holds the merged state.
  useEffect(() => {
    if (!autoPushQueued || !activeUserKey) return;
    setAutoPushQueued(0);
    void triggerSync();
  }, [autoPushQueued, activeUserKey, triggerSync]);

  // Pull whenever the app returns to the foreground — a phone app is
  // backgrounded for days, and the Telegram bot writes the whole time.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void performCloudPull();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [performCloudPull]);

  /**
   * Tapping a captured-transaction notification opens `cashflow://review?key=…`.
   *
   * This has to live at app level, not inside the Expenses tab. It was in
   * AdvanziaInbox originally, and on-device testing showed the consequence: the
   * app opens on the Savings tab, so the inbox was not mounted, no listener was
   * registered, and Capacitor logged "No listeners found for event appUrlOpen"
   * — the notification tap did nothing at all unless you happened to already be
   * looking at Expenses.
   *
   * `getLaunchUrl` covers the cold-start case, where the event has already
   * fired by the time React mounts.
   */
  const [captureFocusKey, setCaptureFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;

    const focus = (url: string | undefined) => {
      const key = url ? captureKeyFromUrl(url) : null;
      if (!key) return;
      setCaptureFocusKey(key);
      navigate('expenses');
    };

    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appUrlOpen', ({ url }) => focus(url));
      remove = () => void handle.remove();
      focus((await App.getLaunchUrl())?.url);
    });

    return () => remove?.();
  }, [navigate]);

  // Android/browser back: close the More sheet, then fall back to the Savings
  // Hub, then let the platform have the event (which exits the app).
  //
  // Exactly one guard entry exists at a time. Consuming it re-arms the guard on
  // the next render if there is still somewhere to go back to, so history never
  // accumulates an entry per tab change.
  const backGuardRef = useRef(false);
  const moreOpenRef = useRef(moreOpen);
  const activeTabRef = useRef(activeTab);
  moreOpenRef.current = moreOpen;
  activeTabRef.current = activeTab;

  useEffect(() => {
    if ((moreOpen || activeTab !== 'savings') && !backGuardRef.current) {
      backGuardRef.current = true;
      window.history.pushState({ cashflow: 'guard' }, '');
    }
  }, [moreOpen, activeTab]);

  // Android hardware back. Same precedence as the History fallback below:
  // close the sheet, then fall back to Savings, then let the platform exit.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void startNativeShell({
      onBackButton: () => {
        if (moreOpenRef.current) { setMoreOpen(false); return true; }
        if (activeTabRef.current !== 'savings') { setActiveTab('savings'); return true; }
        return false;
      },
    }).then(fn => { stop = fn; });
    return () => stop?.();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      backGuardRef.current = false;
      if (moreOpenRef.current) setMoreOpen(false);
      else if (activeTabRef.current !== 'savings') setActiveTab('savings');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleLogout = async () => {
    await signOut();
    setSessionUserId(null);
    setIsGuest(false);
    window.localStorage.clear();
    window.location.reload();
  };

  useEffect(() => {
    // Native Google Sign-In needs the plugin initialised before the first tap.
    // A no-op on the web.
    void initAuth().catch(err => console.error('[Cashflow] auth init failed:', err));
  }, []);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSessionUserId(session.user.id);
        setUserMetadata(session.user.user_metadata);
        setIsGuest(false);
      }
      // Gates the first render: without it the app flashes the login screen
      // for a moment on every cold start while the stored session is restored,
      // which on a phone reads as being signed out.
      setAuthChecked(true);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionUserId(session.user.id);
        setUserMetadata(session.user.user_metadata);
        setIsGuest(false);
        window.localStorage.removeItem('isGuest');
      } else if (_event === 'SIGNED_OUT') {
        setSessionUserId(null);
        setUserMetadata(null);
      }
      setAuthChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleEnterAsGuest = () => {
    setIsGuest(true);
    window.localStorage.setItem('isGuest', 'true');
  };

  if (!authChecked) {
    // Matches the native splash colour so the handover is invisible.
    return <div className="app-shell md:min-h-screen bg-background" aria-busy="true" />;
  }

  if (!sessionUserId && !isGuest) {
    return <Login onGuestEnter={handleEnterAsGuest} />;
  }

  // Signed in but the cloud has not answered yet. Showing the cache here would
  // present stale or empty figures as if they were real.
  if (sessionUserId && firstPull !== 'done') {
    return (
      <div className="app-shell md:min-h-screen bg-background text-on-surface font-body flex flex-col items-center justify-center gap-4 p-6 text-center">
        {firstPull === 'pending' ? (
          <>
            <span
              className="material-symbols-outlined animate-spin text-primary"
              aria-hidden="true"
              style={{ fontSize: 32 }}
            >
              sync
            </span>
            <p className="text-body text-secondary" role="status">Loading your data…</p>
          </>
        ) : (
          <>
            <span
              className="material-symbols-outlined text-negative"
              aria-hidden="true"
              style={{ fontSize: 32 }}
            >
              cloud_off
            </span>
            <p className="text-body-lg font-bold">Could not reach the cloud</p>
            <p className="text-body text-secondary max-w-[32ch]">
              Your data lives in the cloud, so it is not shown until it can be loaded.
              Nothing has been lost.
            </p>
            <button
              onClick={() => { setFirstPull('pending'); void performCloudPull(); }}
              className="mt-2 h-12 px-6 rounded-xl bg-gradient-to-br from-primary to-primary-container
                text-background text-body-lg font-bold active:scale-[.98]"
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  }

  const renderContent = () => {
    const syncCallback = activeUserKey ? triggerSync : undefined;
    switch (activeTab) {
      case 'expenses': return <Expenses expenses={expenses} setExpenses={setExpenses} income={income} setIncome={setIncome} onSync={syncCallback} onExpenseDeleted={recordExpenseDeletion} onExpenseRestored={restoreExpenseDeletion} captureFocusKey={captureFocusKey} onCaptureFocusHandled={() => setCaptureFocusKey(null)} />;
      case 'savings': return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} expenses={expenses} emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund} onNavigate={navigate} />;
      case 'investment': return <InvestmentCalculator investment={investment} setInvestment={setInvestment} onSync={syncCallback} />;
      case 'goal': return <SavingsGoal goal={goal} setGoal={setGoal} breakdown={breakdown} monthlySavings={netWorthData.monthlyRecurringSavings || 0} onNavigate={navigate} onSync={syncCallback} />;
      case 'networth': return <NetWorth netWorthData={netWorthData} setNetWorthData={setNetWorthData} stocks={stocks} portfolio={portfolio} userKey={activeUserKey || undefined} history={history} setHistory={setHistory} onSync={syncCallback} loans={loans} />;
      case 'debts': return <Debts loans={loans} setLoans={setLoans} netWorthData={netWorthData} expenses={expenses} emergencyFund={emergencyFund} onSync={syncCallback} />;
      case 'fire': return <FIRECalculator state={fire} setState={setFire} onSync={syncCallback} />;
      case 'portfolio': return <Portfolio assets={portfolio} setAssets={setPortfolio} onSync={syncCallback} />;
      case 'stocks': return <Stocks stocks={stocks} setStocks={setStocks} onSync={syncCallback} />;
      case 'stmt': return <StatementReview onImported={handleStatementImport} />;
      case 'data': return <DataManagement expenses={expenses} portfolio={portfolio} stocks={stocks} income={income} investment={investment} goal={goal} fire={fire} netWorthData={netWorthData} emergencyFund={emergencyFund} loans={loans} userId={sessionUserId} accountEmail={userMetadata?.email} lastSyncedAt={lastSyncedAt} setExpenses={setExpenses} setPortfolio={setPortfolio} setStocks={setStocks} setIncome={setIncome} setInvestment={setInvestment} setGoal={setGoal} setFire={setFire} setNetWorthData={setNetWorthData} setEmergencyFund={setEmergencyFund} setLoans={setLoans} onLogout={handleLogout} onRetryPull={performCloudPull} />;
      default: return <SavingsDashboard portfolio={portfolio} stocks={stocks} netWorthData={netWorthData} setNetWorthData={setNetWorthData} onSync={syncCallback || (async () => { })} expenses={expenses} emergencyFund={emergencyFund} setEmergencyFund={setEmergencyFund} onNavigate={navigate} />;
    }
  };

  const syncing = syncStatus === 'syncing';
  const syncButton = (
    <button
      onClick={() => triggerSync()}
      aria-label="Sync now"
      title={syncStatus === 'offline' ? 'Offline — changes are saved locally' : 'Sync now'}
      className="w-11 h-11 flex items-center justify-center rounded-full text-primary hover:bg-surface-container-high transition-colors"
    >
      <span
        className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''} ${
          syncStatus === 'offline' ? 'text-outline' : ''
        }`}
        style={{ fontSize: 22 }}
      >
        {syncStatus === 'offline' ? 'cloud_off' : 'sync'}
      </span>
    </button>
  );

  const avatar = userMetadata?.avatar_url ? (
    <img src={userMetadata.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-secondary text-label font-bold">
      {isGuest ? 'G' : 'U'}
    </div>
  );

  return (
    // `relative` scopes the More sheet, toast and ambient glows to the app
    // surface. On mobile `.app-shell` makes this a fixed-height flex viewport
    // so the header and bottom bar are layout siblings of a scrolling main —
    // the arrangement that survives a mobile URL bar and reserves safe areas.
    <div className="app-shell relative flex flex-col bg-background text-on-surface font-body md:min-h-screen">
      {/* Ambient glows. First in the DOM and unpositioned in z, so everything
          after them stacks on top without needing a negative index that would
          hide them behind the shell's own background. The clipping wrapper is
          required: the glows deliberately sit outside the viewport, and on
          desktop — where the shell does not clip — they would otherwise add
          horizontal scroll to the whole page. */}
      {/* Radial gradients rather than `blur-[120px]` on a solid circle. The
          filter version looked identical but forced the compositor to raster a
          120px-radius blur on every paint — one of the most expensive things
          that can go on a phone GPU, for something purely decorative. */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 45% at 90% 0%, rgba(193,193,255,0.07), transparent 70%),' +
            'radial-gradient(45% 35% at 5% 100%, rgba(238,192,96,0.06), transparent 70%)',
        }}
      />

      {/* Desktop top nav — sticky rather than fixed, since the shell is normal flow at md+ */}
      <header className="hidden md:flex sticky top-0 z-30 justify-between items-center px-8 h-14 flex-none bg-surface-container-low border-b border-outline-variant/15">
        <div className="flex items-center gap-8 min-w-0">
          <span className="text-stat font-bold text-on-surface tracking-widest uppercase">Cashflow</span>
          {/* Distinct from the bottom bar's "Primary": both are in the DOM at
              once and only CSS hides one, so sharing a label would leave two
              identically-named landmarks. */}
          <nav aria-label="All sections" className="flex gap-6 items-center overflow-x-auto no-scrollbar">
            {ALL_DESTINATIONS.map(d => (
              <button
                key={d.id}
                onClick={() => navigate(d.id)}
                aria-current={activeTab === d.id ? 'page' : undefined}
                className={`whitespace-nowrap text-body transition-colors ${
                  activeTab === d.id
                    ? 'text-primary border-b-2 border-primary pb-1 font-semibold'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                {d.title}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 flex-none">
          {syncButton}
          {avatar}
          <button
            onClick={handleLogout}
            className="text-secondary hover:text-on-surface text-caption transition-colors"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden flex-none app-header-safe box-border flex justify-between items-center px-4 bg-surface-container-low border-b border-outline-variant/15 z-20">
        <span className="text-title font-extrabold text-on-surface tracking-[.18em] uppercase">
          Cashflow
        </span>
        <div className="flex items-center gap-2">
          {syncButton}
          {avatar}
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto app-scroll p-4 pb-6 md:p-8">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-3">{renderContent()}</div>
      </main>

      <BottomNav
        activeTab={activeTab}
        onNavigate={navigate}
        onOpenMore={() => setMoreOpen(true)}
        moreOpen={moreOpen}
      />

      <MoreSheet
        open={moreOpen}
        activeTab={activeTab}
        onNavigate={navigate}
        onClose={() => setMoreOpen(false)}
      />

      <Toast message={toastMessage} />
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppMain />
  </ErrorBoundary>
);

export default App;
