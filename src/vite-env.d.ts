/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of a deployed Cloudflare Worker proxy. Empty means no edge proxy. */
  readonly VITE_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
