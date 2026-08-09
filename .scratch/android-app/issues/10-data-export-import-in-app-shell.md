# Data export and import inside the app shell

Type: research
Status: resolved
Blocked by: —

## Question

`components/DataManagement.tsx` is a nav destination and does file download and upload for
backup/restore. Both behave differently inside a Capacitor WebView than in a desktop browser:
an anchor with a `download` attribute or a blob URL typically does nothing visible, and
`<input type="file">` needs the system picker plus, depending on API level, storage permissions.

Research and report:

- How a generated JSON backup is saved and shared from Capacitor on modern Android — Filesystem
  plugin, Share sheet, or the MediaStore/SAF route — and which directories are writable without a
  runtime permission prompt on current API levels.
- How file import should work, and whether `<input type="file">` is sufficient in the WebView or
  needs a native picker.
- Which permissions must be declared, and how scoped storage changes the answer.
- Whether the same code path can serve both desktop web and Android, or must branch.

Output: a recommendation with enough specificity to implement, naming plugins and any permission
declarations. Implementation is a follow-on ticket.

The component also has zero responsive classes — layout is covered separately by "Mobile layout
audit of all 10 screens at 390px"; this ticket is about file I/O only.

## Answer

Researched 2026-07-30 against capacitorjs.com/docs, developer.android.com, npm registry, and the
actual Capacitor / plugin Android source on GitHub `main`.

### 0. What the component actually does today (correction to the ticket premise)

`components/DataManagement.tsx` does **not** do a single JSON backup. It has:

- `exportCSV(type)` (lines 152-181) — three separate CSV exports (`expenses.csv`, `portfolio.csv`,
  `stocks.csv`) via `new Blob(...)` -> `URL.createObjectURL` -> `<a download>` -> `link.click()`.
  It also never calls `URL.revokeObjectURL`, so it leaks a blob per click on web too.
- `handleImport(e, type)` (lines 183-238) — three hidden `<input type="file" accept=".csv">`
  elements (lines 386, 403, 420) read with `FileReader.readAsText`, parsed with a regex, then
  **`setExpenses(parsed)` / `setPortfolio(parsed)` / `setStocks(parsed)` — a full replace, not a
  merge.** Importing a 3-row CSV destroys everything else. That is a data-loss bug independent of
  Android and overlaps ticket 07; call it out there.
- Cloud push/pull (`pushToCloud` / `pullFromCloud`) is the only path that moves the *whole* state
  blob. There is no JSON backup file feature yet.

So the implementation ticket has two jobs: (a) make file I/O work on Android, (b) decide whether to
keep three CSVs or add one whole-state JSON backup. Recommendation below assumes a generic
`saveTextFile()` / `pickTextFile()` pair that serves both.

### 1. THE BLOCKER — export is a silent no-op on Android, not merely "degraded"

Verified in Capacitor `main` source, not from memory:

- `android/capacitor/src/main/java/com/getcapacitor/Bridge.java` `launchIntent(Uri)`:
  ```java
  if (url.getScheme().equals("data") || url.getScheme().equals("blob")) {
      return false;
  }
  ```
  Returning `false` means "let the WebView handle it". The WebView cannot navigate to `blob:`.
- Nothing in `Bridge.java`, `CapacitorWebView.java`, `BridgeWebViewClient.java` or
  `BridgeWebChromeClient.java` calls `setDownloadListener(...)`. Grepping all four for
  `download` returns zero hits. Android WebView only honours `<a download>` if the host app
  registers a `DownloadListener`; Capacitor does not.

Net effect: on Android the user taps Export, **nothing happens, no file, no error, no exception**.
There is nothing to "fix in CSS" — `exportCSV` must be replaced on the native path. Do not ship the
APK with the current export wired up; it looks like a dead button.

Import is the opposite: it already works (see section 3).

### 2. Export: recommended approach — Filesystem (Cache) + Share sheet

**Decision: write to `Directory.Cache`, then hand the `file://` URI to `@capacitor/share`.**
Zero runtime permission prompts, zero manifest changes, works on API 29 through 36, and the user
picks the destination themselves (Drive, Gmail, Files/"Save to device", Keep, WhatsApp...).

#### Directory matrix — what is writable without a permission prompt

Mapping verified in `capacitor-filesystem/android/.../LegacyFilesystemImplementation.kt`:

```kotlin
"DOCUMENTS"        -> Environment.getExternalStoragePublicDirectory(DIRECTORY_DOCUMENTS)
"DATA", "LIBRARY"  -> c.filesDir
"CACHE"            -> c.cacheDir
"EXTERNAL"         -> c.getExternalFilesDir(null)
"EXTERNAL_STORAGE" -> Environment.getExternalStorageDirectory()
```

| `Directory` | Real path | Prompt? | Actually writable API 30-36? | Shareable with the **default** `file_paths.xml`? | User can re-pick it later? |
|---|---|---|---|---|---|
| `Cache` | `/data/user/0/<pkg>/cache` | never | yes | **yes** (`<cache-path path="."/>`) | no |
| `Data` / `Library` | `/data/user/0/<pkg>/files` | never | yes | **no** — needs `<files-path>` added | no |
| `External` | `/sdcard/Android/data/<pkg>/files` | never | yes | yes (falls under `<external-path path="."/>`) | **no — SAF blocks `Android/data/` since Android 11** |
| `ExternalCache` | `/sdcard/Android/data/<pkg>/cache` | never | yes | yes | no (same SAF block) |
| `Documents` | `/sdcard/Documents` | **no prompt on API 33+, see trap** | **no — EACCES** | yes | yes |
| `ExternalStorage` | `/sdcard` | n/a | **no** — plugin README: "only available on Android 9 or older" | yes | yes |

**The `Directory.Documents` trap.** `FilesystemPlugin.kt` gates permissions with:

```kotlin
private fun isStoragePermissionGranted(shouldRequestAboveAndroid10: Boolean): Boolean = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> true          // API 33+: always "granted"
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> !shouldRequestAboveAndroid10 || ...
    else -> getPermissionState(PUBLIC_STORAGE) == PermissionState.GRANTED
}
```

On API 33+ `checkPermissions()` / `requestPermissions()` return `granted` **unconditionally and
without showing anything**, then `writeFile` still fails with `EACCES (Permission denied)` because
scoped storage blocks raw `File` writes into `/sdcard/Documents`. An implementer who "asks for
permission, gets granted, then gets EACCES" will burn a day. Android 11's restored direct-file-path
access is explicitly **media-only** ("Android 11 allows you to use APIs other than the MediaStore
API to access *media files*... The `File` API"), and `android:requestLegacyExternalStorage="true"`
is ignored at `targetSdk >= 30`, which Capacitor 7 and 8 both are.

#### Scoped storage / Android 13+ granular media permissions

- Android 10 (API 29) turned on scoped storage; `WRITE_EXTERNAL_STORAGE` has had **no effect** at
  `targetSdk >= 30` since Android 11.
- Android 13 (API 33) split `READ_EXTERNAL_STORAGE` into `READ_MEDIA_IMAGES` /
  `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO`. **There is no `READ_MEDIA_DOCUMENTS`.** A `.json` or
  `.csv` is not media, so none of these permissions exist for us and none would help. Android 14
  added `READ_MEDIA_VISUAL_USER_SELECTED` — also visual-media only.
- The two permission-free routes for non-media files are therefore exactly:
  1. **App-specific storage** — "Never needed for internal storage" (`getFilesDir`/`getCacheDir`),
     "Not needed for external storage" (`getExternalFilesDir`) per the Android storage overview.
  2. **Storage Access Framework** — the docs table lists "Documents and other files ->
     Storage Access Framework -> Permissions needed: **None**", because "the user is involved in
     selecting the files or directories that your app can access, [so] this mechanism doesn't
     require any system permissions".
- **MediaStore**: writing to `MediaStore.Downloads` also needs no permission on API 29+ ("you don't
  need storage-related permissions to access and modify media files that your app owns, including
  files in the `MediaStore.Downloads` collection"), but there is no first-party Capacitor plugin
  for it. See "rejected alternatives".

#### FileProvider — the second gotcha

`share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java` does:

```java
if (isFileUrl(file)) { ... }                  // content:// is REJECTED, must be file://
Uri fileUrl = FileProvider.getUriForFile(
    getActivity(), getContext().getPackageName() + ".fileprovider", new File(Uri.parse(file).getPath()));
```

`FileProvider.getUriForFile` throws `IllegalArgumentException` for any path not declared in
`android/app/src/main/res/xml/file_paths.xml`, which the plugin turns into `call.reject(...)`.
The Capacitor Android template ships exactly:

```xml
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
</paths>
```

`<cache-path>` == `context.getCacheDir()` == `Directory.Cache`. **`Directory.Cache` is the only
internal directory that works with the stock file_paths.xml.** If you pick `Directory.Data` you must
also add `<files-path name="files" path="." />`. Recommendation: use `Directory.Cache` and add
nothing.

Also note the share MIME type is derived from the file extension via `MimeTypeMap`; unknown
extensions fall back to `*/*`, which is harmless.

#### Rejected alternatives

- **MediaStore.Downloads insert** — permission-free and drops the file straight into Downloads with
  no chooser, which is arguably nicer UX. But there is no maintained first-party plugin;
  `odion-cloud/capacitor-mediastore` and `@capacitor-community/media` are media-oriented, and
  `cordova-plugin-saf-mediastore@1.0.10` was last published 2023-05. Writing ~60 lines of custom
  Java is the honest cost. Not worth it for a sideloaded personal app — revisit only if users
  complain about the share sheet.
- **SAF `ACTION_CREATE_DOCUMENT`** ("Save as..." dialog) — the most correct answer and needs no
  permissions, but again no first-party plugin exposes it. The share sheet already contains a
  "Save to Files/Drive" target that reaches the same place with zero native code.
- **`@capacitor/file-transfer@2.0.4`** — this is HTTP upload/download (the successor to the
  deprecated `Filesystem.downloadFile`). **Irrelevant here**; do not install it.
- **`Directory.External` as a "quiet" save location** — writes fine, but `/sdcard/Android/data/`
  cannot be reached by `ACTION_OPEN_DOCUMENT` / `ACTION_OPEN_DOCUMENT_TREE` since Android 11, so the
  user could never get the backup out again or re-import it. Dead end for a backup feature.

### 3. Import: keep `<input type="file">`, no plugin needed

`BridgeWebChromeClient.onShowFileChooser` **is** implemented in Capacitor and returns `true`:

```java
} else {
    showFilePicker(filePathCallback, fileChooserParams);
}
return true;
```

and `showFilePicker` launches `fileChooserParams.createIntent()` through an
`ActivityResultLauncher`, handling both single and `MODE_OPEN_MULTIPLE`. The resulting `content://`
URI is resolved by the WebView into a normal `File` object, so `FileReader.readAsText` in the
current `handleImport` works unchanged. **No native picker plugin is required and no permission is
involved** — SAF grants per-file access.

Three real WebView quirks to handle:

1. **Extension-only `accept` is translated, but fragilely.** Capacitor maps `.csv` -> MIME via
   `MimeTypeMap`:
   ```java
   if (fileChooserParams.getAcceptTypes().length > 1 || intent.getType().startsWith(".")) {
       String[] validTypes = getValidTypes(fileChooserParams.getAcceptTypes());
       intent.putExtra(Intent.EXTRA_MIME_TYPES, validTypes);
       if (intent.getType().startsWith(".")) { intent.setType(validTypes[0]); }   // <-- AIOOBE if empty
   }
   ```
   If `MimeTypeMap` doesn't know the extension, `validTypes` is empty and `validTypes[0]` throws
   `ArrayIndexOutOfBoundsException`. Always include at least one literal MIME type in `accept` so
   the array is never empty.
2. **MIME filtering greys out legitimate files.** Google Drive, Downloads and third-party file
   managers report CSV as `text/csv`, `text/plain`, `application/vnd.ms-excel` or
   `application/octet-stream` fairly arbitrarily, and JSON as `application/json` or
   `application/octet-stream`. A narrow `accept` makes the user's own backup un-selectable.
   Recommendation: **broaden `accept` on native**, and validate by extension/content in JS after
   selection rather than in the picker.
   ```tsx
   const ACCEPT_CSV = Capacitor.isNativePlatform()
     ? 'text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel,application/octet-stream,.csv'
     : '.csv';
   ```
   (If any device still filters everything out, fall back to `accept="*/*"` on native.)
3. **No camera/file chooser dialog on Android.** Capacitor jumps straight to the file browser
   instead of offering a Camera/Files choice (ionic-team/capacitor#6536). Irrelevant for CSV/JSON.

Optional escape hatch if a specific device proves flaky: **`@capawesome/capacitor-file-picker@8.0.3`**
(peer `@capacitor/core >= 8.0.0`), `FilePicker.pickFiles({ types, readData: true })` returns
`{ files: [{ name, mimeType, data /* base64 */, blob, path, size }] }`. Its documented
`ACCESS_MEDIA_LOCATION` / `READ_EXTERNAL_STORAGE` manifest entries are for the *media* pickers only
and are not needed for `pickFiles`. Treat as plan B — do not install it up front.

### 4. AndroidManifest.xml — declare nothing

**No storage permissions at all.** Do not add `WRITE_EXTERNAL_STORAGE` (no effect at
`targetSdk >= 30`) or `READ_EXTERNAL_STORAGE` (superseded by granular media perms on API 33+, and
useless for non-media anyway). The Capacitor template's existing
`<uses-permission android:name="android.permission.INTERNET" />` plus the template's
`androidx.core.content.FileProvider` block with `android:authorities="${applicationId}.fileprovider"`
are already everything the recommended path needs, and `res/xml/file_paths.xml` stays as generated.

The only manifest-adjacent change is *conditional*: **if** you deviate from `Directory.Cache` to
`Directory.Data`, add `<files-path name="files" path="." />` to `res/xml/file_paths.xml`.

`Intent.createChooser` does not require an Android 11 `<queries>` element, so no package-visibility
declaration either. Sharing on API 34+ already sets `FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT` inside the
plugin.

### 5. One bundle, runtime branch — no Vite config change

**Do not branch at build time.** Do not add a Vite mode, `define` flag, `.env.android`, or a second
entry point. Capacitor consumes the *same* `dist/` that FastAPI serves; a second build target would
mean two artifacts to keep in sync and would break the ticket-02 requirement that the desktop web
build keeps working unchanged.

Branch at runtime on `Capacitor.isNativePlatform()`, in **one new module**
`services/fileTransferService.ts` (or `utils/platformFiles.ts`). `DataManagement.tsx` then calls
`saveTextFile(...)` and stays platform-agnostic. `@capacitor/core` is web-safe and returns `false`
for `isNativePlatform()` in a plain browser, so the desktop build behaves exactly as today.

Use `await import(...)` for the two native plugins so Vite code-splits them into a chunk the desktop
user never downloads. `@capacitor/core` itself stays a static import (a few KB).

Do **not** branch on `navigator.share` / the Web Share API for desktop: Chrome/Firefox desktop
either lack it or reject `files`, and it needs a user gesture. Keep the anchor-download path for web.

### 6. Packages and versions (verified against the npm registry on 2026-07-30)

If ticket 02 scaffolds **Capacitor 8** (current; `minSdkVersion 24`, `compileSdkVersion 36`,
`targetSdkVersion 36` — note this is API **36**, not the 34/35 in this ticket's brief, because the
Android target SDK is pinned to the Capacitor major):

```
@capacitor/core        8.4.2
@capacitor/cli         8.4.2
@capacitor/android     8.4.2
@capacitor/filesystem  8.1.2   (peer @capacitor/core >=8.0.0)
@capacitor/share       8.0.1   (peer @capacitor/core >=8.0.0)
```

If ticket 02 pins **Capacitor 7** to actually hit API 35 (`minSdk 23`, `compile/targetSdk 35`):

```
@capacitor/core/cli/android  7.6.8
@capacitor/filesystem        7.1.8
@capacitor/share             7.0.4
```

Everything in this answer holds identically for 7 and 8 — the Bridge blob behaviour, the
`isStoragePermissionGranted` API-33 short-circuit, the FileProvider requirement and the
`onShowFileChooser` implementation are the same in both lines.

Install:

```bash
npm install @capacitor/filesystem @capacitor/share
npx cap sync android
```

Optional, only if plan B is needed: `@capawesome/capacitor-file-picker@8.0.3`.
Do **not** install `@capacitor/file-transfer` (HTTP transfers, unrelated).

### 7. Code sketches

**`services/fileTransferService.ts`** (new file — the only place that knows about platforms):

```ts
import { Capacitor } from '@capacitor/core';

export type SaveResult = 'saved' | 'cancelled';

/** Save `contents` as `filename`. Web: browser download. Android: cache file + share sheet. */
export async function saveTextFile(
  filename: string,
  contents: string,
  mimeType = 'text/csv',
): Promise<SaveResult> {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([contents], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);   // today's code never revokes
    return 'saved';
  }

  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  // Cache is the ONLY dir covered by the stock res/xml/file_paths.xml <cache-path>.
  await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  // Share requires a file:// URI; content:// is rejected by SharePlugin.isFileUrl().
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

  try {
    await Share.share({
      title: filename,
      dialogTitle: 'Save or send backup',
      files: [uri],
    });
    return 'saved';
  } catch (e: any) {
    // The plugin rejects with "Share canceled" on dismiss — that is NOT an error state.
    if (String(e?.message ?? e).toLowerCase().includes('cancel')) return 'cancelled';
    throw e;
  } finally {
    // Cache is never auto-pruned by us; drop the temp copy.
    await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});
  }
}

/** accept= value for a file input; deliberately loose on Android (see quirk 2). */
export function acceptFor(kind: 'csv' | 'json'): string {
  const web = kind === 'csv' ? '.csv' : '.json';
  if (!Capacitor.isNativePlatform()) return web;
  return kind === 'csv'
    ? 'text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel,application/octet-stream,.csv'
    : 'application/json,text/plain,application/octet-stream,.json';
}
```

**`components/DataManagement.tsx`** — export becomes async, import is untouched except `accept`:

```tsx
import { saveTextFile, acceptFor } from '../services/fileTransferService';

const exportCSV = async (type: 'expenses' | 'portfolio' | 'stocks') => {
  const { content, filename } = buildCsv(type);   // pure, extracted from today's downloadCSV
  try {
    const r = await saveTextFile(filename, content, 'text/csv');
    if (r === 'saved') setStatusMsg({ type: 'success', text: `Exported ${type}.` });
  } catch (e: any) {
    setStatusMsg({ type: 'error', text: `Export failed: ${e?.message ?? e}` });
  }
};

// unchanged handler, only the accept value changes:
<input type="file" accept={acceptFor('csv')} className="hidden"
       onChange={(e) => handleImport(e, 'expenses')} />
```

Note `buildCsv` should be extracted as a pure function so it is unit-testable under vitest without
touching `document` — the current `downloadCSV` closure mixes generation and delivery.

For a whole-state JSON backup (if that is added):

```ts
const payload = { version: 1, exportedAt: new Date().toISOString(),
                  expenses, portfolio, stocks, income, investment, goal, fire,
                  netWorthData, emergencyFund, loans };
const stamp = new Date().toISOString().slice(0, 10);
await saveTextFile(`cashflow-backup-${stamp}.json`, JSON.stringify(payload, null, 2),
                   'application/json');
```
The share sheet shows the file under the exact `path` you wrote to cache, so put the human-readable
name there — do not write `tmp.json` and hope.

### 8. Secondary finding worth carrying into ticket 02

`handleImport` calls `crypto.randomUUID()` and `copySyncId` calls `navigator.clipboard.writeText`.
Both require a **secure context**. Capacitor's default `androidScheme` is `https` (serving from
`https://localhost`), which is a secure context, so both keep working — but if ticket 02 sets
`androidScheme: 'http'` or points `server.url` at a plain-HTTP dev host, import will throw
`crypto.randomUUID is not a function` and Copy will silently fail. Keep the default `https` scheme.

### 9. Implementation checklist for the follow-on ticket

1. `npm install @capacitor/filesystem @capacitor/share` (versions per section 6); `npx cap sync android`.
2. Add `services/fileTransferService.ts` exactly as sketched. No Vite config change. No manifest change.
3. Extract `buildCsv(type)` as a pure function; make `exportCSV` async and route through `saveTextFile`.
4. Swap the three `accept=".csv"` values for `acceptFor('csv')`; leave `FileReader` logic alone.
5. Handle "Share canceled" as a no-op, not an error toast.
6. Verify on a real device: (a) Export -> share sheet appears -> "Save to Files" lands a correctly
   named, non-empty file in Downloads; (b) Import -> SAF picker opens -> the file just saved is
   selectable (not greyed out) -> parses.
7. Do **not** verify export in `npx cap run android` with a live-reload `server.url` pointed at the
   Vite dev server and then assume the bundled build behaves the same — the blob path is broken in
   both, but the share path is the one that must be exercised against bundled assets.
8. Separately (ticket 07 territory): make import merge rather than replace. Today one import wipes
   the other records.
