/// <reference types="vite/client" />

/**
 * Build-time environment augmentation for the Bills n' Bonds app.
 *
 * Vite exposes any env var prefixed with `VITE_` to client code via
 * `import.meta.env`. We declare the optional CORS-proxy URL here so
 * `tsc` recognises it as `string | undefined` (instead of `any` or
 * "unknown property"), letting call sites use it directly without
 * casts.
 */
interface ImportMetaEnv {
  /**
   * Optional Cloudflare Worker CORS-proxy URL — e.g.
   * `https://bills-n-bonds-cors-proxy.<subdomain>.workers.dev`.
   *
   * When set (at build time, via a GitHub Actions repo secret or a
   * local `.env` file), Treasury Fiscal Data AND FRED API calls are
   * routed through this worker so they're CORS-permissive on
   * GitHub Pages. When unset, the app relies on:
   *   • Dev: the Vite dev-server proxies in vite.config.ts
   *   • Prod: likely-404 / direct blocked requests → synthetic fallback
   *
   * No trailing slash expected; the runtime trims any it finds.
   */
  readonly VITE_CORS_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
