export interface Env {
  /** FRED API key — set via `wrangler secret put FRED_API_KEY` */
  FRED_API_KEY?: string;
}

/**
 * CORS proxy + API gateway.
 *
 * Routes:
 *   /fred/*          → FRED API (api.stlouisfed.org) with auto-injected API key
 *   /treasury/*      → Treasury Fiscal Data API (v1)
 *   /?url=<target>   → Generic passthrough (legacy fallback)
 *
 * All responses are stamped with `Access-Control-Allow-Origin: *`
 * so the browser can read them cross-origin.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Route: /fred/* ──────────────────────────────────────────────
    if (url.pathname.startsWith('/fred')) {
      const fredPath = url.pathname.replace(/^\/fred/, '');
      let fredUrl = `https://api.stlouisfed.org${fredPath}${url.search}`;
      // Inject the API key if configured and not already present.
      if (env.FRED_API_KEY && !fredUrl.includes('api_key=')) {
        const sep = fredUrl.includes('?') ? '&' : '?';
        fredUrl = `${fredUrl}${sep}api_key=${env.FRED_API_KEY}`;
      }
      const upstream = await fetch(fredUrl, {
        headers: { 'User-Agent': 'bills-n-bonds-cors-proxy/1.0' },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        },
      });
    }

    // ── Route: /treasury/* ──────────────────────────────────────────
    if (url.pathname.startsWith('/treasury')) {
      const treasuryPath = url.pathname.replace(/^\/treasury/, '');
      const treasuryUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1${treasuryPath}${url.search}`;
      const upstream = await fetch(treasuryUrl, {
        headers: { 'User-Agent': 'bills-n-bonds-cors-proxy/1.0' },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        },
      });
    }

    // ── Legacy: generic passthrough ─────────────────────────────────
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(
        'Missing ?url= or unknown path. Use /fred/*, /treasury/*, or /?url=<target>',
        { status: 400 },
      );
    }
    // If the target is a FRED URL, inject the API key when available.
    let finalTarget = target;
    if (target.includes('api.stlouisfed.org') && env.FRED_API_KEY && !target.includes('api_key=')) {
      const sep = target.includes('?') ? '&' : '?';
      finalTarget = `${target}${sep}api_key=${env.FRED_API_KEY}`;
    }
    const upstream = await fetch(finalTarget, {
      headers: { 'User-Agent': 'bills-n-bonds-cors-proxy/1.0' },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      },
    });
  },
};
