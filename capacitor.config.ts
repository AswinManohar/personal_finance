import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

/**
 * Capacitor packaging for the Android build.
 *
 * `appId` is load-bearing and effectively permanent: the Android OAuth client
 * is registered against this exact string plus the signing certificate's SHA-1,
 * so changing it later means re-registering and re-issuing the client. Settle it
 * before creating the keystore (ticket 03), not after.
 *
 * `webDir: 'dist'` is the same Vite output that FastAPI serves for the desktop
 * web app (api/main.py mounts dist/), so one `npm run build` feeds both. The
 * assets are copied into the APK rather than loaded from Railway, which is what
 * makes the app work offline — and why Tailwind and the fonts had to come off
 * their CDNs first (ticket 01).
 *
 * The Supabase URL and anon key are literals in services/supabaseService.ts, not
 * build-time env vars, so they survive bundling with no extra configuration. The
 * anon key is a public credential; row-level security is what scopes access.
 */
const config: CapacitorConfig = {
  appId: 'com.aswinmanohar.cashflow',
  appName: 'Cashflow',
  webDir: 'dist',
  android: {
    // Debug builds only; a release APK is signed with the keystore from
    // ticket 03. Left explicit so it is obvious this is not yet a shippable
    // configuration.
    buildOptions: {},
  },
  plugins: {
    SplashScreen: {
      // Matches --background (#121317) and the app-shell placeholder React
      // renders while the session is being restored, so there is no flash of a
      // different colour between the native splash and the first paint.
      backgroundColor: '#121317',
      // Hidden explicitly from services/nativeShell.ts once React has mounted;
      // auto-hiding on a timer shows a blank frame if the app is slower.
      launchAutoHide: false,
      androidSpinnerStyle: 'small',
      spinnerColor: '#c1c1ff',
    },
    StatusBar: {
      backgroundColor: '#1a1b20',
      style: 'DARK',
      overlaysWebView: true,
    },
    Keyboard: {
      // Enum, not the bare string — nativeShell.ts also sets this at runtime.
      resize: KeyboardResize.Native,
    },
  },
  server: {
    // No `url` on purpose. Pointing this at the Railway host would turn the app
    // back into a thin browser over the network and defeat offline use; the
    // WebView loads the bundled assets instead.
    androidScheme: 'https',
  },
};

export default config;
