import { useMemo, useState } from 'react';
import { ChevronRight, RefreshCcw, Filter } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SecurityType, TreasuryAuction } from '../lib/types';
import { SECURITY_TYPES, SECURITY_TYPE_META } from '../lib/types';
import { fetchRecentAuctions } from '../lib/treasury-api';
import { useRates } from '../lib/rates-cache';
import { Card } from '../components/ui/Card';
import { TypeBadge } from '../components/ui/TypeBadge';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDateISO, fmtUSD } from '../lib/format';
import { cn } from '../lib/cn';

const TYPE_LABELS: Record<string, SecurityType> = {
  BILL: 'Bill',
  BOND: 'Bond',
  NOTE: 'Note',
  TIPS: 'TIPS',
  CMB: 'Bill', // Cash Management Bills are types of bills
  'TIPS NOTE': 'TIPS',
};

function normalizeType(t: string | undefined): SecurityType {
  if (!t) return 'Bill';
  const upper = t.trim().toUpperCase();
  if (upper.includes('TIPS')) return 'TIPS';
  if (upper.includes('NOTE')) return 'Note';
  if (upper.includes('BOND')) return 'Bond';
  if (upper.includes('BILL') || upper.includes('CMB')) return 'Bill';
  return (SECURITY_TYPES as string[]).includes(upper)
    ? (upper as SecurityType)
    : 'Bill';
}

export function AuctionsPage() {
  const { rates, lastUpdated, loading, refresh } = useRates();
  // Default to 'recent' so the data the cache actually contains is shown
  // immediately on first load; the Treasury fetch returns the most-recent
  // sorted DESC by auction_date (i.e. past results), so defaulting to
  // 'upcoming' would always show the empty state.
  const [view, setView] = useState<'upcoming' | 'recent'>('recent');
  const [filter, setFilter] = useState<Set<SecurityType>>(new Set());
  // Recompute on every render instead of freezing via useState so that
  // leaving the tab open past midnight doesn't drift the upcoming/recent
  // partitioning. This is cheap (a single Date ctor) and the useMemo below
  // re-runs only when its other deps change.
  const now = new Date();

  // Toggle a filter chip
  function toggleFilter(t: SecurityType) {
    setFilter((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Group recent by type for a yield-by-type chart
  const recentByType = useMemo(() => {
    const map = new Map<SecurityType, { count: number; avg: number; sum: number }>();
    for (const a of rates.recentAuctions ?? []) {
      const t = normalizeType(a.security_type);
      const av = Number(a.high_yield ?? a.high_investment_rate ?? 0);
      if (!av) continue;
      const v = map.get(t) ?? { count: 0, avg: 0, sum: 0 };
      v.count++;
      v.sum += av;
      v.avg = v.sum / v.count;
      map.set(t, v);
    }
    return Array.from(map.entries()).map(([type, v]) => ({
      type,
      avgYield: v.avg,
      count: v.count,
    }));
  }, [rates.recentAuctions]);

  // Compute the visible table rows AND past-available count in a single
  // pass so both values stay perfectly in sync (and `now` is read once per
  // memo invalidation, not twice). `pastCount > 0` is used by the empty
  // state to surface a "switch to Recent" CTA when the user is on the
  // Upcoming tab but the cache only contains past results.
  const { visible, pastCount } = useMemo(() => {
    const all = rates.recentAuctions ?? [];
    const wantsPast = view === 'recent';
    // Use a dedicated inner counter so the outer `pastCount` returned
    // value doesn't visually shadow a same-named inner accumulator.
    let pastSeen = 0;
    const rows: TreasuryAuction[] = [];
    for (const a of all) {
      if (filter.size > 0 && !filter.has(normalizeType(a.security_type))) continue;
      const isPast = new Date(a.auction_date) < now;
      if (isPast) pastSeen++;
      // For the active view, only the matching date-direction bucket holds
      // viewable rows. (`past === wantsPast` is true exactly when this row
      // belongs to the current tab.)
      if (isPast === wantsPast) rows.push(a);
    }
    rows.sort((a, b) => {
      const da = new Date(a.auction_date).getTime();
      const db = new Date(b.auction_date).getTime();
      return wantsPast ? db - da : da - db;
    });
    return { visible: rows.slice(0, 50), pastCount: pastSeen };
  }, [rates.recentAuctions, filter, now, view]);

  // The RatesProvider auto-refreshes on first mount when the cache is stale,
  // so no separate refresh is needed here.

  return (
    <div className="space-y-6">
      <Card
        accent="amber"
        eyebrow="Calendar"
        title="Treasury Auction Calendar"
        action={
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mr-2">
              <span>Data:</span>
              <button
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-100"
              >
                <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
                {lastUpdated
                  ? `Refreshed ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Refresh'}
              </button>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 flex">
              {(['upcoming', 'recent'] as const).map((v) => (
                <button
                  key={v}
                  className={cn('pill-tab', view === v && 'pill-tab-active')}
                  onClick={() => setView(v)}
                >
                  {v === 'upcoming' ? 'Upcoming' : 'Recent Results'}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Filter by type:
          </span>
          <button
            className={cn('pill-tab', filter.size === 0 && 'pill-tab-active')}
            onClick={() => setFilter(new Set())}
          >
            All
          </button>
          {SECURITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleFilter(t)}
              className={cn('pill-tab', filter.has(t) && 'pill-tab-active')}
              style={filter.has(t) ? { boxShadow: `inset 3px 0 0 ${SECURITY_TYPE_META[t].color}` } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: SECURITY_TYPE_META[t].color }}
              />
              {t}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <Card accent="brand" title="Auctions" eyebrow={`${visible.length} matching`} className="xl:col-span-2" bodyClassName="p-0">
          {visible.length === 0 ? (
            <div className="p-6">
              {loading ? (
                <EmptyState
                  icon={<RefreshCcw size={20} className="animate-spin" />}
                  title="Fetching…"
                  description="Calling the Treasury Fiscal Data API."
                />
              ) : view === 'upcoming' && pastCount > 0 ? (
                <EmptyState
                  icon={<ChevronRight size={20} />}
                  title="Auctions have settled"
                  description="These are recent results, not upcoming. Switch tabs to view them."
                  action={
                    <button className="btn-primary" onClick={() => setView('recent')}>
                      <ChevronRight size={14} /> View recent results
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<RefreshCcw size={20} />}
                  title="No auctions to show"
                  description={
                    view === 'upcoming'
                      ? 'No scheduled auctions match your filters, or the API is unavailable.'
                      : 'Recently settled auctions will appear once the data refreshes.'
                  }
                  action={
                    <button className="btn-primary" onClick={refresh} disabled={loading}>
                      <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Term</th>
                    <th>CUSIP</th>
                    <th>Auction</th>
                    {view === 'recent' && <th className="text-right">High Yield</th>}
                    {view === 'recent' && <th className="text-right">Avg Yield</th>}
                    <th className="text-right">
                      {view === 'upcoming' ? 'Total Tendered' : 'Total Accepted'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a, idx) => {
                    const normType = normalizeType(a.security_type);
                    return (
                      <tr key={idx}>
                        <td>
                          <TypeBadge type={normType} />
                        </td>
                        <td className="font-medium">{a.security_term || '—'}</td>
                        <td className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {a.cusip || '—'}
                        </td>
                        <td className="tabular-nums">{fmtDateISO(a.auction_date)}</td>
                        {view === 'recent' && (
                          <td className="text-right tabular-nums">
                            {fmtPctMaybe(a.high_yield ?? a.high_discount_rate)}
                          </td>
                        )}
                        {view === 'recent' && (
                          <td className="text-right tabular-nums">
                            {fmtPctMaybe(
                              a.average_median_yield ??
                                a.average_median_award_yield,
                            )}
                          </td>
                        )}
                        <td className="text-right tabular-nums">
                          {fmtUSDMaybe(
                            view === 'upcoming' ? a.total_tendered : a.total_accepted,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card accent="accent" title="Yield by Recent Auctions" eyebrow="Avg high yield" className="xl:col-span-1">
          {recentByType.length === 0 ? (
            <EmptyState title="Awaiting data" description="Recent auctions will populate this chart on next refresh." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={recentByType} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="avgYield" radius={[6, 6, 0, 0]}>
                    {recentByType.map((d) => (
                      <Cell key={d.type} fill={SECURITY_TYPE_META[d.type as SecurityType]?.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Source: modeled reference data (deterministic, anchored to today). The live Treasury
        Fiscal Data feed is currently disabled at the application layer while the upstream
        CORS policy + Cloudflare Workers\u2194Treasury TLS path are unavailable. Cached for fast
        repeat loads. Click the refresh button to roll the auction schedule forward.
      </div>
    </div>
  );
}

function fmtUSDMaybe(v: string | undefined): string {
  if (!v) return '—';
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return v;
  return fmtUSD(n, { compact: true });
}

function fmtPctMaybe(v: string | undefined): string {
  if (!v) return '—';
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return v;
  return n.toFixed(2) + '%';
}
