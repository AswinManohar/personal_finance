import { Capacitor } from '@capacitor/core';

/**
 * Saves a generated file, on whichever platform is running.
 *
 * The browser path builds a `blob:` URL and clicks a synthetic `<a download>`.
 * In a Capacitor WebView that does nothing at all: there is no `DownloadListener`
 * registered, and the WebView refuses `blob:` navigations — so the Export buttons
 * on the Data screen looked functional and silently did nothing.
 *
 * On Android the file is written to the app's cache directory and handed to the
 * system share sheet, which is what lets the user put it wherever they want.
 * Cache rather than Documents deliberately: it needs no storage permission at
 * all, and Android reclaims it on its own.
 */
export const saveTextFile = async (
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8;'
): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await Share.share({
    title: filename,
    // `url` is what carries the actual file; `text` alone would share the name.
    url: uri,
    dialogTitle: `Save ${filename}`,
  });
};
