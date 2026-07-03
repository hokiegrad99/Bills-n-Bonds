import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CachedRates, SecurityType, YieldCurvePoint } from './types';
import type { FetchErrorKind } from './types';
import {
  fetchLatestRealYieldCurve,
  fetchLatestYieldCurve,
  fetchRecentAuctions,
} from './treasury-api';

// Bumped from v1 → v2 when fetchRecentAuctions started including future
// auctions (instead of just past). Old v1 caches only contain past rows,
// which would silently leave the Upcoming tab empty for users with stale
// localStorage state for up to 6 hours.
const RATES_KEY = 'bnb.rates.v2';
// Previous-key so we can migrate user-set yield overrides forward when
// bumping the cache version.
const LEGACY_RATES_KEY = 'bnb.rates.v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
/** Retry sooner after transient failures — 30 seconds. */
const TRANSIENT_RETRY_MS = 1000 * 30;

const emptyRates: CachedRates = {
  fetchedAt: '',
  yieldByTerm: {},
  yieldByTermOverrides: {},
  yieldCurve: [],
  realYieldCurve: [],
  recentAuctions: [],
};

interface RatesContextValue {
  rates: CachedRates;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  setYieldOverride: (securityType: SecurityType, termMonths: number, yieldPct: number) => void;
  removeYieldOverride: (securityType: SecurityType, termMonths: number) => void;
  lookup: (type: SecurityType, termMonths: number) => number | null;
}

const RatesContext = createContext<RatesContextValue | null>(null);

export function RatesProvider({ children }: { children: React.ReactNode }) {
  const [rates, setRates] = useState<CachedRates>(() => {
    // Load current cache (v2), falling back to emptyRates on miss or parse error.
    let base: CachedRates;
    try {
      const raw = localStorage.getItem(RATES_KEY);
      base = raw ? ({ ...emptyRates, ...JSON.parse(raw) } as CachedRates) : emptyRates;
    } catch {
      base = emptyRates;
    }
    // One-time v1→v2 migration. Synchronous so it cannot race with a
    // user's immediate `setYieldOverride` interaction (which would
    // otherwise land in `base` first then be clobbered by a delayed
    // migration effect). Carry forward only `yieldByTermOverrides` —
    // those are durable user choices the broadened fetcher will not
    // re-derive. Other v1 fields are intentionally not migrated since
    // the new fetcher recomputes them on the next refresh.
    try {
      const legacyRaw = localStorage.getItem(LEGACY_RATES_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as Partial<CachedRates>;
        const legacyOverrides = parsed.yieldByTermOverrides ?? {};
        base = {
          ...base,
          yieldByTermOverrides: { ...legacyOverrides, ...base.yieldByTermOverrides },
        };
        localStorage.removeItem(LEGACY_RATES_KEY);
      }
    } catch {
      /* ignore */
    }
    return base;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() =>
    rates.fetchedAt ? new Date(rates.fetchedAt) : null,
  );
  const aborter = useRef<AbortController | null>(null);

  // Persist rates to localStorage on changes.
  useEffect(() => {
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(rates));
    } catch {
      /* ignore */
    }
  }, [rates]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    aborter.current?.abort();
    aborter.current = new AbortController();
    const signal = aborter.current.signal;
    try {
      const [auctionsResult, curveResult, realResult] = await Promise.all([
        fetchRecentAuctions(120, signal),
        fetchLatestYieldCurve(signal),
        fetchLatestRealYieldCurve(signal),
      ]);
      const auctions = auctionsResult.data;
      const real = realResult.data;
      // curveResult.history is now non-null because the fetcher falls back
      // to a synthetic curve when the live API is unreachable.
      const curveHistory = curveResult.history;
      const curveLatest = curveResult.latest;
      const computed = computeYieldByTerm(auctions, curveLatest, real);
      setRates((prev) => ({
        ...prev,
        fetchedAt: new Date().toISOString(),
        // Surface a global banner if ANY of the three feeds came from the
        // synthetic fallback. The banner copy calls this out loudly so
        // users don't mistake modeled numbers for live data.
        // Aggregate: surface banner if ANY of three feeds is synthetic; show first encountered upstream error message.
        // Pick the most informative error kind. Priority: no-api-key > permanent > network > transient.
        errorKind: pickWorstErrorKind([
          auctionsResult.errorKind,
          curveResult.errorKind,
          realResult.errorKind,
        ]),
        fallbackReason:
          auctionsResult.fallbackReason ||
          curveResult.fallbackReason ||
          realResult.fallbackReason,
        isSynthetic:
          auctionsResult.isSynthetic ||
          curveResult.isSynthetic ||
          realResult.isSynthetic,
        recentAuctions: auctions,
        yieldCurve: curveHistory,
        realYieldCurve: real,
        yieldByTerm: { ...prev.yieldByTerm, ...computed },
      }));
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch rates');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh on first mount if cache is stale or missing.
  // Use a much shorter retry window when the cached data is synthetic
  // from a transient failure, so the app self-heals quickly.
  useEffect(() => {
    const age = rates.fetchedAt ? Date.now() - new Date(rates.fetchedAt).getTime() : Infinity;
    const isTransient = rates.isSynthetic && (rates.errorKind === 'transient' || rates.errorKind === 'network');
    const ttl = isTransient ? TRANSIENT_RETRY_MS : CACHE_TTL_MS;
    if (age > ttl) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setYieldOverride = useCallback<RatesContextValue['setYieldOverride']>(
    (securityType, termMonths, yieldPct) => {
      setRates((prev) => ({
        ...prev,
        yieldByTermOverrides: {
          ...prev.yieldByTermOverrides,
          [key(securityType, termMonths)]: yieldPct,
        },
      }));
    },
    [],
  );

  const removeYieldOverride = useCallback<RatesContextValue['removeYieldOverride']>(
    (securityType, termMonths) => {
      setRates((prev) => {
        const next = { ...prev.yieldByTermOverrides };
        delete next[key(securityType, termMonths)];
        return { ...prev, yieldByTermOverrides: next };
      });
    },
    [],
  );

  const lookup = useCallback<RatesContextValue['lookup']>(
    (type, termMonths) => {
      const k = key(type, termMonths);
      if (k in rates.yieldByTermOverrides) return rates.yieldByTermOverrides[k];
      return rates.yieldByTerm[k] ?? null;
    },
    [rates],
  );

  const value = useMemo<RatesContextValue>(
    () => ({
      rates,
      loading,
      error,
      lastUpdated,
      refresh,
      setYieldOverride,
      removeYieldOverride,
      lookup,
    }),
    [rates, loading, error, lastUpdated, refresh, setYieldOverride, removeYieldOverride, lookup],
  );

  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

export function useRates(): RatesContextValue {
  const ctx = useContext(RatesContext);
  if (!ctx) throw new Error('useRates must be used within RatesProvider');
  return ctx;
}

function key(t: SecurityType, m: number): string {
  return `${t}:${m}`;
}

/**
 * From a list of error kinds (one per feed), pick the "worst" — the one
 * that should drive the banner's message. Priority: no-api-key > permanent > network > transient.
 * Returns undefined when all inputs are undefined (all feeds succeeded).
 */
const ERROR_KIND_PRIORITY: FetchErrorKind[] = ['no-api-key', 'permanent', 'network', 'transient'];
function pickWorstErrorKind(kinds: (FetchErrorKind | undefined)[]): FetchErrorKind | undefined {
  const defined = kinds.filter(Boolean) as FetchErrorKind[];
  if (defined.length === 0) return undefined;
  for (const kind of ERROR_KIND_PRIORITY) {
    if (defined.includes(kind)) return kind;
  }
  return defined[0];
}

function computeYieldByTerm(
  auctions: { security_type?: string; security_term?: string; high_yield?: string; high_investment_rate?: string }[],
  curve: YieldCurvePoint | null,
  real: any[],
): Record<string, number> {
  const out: Record<string, number> = {};

  // Helper: find nearest tenor on the curve.
  function fromCurve(termMonths: number, securityType: SecurityType): number | null {
    if (securityType === 'TIPS' && real.length) {
      const tenors = [60, 120, 240, 360];
      const nearest = tenors.reduce((a, b) =>
        Math.abs(b - termMonths) < Math.abs(a - termMonths) ? b : a,
      );
      const key = `tc_${nearest / 12}year` as 'tc_5year' | 'tc_10year' | 'tc_20year' | 'tc_30year';
      const v = real[0]?.[key];
      return v ? Number(v) : null;
    }
    if (!curve) return null;
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
    const nearest = tenors.reduce((a, b) =>
      Math.abs(b.months - termMonths) < Math.abs(a.months - termMonths) ? b : a,
    );
    const v = curve[nearest.key];
    const base = v ? Number(v) : null;
    return securityType === 'CD' && base !== null ? base + 0.2 : base;
  }

  // Predefined typical bill/note/bond/CD terms.
  const presets: { type: SecurityType; months: number }[] = [
    { type: 'Bill', months: 1 },
    { type: 'Bill', months: 1.5 },
    { type: 'Bill', months: 2 },
    { type: 'Bill', months: 3 },
    { type: 'Bill', months: 4.25 },
    { type: 'Bill', months: 6 },
    { type: 'Bill', months: 12 },
    { type: 'Note', months: 24 },
    { type: 'Note', months: 36 },
    { type: 'Note', months: 60 },
    { type: 'Note', months: 84 },
    { type: 'Bond', months: 120 },
    { type: 'Bond', months: 240 },
    { type: 'Bond', months: 360 },
    { type: 'CD', months: 6 },
    { type: 'CD', months: 12 },
    { type: 'CD', months: 24 },
    { type: 'CD', months: 60 },
    { type: 'TIPS', months: 60 },
    { type: 'TIPS', months: 120 },
    { type: 'TIPS', months: 240 },
  ];

  for (const p of presets) {
    const v = fromCurve(p.months, p.type);
    if (v !== null) out[key(p.type, p.months)] = v;
  }

  return out;
}
