// Locale-aware number, USD and percent formatters.

const usdCache = new Map<string, Intl.NumberFormat>();
const pctCache = new Map<string, Intl.NumberFormat>();
const intCache = new Map<string, Intl.NumberFormat>();

function get(map: Map<string, Intl.NumberFormat>, key: string, factory: () => Intl.NumberFormat) {
  let f = map.get(key);
  if (!f) {
    f = factory();
    map.set(key, f);
  }
  return f;
}

export function fmtUSD(value: number, opts: { compact?: boolean; cents?: boolean } = {}): string {
  const cacheKey = JSON.stringify(opts);
  const f = get(usdCache, cacheKey, () =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.cents ? 2 : opts.compact ? 1 : 0,
      minimumFractionDigits: opts.cents ? 2 : opts.compact ? 0 : 0,
    }),
  );
  return f.format(value);
}

export function fmtPct(value: number, decimals: number = 2): string {
  const key = `d${decimals}`;
  const f = get(pctCache, key, () =>
    new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  );
  return f.format(value / 100);
}

export function fmtInt(value: number): string {
  return get(intCache, 'default', () =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  ).format(value);
}

export const fmtDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

export function fmtDateISO(iso: string | undefined | null): string {
  if (!iso) return '—';
  // "YYYY-MM-DD" strings are STORED as local-component dates in this app
  // (see `toISODate` in lib/calc.ts). Parsing them via `new Date(iso)`
  // interprets them as UTC midnight — which displays one day earlier in
  // negative-offset timezones. Reconstruct a local Date from the components
  // to keep round-trip fidelity. Full ISO timestamps (e.g. Treasury
  // auction_date strings like "2025-07-15T13:00:00-04:00") still fall
  // through to the `new Date(iso)` path because they fail the date-only
  // regex match.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    return fmtDate.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  try {
    return fmtDate.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function termLabel(months: number): string {
  if (months < 12) return `${months}-Month`;
  const y = months / 12;
  return Number.isInteger(y) ? `${y}-Year` : `${y.toFixed(1)}-Year`;
}
