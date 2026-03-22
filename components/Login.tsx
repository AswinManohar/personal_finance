import React, { useState } from 'react';
import { Key, Copy, Check } from 'lucide-react';
import { signInWithGoogle } from '../services/supabaseService';

interface LoginProps {
  onGuestEnter: () => void;
  onSyncIdEnter: (id: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onGuestEnter, onSyncIdEnter }) => {
  const [inputSyncId, setInputSyncId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showSyncInput, setShowSyncInput] = useState(false);

  const generateNewId = () => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let newId = 'ID-';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) newId += '-';
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
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="w-[600px] h-[600px] rounded-full bg-[#c1c1ff]/5 blur-[120px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Branding */}
        <div className="mb-10">
          <p className="text-2xl font-bold text-[#e3e2e7] tracking-widest uppercase">CASHFLOW</p>
          <h1 className="text-3xl font-bold text-[#e3e2e7] mt-2">Your money, clearly.</h1>
          <p className="text-sm text-secondary mt-2 mb-0">
            Private, secure finance tracking — no email required.
          </p>
        </div>

        <div className="space-y-3">
          {/* Google Sign In */}
          <button
            onClick={() => signInWithGoogle()}
            className="w-full border border-outline-variant/20 bg-transparent text-on-surface hover:bg-surface-container-low rounded-lg py-3 px-4 flex items-center gap-3 transition-all font-medium text-sm"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Sync ID Section */}
          {!showSyncInput ? (
            <button
              onClick={() => setShowSyncInput(true)}
              className="w-full border border-outline-variant/20 bg-transparent text-on-surface hover:bg-surface-container-low rounded-lg py-3 px-4 flex items-center gap-3 transition-all font-medium text-sm"
            >
              <Key size={18} className="text-secondary shrink-0" />
              Continue with Sync ID
            </button>
          ) : (
            <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4 space-y-3">
              <label className="text-xs font-bold tracking-widest uppercase text-secondary block">
                Unique Sync ID
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
                <input
                  type="text"
                  value={inputSyncId}
                  onChange={(e) => {
                    setInputSyncId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="ID-XXXX-XXXX-XXXX-XXXX"
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant/20 focus:border-primary rounded-lg text-on-surface outline-none transition-all font-mono text-sm tracking-wider"
                />
              </div>
              {error && <p className="text-xs text-[#F26B6B] font-bold">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={generateNewId}
                  className="flex-1 bg-surface-container-high px-3 py-2 rounded-lg text-xs font-bold text-on-surface hover:bg-surface-bright transition-all"
                >
                  Generate New ID
                </button>
                {inputSyncId && (
                  <button
                    onClick={handleCopy}
                    className="bg-surface-container-high px-3 py-2 rounded-lg hover:bg-surface-bright transition-all"
                    title="Copy ID"
                  >
                    {copied ? <Check size={16} className="text-[#3DD68C]" /> : <Copy size={16} className="text-secondary" />}
                  </button>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!inputSyncId}
                className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold rounded-lg py-3 text-sm hover:opacity-90 transition-all disabled:opacity-40"
              >
                Access Dashboard
              </button>

              <p className="text-[11px] text-secondary leading-relaxed">
                Save your Sync ID to restore data on other devices — no account needed.
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-outline-variant/20" />
            <span className="text-xs font-bold tracking-widest uppercase text-secondary">or</span>
            <div className="flex-1 h-px bg-outline-variant/20" />
          </div>

          {/* Guest */}
          <button
            onClick={onGuestEnter}
            className="w-full text-secondary text-sm hover:text-on-surface transition-colors text-center cursor-pointer underline-offset-2 hover:underline py-1"
          >
            Continue as Guest (local only)
          </button>
        </div>
      </div>
    </div>
  );
};
