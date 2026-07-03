import {
  Banknote,
  Calendar,
  CircleCheck,
  Coins,
  PiggyBank,
  Layers,
  ListTree,
  Clock,
  CircleDollarSign,
  StickyNote,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Line,
  LineChart,
} from 'recharts';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useHoldings } from '../lib/storage';
import {
  cashFlowProjection,
  effectiveStatus,
  nextMaturity,
  portfolioByTerm,
  portfolioByType,
  summarize,
  upcomingMaturities,
} from '../lib/calc';
import { KPICard } from '../components/ui/KPICard';
import { Card } from '../components/ui/Card';
import { TypeBadge } from '../components/ui/TypeBadge';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { fmtDateISO, fmtUSD } from '../lib/format';
import { SECURITY_TYPE_META } from '../lib/types';

// Shared className for clickable deep-link rows in Dashboard lists
// (Recent Activity / Upcoming Maturities / Scheduled Purchases). Keep
// all three lists visually consistent — any future tweak (e.g. a ring
// on focus) lands here once.
const DEEPLINK_ROW_CLASS =
  'py-2.5 flex items-center gap-3 rounded-md px-2 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/50 focus-visible:outline-none transition-colors';

export function DashboardPage() {
  const { holdings } = useHoldings();
  const summary = useMemo(() => summarize(holdings), [holdings]);
  const byType = useMemo(() => portfolioByType(holdings), [holdings]);
  const byTerm = useMemo(() => portfolioByTerm(holdings), [holdings]);
  const cf = useMemo(() => cashFlowProjection(holdings, 12), [holdings]);
  const next = useMemo(() => nextMaturity(holdings), [holdings]);
  const upcoming = useMemo(() => upcomingMaturities(holdings, 60), [holdings]);

  const recent = useMemo(() => {
    // Filter out Matured holdings so the "Most Recently Added" surface
    // reflects only currently-tracked rows. Matured holdings drop out of
    // the user's outstanding pool (see summarize() totalFaceValue) so
    // surfacing them here as "recent activity" would be misleading.
    return [...holdings]
      .filter((h) => effectiveStatus(h) !== 'Matured')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [holdings]);

  const recentlySettled = useMemo(() => {
    // Companion strip to "Recent Activity": only holdings whose
    // effectiveStatus is Matured, sorted by maturityDate DESC so the
    // most recently settled rows appear first. Reuses the same
    // deep-link wrapping so clicking a row opens its edit modal on
    // the Holdings page.
    return [...holdings]
      .filter((h) => effectiveStatus(h) === 'Matured')
      .sort((a, b) => b.maturityDate.localeCompare(a.maturityDate))
      .slice(0, 6);
  }, [holdings]);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <KPICard
          label="Total Face Value"
          value={fmtUSD(summary.totalFaceValue, { compact: true })}
          icon={Banknote}
          accent="brand"
          hint={`${summary.activeCount} active · ${summary.maturedCount} matured`}
        />
        <KPICard
          label="Interest — Month"
          value={fmtUSD(summary.totalInterestMTD, { compact: true })}
          icon={Coins}
          accent="accent"
          hint="Current calendar month"
        />
        <KPICard
          label="Interest — YTD"
          value={fmtUSD(summary.totalInterestYTD, { compact: true })}
          icon={TrendingUp}
          accent="accent"
          hint="Current calendar year"
        />
        <KPICard
          label="Interest — Total"
          value={fmtUSD(summary.totalInterestEarned, { compact: true })}
          icon={CircleDollarSign}
          accent="accent"
          hint="All-time, all holdings"
        />
        <KPICard
          label="Active Holdings"
          value={summary.activeCount}
          icon={Layers}
          accent="violet"
          hint={`Avg yield ${summary.avgYieldActive.toFixed(2)}%`}
        />
        <KPICard
          label="Next Maturity"
          value={next ? fmtUSD(next.faceValue, { compact: true }) : '—'}
          icon={Calendar}
          accent="amber"
          hint={next ? `${fmtDateISO(next.maturityDate)} · ${next.institution}` : 'No upcoming maturity'}
          to={next ? `/holdings?id=${encodeURIComponent(next.id)}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        {/* Portfolio by Type */}
        <Card title="Portfolio by Type" eyebrow="Allocation" className="xl:col-span-1" accent="brand">
          {byType.length === 0 ? (
            <EmptyHint message="Add holdings to see allocation by security type." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="type" stroke="none" innerRadius={50}>
                    {byType.map((d) => (
                      <Cell key={d.type} fill={SECURITY_TYPE_META[d.type].color} />
                    ))}
                  </Pie>
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Portfolio by Term */}
        <Card title="Portfolio by Term" eyebrow="Bucketed" className="xl:col-span-2" accent="brand">
          {byTerm.every((b) => b.value === 0) ? (
            <EmptyHint message="Add holdings to see allocation by maturity bucket." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={byTerm} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#345dff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        {/* Cash-flow projection */}
        <Card title="Projected Cash Flow" eyebrow="Next 12 months" className="xl:col-span-2" accent="violet">
          {cf.every((c) => c.principal + c.interest === 0) ? (
            <EmptyHint message="No maturities scheduled in the next 12 months." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={cf} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="principal" name="Principal" stackId="a" fill="#345dff" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="interest" name="Interest" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Upcoming maturities */}
        <Card title="Upcoming Maturities" eyebrow="Next 60 days" className="xl:col-span-1" accent="amber">
          {upcoming.length === 0 ? (
            <EmptyHint message="You have no maturities in the next 60 days." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <Link
                    to={`/holdings?id=${encodeURIComponent(h.id)}`}
                    className={DEEPLINK_ROW_CLASS}
                  >
                    <TypeBadge type={h.securityType} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{h.institution}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Matures {fmtDateISO(h.maturityDate)} · {h.termMonths >= 12 ? `${Math.round(h.termMonths / 12)}Y` : `${h.termMonths}M`}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-sm font-semibold">{fmtUSD(h.faceValue, { compact: true })}</div>
                      <div className="text-[11px] text-accent-700 dark:text-accent-300">
                        +${h.interestEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        {/* Recent transactions */}
        <Card title="Recent Activity" eyebrow="Most recently added" accent="brand">
          {recent.length === 0 ? (
            <EmptyHint
              message={
                holdings.length === 0
                  ? 'No holdings yet — add one to get started.'
                  : "All recent holdings have settled — toggle 'Hide matured holdings' off on the Holdings page to view them."
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((h) => (
                <li key={h.id}>
                  <Link
                    to={`/holdings?id=${encodeURIComponent(h.id)}`}
                    className={DEEPLINK_ROW_CLASS}
                  >
                    <TypeBadge type={h.securityType} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        Purchased {fmtUSD(h.faceValue, { compact: true })} of {h.securityType}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> {fmtDateISO(h.purchaseDate)} · {h.institution}
                      </div>
                    </div>
                    <div className="text-right tabular-nums text-sm">
                      @ {h.highRate.toFixed(2)}%
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Scheduled purchases / renewals */}
        <Card title="Scheduled Purchases & Renewals" eyebrow="Auto-reinvest" accent="violet">
          {holdings.filter((h) => h.autoReinvest).length === 0 ? (
            <EmptyHint message="Enable 'Auto-Reinvest' on any holding to roll it into a new rung." icon={<PiggyBank size={20} />} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {holdings
                .filter((h) => h.autoReinvest)
                .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))
                .map((h) => (
                  <li key={h.id}>
                  <Link
                    to={`/holdings?id=${encodeURIComponent(h.id)}`}
                    className={DEEPLINK_ROW_CLASS}
                  >
                      <ListTree size={14} className="text-brand-600 dark:text-brand-300" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {fmtUSD(h.faceValue, { compact: true })} {h.securityType} ladder rung
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Matures {fmtDateISO(h.maturityDate)} · auto-rolls into new {h.termMonths}M {h.securityType}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recently settled strip — only shows when at least one holding
          has matured, so the empty-state "no non-matured to surface"
          branch is no longer the only signal that settlements exist. */}
      <Card title="Recently Settled" eyebrow="Most recent maturities" accent="amber">
        {recentlySettled.length === 0 ? (
          <EmptyHint message="No holdings have settled yet — they'll appear here as their maturity date passes." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentlySettled.map((h) => (
              <li key={h.id}>
                <Link
                  to={`/holdings?id=${encodeURIComponent(h.id)}`}
                  className={DEEPLINK_ROW_CLASS}
                >
                  <TypeBadge type={h.securityType} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      Settled {fmtUSD(h.faceValue, { compact: true })} of {h.securityType}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <CircleCheck size={10} /> Matured {fmtDateISO(h.maturityDate)} · {h.institution}
                    </div>
                  </div>
                  <div className="text-right tabular-nums text-sm">
                    <div className="text-accent-700 dark:text-accent-300 font-semibold">
                      +${h.interestEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      earned
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Net cash-flow line */}
      <Card title="Net Cash Flow Schedule" eyebrow="Principal + Interest over time" accent="accent">
        {cf.every((c) => c.principal === 0 && c.interest === 0) ? (
          <EmptyHint message="No projected cash flow yet." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={cf} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
                <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="principal" stroke="#345dff" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="interest" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <StickyNote size={12} />
        Tip: All numbers are recomputed live from your holdings. Data is stored only in this browser.
      </div>
    </div>
  );
}

function EmptyHint({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="h-44 grid place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
      <div>
        {icon ? <div className="mb-2 flex justify-center">{icon}</div> : null}
        {message}
      </div>
    </div>
  );
}
