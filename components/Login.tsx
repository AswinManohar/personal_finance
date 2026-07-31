import React, { useState } from 'react';
import { Key, Copy, Check } from 'lucide-react';
import { signInWithGoogle } from '../services/auth';
import { Card, FieldLabel, GhostButton, Input, PrimaryButton } from './ui';

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
    <div className="app-shell md:min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Gradient rather than a blurred circle — see the note in App.tsx. */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(50% 40% at 50% 50%, rgba(193,193,255,0.07), transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="mb-10">
          <p className="text-num-sm font-extrabold tracking-[.18em] uppercase">Cashflow</p>
          <h1 className="mt-2 text-num font-bold">Your money, clearly.</h1>
          <p className="mt-2 text-body text-secondary">
            Private, secure finance tracking — no email required.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => signInWithGoogle()}
            className="w-full h-12 px-4 flex items-center gap-3 rounded-field border border-outline-variant/20
              bg-transparent text-on-surface text-body font-medium hover:bg-surface-container-low transition-colors"
          >
            <svg className="w-5 h-5 flex-none" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          {!showSyncInput ? (
            <button
              onClick={() => setShowSyncInput(true)}
              className="w-full h-12 px-4 flex items-center gap-3 rounded-field border border-outline-variant/20
                bg-transparent text-on-surface text-body font-medium hover:bg-surface-container-low transition-colors"
            >
              <Key size={18} className="text-secondary flex-none" />
              Continue with Sync ID
            </button>
          ) : (
            <Card className="flex flex-col gap-3 border border-outline-variant/20">
              <FieldLabel>Unique Sync ID</FieldLabel>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary z-10" size={16} />
                <Input
                  type="text"
                  aria-label="Unique Sync ID"
                  value={inputSyncId}
                  onChange={e => {
                    setInputSyncId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="ID-XXXX-XXXX-XXXX-XXXX"
                  className="!pl-10 !font-mono tracking-wider"
                />
              </div>
              {error && <p className="text-label font-bold text-negative">{error}</p>}

              <div className="flex gap-2">
                <GhostButton className="flex-1" onClick={generateNewId}>
                  Generate New ID
                </GhostButton>
                {inputSyncId && (
                  <GhostButton onClick={handleCopy} aria-label="Copy Sync ID">
                    {copied ? <Check size={16} className="text-positive" /> : <Copy size={16} />}
                  </GhostButton>
                )}
              </div>

              <PrimaryButton onClick={handleSubmit} disabled={!inputSyncId}>
                Access Dashboard
              </PrimaryButton>

              <p className="text-label text-secondary leading-relaxed">
                Save your Sync ID to restore data on other devices — no account needed.
              </p>
            </Card>
          )}

          <div className="flex items-center gap-3 py-1">
            <span className="flex-1 h-px bg-outline-variant/20" />
            <span className="text-label font-bold tracking-[.08em] uppercase text-secondary">or</span>
            <span className="flex-1 h-px bg-outline-variant/20" />
          </div>

          <button
            onClick={onGuestEnter}
            className="w-full min-h-11 text-body text-secondary hover:text-on-surface hover:underline
              underline-offset-2 transition-colors"
          >
            Continue as Guest (local only)
          </button>
        </div>
      </div>
    </div>
  );
};
