import { useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Percent,
  Sigma,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHoldings } from '../lib/storage';
import { useRates } from '../lib/rates-cache';
import { KPICard } from '../components/ui/KPICard';
import { Card } from '../components/ui/Card';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { effectiveStatus, summarize } from '../lib/calc';
import { fmtInt, fmtPct, fmtUSD } from '../lib/format';
import { SECURITY_TYPE_META, SECURITY_TYPES } from '../lib/types';
import type { SecurityType } from '../lib/types';

interface TreasurySecurityRow {
  label: string;
  type: SecurityType;
  secYield: number;
  change: number; // % change in yield
}

/**
 * Map of tenor keys to display metadata. Used to build the live
 * "US Treasuries — current yields" table from the FRED yield curve data.
 */
const TENOR_ROWS: { label: string; type: SecurityType; curveKey: string }[] = [
  { label: '3-Month Bill',  type: 'Bill',  curveKey: 'bc_3month' },
  { label: '6-Month Bill',  type: 'Bill',  curveKey: 'bc_6month' },
  { label: '1-Year Bill',   type: 'Bill',  curveKey: 'bc_1year' },
  { label: '2-Year Note',   type: 'Note',  curveKey: 'bc_2year' },
  { label: '3-Year Note',   type: 'Note',  curveKey: 'bc_3year' },
  { label: '5-Year Note',   type: 'Note',  curveKey: 'bc_5year' },
  { label: '7-Year Note',   type: 'Note',  curveKey: 'bc_7year' },
  { label: '10-Year Note',  type: 'Note',  curveKey: 'bc_10year' },
  { label: '20-Year Bond',  type: 'Bond',  curveKey: 'bc_20year' },
  { label: '30-Year Bond',  type: 'Bond',  curveKey: 'bc_30year' },
  { label: '5-Year TIPS',   type: 'TIPS',  curveKey: 'tc_5year' },
  { label: '10-Year TIPS',  type: 'TIPS',  curveKey: 'tc_10year' },
];

export function YieldsPage() {
  const { holdings } = useHoldings();
  const { rates } = useRates();

  const summary = useMemo(() => summarize(holdings), [holdings]);

  const aggregates = useMemo(() => {
    let activeFace = 0, maturedFace = 0, activeInterest = 0, maturedInterest = 0;
    let activeYieldNum = 0, activeYieldDen = 0, maturedYieldNum = 0, maturedYieldDen = 0;
    for (const h of holdings) {
      const eff = effectiveStatus(h);
      if (eff === 'Active') {
        activeFace += h.faceValue;
        activeInterest += h.interestEarned;
        activeYieldNum += h.highRate * h.faceValue;
        activeYieldDen += h.faceValue;
      } else if (eff === 'Matured') {
        maturedFace += h.faceValue;
        maturedInterest += h.interestEarned;
        maturedYieldNum += h.highRate * h.faceValue;
        maturedYieldDen += h.faceValue;
      }
    }
    return {
      activeFace,
      maturedFace,
      activeInterest,
      maturedInterest,
      avgActive: activeYieldDen ? activeYieldNum / activeYieldDen : 0,
      avgMatured: maturedYieldDen ? maturedYieldNum / maturedYieldDen : 0,
    };
  }, [holdings]);

  const yieldTrendSeries = useMemo(() => {
    // Build a 90-day trend from the cached yield curve history.
    const lastN = (rates.yieldCurve ?? []).slice(0, 30).reverse();
    return lastN.map((p) => ({
      date: p.new_date,
      '3M': num(p.bc_3month),
      '2Y': num(p.bc_2year),
      '10Y': num(p.bc_10year),
      '30Y': num(p.bc_30year),
    }));
  }, [rates.yieldCurve]);

  const realYieldSeries = useMemo(() => {
    return (rates.realYieldCurve ?? []).slice(0, 30).reverse().map((p) => ({
      date: p.new_date,
      '5Y Real': num(p.tc_5year),
      '10Y Real': num(p.tc_10year),
    }));
  }, [rates.realYieldCurve]);

  // Build live "US Treasuries — current yields" table from FRED yield curve data.
  const treasuryList = useMemo<TreasurySecurityRow[]>(() => {
    const latest = rates.yieldCurve[0];
    const prev = rates.yieldCurve[1];
    const latestReal = rates.realYieldCurve[0];
    const prevReal = rates.realYieldCurve[1];
    if (!latest) return [];
    return TENOR_ROWS.map((r) => {
      const isTIPS = r.type === 'TIPS';
      const src = isTIPS ? latestReal : latest;
      const srcPrev = isTIPS ? prevReal : prev;
      const val = src ? Number((src as any)[r.curveKey]) : NaN;
      const valPrev = srcPrev ? Number((srcPrev as any)[r.curveKey]) : NaN;
      const secYield = Number.isFinite(val) ? val : 0;
      const change = Number.isFinite(val) && Number.isFinite(valPrev) ? Number((val - valPrev).toFixed(3)) : 0;
      return { label: r.label, type: r.type, secYield, change };
    });
  }, [rates.yieldCurve, rates.realYieldCurve]);

  // Build a "yield by security" chart based on user's holdings, bucketed by type.
  const byType = useMemo(() => {
    const map = new Map<SecurityType, { sumRate: number; den: number; count: number }>();
    for (const h of holdings) {
      if (effectiveStatus(h) !== 'Active') continue;
      const v = map.get(h.securityType) ?? { sumRate: 0, den: 0, count: 0 };
      v.sumRate += h.highRate * h.faceValue;
      v.den += h.faceValue;
      v.count++;
      map.set(h.securityType, v);
    }
    return Array.from(map.entries()).map(([type, v]) => ({
      type,
      avgYield: v.den ? v.sumRate / v.den : 0,
      count: v.count,
    }));
  }, [holdings]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard
          label="Active Holdings"
          value={fmtInt(summary.activeCount)}
          icon={Wallet}
          accent="brand"
          hint={`${fmtUSD(aggregates.activeFace, { compact: true })} face value`}
        />
        <KPICard
          label="Matured Holdings"
          value={fmtInt(summary.maturedCount)}
          icon={Sigma}
          accent="violet"
          hint={`${fmtUSD(aggregates.maturedFace, { compact: true })} face value`}
        />
        <KPICard
          label="Interest Earned (Active)"
          value={fmtUSD(aggregates.activeInterest, { compact: true })}
          icon={Percent}
          accent="accent"
          hint={`Avg yield ${aggregates.avgActive.toFixed(2)}%`}
        />
        <KPICard
          label="Interest Earned (Matured)"
          value={fmtUSD(aggregates.maturedInterest, { compact: true })}
          icon={Percent}
          accent="amber"
          hint={`Avg yield ${aggregates.avgMatured.toFixed(2)}%`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <Card accent="amber" title="Yield Trend — Recent Treasury Auctions" eyebrow="90-day trend">
          {yieldTrendSeries.length < 2 ? (
            <EmptyState title="Not enough data yet" description="Awaiting a yield-curve history fetch." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={yieldTrendSeries} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="3M" stroke="#3b82f6" dot={false} />
                  <Line type="monotone" dataKey="2Y" stroke="#10b981" dot={false} />
                  <Line type="monotone" dataKey="10Y" stroke="#8b5cf6" dot={false} />
                  <Line type="monotone" dataKey="30Y" stroke="#f59e0b" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card accent="violet" title="Real (TIPS) Yields" eyebrow="Inflation-adjusted">
          {realYieldSeries.length < 2 ? (
            <EmptyState title="Not enough data yet" description="Latest real yield curve will appear once the API refreshes." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={realYieldSeries} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="5Y Real" stroke="#10b981" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="10Y Real" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Yield by security type (user portfolio) */}
      <Card accent="accent" title="Yields by Security" eyebrow="Your portfolio · active only">
        {byType.length === 0 ? (
          <EmptyState title="No active holdings" description="Add a holding to break down by type." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {SECURITY_TYPES.map((t) => {
              const row = byType.find((b) => b.type === t);
              const avg = row?.avgYield ?? 0;
              return (
                <div key={t} className="card p-3">
                  <div className="label-eyebrow">{t}</div>
                  <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: SECURITY_TYPE_META[t].color }}>
                    {row ? avg.toFixed(2) + '%' : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {row ? `${row.count} active holding${row.count === 1 ? '' : 's'}` : 'No active holdings'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card accent="brand" eyebrow="Reference" title="US Treasuries — current yields" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Security</th>
                <th>Type</th>
                <th className="text-right">Yield</th>
                <th className="text-right">Change (1d)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {treasuryList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
                    Awaiting yield curve data — click Refresh rates above.
                  </td>
                </tr>
              ) : (
                treasuryList.map((row) => (
                  <tr key={row.label}>
                    <td className="font-medium">{row.label}</td>
                    <td>
                      <span
                        className="badge ring-inset"
                        style={{
                          color: SECURITY_TYPE_META[row.type].color,
                          background: SECURITY_TYPE_META[row.type].bg,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: SECURITY_TYPE_META[row.type].color }}
                        />
                        {row.type}
                      </span>
                    </td>
                    <td className="text-right tabular-nums font-semibold">{row.secYield.toFixed(2)}%</td>
                    <td className="text-right tabular-nums">
                      <span
                        className={
                          row.change > 0
                            ? 'text-accent-700 dark:text-accent-300'
                            : row.change < 0
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-slate-500'
                        }
                      >
                        {row.change > 0 ? '+' : ''}{row.change.toFixed(3)}%
                      </span>
                    </td>
                    <td className="text-right">
                      {row.change > 0 ? (
                        <ArrowUpRight size={14} className="inline text-accent-600" />
                      ) : row.change < 0 ? (
                        <ArrowDownRight size={14} className="inline text-rose-600" />
                      ) : (
                        <Minus size={14} className="inline text-slate-400" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
          Yields sourced live from the St. Louis Fed (FRED) yield curve. Click{' '}
          <a
            href="https://www.cnbc.com/markets/us-treasurys/"
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            cnbc.com/markets/us-treasurys
          </a>{' '}
          for additional reference.
        </div>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Tip: {fmtPct(100 * 0.045)} average yields translate roughly to ${(50000 * 0.045).toFixed(0)} in annual interest on a $50,000 portfolio.
      </div>
    </div>
  );
}

function num(v: string | undefined): number {
  if (!v) return Number.NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}
