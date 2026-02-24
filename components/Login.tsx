import React, { useState } from 'react';
import { LayoutDashboard, ShieldCheck, Sparkles, TrendingUp, PiggyBank, CloudOff, Key, Copy, Check, Info, LogIn } from 'lucide-react';
import { signInWithGoogle } from '../services/supabaseService';

interface LoginProps {
  onGuestEnter: () => void;
  onSyncIdEnter: (id: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onGuestEnter, onSyncIdEnter }) => {
  const [inputSyncId, setInputSyncId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generateNewId = () => {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let newId = "ID-";
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) newId += "-";
      newId += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setInputSyncId(newId);
    setError('');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inputSyncId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    if (inputSyncId.length < 5) {
      setError('Please enter a valid Sync ID');
      return;
    }
    onSyncIdEnter(inputSyncId);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col md:flex-row items-stretch overflow-hidden">
      {/* Brand Side */}
      <div className="hidden md:flex flex-1 border-r border-zinc-200 dark:border-zinc-900 relative p-12 flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-12 h-12 border border-black dark:border-white flex items-center justify-center text-black dark:text-white">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white tracking-widest uppercase">FinanceFlow</h1>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Master Your Wealth</p>
            </div>
          </div>

          <div className="space-y-12 max-w-md">
            <div className="space-y-6">
              <h2 className="text-5xl font-bold text-black dark:text-white leading-tight tracking-tighter">Private, Secure Financial Planning.</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm font-bold uppercase tracking-widest leading-loose">No email required. Sync your data across devices using a unique secure ID.</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient">
                <Sparkles className="text-black dark:text-white mb-4" size={20} />
                <h4 className="text-black dark:text-white font-bold mb-2 text-[10px] uppercase tracking-widest">AI Advisor</h4>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Personalized tips for your money.</p>
              </div>
              <div className="p-6 border border-zinc-200 dark:border-zinc-900 bg-metric-gradient">
                <ShieldCheck className="text-black dark:text-white mb-4" size={20} />
                <h4 className="text-black dark:text-white font-bold mb-2 text-[10px] uppercase tracking-widest">Anonymous</h4>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">We don't collect your personal data.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 text-zinc-600 text-[9px] font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} FinanceFlow. Privacy First.
        </div>
      </div>

      {/* Login Section */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 bg-white dark:bg-black">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-4 mb-16 justify-center">
            <div className="w-10 h-10 border border-black dark:border-white flex items-center justify-center text-black dark:text-white">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-black dark:text-white tracking-widest uppercase">FinanceFlow</h1>
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Master Your Wealth</p>
            </div>
          </div>

          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-black dark:text-white uppercase tracking-widest mb-4">Access Dashboard</h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">Use your Unique Sync ID to restore your data.</p>
          </div>

          <div className="space-y-8">
            <button
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-4 py-4 bg-transparent border border-zinc-300 dark:border-zinc-800 text-black dark:text-white font-bold text-[10px] uppercase tracking-widest hover:border-black dark:border-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="var(--chart-line)" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="var(--chart-line)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="var(--chart-line)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" />
                <path fill="var(--chart-line)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-900"></div></div>
              <div className="relative flex justify-center"><span className="bg-white dark:bg-black px-4 text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Or use Sync ID</span></div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Unique Sync ID</label>
              <div className="relative border-b border-zinc-300 dark:border-zinc-800 focus-within:border-black dark:border-white transition-colors">
                <Key className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                <input
                  type="text"
                  value={inputSyncId}
                  onChange={(e) => {
                    setInputSyncId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="ID-XXXX-XXXX..."
                  className="w-full pl-8 pr-0 py-3 bg-transparent text-black dark:text-white outline-none font-bold tracking-widest text-sm placeholder:text-zinc-800"
                />
              </div>
              {error && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{error}</p>}
            </div>

            <div className="flex gap-4 pt-2">
              <button
                onClick={generateNewId}
                className="flex-1 py-3 bg-transparent text-black dark:text-white border border-zinc-300 dark:border-zinc-800 font-bold text-[10px] uppercase tracking-widest hover:border-black dark:border-white transition-colors"
              >
                New ID
              </button>
              {inputSyncId && (
                <button
                  onClick={handleCopy}
                  className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 text-[10px]"
                  title="Copy ID"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!inputSyncId}
              className="w-full py-4 mt-8 bg-black dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:bg-zinc-100 dark:bg-zinc-900 disabled:text-zinc-600"
            >
              Access Dashboard
            </button>

            <div className="relative py-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-900"></div></div>
              <div className="relative flex justify-center"><span className="bg-white dark:bg-black px-4 text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Or</span></div>
            </div>

            <button
              onClick={onGuestEnter}
              className="w-full flex items-center justify-center gap-3 py-4 bg-transparent text-zinc-500 border border-zinc-200 dark:border-zinc-900 font-bold text-[10px] uppercase tracking-widest hover:text-black dark:hover:text-black dark:text-white hover:border-zinc-700 transition-colors"
            >
              <CloudOff size={14} />
              Continue as Guest (Local)
            </button>

            <div className="p-4 border border-zinc-200 dark:border-zinc-900 flex gap-4 mt-8">
              <Info className="text-zinc-500 shrink-0" size={16} />
              <p className="text-[9px] text-zinc-600 dark:text-zinc-400 uppercase tracking-widest leading-relaxed">
                <strong className="text-black dark:text-white">Tip:</strong> If you generate a new ID, save it somewhere safe. You will need it to access your data on other devices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};