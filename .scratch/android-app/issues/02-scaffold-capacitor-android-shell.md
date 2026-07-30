# Scaffold the Capacitor Android shell

Type: task
Status: open
Blocked by: —

## Question

Stand up Capacitor over the existing Vite build so `npm run build` produces web assets that sync
into a native Android project and run on a device.

Decisions this ticket must settle and record, because later tickets depend on them:

- **`applicationId`** (e.g. `com.aswinmanohar.cashflow`) — the OAuth client registration in
  "Choose applicationId, create keystore, and register the Android OAuth client" needs this exact
  string, and it can never change afterwards without re-registering.
- App display name and Capacitor `webDir` / `server` config.
- Where the Android project lives in the repo, and what gets committed vs gitignored.
- How the Supabase URL and anon key reach the bundled app — today they come from the Vite build
  environment; confirm that still holds when assets are bundled rather than served by Railway.

Done when a debug build installs on a real device and the app loads its own bundled assets, with
no dependency on the Railway-hosted SPA for the frontend. Auth is expected to be broken at this
point — that is a later ticket.

The desktop web build served by FastAPI (`api/main.py` mounts `dist/`) must keep working
unchanged.
