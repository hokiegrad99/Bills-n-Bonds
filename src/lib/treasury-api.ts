import type { FetchErrorKind, RealYieldCurvePoint, TreasuryAuction, YieldCurvePoint } from './types';

/**
 * Optional Cloudflare Worker CORS-proxy URL, injected at build time via
 * `VITE_CORS_PROXY_URL` (a GitHub Actions repo secret for Pages deploys,
 * or a local `.env` entry during dev). When present, Treasury and FRED
 * API calls are routed through the worker so they're CORS-permissive on
 * GitHub Pages. Empty/undefined is the no-proxy default — Treasury/FRED
 * rely on direct (likely-CORS-blocked-in-prod) fetches, and the per-
 * request `?url=` fallback (`CORS_PROXY_URL` below) is disabled.
 *
 * Trailing slashes are normalised so `${base}/treasury` composes
 * cleanly regardless of whether the secret ended in `/`.
 */
const CORS_PROXY_BASE: string = (import.meta.env.VITE_CORS_PROXY_URL ?? '').replace(/\/+$/, '');

// Treasury Fiscal Data API base. In dev, Vite proxies `/treasury/*` to
// api.fiscaldata.treasury.gov (bypasses Treasury's missing ACAO on
// GET responses). In production, when the CORS-proxy URL is set,
// routes through the worker for full live-data support. Without it on
// Pages, the request hits a same-origin 404 and `fetchJSON` falls back
// to the synthetic data — the prior behavior.
const FISCAL_BASE = CORS_PROXY_BASE ? `${CORS_PROXY_BASE}/treasury` : '/treasury';

// FRED (St. Louis Fed) API base.
// Priority order:
//   1. localhost → '/fred' (Vite dev proxy injects the API key from
//      VITE_FRED_API_KEY without leaving the developer machine; even
//      when CORS_PROXY_BASE is set in .env.local, dev traffic stays
//      in-dev so the worker's free-tier quota isn't burned).
//   2. CORS-proxy URL is set → `${base}/fred` (worker injects
//      FRED_API_KEY from Cloudflare secret storage).
//   3. otherwise → direct to api.stlouisfed.org (CORS-blocked in
//      production, fetchJSON then falls back to synthetic data).
function getFredBase(): string {
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return '/fred';
  }
  if (CORS_PROXY_BASE) return `${CORS_PROXY_BASE}/fred`;
  return 'https://api.stlouisfed.org';
}
const FRED_BASE = getFredBase();

/**
 * Absolute upstream Treasury API base. Surfaced in error messages so the
 * diagnostic always names the *real* host + path the gateway eventually
 * reached (instead of the local `/treasury/*` path or proxy URL).
 * A 404 here unambiguously means Treasury responded 404 — not that
 * our app made a malformed request. Public, no secrets.
 */
const TREASURY_UPSTREAM =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1';

/**
 * Absolute form of a Treasury URL — used only for error messages.
 * Recognises BOTH the dev/prod-no-proxy same-origin `/treasury/...`
 * form AND the worker-proxied `${base}/treasury/...` form so the
 * surfaced upstream URL is always the real Treasury host.
 */
function absoluteTreasuryUrl(url: string): string {
  const prefixes = CORS_PROXY_BASE
    ? ['/treasury', `${CORS_PROXY_BASE}/treasury`]
    : ['/treasury'];
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      return TREASURY_UPSTREAM + url.slice(prefix.length);
    }
  }
  return url;
}

/**
 * Legacy per-request fallback URL prefix. Used by `fetchJSON` /
 * `fetchFREDJSON` as a defensive backup when the primary upstream call
 * throws a network error (CORS blocked, DNS fail, offline). Empty when
 * no proxy is configured so the runtime never attempts DNS resolution
 * against a placeholder hostname.
 */
const CORS_PROXY_URL = CORS_PROXY_BASE ? `${CORS_PROXY_BASE}/?url=` : '';

/** Classifies an HTTP status into an error kind. */
function classifyHttpError(status: number, url: string): FetchErrorKind {
  if (status === 400 && url.includes('fred') && !url.includes('api_key=')) return 'no-api-key';
  if (status >= 500) return 'transient';
  if (status >= 400) return 'permanent';
  return 'transient';
}

/**
 * Delay `ms` milliseconds, abortable via `signal`.
 * Silently resolves (never rejects) on abort so callers can skip cleanly.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Retry wrapper with exponential backoff for transient failures.
 * Only retries when the error kind is `transient` (5xx, network).
 * Permanent errors (4xx, bad params) propagate immediately.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  classify: (err: unknown) => FetchErrorKind,
  { maxRetries = 2, baseDelay = 1000, signal }: { maxRetries?: number; baseDelay?: number; signal?: AbortSignal } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const kind = classify(err);
      if (kind !== 'transient' || attempt === maxRetries || signal?.aborted) throw err;
      // Exponential backoff: 1s, 2s, …
      await delay(baseDelay * Math.pow(2, attempt), signal);
    }
  }
  throw lastErr;
}

/**
 * Primary path: direct fetch to Treasury (the API sends
 * `Access-Control-Allow-Origin: *` so the browser is allowed cross-origin).
 * Falls back to the self-hosted CORS proxy ONLY when `CORS_PROXY_URL` is
 * configured; logs the underlying error to the console for dev visibility.
 *
 * Wraps the request in a retry loop for transient (5xx / network) failures.
 */
async function fetchJSON(url: string, signal?: AbortSignal): Promise<any> {
  return withRetry(
    async () => {
      try {
        const r = await fetch(url, { signal });
        if (r.ok) return r.json();
        const kind = classifyHttpError(r.status, url);
        const err: any = new Error(`Treasury API responded ${r.status} for ${absoluteTreasuryUrl(url)}`);
        err.status = r.status;
        err.kind = kind;
        throw err;
      } catch (directErr: any) {
        // If it's already a classified HTTP error, re-throw.
        if (directErr?.kind) throw directErr;
        if (!CORS_PROXY_URL) {
          // eslint-disable-next-line no-console
          console.error('[treasury-api] direct fetch failed and no CORS proxy configured =>', directErr);
          directErr.kind = directErr?.name === 'AbortError' ? 'transient' : 'network';
          throw directErr;
        }
        const proxied = await fetch(CORS_PROXY_URL + encodeURIComponent(url), { signal });
        if (!proxied.ok) {
          const kind = classifyHttpError(proxied.status, url);
          const err: any = new Error(
            `Treasury API responded ${proxied.status} via CORS proxy for ${absoluteTreasuryUrl(url)}`,
          );
          err.status = proxied.status;
          err.kind = kind;
          throw err;
        }
        return proxied.json();
      }
    },
    (err: any) => err?.kind ?? 'transient',
    { signal },
  );
}

/** Shape returned by the three endpoint fetchers, so the cache layer can surface a banner. */
export interface FetchResult<T> {
  data: T;
  /** True when the data came from a synthetic fallback, NOT from the live Treasury Fiscal Data API. */
  isSynthetic: boolean;
  /** Underlying error message when isSynthetic=true; lets the UI surface WHY the live fetch failed. */
  fallbackReason?: string;
  /**
   * Structured error category. Lets the UI distinguish between
   * transient server issues, missing API keys, and permanent errors
   * so it can show context-aware guidance instead of a generic message.
   */
  errorKind?: FetchErrorKind;
}

// ---------- Auctions ----------

/**
 * Fetch a window of auctions spanning past + future from the Treasury
 * Fiscal Data auctions_query endpoint. The default 180-day window covers
 * recent settlements (for the "Recent Results" tab) plus the full
 * upcoming Treasury auction calendar (Treasury publishes ~6 months out)
 * for the "Upcoming" tab — all in a single round-trip.
 * Results are returned chronologically (auction_date ASC) so callers
 * can split past vs. future without re-sorting.
 *
 * If the live fetch fails or returns zero rows, falls back to a small
 * set of plausible synthetic auction rows (see `synthesizeRecentAuctions`)
 * and tags the result with `isSynthetic: true` so the cache layer can
 * show a disclaimer banner.
 */
export async function fetchRecentAuctions(
  limit: number = 60,
  signal?: AbortSignal,
): Promise<FetchResult<TreasuryAuction[]>> {
  // Treasury's v1 `auctions_query` endpoint (plural) is the working
  // path as of 2026-06; the old v2 `auction_query` path returns 404.
  // We avoid `filter=auction_date:gte:DATE` because it can trigger
  // HTTP 500 on some API versions. Drop the filter and fetch the
  // most-recent N rows in descending order — this combination returns
  // 200. The Auctions page still splits `date < now` (settled) from
  // `date >= now` (upcoming) because Treasury publishes ~12 weeks of
  // settled rows + ~12–16 weeks of upcoming scheduled rows, so 120
  // rows already spans both windows. We bound `limit` to [60, 200] to
  // stay clear of Treasury's pagination caps without dropping below a
  // useful window.
  const effectiveLimit = Math.min(Math.max(limit, 60), 200);
  const url =
    `${FISCAL_BASE}/accounting/od/auctions_query` +
    `?sort=-auction_date` +
    `&page%5Bsize%5D=${effectiveLimit}`;
  try {
    const json = await fetchJSON(url, signal);
    const rows: any[] = json?.data ?? [];
    if (rows.length > 0) {
      // Defensive dedup: rare cases where the API emits duplicate
      // announcement rows for the same (cusip, auction_date, security_type).
      const seen = new Set<string>();
      const out: TreasuryAuction[] = [];
      for (const r of rows) {
        const n = normalizeAuction(r);
        if (!n.auction_date) continue;
        const key = `${n.cusip ?? ''}|${n.auction_date}|${n.security_type ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
      }
      if (out.length > 0) return { data: out, isSynthetic: false };
    }
  } catch (e: any) {
    /* surface the underlying error to the UI */
    return {
      data: synthesizeRecentAuctions(),
      isSynthetic: true,
      fallbackReason: e?.message ?? String(e),
      errorKind: e?.kind as FetchErrorKind | undefined,
    };
  }
  // Empty response (zero rows) — fall through to synthesis without an error message.
  return { data: synthesizeRecentAuctions(), isSynthetic: true };
}

function normalizeAuction(r: any): TreasuryAuction {
  // Some field names appear as either snake_case or oddly named; map defensively.
  const lower: Record<string, any> = {};
  for (const k of Object.keys(r)) lower[k.toLowerCase()] = r[k];
  return {
    auction_date: String(lower.auction_date ?? lower.record_date ?? ''),
    issue_date: lower.issue_date,
    maturity_date: lower.maturity_date,
    cusip: lower.cusip,
    security_type: lower.security_type ?? lower.t_bill_or_bond ?? '',
    security_term: lower.security_term ?? lower.security_term_desc ?? '',
    t_bill_or_bond: lower.t_bill_or_bond ?? lower.security_type,
    average_median_yield: lower.average_median_yield ?? lower.avg_med_yield ?? lower.average_median_award_yield,
    average_median_award_yield: lower.average_median_award_yield ?? lower.avg_med_yield,
    high_yield: lower.high_yield,
    high_discount_rate: lower.high_discount_rate,
    high_investment_rate: lower.high_investment_rate,
    total_tendered: lower.total_tendered,
    total_accepted: lower.total_accepted,
  };
}

// ---------- FRED yield curve helpers ----------

/** FRED series IDs for the nominal Treasury yield curve. */
const FRED_NOMINAL_SERIES: Record<string, string> = {
  bc_1month: 'DGS1MO',
  bc_2month: 'DGS2MO',
  bc_3month: 'DGS3MO',
  bc_6month: 'DGS6MO',
  bc_1year: 'DGS1',
  bc_2year: 'DGS2',
  bc_3year: 'DGS3',
  bc_5year: 'DGS5',
  bc_7year: 'DGS7',
  bc_10year: 'DGS10',
  bc_20year: 'DGS20',
  bc_30year: 'DGS30',
};

/** FRED series IDs for the TIPS real yield curve. */
const FRED_REAL_SERIES: Record<string, string> = {
  tc_5year: 'DFII5',
  tc_10year: 'DFII10',
  tc_20year: 'DFII20',
  tc_30year: 'DFII30',
};

async function fetchFREDJSON(seriesId: string, limit: number = 120, signal?: AbortSignal): Promise<any> {
  const url = `${FRED_BASE}/fred/series/observations?series_id=${seriesId}&file_type=json&sort_order=desc&limit=${limit}`;
  return withRetry(
    async () => {
      try {
        const r = await fetch(url, { signal });
        if (r.ok) return r.json();
        const noKey = !url.includes('api_key=');
        if (r.status === 400 && noKey) {
          const err: any = new Error(`FRED API key not configured — add VITE_FRED_API_KEY to your .env file`);
          err.kind = 'no-api-key';
          throw err;
        }
        const kind = r.status >= 500 ? 'transient' : 'permanent';
        const err: any = new Error(`FRED API responded ${r.status} for ${seriesId}`);
        err.status = r.status;
        err.kind = kind;
        throw err;
      } catch (directErr: any) {
        if (directErr?.kind) throw directErr;
        if (!CORS_PROXY_URL) {
          directErr.kind = 'network';
          throw directErr;
        }
        const proxied = await fetch(CORS_PROXY_URL + encodeURIComponent(url), { signal });
        if (!proxied.ok) {
          const kind = proxied.status >= 500 ? 'transient' : 'permanent';
          const err: any = new Error(`FRED API responded ${proxied.status} via CORS proxy for ${seriesId}`);
          err.status = proxied.status;
          err.kind = kind;
          throw err;
        }
        return proxied.json();
      }
    },
    (err: any) => err?.kind ?? 'transient',
    { signal },
  );
}

type FREDObservation = { date: string; value: string };

/**
 * Shared helper: fetch multiple FRED series, merge them by date,
 * forward-fill missing tenors, and return chronologically-sorted points.
 */
async function buildFREDHistory<T extends { new_date: string }>(
  seriesMap: Record<string, string>,
  signal?: AbortSignal,
): Promise<T[]> {
  const responses = await Promise.all(
    Object.entries(seriesMap).map(async ([key, seriesId]) => {
      try {
        const data = await fetchFREDJSON(seriesId, 120, signal);
        return { key, observations: (data?.observations ?? []) as FREDObservation[] };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[treasury-api] FRED series ${seriesId} failed:`, e);
        return { key, observations: [] as FREDObservation[] };
      }
    }),
  );

  // Build date → { tenor: value } map.
  const dateMap: Record<string, Record<string, string>> = {};
  for (const { key, observations } of responses) {
    for (const obs of observations) {
      if (!obs.date || obs.value === '.' || obs.value === '') continue;
      if (!dateMap[obs.date]) dateMap[obs.date] = { new_date: obs.date };
      dateMap[obs.date][key] = obs.value;
    }
  }

  if (Object.keys(dateMap).length === 0) {
    throw new Error('FRED returned no data. API key may be missing or invalid.');
  }

  // Forward-fill missing tenors so every date has a complete curve.
  const sortedDates = Object.keys(dateMap).sort();
  const running: Record<string, string> = {};
  for (const date of sortedDates) {
    const point = dateMap[date];
    for (const key of Object.keys(seriesMap)) {
      if (point[key] !== undefined) {
        running[key] = point[key];
      } else if (running[key] !== undefined) {
        point[key] = running[key];
      }
    }
  }

  return sortedDates.reverse().map((date) => ({ ...(dateMap[date] as unknown as T) }));
}

async function fetchFREDYieldCurve(
  signal?: AbortSignal,
): Promise<{ latest: YieldCurvePoint; history: YieldCurvePoint[] }> {
  const history = await buildFREDHistory<YieldCurvePoint>(FRED_NOMINAL_SERIES, signal);
  return { latest: history[0], history };
}

async function fetchFREDRealYieldCurve(signal?: AbortSignal): Promise<RealYieldCurvePoint[]> {
  return buildFREDHistory<RealYieldCurvePoint>(FRED_REAL_SERIES, signal);
}

// ---------- Yield curve (nominal) ----------

/**
 * Fetch the latest nominal Treasury yield curve from FRED (St. Louis Fed).
 *
 * Falls back to synthetic data if FRED is unreachable or no API key
 * is configured. Set `VITE_FRED_API_KEY` in a `.env` file for dev,
 * or deploy the Cloudflare Worker with `wrangler secret put FRED_API_KEY`
 * for production.
 */
export async function fetchLatestYieldCurve(
  signal?: AbortSignal,
): Promise<{ latest: YieldCurvePoint; history: YieldCurvePoint[]; isSynthetic: boolean; fallbackReason?: string; errorKind?: FetchErrorKind }> {
  try {
    const { latest, history } = await fetchFREDYieldCurve(signal);
    return { latest, history, isSynthetic: false };
  } catch (e: any) {
    const history = synthesizeYieldCurveHistory();
    return {
      latest: history[0],
      history,
      isSynthetic: true,
      fallbackReason: e?.message ?? 'FRED yield curve fetch failed. Using modeled reference values.',
      errorKind: e?.kind as FetchErrorKind | undefined,
    };
  }
}

// ---------- Real yield curve (TIPS) ----------

/**
 * Fetch the latest real (TIPS) yield curve from FRED (St. Louis Fed).
 *
 * Falls back to synthetic data if FRED is unreachable or no API key
 * is configured.
 */
export async function fetchLatestRealYieldCurve(
  signal?: AbortSignal,
): Promise<FetchResult<RealYieldCurvePoint[]>> {
  try {
    const history = await fetchFREDRealYieldCurve(signal);
    return { data: history, isSynthetic: false };
  } catch (e: any) {
    return {
      data: synthesizeRealYieldCurveHistory(),
      isSynthetic: true,
      fallbackReason: e?.message ?? 'FRED real yield curve fetch failed. Using modeled reference values.',
      errorKind: e?.kind as FetchErrorKind | undefined,
    };
  }
}

// ---------- Classify a security term into a "common" bucket ----------

/**
 * Approximates a yield % for a given (securityType, termMonths).
 * Strategy:
 *   - Map the term to the closest tenor on the latest yield curve.
 *   - Use high_yield of recent auctions for that term if we have it.
 *   - For TIPS, use the real yield curve.
 *   - For CDs, apply a small brokered-CD spread above the note yield.
 */
export interface RateInputs {
  curve: YieldCurvePoint | null;
  auctions: TreasuryAuction[];
  realCurve: RealYieldCurvePoint[];
}

export function approximateYield(
  type: TreasuryAuction['security_type'] extends infer _ ? any : never
    | 'Bill' | 'Note' | 'Bond' | 'TIPS' | 'CD',
  termMonths: number,
  inputs: RateInputs,
): number | null {
  if (type === 'TIPS') {
    const r = inputs.realCurve[0];
    if (!r) return null;
    const tenors: { months: number; key: keyof RealYieldCurvePoint }[] = [
      { months: 60, key: 'tc_5year' },
      { months: 120, key: 'tc_10year' },
      { months: 240, key: 'tc_20year' },
      { months: 360, key: 'tc_30year' },
    ];
    const nearest = nearestTenor(termMonths, tenors);
    const v = r[nearest.key];
    return v ? Number(v) : null;
  }

  const curve = inputs.curve;
  if (curve) {
    const tenors: { months: number; key: keyof YieldCurvePoint }[] = [
      { months: 1, key: 'bc_1month' },
      { months: 2, key: 'bc_2month' },
      { months: 3, key: 'bc_3month' },
      { months: 6, key: 'bc_6month' },
      { months: 12, key: 'bc_1year' },
      { months: 24, key: 'bc_2year' },
      { months: 36, key: 'bc_3year' },
      { months: 60, key: 'bc_5year' },
      { months: 84, key: 'bc_7year' },
      { months: 120, key: 'bc_10year' },
      { months: 240, key: 'bc_20year' },
      { months: 360, key: 'bc_30year' },
    ];
    const nearest = nearestTenor(termMonths, tenors);
    const v = curve[nearest.key];
    const base = v ? Number(v) : null;

    // CDs typically yield slightly above the comparable Treasury note.
    if (type === 'CD' && base !== null) return base + 0.20;

    return base;
  }

  // Fallback: average high_yield of recent auctions matching this term label.
  const termLabel = termToLabel(termMonths, type);
  if (!termLabel) return null;
  const matching = inputs.auctions.filter(
    (a) =>
      (a.security_type ?? '').toUpperCase().startsWith(type.toUpperCase()) &&
      labelMatches((a.security_term ?? '').toLowerCase(), termLabel.toLowerCase()),
  );
  if (!matching.length) return null;
  const ys = matching
    .map((a) => Number(a.high_yield ?? a.high_investment_rate ?? 0))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (!ys.length) return null;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

function nearestTenor<T>(
  termMonths: number,
  tenors: { months: number; key: any }[],
): { months: number; key: any } {
  return tenors.reduce((best, t) =>
    Math.abs(t.months - termMonths) < Math.abs(best.months - termMonths) ? t : best,
  );
}

function termToLabel(months: number, type: string): string | null {
  if (type === 'Bill') {
    if ([4, 6, 8, 13, 17, 26, 52].includes(months)) return `${months}-Week`;
    if (months === 1) return '4-Week';
    if (months === 3) return '13-Week';
    if (months === 6) return '26-Week';
    if (months === 12) return '52-Week';
    return `${months}-Month`;
  }
  return `${Math.max(1, Math.round(months / 12))}-Year`;
}

function labelMatches(a: string, b: string): boolean {
  // "13-WEEK" vs "13-week": we only care that the digit runs match.
  const num = (s: string) => (s.match(/(\d+)/) ?? [, ''])[1];
  return Boolean(num(a)) && num(a) === num(b);
}

// ---------- Synthetic alternative-data feeds ----------

export interface CpiPoint {
  date: string; // YYYY-MM
  cpi: number;
  yoy: number; // %
}

/**
 * Fetch live CPI history from FRED (series CPIAUCSL, monthly, seasonally adjusted).
 * Returns the latest `limit` months with YoY % computed from the index values.
 * Falls back to the hard-coded `CPI_HISTORY_FALLBACK` if the API is unavailable.
 */
export async function fetchCpiHistory(
  limit: number = 36,
  signal?: AbortSignal,
): Promise<{ data: CpiPoint[]; isSynthetic: boolean; fallbackReason?: string }> {
  try {
    const json = await fetchFREDJSON('CPIAUCSL', limit + 13, signal);
    const obs: { date: string; value: string }[] = json?.observations ?? [];
    if (obs.length < 13) throw new Error('Not enough CPI data points');

    const valid = obs.filter((o) => o.value !== '.' && o.value !== '' && !Number.isNaN(Number(o.value)));
    if (valid.length < 13) throw new Error('Not enough valid CPI data points');

    const data: CpiPoint[] = [];
    for (let i = 0; i < Math.min(limit, valid.length - 12); i++) {
      const current = Number(valid[i].value);
      const prior = Number(valid[i + 12].value);
      if (prior <= 0 || Number.isNaN(current) || Number.isNaN(prior)) continue;
      const yoy = Number((((current - prior) / prior) * 100).toFixed(1));
      data.push({
        date: valid[i].date.slice(0, 7), // YYYY-MM
        cpi: Number(current.toFixed(3)),
        yoy,
      });
    }
    if (data.length === 0) throw new Error('Failed to compute CPI YoY');
    return { data, isSynthetic: false };
  } catch (e: any) {
    return {
      data: CPI_HISTORY_FALLBACK,
      isSynthetic: true,
      fallbackReason: e?.message ?? 'Failed to fetch CPI from FRED.',
    };
  }
}

/** Hard-coded fallback CPI data through Dec 2024. */
export const CPI_HISTORY_FALLBACK: CpiPoint[] = [
  { date: '2022-01', cpi: 281.148, yoy: 7.5 },
  { date: '2022-02', cpi: 283.716, yoy: 7.9 },
  { date: '2022-03', cpi: 287.504, yoy: 8.5 },
  { date: '2022-04', cpi: 289.109, yoy: 8.3 },
  { date: '2022-05', cpi: 292.296, yoy: 8.6 },
  { date: '2022-06', cpi: 296.311, yoy: 9.1 },
  { date: '2022-07', cpi: 296.276, yoy: 8.5 },
  { date: '2022-08', cpi: 296.171, yoy: 8.3 },
  { date: '2022-09', cpi: 296.808, yoy: 8.2 },
  { date: '2022-10', cpi: 298.012, yoy: 7.7 },
  { date: '2022-11', cpi: 297.711, yoy: 7.1 },
  { date: '2022-12', cpi: 296.797, yoy: 6.5 },
  { date: '2023-01', cpi: 299.170, yoy: 6.4 },
  { date: '2023-02', cpi: 300.840, yoy: 6.0 },
  { date: '2023-03', cpi: 301.836, yoy: 5.0 },
  { date: '2023-04', cpi: 303.363, yoy: 4.9 },
  { date: '2023-05', cpi: 304.127, yoy: 4.0 },
  { date: '2023-06', cpi: 305.109, yoy: 3.0 },
  { date: '2023-07', cpi: 305.691, yoy: 3.2 },
  { date: '2023-08', cpi: 307.026, yoy: 3.7 },
  { date: '2023-09', cpi: 307.789, yoy: 3.7 },
  { date: '2023-10', cpi: 307.671, yoy: 3.2 },
  { date: '2023-11', cpi: 307.051, yoy: 3.1 },
  { date: '2023-12', cpi: 306.746, yoy: 3.4 },
  { date: '2024-01', cpi: 308.417, yoy: 3.1 },
  { date: '2024-02', cpi: 310.326, yoy: 3.2 },
  { date: '2024-03', cpi: 312.230, yoy: 3.5 },
  { date: '2024-04', cpi: 313.207, yoy: 4 },
  { date: '2024-05', cpi: 314.069, yoy: 3.3 },
  { date: '2024-06', cpi: 314.175, yoy: 3.0 },
  { date: '2024-07', cpi: 314.540, yoy: 2.9 },
  { date: '2024-08', cpi: 315.454, yoy: 2.7 },
  { date: '2024-09', cpi: 315.985, yoy: 2.6 },
  { date: '2024-10', cpi: 315.664, yoy: 2.6 },
  { date: '2024-11', cpi: 315.493, yoy: 2.7 },
  { date: '2024-12', cpi: 315.605, yoy: 2.9 },
];

/** Backward-compatible alias for the default CPI history. */
export const CPI_HISTORY: CpiPoint[] = CPI_HISTORY_FALLBACK;

/**
 * Market-relevant indicators used in the Research page.
 * When the FRED API key is configured, these are fetched live;
 * otherwise the static fallback values are used.
 */
export interface MarketIndicatorsSnapshot {
  fedFundsTargetLow: number;
  fedFundsTargetHigh: number;
  cpiYoY: number;
  coreCpiYoY: number;
  unemployment: number;
  tenYearYield: number;
  twoYearYield: number;
}

/** Static fallback values (late-2024 levels). Used when FRED is unreachable. */
export const INDICATORS_FALLBACK: MarketIndicatorsSnapshot = {
  fedFundsTargetHigh: 5.5,
  fedFundsTargetLow: 5.25,
  cpiYoY: 3.0,
  coreCpiYoY: 3.3,
  unemployment: 4.2,
  tenYearYield: 4.45,
  twoYearYield: 4.85,
};

/** Re-export with the old name so existing imports keep working. */
export const INDICATORS_SNAPSHOT = INDICATORS_FALLBACK;

/** FRED series IDs for macro indicators fetched live. */
const FRED_MACRO_SERIES = {
  cpi: 'CPIAUCSL',       // CPI for All Urban Consumers (monthly, index)
  unemployment: 'UNRATE', // Unemployment Rate (monthly, %)
  fedFunds: 'FEDFUNDS',   // Federal Funds Effective Rate (monthly, %)
} as const;

/**
 * Fetch the latest macro-indicator snapshot from FRED.
 * Returns live values when the API is available, otherwise falls back to
 * the static `INDICATORS_FALLBACK`.
 */
export async function fetchMacroIndicators(
  signal?: AbortSignal,
): Promise<{ data: MarketIndicatorsSnapshot; isSynthetic: boolean; fallbackReason?: string }> {
  try {
    const [cpiJson, unempJson, fedJson] = await Promise.all([
      fetchFREDJSON(FRED_MACRO_SERIES.cpi, 14, signal),
      fetchFREDJSON(FRED_MACRO_SERIES.unemployment, 2, signal),
      fetchFREDJSON(FRED_MACRO_SERIES.fedFunds, 2, signal),
    ]);

    const cpiObs: { date: string; value: string }[] = cpiJson?.observations ?? [];
    const unempObs: { date: string; value: string }[] = unempJson?.observations ?? [];
    const fedObs: { date: string; value: string }[] = fedJson?.observations ?? [];

    // CPI YoY: compare latest to 12 months prior.
    let cpiYoY = INDICATORS_FALLBACK.cpiYoY;
    if (cpiObs.length >= 13) {
      const latest = Number(cpiObs[0].value);
      const prior = Number(cpiObs[12].value);
      if (prior > 0 && !Number.isNaN(latest) && !Number.isNaN(prior)) {
        cpiYoY = Number((((latest - prior) / prior) * 100).toFixed(1));
      }
    }

    const unemployment = unempObs.length > 0 ? Number(unempObs[0].value) : INDICATORS_FALLBACK.unemployment;
    const fedRate = fedObs.length > 0 ? Number(fedObs[0].value) : INDICATORS_FALLBACK.fedFundsTargetHigh;

    return {
      data: {
        fedFundsTargetLow: Number((fedRate - 0.25).toFixed(2)),
        fedFundsTargetHigh: fedRate,
        cpiYoY,
        coreCpiYoY: Number((cpiYoY + 0.3).toFixed(1)), // approximate; BLS core series not available via this path
        unemployment: Number.isNaN(unemployment) ? INDICATORS_FALLBACK.unemployment : unemployment,
        tenYearYield: INDICATORS_FALLBACK.tenYearYield, // populated from yield curve
        twoYearYield: INDICATORS_FALLBACK.twoYearYield, // populated from yield curve
      },
      isSynthetic: false,
    };
  } catch (e: any) {
    return {
      data: INDICATORS_FALLBACK,
      isSynthetic: true,
      fallbackReason: e?.message ?? 'Failed to fetch macro indicators from FRED.',
    };
  }
}

// ---------- Synthetic fallback feeds (when the live Treasury API is unreachable) ----------
//
// IMPORTANT: these are *reference* values intended to keep the app's UI
// populated for layout/visual demonstration. They are NOT live data and
// must NOT be used for trading, tax filing, or any real-world financial
// decision. The `isSynthetic: true` flag travels with them so the UI can
// surface this caveat via the global ApiFallbackBanner.

/**
 * 90 daily snapshots of the nominal Treasury yield curve, anchored to
 * `Date.now()`. Day 0 is today; back to day 89 is ~3 months ago.
 * Base values are seeded at late-2024 nominal levels (Fed 5.25–5.5%
 * range). Each day's values are slightly perturbed by deterministic
 * sine noise so the chart shows a believable 90-day trend.
 */
export function synthesizeYieldCurveHistory(): YieldCurvePoint[] {
  const out: YieldCurvePoint[] = [];
  const todayMs = Date.now();
  for (let d = 89; d >= 0; d--) {
    const date = new Date(todayMs - d * 24 * 3600 * 1000);
    const new_date = date.toISOString().slice(0, 10);
    const drift = Math.sin((d / 89) * Math.PI * 2) * 0.18;
    out.push({
      new_date,
      bc_1month: round2(5.10 + drift + 0.06 * Math.sin(d * 0.40)),
      bc_2month: round2(5.05 + drift + 0.05 * Math.sin(d * 0.40)),
      bc_3month: round2(4.95 + drift + 0.07 * Math.sin(d * 0.35)),
      bc_6month: round2(4.70 + drift + 0.08 * Math.sin(d * 0.30)),
      bc_1year:  round2(4.40 + drift + 0.09 * Math.sin(d * 0.25)),
      bc_2year:  round2(4.20 + drift + 0.10 * Math.sin(d * 0.22)),
      bc_3year:  round2(4.10 + drift + 0.10 * Math.sin(d * 0.20)),
      bc_5year:  round2(4.20 + drift + 0.09 * Math.sin(d * 0.18)),
      bc_7year:  round2(4.30 + drift + 0.08 * Math.sin(d * 0.17)),
      bc_10year: round2(4.40 + drift + 0.07 * Math.sin(d * 0.16)),
      bc_20year: round2(4.65 + drift + 0.06 * Math.sin(d * 0.14)),
      bc_30year: round2(4.55 + drift + 0.06 * Math.sin(d * 0.13)),
    });
  }
  return out;
}

/**
 * 90 daily snapshots of the TIPS (real) yield curve, anchored to today.
 * Seed values match late-2024 nominal TIPS market levels.
 */
export function synthesizeRealYieldCurveHistory(): RealYieldCurvePoint[] {
  const out: RealYieldCurvePoint[] = [];
  const todayMs = Date.now();
  for (let d = 89; d >= 0; d--) {
    const date = new Date(todayMs - d * 24 * 3600 * 1000);
    const new_date = date.toISOString().slice(0, 10);
    const drift = Math.sin((d / 89) * Math.PI * 2) * 0.10;
    out.push({
      new_date,
      tc_5year:  round2(1.85 + drift + 0.05 * Math.sin(d * 0.30)),
      tc_10year: round2(2.05 + drift + 0.04 * Math.sin(d * 0.28)),
      tc_20year: round2(2.20 + drift + 0.03 * Math.sin(d * 0.25)),
      tc_30year: round2(2.10 + drift + 0.03 * Math.sin(d * 0.22)),
    });
  }
  return out;
}

/**
 * ~26 representative Treasury auction rows spanning ~84 days of past
 * settled auctions (with yields) AND ~62 days of upcoming scheduled
 * auctions (no yields yet). Dates are computed dynamically relative to
 * `Date.now()` so the Auctions page's view-aware sort (`date < now`
 * vs `date >= now`) still works exactly as it does with real data.
 */
export function synthesizeRecentAuctions(): TreasuryAuction[] {
  const todayMs = Date.now();
  type Spec = {
    cusip: string;
    security_type: string;
    security_term: string;
    days: number; // offset from today (negative = past, positive = upcoming)
    tendered: number;
    accepted: number;
    high_yield?: string;
    median_yield?: string;
    discount_rate?: string;
  };
  const specs: Spec[] = [
    // Past — settled with realistic yields.
    { cusip: '912797HG4', security_type: 'Bill', security_term: '4-Week',  days: -84, tendered: 85_000_000_000, accepted: 75_000_000_000, high_yield: '5.180', median_yield: '5.150', discount_rate: '5.290' },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days: -77, tendered: 78_000_000_000, accepted: 70_000_000_000, high_yield: '5.100', median_yield: '5.080', discount_rate: '5.220' },
    { cusip: '912797GK0', security_type: 'Bill', security_term: '26-Week', days: -70, tendered: 72_000_000_000, accepted: 64_000_000_000, high_yield: '4.950', median_yield: '4.920', discount_rate: '5.080' },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days: -56, tendered: 79_000_000_000, accepted: 71_000_000_000, high_yield: '5.120', median_yield: '5.100', discount_rate: '5.240' },
    { cusip: '912797HG4', security_type: 'Bill', security_term: '4-Week',  days: -49, tendered: 86_000_000_000, accepted: 76_000_000_000, high_yield: '5.220', median_yield: '5.200', discount_rate: '5.330' },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days: -42, tendered: 80_000_000_000, accepted: 72_000_000_000, high_yield: '5.080', median_yield: '5.060', discount_rate: '5.200' },
    { cusip: '91282CHU0', security_type: 'Note', security_term: '2-Year',  days: -35, tendered: 42_000_000_000, accepted: 38_000_000_000, high_yield: '4.490', median_yield: '4.470' },
    { cusip: '912797FS6', security_type: 'Bill', security_term: '4-Week',  days: -28, tendered: 87_000_000_000, accepted: 78_000_000_000, high_yield: '5.250', median_yield: '5.230', discount_rate: '5.360' },
    { cusip: '912797GK0', security_type: 'Bill', security_term: '26-Week', days: -21, tendered: 73_000_000_000, accepted: 65_000_000_000, high_yield: '4.920', median_yield: '4.900', discount_rate: '5.050' },
    { cusip: '91282CGK1', security_type: 'TIPS', security_term: '10-Year', days: -14, tendered: 18_000_000_000, accepted: 16_000_000_000, high_yield: '2.020', median_yield: '1.990' },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days:  -7, tendered: 81_000_000_000, accepted: 73_000_000_000, high_yield: '5.110', median_yield: '5.090', discount_rate: '5.230' },
    // Future — scheduled auctions, no settlement yet, so yields absent.
    { cusip: '912797HG4', security_type: 'Bill', security_term: '4-Week',  days:   1, tendered: 86_000_000_000, accepted: 0 },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days:   2, tendered: 80_000_000_000, accepted: 0 },
    { cusip: '912797GK0', security_type: 'Bill', security_term: '26-Week', days:   3, tendered: 73_000_000_000, accepted: 0 },
    { cusip: '91282CHU0', security_type: 'Note', security_term: '2-Year',  days:   5, tendered: 42_000_000_000, accepted: 0 },
    { cusip: '91282CFV1', security_type: 'Note', security_term: '5-Year',  days:   6, tendered: 65_000_000_000, accepted: 0 },
    { cusip: '912810TM0', security_type: 'Bond', security_term: '30-Year', days:  11, tendered: 25_000_000_000, accepted: 0 },
    { cusip: '912797FS6', security_type: 'Bill', security_term: '4-Week',  days:  15, tendered: 86_000_000_000, accepted: 0 },
    { cusip: '912797GH7', security_type: 'Bill', security_term: '13-Week', days:  16, tendered: 81_000_000_000, accepted: 0 },
    { cusip: '91282CGK1', security_type: 'TIPS', security_term: '10-Year', days:  20, tendered: 18_000_000_000, accepted: 0 },
    { cusip: '912797GK0', security_type: 'Bill', security_term: '26-Week', days:  31, tendered: 73_000_000_000, accepted: 0 },
    { cusip: '91282CHU0', security_type: 'Note', security_term: '2-Year',  days:  34, tendered: 42_000_000_000, accepted: 0 },
    { cusip: '912810TM0', security_type: 'Bond', security_term: '30-Year', days:  39, tendered: 25_000_000_000, accepted: 0 },
    { cusip: '912797HG4', security_type: 'Bill', security_term: '4-Week',  days:  43, tendered: 86_000_000_000, accepted: 0 },
    { cusip: '91282CGK1', security_type: 'TIPS', security_term: '10-Year', days:  48, tendered: 18_000_000_000, accepted: 0 },
    { cusip: '91282CFV1', security_type: 'Note', security_term: '5-Year',  days:  62, tendered: 65_000_000_000, accepted: 0 },
  ];
  return specs.map((s) => {
    const dateMs = todayMs + s.days * 24 * 3600 * 1000;
    const auction_date = new Date(dateMs).toISOString().slice(0, 10);
    const row: TreasuryAuction = {
      auction_date,
      cusip: s.cusip,
      security_type: s.security_type,
      security_term: s.security_term,
      t_bill_or_bond: s.security_type,
      average_median_yield: s.median_yield,
      average_median_award_yield: s.median_yield,
      high_yield: s.high_yield,
      high_discount_rate: s.discount_rate,
      high_investment_rate: s.high_yield,
      total_tendered: String(s.tendered),
      total_accepted: s.accepted > 0 ? String(s.accepted) : '',
    };
    return row;
  });
}

function round2(n: number): string {
  return n.toFixed(2);
}
