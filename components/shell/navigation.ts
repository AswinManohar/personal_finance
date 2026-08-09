import { ActiveTab } from '../../types';

/**
 * The app's destinations, in one place.
 *
 * The mobile design puts five in the bottom bar and the rest behind a "More"
 * sheet. Desktop shows all of them in the top bar. Both read from this file so
 * a new screen can never appear on one and go missing on the other.
 */

export interface Destination {
  id: ActiveTab;
  /** Short form for the bottom bar, which has ~60px per item. */
  label: string;
  /** Full form for the More sheet and the desktop top bar. */
  title: string;
  icon: string;
  description: string;
}

/** Bottom bar, left to right. A sixth slot is "More". */
export const PRIMARY_DESTINATIONS: Destination[] = [
  {
    id: 'savings',
    label: 'Savings',
    title: 'Savings Hub',
    icon: 'savings',
    description: 'Assets, emergency fund and outlook',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    title: 'Expenses',
    icon: 'receipt_long',
    description: 'Log and review spending',
  },
  {
    id: 'networth',
    label: 'Net Worth',
    title: 'Net Worth',
    icon: 'account_balance',
    description: 'Assets against liabilities',
  },
  {
    id: 'debts',
    label: 'Debts',
    title: 'Debts',
    icon: 'credit_card',
    description: 'Payoff order and simulation',
  },
];

/**
 * Behind the More sheet.
 *
 * Portfolio and Stocks are not in the prototype — it hardcodes their totals.
 * They are kept because they are the only way to edit the holdings that feed
 * Total Assets and the Distribution Mix on the Savings Hub.
 */
export const MORE_DESTINATIONS: Destination[] = [
  {
    id: 'fire',
    label: 'FIRE',
    title: 'FIRE',
    icon: 'local_fire_department',
    description: 'Financial independence projection',
  },
  {
    id: 'goal',
    label: 'Goals',
    title: 'Goals',
    icon: 'flag',
    description: 'Savings goal tracking',
  },
  {
    id: 'investment',
    label: 'Calculator',
    title: 'Calculator',
    icon: 'calculate',
    description: 'Compound growth projections',
  },
  {
    id: 'stmt',
    label: 'Statements',
    title: 'Statement Review',
    icon: 'document_scanner',
    description: 'Upload a bank statement for review',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    title: 'Portfolio',
    icon: 'pie_chart',
    description: 'Mutual funds and holdings',
  },
  {
    id: 'stocks',
    label: 'Stocks',
    title: 'Stocks',
    icon: 'trending_up',
    description: 'Individual equity positions',
  },
  {
    id: 'data',
    label: 'Data',
    title: 'Data',
    icon: 'database',
    description: 'Sync, export and account',
  },
];

export const ALL_DESTINATIONS: Destination[] = [...PRIMARY_DESTINATIONS, ...MORE_DESTINATIONS];

const MORE_IDS = new Set<ActiveTab>(MORE_DESTINATIONS.map(d => d.id));

/** True when the current screen lives behind More, so the tab can light up. */
export const isMoreDestination = (tab: ActiveTab): boolean => MORE_IDS.has(tab);

export const destinationTitle = (tab: ActiveTab): string =>
  ALL_DESTINATIONS.find(d => d.id === tab)?.title ?? 'Cashflow';
