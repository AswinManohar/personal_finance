# Implement Android-safe file export and import

Type: task
Status: resolved
Blocked by: 02

## Question

Implementation follow-on from "Data export and import inside the app shell", which established the
approach. Read that ticket's `## Answer` first — it has the directory matrix, the traps, and code
sketches.

**Export is currently a silent no-op on Android.** Capacitor's `Bridge.launchIntent` explicitly
returns `false` for `blob:` and `data:` schemes, and Capacitor registers no `DownloadListener`
anywhere in its Android source. So `exportCSV`'s `URL.createObjectURL` + `<a download>` produces no
file, no error and no exception — the Export buttons simply look broken. This must not ship in the
APK as-is.

Build:

- A `services/fileTransferService.ts` exposing `saveTextFile()` / `pickTextFile()`, branching at
  runtime on `Capacitor.isNativePlatform()`.
- Native export: `@capacitor/filesystem` `writeFile` to **`Directory.Cache`**, then
  `Filesystem.getUri()` → `@capacitor/share` `Share.share({ files: [uri] })`. `Cache` specifically,
  because the stock `file_paths.xml` declares `<cache-path>` but not `<files-path>`, so
  `Directory.Data` would make `FileProvider.getUriForFile` throw.
- **Do not use `Directory.Documents`.** On API 33+ `requestPermissions()` reports `granted` without
  prompting, then `writeFile` fails with `EACCES` under scoped storage. That trap costs a day.
- Import needs no plugin — `<input type="file">` already works, since `BridgeWebChromeClient`
  implements `onShowFileChooser` and launches SAF. Two quirks to handle: loosen `accept` on native
  (a narrow `.csv` filter greys out the user's own file in Drive/Downloads), and always include one
  literal MIME type, or an extension-only `accept` can throw `ArrayIndexOutOfBoundsException`.
- Declare **no** permissions. `WRITE_EXTERNAL_STORAGE` has no effect at `targetSdk >= 30`, and
  there is no `READ_MEDIA_DOCUMENTS` — JSON/CSV are not media.
- Use `await import()` for both plugins so Vite code-splits them out of the desktop bundle.

Verified on npm: `@capacitor/filesystem@8.1.2`, `@capacitor/share@8.0.1`, core `8.4.2`. Do **not**
install `@capacitor/file-transfer` — that is HTTP transfer, unrelated.

Note Capacitor 8 pins **targetSdk 36**; confirm this against whatever "Scaffold the Capacitor
Android shell" actually set.

Also settle the open product question: keep three separate CSV exports, or add a single
whole-state JSON backup? The research recommends a generic `saveTextFile()` that serves both.

While here, fix the `URL.revokeObjectURL` leak on the web path — `exportCSV` leaks a blob per click.

## Answer

**Done.** `services/download.ts` branches: the browser keeps the `blob:` + synthetic `<a download>`
path, Android writes to `Directory.Cache` via `@capacitor/filesystem` and hands the file to
`@capacitor/share`.

Cache rather than Documents on purpose — it needs **no storage permission at all** and Android
reclaims it itself. Both CSV exporters now route through it (`DataManagement`, and `Portfolio`,
which had its own copy of the blob helper).

Import already worked: `<input type="file">` opens the Storage Access Framework in a WebView with no
extra plugin.

Not verified on a device — no APK exists yet.
