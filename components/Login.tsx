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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row items-stretch overflow-hidden">
      {/* Brand Side */}
      <div className="hidden md:flex flex-1 bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-900 relative p-12 flex-col justify-between overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-white rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-primary-400 rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-xl">
              <LayoutDashboard size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">FinanceFlow</h1>
              <p className="text-[10px] font-bold text-primary-200 uppercase tracking-widest">Master Your Wealth</p>
            </div>
          </div>

          <div className="space-y-12 max-w-md">
            <div className="space-y-4">
              <h2 className="text-5xl font-black text-white leading-tight">Private, Secure Financial Planning.</h2>
              <p className="text-primary-100 text-lg font-medium opacity-80">No email required. Sync your data across devices using a unique secure ID.</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                <Sparkles className="text-primary-300 mb-3" size={24} />
                <h4 className="text-white font-bold mb-1 text-sm">AI Advisor</h4>
                <p className="text-primary-100 text-[10px] opacity-70">Personalized tips for your money.</p>
              </div>
              <div className="p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                <ShieldCheck className="text-emerald-400 mb-3" size={24} />
                <h4 className="text-white font-bold mb-1 text-sm">Anonymous</h4>
                <p className="text-primary-100 text-[10px] opacity-70">We don't collect your personal data.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 text-primary-200 text-sm font-medium">
          © 2024 FinanceFlow. Privacy First.
        </div>
      </div>

      {/* Login Section */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 md:p-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-3 mb-12 justify-center">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <LayoutDashboard size={24} />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">FinanceFlow</h1>
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 mb-3">Access Dashboard</h2>
            <p className="text-slate-500 font-medium">Use your Unique Sync ID to restore your data.</p>
          </div>

          <div className="space-y-6">
            <button
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Or use Sync ID</span></div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Unique Sync ID</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={inputSyncId}
                  onChange={(e) => {
                    setInputSyncId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="ID-XXXX-XXXX..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none font-mono font-bold tracking-wider text-slate-900"
                />
              </div>
              {error && <p className="text-xs text-red-500 font-bold ml-1">{error}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={generateNewId}
                className="flex-1 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all border border-indigo-100"
              >
                Generate New ID
              </button>
              {inputSyncId && (
                <button
                  onClick={handleCopy}
                  className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
                  title="Copy ID"
                >
                  {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!inputSyncId}
              className="w-full py-4 bg-primary-600 text-white rounded-2xl font-black text-sm hover:bg-primary-700 transition-all shadow-xl shadow-primary-200 disabled:opacity-50 disabled:shadow-none"
            >
              Access Dashboard
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Or</span></div>
            </div>

            <button
              onClick={onGuestEnter}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white text-slate-600 border border-slate-200 rounded-2xl font-bold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <CloudOff size={18} />
              Continue as Guest (Local Only)
            </button>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
              <Info className="text-blue-500 shrink-0" size={20} />
              <p className="text-xs text-blue-800 leading-relaxed">
                <strong>Tip:</strong> If you generate a new ID, save it somewhere safe. You will need it to access your data on other devices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};