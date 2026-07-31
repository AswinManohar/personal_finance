import React from 'react';

/**
 * Layout and text primitives from the mobile prototype
 * (docs/superpowers/specs/2026-07-31-mobile-design-reference.html).
 *
 * The prototype repeats about fifteen shapes across nine screens. Each one is
 * captured here exactly once so a screen never re-decides what a card, a label
 * or a list row looks like.
 */

/** Semantic accents. `neutral` is the plain elevated surface. */
export type Tone = 'primary' | 'positive' | 'negative' | 'tertiary' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  positive: 'text-positive',
  negative: 'text-negative',
  tertiary: 'text-tertiary',
  neutral: 'text-secondary',
};

/**
 * Tinted backgrounds are literal rgba rather than Tailwind's `/10` opacity
 * modifier: the prototype tints toward the page, and a translucent fill would
 * pick up whatever sits behind it instead.
 */
const TONE_TINT: Record<Tone, string> = {
  primary: 'bg-[rgba(193,193,255,0.1)]',
  positive: 'bg-[rgba(61,214,140,0.1)]',
  negative: 'bg-[rgba(242,107,107,0.1)]',
  tertiary: 'bg-[rgba(238,192,96,0.1)]',
  neutral: 'bg-surface-container-high',
};

/** Hairline used between list rows and card sections throughout the design. */
export const HAIRLINE = 'border-outline-variant/12';

/** The one card recipe: #1a1b20, 16px radius, 20px padding. */
export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Left accent stripe — the prototype uses this on the Income card only. */
  accent?: boolean;
  /** Removes padding so the card can host full-bleed rows (Data screen). */
  flush?: boolean;
}> = ({ children, className = '', accent = false, flush = false }) => (
  <div
    className={`bg-surface-container-low rounded-card ${flush ? 'overflow-hidden' : 'p-5'} ${
      accent ? 'border-l-4 border-primary' : ''
    } ${className}`}
  >
    {children}
  </div>
);

/** Card heading: 11px bold, wide uppercase tracking, #c7c4d7. */
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <h2 className={`text-label font-bold tracking-[.08em] uppercase text-on-surface-variant ${className}`}>
    {children}
  </h2>
);

/** Field/stat eyebrow: same shape as SectionLabel but muted to #908fa0. */
export const FieldLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span className={`block text-label font-bold tracking-[.08em] uppercase text-outline ${className}`}>
    {children}
  </span>
);

/**
 * Written out rather than interpolated: Tailwind only ever sees class names it
 * can find as complete strings, so `text-${size}` would silently produce no CSS
 * once this project moves off the runtime CDN.
 */
const FIGURE_SIZE = {
  stat: 'text-stat',
  'num-sm': 'text-num-sm',
  num: 'text-num',
  'num-lg': 'text-num-lg',
} as const;

/** Label + figure + optional caption. The workhorse of every summary grid. */
export const StatBlock: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  /** Figure size. `stat` (20px) is the default; heroes use `num-lg`. */
  size?: 'stat' | 'num-sm' | 'num' | 'num-lg';
  align?: 'left' | 'right' | 'center';
  className?: string;
}> = ({ label, value, sub, tone = 'neutral', size = 'stat', align = 'left', className = '' }) => (
  <div
    className={`${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`}
  >
    <FieldLabel>{label}</FieldLabel>
    <p
      className={`mt-1 ${FIGURE_SIZE[size]} font-bold tabular-nums ${
        tone === 'neutral' ? 'text-on-surface' : TONE_TEXT[tone]
      }`}
    >
      {value}
    </p>
    {sub !== undefined && sub !== null && (
      <p className="mt-1 text-label text-secondary tabular-nums">{sub}</p>
    )}
  </div>
);

/** Small uppercase badge — "Essential", "Pay First", "PROJECTED". */
export const Pill: React.FC<{ children: React.ReactNode; tone?: Tone; className?: string }> = ({
  children,
  tone = 'primary',
  className = '',
}) => (
  <span
    className={`inline-flex items-center flex-none px-2 py-0.5 rounded-lg text-micro font-bold uppercase ${TONE_TINT[tone]} ${TONE_TEXT[tone]} ${className}`}
  >
    {children}
  </span>
);

/** Rounded square holding a Material Symbol. 40px, or 44px alongside body text. */
export const IconBox: React.FC<{
  icon: string;
  tone?: Tone;
  size?: 40 | 44;
  className?: string;
}> = ({ icon, tone = 'primary', size = 40, className = '' }) => (
  <div
    className={`${size === 44 ? 'w-11 h-11' : 'w-10 h-10'} rounded-field flex items-center justify-center flex-none ${TONE_TINT[tone]} ${TONE_TEXT[tone]} ${className}`}
  >
    {/* The ligature text is the icon's source, not a label — hide it so it
        never leaks into the accessible name of the control wrapping it. */}
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: size === 44 ? 22 : 20 }}
    >
      {icon}
    </span>
  </div>
);

/**
 * Hairline-separated row. `divider={false}` on the last item, matching the
 * prototype, which never draws a rule above a card's bottom padding.
 */
export const ListRow: React.FC<{
  children: React.ReactNode;
  divider?: boolean;
  className?: string;
  onClick?: () => void;
}> = ({ children, divider = true, className = '', onClick }) => {
  const cls = `flex items-center justify-between gap-3 ${
    divider ? `border-b ${HAIRLINE}` : ''
  } ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`w-full text-left ${cls}`}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
};

/** Sunken tile used for list items that need their own surface (Net Worth, Debts). */
export const Tile: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <div
    {...rest}
    className={`bg-[rgba(41,42,46,0.4)] rounded-xl p-3 flex items-center justify-between gap-3 ${className}`}
  >
    {children}
  </div>
);

/** 8px track with a tinted fill. Used for goals, emergency fund and coverage. */
export const ProgressBar: React.FC<{
  /** 0–100; clamped, and NaN-safe so a missing figure renders empty, not full. */
  percent: number;
  tone?: Tone;
  className?: string;
}> = ({ percent, tone = 'primary', className = '' }) => {
  const raw = Number(percent);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  // Solid fills, per the prototype — a gradient here reads as a second accent
  // and competes with the gradient reserved for primary buttons.
  const fill: Record<Tone, string> = {
    primary: 'bg-primary',
    positive: 'bg-positive',
    negative: 'bg-negative',
    tertiary: 'bg-tertiary',
    neutral: 'bg-primary-container',
  };
  return (
    <div className={`h-2 bg-surface-container-highest rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fill[tone]}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
};

/** Page heading used by the screens the prototype gives a title rather than a hero card. */
export const ScreenTitle: React.FC<{
  title: string;
  subtitle?: string;
  eyebrow?: { icon: string; text: string };
}> = ({ title, subtitle, eyebrow }) => (
  <div className="px-1 pt-2 pb-1">
    {eyebrow && (
      <div className="flex items-center gap-2 mb-2 text-label font-bold tracking-[.16em] uppercase text-primary">
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
          {eyebrow.icon}
        </span>
        {eyebrow.text}
      </div>
    )}
    <h1 className="text-num-sm font-extrabold text-on-surface">{title}</h1>
    {subtitle && <p className="mt-1.5 text-body text-secondary">{subtitle}</p>}
  </div>
);

/** Empty-state copy, centred in a card. */
export const EmptyState: React.FC<{ icon?: string; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
    {icon && (
      <span className="material-symbols-outlined text-outline" aria-hidden="true" style={{ fontSize: 28 }}>
        {icon}
      </span>
    )}
    <p className="text-body text-secondary max-w-[26ch]">{children}</p>
  </div>
);
