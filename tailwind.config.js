import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */

// Moved verbatim out of the inline `tailwind.config` in index.html, which ran
// against the CDN build of Tailwind. Capacitor bundles web assets inside the
// APK so the app opens offline; a runtime CDN defeats that, and the app would
// render unstyled with no network.
export default {
  // `hover:` utilities stick after a tap in a WebView: touch leaves the element
  // in :hover until something else is touched, so a tapped button keeps its
  // hover background. This emits every hover: rule inside `@media (hover:
  // hover)`, so they apply on a pointer and never on the phone.
  future: { hoverOnlyWhenSupported: true },
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        tertiary: '#eec060',
        'surface-container-lowest': '#0d0e12',
        'surface-container': '#1f1f24',
        'on-surface': '#e3e2e7',
        background: '#121317',
        'surface-container-low': '#1a1b20',
        'secondary-container': '#4c4844',
        'surface-bright': '#38393d',
        'surface-container-high': '#292a2e',
        surface: '#121317',
        'surface-container-highest': '#343439',
        'on-background': '#e3e2e7',
        outline: '#908fa0',
        'on-surface-variant': '#c7c4d7',
        'on-secondary': '#33302c',
        'outline-variant': '#464554',
        secondary: '#ccc5c0',
        'primary-container': '#8183ff',
        primary: '#c1c1ff',
        'surface-dim': '#121317',
        'surface-variant': '#343439',
        'inverse-surface': '#e3e2e7',
        positive: '#3DD68C',
        negative: '#F26B6B',
        gold: '#D4A84B',
        // Hero numerals sit a touch warmer/brighter than body text.
        hero: '#f0ede8',
      },
      fontFamily: {
        headline: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        label: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Type scale from the mobile prototype. Tracking is baked in so a size
      // and its letter-spacing can never drift apart across screens.
      // Defaults (text-xs/sm/base…) stay available underneath.
      fontSize: {
        nav: ['9px', { lineHeight: '1', letterSpacing: '-0.01em' }],
        micro: ['10px', { lineHeight: '1.2' }],
        label: ['11px', { lineHeight: '1.3' }],
        caption: ['12px', { lineHeight: '1.4' }],
        body: ['13px', { lineHeight: '1.45' }],
        'body-lg': ['14px', { lineHeight: '1.45' }],
        title: ['16px', { lineHeight: '1.3' }],
        stat: ['20px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        ring: ['22px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'num-sm': ['25px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        num: ['31px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'num-lg': ['39px', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem' /*  8 — chips, pills */,
        field: '10px' /* 10 — inputs, small buttons, icon boxes */,
        xl: '0.75rem' /* 12 — list rows, large buttons */,
        card: '16px',
        sheet: '20px',
        full: '9999px',
      },
      keyframes: {
        toastIn: {
          from: { opacity: '0', transform: 'translate(-50%, 8px)' },
          to: { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        sheetIn: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        scrimIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'toast-in': 'toastIn .2s ease',
        'sheet-in': 'sheetIn .22s cubic-bezier(.32, .72, 0, 1)',
        'scrim-in': 'scrimIn .2s ease',
      },
    },
  },
  plugins: [
    // The CDN was loaded with ?plugins=forms, so keeping it preserves the
    // control resets the screens were styled against.
    forms,
  ],
};
