/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google **web** OAuth client ID, used as the ID-token audience on Android. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  /** Backend origin for native builds; defaults to the Railway host. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
