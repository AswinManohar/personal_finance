# Choose applicationId, create keystore, and register the Android OAuth client

Type: task
Status: open
Blocked by: 02

## Question

The native Google Sign-In plugin authenticates against a Google Cloud **Android OAuth client**,
which is keyed on the pair (package name, signing-certificate SHA-1). Distribution is a
sideloaded self-signed release APK, so we own the keystore and therefore the fingerprint.

Human-in-the-loop — this needs Google Cloud console access.

Work:

- Generate a release keystore and record where it lives and how it is backed up. **Losing it means
  the app can never be updated in place.**
- Extract SHA-1 for both the debug keystore (for development builds) and the release keystore.
- Create an Android OAuth client in the Google Cloud project already backing the existing web
  OAuth, using the `applicationId` fixed in "Scaffold the Capacitor Android shell".
- Add the Android client ID to Supabase's Google provider **Authorized Client IDs**, so
  `signInWithIdToken` will accept tokens minted for the Android client.
- Confirm the existing **web** OAuth client is untouched, so desktop login keeps working.

Done when the client IDs and both fingerprints are recorded in the answer, and the Supabase
provider config accepts the Android client. No app code required.
