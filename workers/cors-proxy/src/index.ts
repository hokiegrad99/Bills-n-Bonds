export interface Env {
  /** FRED API key — set via `wrangler secret put FRED_API_KEY` */
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
 * CORS proxy + API gateway for the Bills n' Bonds static site on GitHub
 * Pages. The upstream APIs (FRED in particular) do not return
 * cross-origin headers, so this worker fronts both Treasury and FRED
 * with `Access-Control-Allow-Origin: *`. The FRED API key is stored as
 * a Cloudflare secret and injected server-side, so it never reaches
 * the browser.
 *
 * Routes:
 *   /fred/*        → FRED API (api.stlouisfed.org) with auto-injected API key
 *   /treasury/*    → Treasury Fiscal Data API (v1)
 *   /?url=<target> → Generic passthrough (legacy fallback for absolute URLs)
 *   OPTIONS *      → 204 preflight with CORS headers
 *   GET /          → JSON descriptor for sanity checks
 *
 * Free-tier limits: 100,000 requests/day, 10ms CPU per request.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Any path, any preflight: respond with a cached 204 + headers.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Root sanity-check. Helpful when curling the deployed URL to
    // confirm it's live AND that the FRED secret is correctly bound.
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({
          ok: true,
          worker: 'bills-n-bonds-cors-proxy',
          routes: ['/fred/*', '/treasury/*', '/?url=<target>'],
          fredApiKeyConfigured: Boolean(env.FRED_API_KEY),
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ── Route: /fred/* ──────────────────────────────────────────────
    // FRED's real upstream URL IS `/fred/...` (e.g.
    // `/fred/series/observations`, `/fred/series/search`),
    // so we pass the FULL pathname through; only the host changes.
    // Do NOT strip a leading `/fred` — that produced 404s because the
    // upstream was being asked for `/series/observations`.
    if (url.pathname.startsWith('/fred')) {
      let fredUrl = `https://api.stlouisfed.org${url.pathname}${url.search}`;
      // Inject the API key if configured and not already present in the
      // request (covers the dev-proxy path that injects client-side).
      if (env.FRED_API_KEY && !fredUrl.includes('api_key=')) {
        const sep = fredUrl.includes('?') ? '&' : '?';
        fredUrl = `${fredUrl}${sep}api_key=${env.FRED_API_KEY}`;
      }
      return proxyFetch(fredUrl);
    }

    // ── Route: /treasury/* ──────────────────────────────────────────
    if (url.pathname.startsWith('/treasury')) {
      const treasuryPath = url.pathname.replace(/^\/treasury/, '');
      const treasuryUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1${treasuryPath}${url.search}`;
      return proxyFetch(treasuryUrl);
    }

    // ── Legacy: generic passthrough ─────────────────────────────────
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(
        'Missing ?url= or unknown path. Use /fred/*, /treasury/*, or /?url=<target>',
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
        },
      );
    }
    // FRED passthroughs get the same key-injection treatment.
    let finalTarget = target;
    if (target.includes('api.stlouisfed.org') && env.FRED_API_KEY && !target.includes('api_key=')) {
      const sep = target.includes('?') ? '&' : '?';
      finalTarget = `${target}${sep}api_key=${env.FRED_API_KEY}`;
    }
    return proxyFetch(finalTarget);
  },
};

/**
 * Fetch an upstream URL and re-emit its body & status with our CORS
 * headers (plus the upstream's content-type, falling back to JSON).
 * Errors from `fetch()` (DNS failure, network timeout) propagate as a
 * 502 — we deliberately don't swallow them so the browser sees a
 * distinguishable failure rather than a silent timeout.
 *
 * Cache-Control / Expires from the upstream are preserved so the
 * browser can cache identical responses within the upstream's TTL,
 * keeping us well under the Cloudflare free-tier 100k req/day limit.
 */
async function proxyFetch(target: string): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { 'User-Agent': 'bills-n-bonds-cors-proxy/1.1' },
    });
  } catch (e: any) {
    return new Response(`Upstream fetch failed: ${e?.message ?? String(e)}`, {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    });
  }
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
  };
  // Forward upstream's caching hint when present. Treasury issues
  // Cache-Control: public, max-age=300 on most endpoints; letting the
  // browser honour that dramatically reduces repeat invocations.
  const cacheControl = upstream.headers.get('Cache-Control');
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  const expires = upstream.headers.get('Expires');
  if (expires) headers['Expires'] = expires;
  return new Response(upstream.body, { status: upstream.status, headers });
}
