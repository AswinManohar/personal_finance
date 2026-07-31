import React, { useEffect, useRef } from 'react';
import { ActiveTab } from '../../types';
import { MORE_DESTINATIONS } from './navigation';
import { IconBox } from '../ui';

/**
 * Bottom sheet holding the destinations that do not fit the bottom bar.
 *
 * Scoped to the phone shell (`absolute`, not `fixed`) so it covers the app
 * surface rather than the whole document — the shell is the viewport here.
 */
export const MoreSheet: React.FC<{
  open: boolean;
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onClose: () => void;
}> = ({ open, activeTab, onNavigate, onClose }) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Escape closes, matching the scrim tap and the Android back button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus into the sheet so keyboard and screen-reader users are not left
  // behind on the nav button that opened it.
  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        data-testid="more-sheet-scrim"
        className="md:hidden absolute inset-0 bg-[rgba(13,14,18,0.6)] z-30 animate-scrim-in"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More destinations"
        className="md:hidden absolute left-0 right-0 bottom-0 z-40 bg-surface-container rounded-t-sheet px-4 pt-4 app-sheet-safe shadow-[0_-8px_32px_rgba(0,0,0,0.4)] animate-sheet-in max-h-[80%] overflow-y-auto app-scroll"
      >
        <div className="w-9 h-1 rounded-full bg-outline-variant mx-auto mb-4" aria-hidden="true" />
        {MORE_DESTINATIONS.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => onNavigate(d.id)}
            aria-current={activeTab === d.id ? 'page' : undefined}
            className={`w-full flex items-center gap-4 p-3 rounded-xl border-0 bg-transparent text-left cursor-pointer transition-colors hover:bg-surface-container-high ${
              activeTab === d.id ? 'bg-surface-container-high' : ''
            }`}
          >
            <IconBox icon={d.icon} size={44} tone="primary" className="!bg-surface-container-high" />
            <span className="min-w-0">
              <span className="block text-body-lg font-bold text-on-surface">{d.label}</span>
              <span className="block mt-0.5 text-label text-secondary">{d.description}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
};
