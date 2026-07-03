export interface Env {
  /** FRED API key — set via `wrangler secret put FRED_API_KEY`. Currently
   * unused: as of 2026-07-03 the bills-n-bonds app fetches no live
   * Treasury or FRED data. Preserved so re-enabling live data is a
   * one-line change rather than a redeploy-cycle. */
  FRED_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Cache legitimate preflights for a day so the browser doesn't
  // re-OPTIONS on every request.
  'Access-Control-Max-Age': '86400',
};

/**
 * CORS proxy kept on the free Cloudflare tier as idle infrastructure.
 *
 * As of 2026-07-03 the bills-n-bonds app fetches no live data, so this
 * worker intentionally serves only a root-level descriptor and the
 * CORS preflight. The earlier `/fred/*` and `/treasury/*` route branches
 * were removed along with their (now-deleted) callers in
 * `src/lib/treasury-api.ts`. If live data is ever reintroduced, the
 * branches can be restored verbatim from git history alongside
 * `FRED_API_KEY` being re-bound.
 *
 * OPTIONS preflights are still answered with permissive CORS headers —
 * cheap, and protects against future clients in unknown order.
 */
export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    if (_request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(_request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({
          ok: true,
          worker: 'bills-n-bonds-cors-proxy',
          status: 'idle',
          message:
            'No active routes. The bills-n-bonds app uses no live data sources as of 2026-07-03.',
          fredApiKeyConfigured: Boolean(env.FRED_API_KEY),
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      'No active routes on this worker. The bills-n-bonds app no longer fetches live data.',
      {
        status: 410,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      },
    );
  },
};
