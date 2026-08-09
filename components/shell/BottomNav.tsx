import React from 'react';
import { ActiveTab } from '../../types';
import { PRIMARY_DESTINATIONS, isMoreDestination } from './navigation';

/**
 * Mobile bottom bar: four destinations plus More.
 *
 * More reads as active whenever the current screen lives behind it, so the bar
 * never shows nothing selected.
 */
export const BottomNav: React.FC<{
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onOpenMore: () => void;
  moreOpen: boolean;
}> = ({ activeTab, onNavigate, onOpenMore, moreOpen }) => {
  const moreActive = moreOpen || isMoreDestination(activeTab);

  const item = (key: string, icon: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="flex-1 min-w-11 flex flex-col items-center justify-center gap-0.5 border-0 bg-transparent cursor-pointer"
    >
      {/* aria-hidden: the ligature text ("receipt_long") is how the icon font
          is addressed, not a label, and would otherwise be read out ahead of
          the real one underneath. */}
      <span
        aria-hidden="true"
        className={`material-symbols-outlined ${active ? 'text-primary' : 'text-secondary/70'}`}
        style={{ fontSize: 22 }}
      >
        {icon}
      </span>
      <span className={`text-nav font-bold ${active ? 'text-primary' : 'text-secondary/70'}`}>
        {label}
      </span>
    </button>
  );

  return (
    <nav
      aria-label="Primary"
      className="md:hidden flex-none app-nav-safe box-border flex items-stretch justify-around px-2 bg-surface-container-low border-t border-outline-variant/10 z-20"
    >
      {PRIMARY_DESTINATIONS.map(d =>
        item(d.id, d.icon, d.label, activeTab === d.id, () => onNavigate(d.id))
      )}
      {item('more', 'apps', 'More', moreActive, onOpenMore)}
    </nav>
  );
};
