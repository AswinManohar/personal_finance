import { Capacitor } from '@capacitor/core';

/**
 * Resolves where `/api/*` actually lives.
 *
 * On the web the SPA and the FastAPI backend share an origin (Railway serves
 * both, and the Vite dev server proxies `/api`), so relative URLs work and are
 * kept — they are what lets the same build run on any deployment.
 *
 * In the Capacitor APK the origin is the bundled `https://localhost`, where no
 * backend exists: a relative `/api/...` fetch resolves to the WebView itself and
 * fails. There the requests must go to the real backend host.
 *
 * `VITE_API_BASE_URL` overrides for dev builds pointed at a laptop; the Railway
 * production host is the default so a plain build just works.
 */
const RAILWAY_API = 'https://web-production-5ebee.up.railway.app';

export const apiUrl = (path: string): string => {
  if (!Capacitor.isNativePlatform()) return path;
  const base = import.meta.env.VITE_API_BASE_URL || RAILWAY_API;
  return base.replace(/\/$/, '') + path;
};
