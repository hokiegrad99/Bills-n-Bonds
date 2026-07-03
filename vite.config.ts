/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/Bills-n-Bonds/' matches the GitHub Pages URL for this repo.
// Change to '/' if hosting at the user/org root (e.g. username.github.io).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/Bills-n-Bonds/',
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
    server: {
      // Dev-only CORS workaround: the Treasury Fiscal Data API's GET
      // responses do NOT carry Access-Control-Allow-Origin (only the
      // OPTIONS preflight does), so the browser blocks direct fetch from
      // the Vite origin. We proxy /treasury/* to Treasury here, making
      // every Treasury request same-origin and bypassing CORS entirely.
      //
      // We also proxy /fred/* to the St. Louis Fed (FRED) API and inject
      // the API key server-side so it never reaches the browser.
      // Set VITE_FRED_API_KEY in a .env file (see README).
      // Production builds ignore this entry — production relies on the
      // Cloudflare Worker at workers/cors-proxy/ (URL set as
      // `CORS_PROXY_URL` in src/lib/treasury-api.ts).
      proxy: {
        '/treasury': {
          target: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/treasury/, ''),
        },
        '/fred': {
          target: 'https://api.stlouisfed.org',
          changeOrigin: true,
          // FRED's real upstream URL IS `/fred/...` (e.g.
          // `/fred/series/observations`, `/fred/series/search`);
          // do NOT strip a leading `/fred`. We only inject the API
          // key server-side so it never reaches the browser.
          rewrite: (path) => {
            if (path.includes('api_key=')) return path;
            const sep = path.includes('?') ? '&' : '?';
            const key = env.VITE_FRED_API_KEY || '';
            return key ? `${path}${sep}api_key=${key}` : path;
          },
        },
      },
    },
  };
});
