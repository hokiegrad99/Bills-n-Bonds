# bills-n-bonds-cors-proxy (idle)

A Cloudflare Worker formerly used by the **Bills n' Bonds** app to front
the US Treasury Fiscal Data API and the St. Louis Fed (FRED) API with
`Access-Control-Allow-Origin: *`.

## Status: idle

As of 2026-07-03 the [Bills n' Bonds app](https://github.com/dad/Bills-n-Bonds)
uses **no live external data**. Treasury and FRED live-fetch paths were
removed because:

1. Treasury Fiscal Data does not send CORS headers to browser origins,
   and Cloudflare Workers cannot complete the upstream TLS handshake
   for Treasury on the free tier (HTTP 525).
2. The app was redesigned to be fully client-local: every page renders
   purely from the user's own `localStorage` holdings, hence no proxy
   is needed in normal use.

This worker is intentionally kept deployed (free tier) as a small piece
of fetchable infrastructure. It still answers CORS preflights and a
root-level descriptor; the `/fred/*` and `/treasury/*` route branches
were removed along with their callers.

## What this worker does today

| Method   | Path      | Effect                                                         |
| -------- | --------- | -------------------------------------------------------------- |
| `GET`    | `/`       | JSON descriptor: `{ ok, worker, status: 'idle', message }`    |
| `OPTIONS`| any       | 204 with permissive CORS headers (preflight friendly)           |
| `*`      | other     | `410 Gone` from `src/index.ts`'s default branch                |

The `FRED_API_KEY` Cloudflare secret binding is **preserved** so that,
if live data is reintroduced in the app, the previously-removed route
branches can be restored unchanged.

## How to revive route branches (optional)

If you re-add a live-Treasury or live-FRED consumer:

1. Restore the `/fred/*` and `/treasury/*` blocks in
   `src/index.ts` from your git history (they are removed intentionally
   here; clobber-defensive commit in the repo keeps history intact).
2. Re-add the corresponding client calls in the app (e.g. a new
   `src/lib/treasury-api.ts`).
3. Restore the Vite dev proxy entries in `vite.config.ts` so `npm run
   dev` works without the deployed worker.
4. Rebuild + redeploy the worker:

   ```bash
   cd workers/cors-proxy
   npm install
   npx wrangler login                     # one-time
   npx wrangler secret put FRED_API_KEY   # free key from fred.stlouisfed.org/docs/api/api_key.html
   npx wrangler deploy
   ```

5. Set `VITE_CORS_PROXY_URL=<worker-url>` as a GitHub Actions secret on
   the app repo with no trailing slash; push a commit so the build
   embeds it.

The full deployment choreography that was previously captured in this
README (Treasury + FRED curl smoke tests, ACAO verification, etc.) is
intentionally not reproduced here — resurrect those by reading the git
history of this file before the cleanup commit.
