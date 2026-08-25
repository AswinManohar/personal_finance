import React from 'react';

/**
 * Inputs, buttons and chips from the mobile prototype
 * (docs/superpowers/specs/2026-07-31-mobile-design-reference.html).
 *
 * Every control is at least 44px tall. That is the prototype's own floor and
 * also the minimum comfortable tap target, which several screens currently miss.
 */

/** Shared input chrome: sunken field, hairline border, accent on focus. */
const INPUT_BASE =
  'w-full bg-surface-container-lowest border border-outline-variant/35 rounded-field ' +
  'text-on-surface tabular-nums outline-none box-border transition-colors ' +
  'focus:border-primary placeholder:text-outline placeholder:font-normal';

export type InputSize = 'default' | 'hero';

/**
 * `hero` is the 64px amount field at the top of Log Expense — the one place the
 * prototype makes an input the largest thing on the card.
 */
const INPUT_SIZE: Record<InputSize, string> = {
  default: 'h-11 text-body font-semibold',
  hero: 'h-16 text-num-sm font-bold',
};

type NativeInput = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Text or number input, optionally with a currency prefix.
 *
 * With a prefix the border moves to a flex wrapper and the input goes
 * transparent, so the symbol and the value share one baseline. An earlier
 * version absolutely-positioned the symbol over a padded input; the two sat on
 * different baselines and the padding had to be recomputed per prefix length.
 */
export const Input: React.FC<
  NativeInput & { prefix?: string; inputSize?: InputSize }
> = ({ prefix, inputSize = 'default', className = '', style, ...rest }) => {
  if (!prefix) {
    return (
      <input
        {...rest}
        style={style}
        className={`${INPUT_BASE} ${INPUT_SIZE[inputSize]} px-3.5 ${className}`}
      />
    );
  }
  return (
    <div
      className={`${INPUT_BASE} ${INPUT_SIZE[inputSize]} px-3.5 flex items-center gap-1.5
        focus-within:border-primary ${className}`}
    >
      <span
        className={`flex-none font-bold ${
          inputSize === 'hero' ? 'text-stat text-primary' : 'text-body text-secondary'
        }`}
      >
        {prefix}
      </span>
      {/* `font: inherit` is load-bearing: a bare <input> takes the UA's
          control font instead of inheriting, which is what put the symbol and
          the value on different baselines. */}
      <input
        {...rest}
        style={{ font: 'inherit', ...style }}
        className="flex-1 min-w-0 w-full bg-transparent border-0 outline-none p-0
          text-inherit tabular-nums placeholder:text-outline placeholder:font-normal"
      />
    </div>
  );
};

/** Native select wearing the same chrome. `appearance-none` per the prototype. */
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = '',
  children,
  ...rest
}) => (
  <select
    {...rest}
    className={`${INPUT_BASE} h-11 px-3.5 text-body appearance-none cursor-pointer ${className}`}
  >
    {children}
  </select>
);

/** Label above a control. Pass `htmlFor`/`id` to keep the pair accessible. */
export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, children, className = '' }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label htmlFor={htmlFor} className="text-micro font-bold tracking-[.08em] uppercase text-outline ml-1">
      {label}
    </label>
    {children}
  </div>
);

/** The gradient call-to-action. One per card, at most. */
export const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'lg' | 'md' }
> = ({ size = 'lg', className = '', children, disabled, ...rest }) => (
  <button
    {...rest}
    disabled={disabled}
    className={`${size === 'lg' ? 'h-12 rounded-xl text-body-lg w-full' : 'h-11 px-5 rounded-field text-body'}
      inline-flex items-center justify-center gap-1.5 font-bold border-0 transition-transform
      ${
        disabled
          ? 'bg-surface-container-high text-outline cursor-default'
          : 'bg-gradient-to-br from-primary to-primary-container text-background cursor-pointer active:scale-[.98]'
      } ${className}`}
  >
    {children}
  </button>
);

/** Quiet elevated button — Push/Pull, Export/Import, Snapshot secondaries. */
export const GhostButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'md' | 'sm' }
> = ({ size = 'md', className = '', children, ...rest }) => (
  <button
    {...rest}
    className={`${size === 'sm' ? 'h-10 px-3 text-caption' : 'h-11 px-4 text-body'}
      inline-flex items-center justify-center gap-1.5 rounded-field border-0 font-semibold
      bg-surface-container-high text-on-surface hover:bg-surface-bright transition-colors cursor-pointer ${className}`}
  >
    {children}
  </button>
);

/** Destructive text button — "Exit Session", "Clear local cache". */
export const DangerButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  children,
  ...rest
}) => (
  <button
    {...rest}
    className={`inline-flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-field border-0 bg-transparent
      text-negative text-body font-bold cursor-pointer hover:bg-[rgba(242,107,107,0.1)] transition-colors ${className}`}
  >
    {children}
  </button>
);

/** Segmented control: sunken group, one chip lit. */
export const ChipGroup = <T,>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
}) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={`flex gap-1 bg-surface-container-lowest p-1 rounded-lg ${className}`}
  >
    {options.map(o => {
      const on = o.value === value;
      return (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(o.value)}
          className={`h-8 px-3 rounded-lg border-0 text-label font-bold tabular-nums cursor-pointer transition-colors ${
            on ? 'bg-surface-container-highest text-primary' : 'bg-transparent text-secondary'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/**
 * Standalone on/off toggle — the Recurring and Essential switches on Log
 * Expense, and the Redact switch on Statement Review.
 *
 * Tint and border are derived from one accent so a new toggle only has to name
 * its colour, matching the prototype's `toggleStyle(on, col)` helper.
 */
export const ToggleButton: React.FC<{
  on: boolean;
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
  /** Accent when on. Defaults to the primary lilac. */
  accent?: 'primary' | 'positive';
  size?: 'md' | 'sm';
  className?: string;
}> = ({ on, onClick, icon, children, accent = 'primary', size = 'md', className = '' }) => {
  const lit =
    accent === 'positive'
      ? 'border-[#3DD68C66] bg-[rgba(61,214,140,0.1)] text-positive'
      : 'border-[#c1c1ff66] bg-[rgba(193,193,255,0.1)] text-primary';
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${size === 'sm' ? 'h-8 px-3 text-label' : 'h-11 text-caption'}
        inline-flex items-center justify-center gap-1.5 rounded-field border font-bold cursor-pointer transition-colors
        ${on ? lit : 'border-outline-variant/35 bg-surface-container-lowest text-secondary'} ${className}`}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: size === 'sm' ? 16 : 18 }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
};

/**
 * 28px chevron a card uses to collapse its own body. Rotates 0° -> -90° rather
 * than swapping icons, so the transition is a transform, not a re-render;
 * `inline-block` is load-bearing — a rotate transform on an inline element is
 * silently ignored.
 *
 * `expand_more` is a ligature, so it only renders as a glyph while that name is
 * in scripts/fetch-icon-font.sh. Absent from the subset it renders as the
 * literal word, clipped by this button's 28px to something like "epand".
 */
export const CollapseToggle: React.FC<{
  collapsed: boolean;
  onClick: () => void;
  label: string;
}> = ({ collapsed, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={!collapsed}
    aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
    className="w-7 h-7 flex items-center justify-center rounded-lg text-secondary hover:bg-primary/[0.14] hover:text-primary transition-colors flex-none"
  >
    <span
      className="material-symbols-outlined inline-block transition-transform duration-200"
      style={{ fontSize: 20, lineHeight: 1, transform: `rotate(${collapsed ? -90 : 0}deg)` }}
      aria-hidden="true"
    >
      expand_more
    </span>
  </button>
);
