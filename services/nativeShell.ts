import { Capacitor } from '@capacitor/core';

/**
 * Android shell behaviours that have no web equivalent.
 *
 * Everything here is behind `Capacitor.isNativePlatform()` and dynamic imports,
 * so the web bundle never pulls the plugins in.
 */

export interface NativeShellHandlers {
  /** Return true if the press was consumed. False lets the app exit. */
  onBackButton: () => boolean;
}

let started = false;

export const startNativeShell = async (handlers: NativeShellHandlers): Promise<() => void> => {
  if (!Capacitor.isNativePlatform() || started) return () => {};
  started = true;

  const [{ StatusBar, Style }, { SplashScreen }, { App }, { Keyboard, KeyboardResize }] =
    await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
      import('@capacitor/app'),
      import('@capacitor/keyboard'),
    ]);

  // The shell reserves the inset itself (see .app-header-safe), so the status
  // bar must not also push the WebView down or the header gets the space twice.
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

  // `native` resizes the WebView itself, which keeps the flex shell intact —
  // `body` would shrink the document and fight the 100dvh viewport.
  await Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});
  await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

  // Hardware back. Capacitor's event is authoritative on Android; the History
  // API fallback in App.tsx only ever worked because the WebView synthesises
  // popstate, and it does not fire for the very last entry.
  const backHandle = await App.addListener('backButton', () => {
    if (!handlers.onBackButton()) App.exitApp();
  });

  // Only now: hiding it earlier shows a blank frame while React mounts.
  await SplashScreen.hide().catch(() => {});

  return () => {
    void backHandle.remove();
    started = false;
  };
};
