/// <reference types="vite/client" />

/** Injected by vite.config.ts `define`. */
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_MOCK_URL?: string;
}
