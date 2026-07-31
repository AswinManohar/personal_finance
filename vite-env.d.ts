/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google **web** OAuth client ID, used as the ID-token audience on Android. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
