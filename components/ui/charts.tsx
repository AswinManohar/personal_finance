import React, { useId } from 'react';

/**
 * Chart primitives ported from the mobile prototype
 * (docs/superpowers/specs/2026-07-31-mobile-design-reference.html), which hand-rolls
 * SVG rather than pulling in a charting library.
 *
 * Kept hand-rolled here too: these are decorative sparklines and rings with no
 * axes, tooltips or interaction, and at phone size a library's default chrome
 * costs more than it gives.
 */

const GRID_STROKE = '#464554';

/** One legend/row swatch. */
export const Dot: React.FC<{ color: string; className?: string }> = ({ color, className = '' }) => (
  <span
    className={`w-2 h-2 rounded-full flex-none ${className}`}
    style={{ backgroundColor: color }}
    aria-hidden="true"
  />
);

/**
 * Gradient-filled area sparkline.
 *
 * Renders nothing below two points — a single reading has no line to draw, and
 * the interpolation would divide by zero.
 */
export const AreaChart: React.FC<{
  points: number[];
  color?: string;
  /** Second, flatter series drawn behind the first (Calculator's "Invested"). */
  baseline?: number[];
  baselineColor?: string;
  grid?: boolean;
  className?: string;
  label?: string;
}> = ({
  points,
  color = '#c1c1ff',
  baseline,
  baselineColor = '#464554',
  grid = true,
  className = '',
  label,
}) => {
  // useId keeps the gradient unique: two charts on one screen sharing a defs id
  // would both resolve to whichever mounted first.
  const gid = `area-${useId().replace(/:/g, '')}`;
  const w = 340;
  const h = 120;

  const clean = points.filter(p => Number.isFinite(p));
  if (clean.length < 2) {
    return (
      <div className={`flex items-center justify-center text-label text-outline ${className}`}>
        Not enough data yet
      </div>
    );
  }

  const all = baseline ? clean.concat(baseline.filter(p => Number.isFinite(p))) : clean;
  const max = Math.max(...all) * 1.05;
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const path = (series: number[]) =>
    series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const line = path(clean);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`w-full h-full overflow-visible ${className}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grid &&
        [0.25, 0.5, 0.75].map(g => (
          <line
            key={g}
            x1={0}
            x2={w}
            y1={h * g}
            y2={h * g}
            stroke={GRID_STROKE}
            strokeOpacity={0.18}
          />
        ))}
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      {baseline && baseline.length > 1 && (
        <path
          d={path(baseline.filter(p => Number.isFinite(p)))}
          fill="none"
          stroke={baselineColor}
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Ring chart with a centred figure.
 *
 * An all-zero set still draws the track, so an empty account reads as "nothing
 * yet" rather than as a broken chart.
 */
export const Donut: React.FC<{
  segments: DonutSegment[];
  size?: number;
  label: string;
  value: string;
}> = ({ segments, size = 176, label, value }) => {
  const r = size * 0.4;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;
  const stroke = size * 0.062;
  const total = segments.reduce((s, x) => s + (Number.isFinite(x.value) ? Math.max(0, x.value) : 0), 0);

  let offset = 0;
  const arcs = total > 0
    ? segments.map((s, i) => {
        const v = Number.isFinite(s.value) ? Math.max(0, s.value) : 0;
        const dash = (v / total) * circumference;
        if (dash <= 0) return null;
        const el = (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={r}
            fill="transparent"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={circumference - offset}
          />
        );
        offset += dash;
        return el;
      })
    : [];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        role="img"
        aria-label={`${label}: ${value}`}
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="transparent"
          stroke="#343439"
          strokeWidth={stroke}
        />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-micro font-bold tracking-[.12em] uppercase text-secondary">{label}</span>
        <span className="text-ring font-extrabold tabular-nums text-on-surface">{value}</span>
      </div>
    </div>
  );
};

/** Full-width stacked proportion bar — the Savings Hub asset breakdown. */
export const StackedBar: React.FC<{
  segments: DonutSegment[];
  height?: number;
  className?: string;
}> = ({ segments, height = 32, className = '' }) => {
  const total = segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  return (
    <div
      className={`flex overflow-hidden rounded-full bg-surface-container-highest ${className}`}
      style={{ height }}
    >
      {total > 0 &&
        segments.map((s, i) => (
          <div
            key={i}
            style={{
              width: `${(Math.max(0, Number(s.value) || 0) / total) * 100}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
    </div>
  );
};

export interface Column {
  label: string;
  value: number;
  /** Caption above the bar (Weekly Trends shows the amount). */
  caption?: string;
  highlight?: boolean;
}

/**
 * Vertical bars with labels beneath — Weekly Trends and the 12-month
 * accumulation. Heights are relative to the tallest column, with a floor so a
 * small non-zero value stays visible.
 */
export const ColumnChart: React.FC<{
  columns: Column[];
  height?: number;
  color?: string;
  highlightColor?: string;
  className?: string;
}> = ({ columns, height = 120, color = '#292a2e', highlightColor = '#8183ff', className = '' }) => {
  const max = Math.max(...columns.map(c => Math.max(0, Number(c.value) || 0)), 0);
  return (
    <div className={`flex items-end gap-3 ${className}`} style={{ height }}>
      {columns.map((c, i) => {
        const v = Math.max(0, Number(c.value) || 0);
        const pct = max > 0 ? Math.max(v > 0 ? 4 : 0, (v / max) * 100) : 0;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full min-w-0"
          >
            {c.caption && (
              <span className="text-label font-semibold text-secondary tabular-nums truncate max-w-full">
                {c.caption}
              </span>
            )}
            <div
              className="w-full rounded-t"
              style={{
                height: `${pct}%`,
                backgroundColor: c.highlight ? highlightColor : color,
              }}
            />
            <span className="text-micro font-bold text-outline truncate max-w-full">{c.label}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Axis captions under a chart — evenly spaced, muted, uppercase. */
export const AxisLabels: React.FC<{ labels: string[]; className?: string }> = ({
  labels,
  className = '',
}) => (
  <div
    className={`flex justify-between text-micro font-bold tracking-[.08em] uppercase text-outline tabular-nums ${className}`}
  >
    {labels.map((l, i) => (
      <span key={i}>{l}</span>
    ))}
  </div>
);
