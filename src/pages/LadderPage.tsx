import { useCallback, useMemo, useState } from 'react';
import { Layers, Sparkles, Wand2 } from 'lucide-react';
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
import { useHoldings } from '../lib/storage';
import {
  cashFlowProjection,
  buildLadderSchedule,
  suggestLadder,
  buildCustomLadder,
  TERMS_BY_TYPE,
} from '../lib/calc';
import type { LadderRung } from '../lib/calc';
import type { SecurityType } from '../lib/types';
import { SECURITY_TYPES, SECURITY_TYPE_META } from '../lib/types';
import { Card } from '../components/ui/Card';
import { TypeBadge } from '../components/ui/TypeBadge';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { fmtUSD } from '../lib/format';
import { cn } from '../lib/cn';

type LadderMode = 'custom' | 'staggered';

// Short-term Bill week counts — the Treasury auction cycle uses 4 / 6 / 8 / 13
// / 17 / 26 / 52-week tenors. Single source of truth for both the visible
// chip label (e.g. "6W") and the screen-reader aria-label ("6-Week").
const billWeekCount: Record<number, number> = {
  1: 4,
  1.5: 6,
  2: 8,
  3: 13,
  4.25: 17,
  6: 26,
  12: 52,
};

function termMonthLabel(m: number): string {
  if (billWeekCount[m] !== undefined) return `${billWeekCount[m]}W`;
  if (m < 12) return `${m}M`;
  if (m % 12 === 0) return `${Math.round(m / 12)}Y`;
  return `${m}M`;
}

function termChipLabel(m: number): string {
  return termMonthLabel(m);
}

function termChipAriaLabel(t: SecurityType, m: number): string {
  if (t === 'Bill' && billWeekCount[m] !== undefined) {
    return `Toggle ${billWeekCount[m]}-Week ${t}`;
  }
  if (m < 12) return `Toggle ${m}-month ${t}`;
  return `Toggle ${Math.round(m / 12)}-year ${t}`;
}

export function LadderPage() {
  const { holdings } = useHoldings();

  // Shared inputs
  const [budget, setBudget] = useState(50000);
  const [startAtMonth, setStartAtMonth] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  // Smart-stagger inputs (legacy)
  const [rungs, setRungs] = useState(6);
  const [monthStep, setMonthStep] = useState(1);

  // Customize inputs (new)
  const [mode, setMode] = useState<LadderMode>('custom');
  const [customTypes, setCustomTypes] = useState<Set<SecurityType>>(() => new Set());
  const [customTermsByType, setCustomTermsByType] = useState<Record<SecurityType, Set<number>>>(
    () =>
      Object.fromEntries(
        SECURITY_TYPES.map((t) => [t, new Set<number>()]),
      ) as Record<SecurityType, Set<number>>,
  );

  /**
   * Per-rung yield lookup. The app no longer fetches live Treasury/FRED
   * data, so the ladder is fed by:
   *   1. The user's PAGE-LOCAL override (values entered directly in the
   *      ladder table — session-scoped, perfect for "what if" planning).
   *   2. `suggestLadder` / `buildCustomLadder` apply a hard-coded fallback
   *      when no override is set (see `lib/calc.ts`).
   * Both layers are deterministic — no network, no jitter, suitable for
   * repeated re-renders.
   */
  const yieldsFor = useCallback(
    (type: SecurityType, m: number): number | null => {
      const k = `${type}:${m}`;
      if (k in overrides) return overrides[k];
      return null;
    },
    [overrides],
  );

  // Live cash-flow projection (from existing holdings)
  const cf = useMemo(() => cashFlowProjection(holdings, 24), [holdings]);

  const ladder: LadderRung[] = useMemo(() => {
    if (mode === 'custom') {
      const termsByType: Partial<Record<SecurityType, number[]>> = {};
      const sortedTypes = Array.from(customTypes).sort(
        (a, b) => SECURITY_TYPES.indexOf(a) - SECURITY_TYPES.indexOf(b),
      );
      for (const t of sortedTypes) {
        const arr = Array.from(customTermsByType[t] ?? new Set<number>()).sort(
          (a, b) => a - b,
        );
        if (arr.length) termsByType[t] = arr;
      }
      return buildCustomLadder(sortedTypes, termsByType, budget, yieldsFor);
    }
    return suggestLadder(budget, rungs, yieldsFor, startAtMonth);
  }, [mode, customTypes, customTermsByType, budget, yieldsFor, rungs, startAtMonth]);

  const schedule = useMemo(
    () =>
      buildLadderSchedule(
        ladder,
        mode === 'custom' ? 'one-shot' : 'cyclic',
        startAtMonth,
        monthStep,
      ),
    [mode, ladder, startAtMonth, monthStep],
  );

  /**
   * Apply a per-rung, session-local yield override. The values are kept
   * in component state (NOT persisted to localStorage) so the ladder
   * generator behaves as a pure "what-if" tool — refreshing the page
   * resets to the reference yields in `lib/calc.ts`.
   */
  function applyOverride(type: SecurityType, term: number, value: number) {
    setOverrides((prev) => ({ ...prev, [`${type}:${term}`]: value }));
  }
  function dropOverride(type: SecurityType, term: number) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[`${type}:${term}`];
      return next;
    });
  }

  const customHasTypes = customTypes.size > 0;
  const customHasAnyTerms = Array.from(customTypes).some(
    (t) => (customTermsByType[t]?.size ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      {/* Cash flow projection card */}
      <Card accent="accent" eyebrow="Expected Cash Flow" title="From your existing holdings">
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={cf} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
              <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="principal" name="Principal" stackId="a" fill="#345dff" />
              <Bar dataKey="interest" name="Interest" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Maturity calendar */}
      <Card accent="amber" eyebrow="Calendar" title="Upcoming Maturity Calendar" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Type</th>
                <th>Institution</th>
                <th>Term</th>
                <th className="text-right">Face</th>
                <th className="text-right">Interest</th>
              </tr>
            </thead>
            <tbody>
              {cf.flatMap((c) => {
                const monthItems = holdings.filter(
                  (h) => h.maturityDate.slice(0, 7) === c.month && h.purchaseDate <= c.month + '-28',
                );
                return monthItems.map((h) => (
                  <tr key={`${c.month}-${h.id}`}>
                    <td className="tabular-nums font-medium">{c.month}</td>
                    <td><TypeBadge type={h.securityType} /></td>
                    <td>{h.institution}</td>
                    <td>{h.termMonths >= 12 ? `${Math.round(h.termMonths / 12)}Y` : `${h.termMonths}M`}</td>
                    <td className="text-right tabular-nums">{fmtUSD(h.faceValue)}</td>
                    <td className="text-right tabular-nums">{fmtUSD(h.interestEarned, { cents: true })}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
          {cf.every((c) => c.principal === 0 && c.interest === 0) && (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              No upcoming maturities in the next 24 months. Add holdings to populate this view.
            </div>
          )}
        </div>
      </Card>

      {/* Ladder generator */}
      <Card accent="brand" eyebrow="Tool" title="Bond / Bill Ladder Generator">
        {/* Mode toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <button
            className={cn('pill-tab', mode === 'custom' && 'pill-tab-active')}
            onClick={() => setMode('custom')}
          >
            <Wand2 size={14} /> Customize types &amp; terms
          </button>
          <button
            className={cn('pill-tab', mode === 'staggered' && 'pill-tab-active')}
            onClick={() => setMode('staggered')}
          >
            <Layers size={14} /> Smart stagger
          </button>
          <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
            {mode === 'custom'
              ? `${ladder.length} rung${ladder.length === 1 ? '' : 's'} selected`
              : `Auto-generated ${ladder.length} rung${ladder.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Shared inputs */}
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <LadderField label="Total Budget (USD)">
            <input
              className="input tabular-nums text-right"
              type="number"
              min={0}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </LadderField>
          <LadderField label="First Maturity in (months)">
            <input
              className="input tabular-nums text-right"
              type="number"
              min={0}
              max={360}
              step={1}
              value={startAtMonth}
              onChange={(e) => setStartAtMonth(Number(e.target.value))}
            />
          </LadderField>
        </div>

        {/* Mode-specific inputs */}
        {mode === 'staggered' ? (
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            <LadderField label="Number of Rungs">
              <input
                className="input tabular-nums text-right"
                type="number"
                min={1}
                max={12}
                step={1}
                value={rungs}
                onChange={(e) => setRungs(Number(e.target.value))}
              />
            </LadderField>
            <LadderField label="Step Between Rungs (months)">
              <input
                className="input tabular-nums text-right"
                type="number"
                min={1}
                max={12}
                step={1}
                value={monthStep}
                onChange={(e) => setMonthStep(Number(e.target.value))}
              />
            </LadderField>
          </div>
        ) : (
          <div className="space-y-4 mb-4">
            <div>
              <div className="label-eyebrow mb-2">Holding Types</div>
              <div className="flex flex-wrap gap-2">
                {SECURITY_TYPES.map((t) => {
                  const active = customTypes.has(t);
                  return (
                    <button
                      key={t}
                      className={cn('pill-tab', active && 'pill-tab-active')}
                      onClick={() => {
                        const next = new Set(customTypes);
                        if (active) next.delete(t);
                        else next.add(t);
                        setCustomTypes(next);
                      }}
                    >
                      <TypeBadge type={t} showLabel={false} />
                      <span>{t}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {customHasTypes ? (
              <div className="space-y-3">
                {Array.from(customTypes)
                  .sort(
                    (a, b) => SECURITY_TYPES.indexOf(a) - SECURITY_TYPES.indexOf(b),
                  )
                  .map((t) => (
                    <div key={t}>
                      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>{t} terms</span>
                        <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {customTermsByType[t]?.size ?? 0} of {TERMS_BY_TYPE[t].length} selected
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {TERMS_BY_TYPE[t].map((m) => {
                          const active = customTermsByType[t]?.has(m) ?? false;
                          return (
                            <button
                              key={m}
                              className={cn('pill-tab text-xs', active && 'pill-tab-active')}
                              onClick={() => {
                                const s = new Set(customTermsByType[t] ?? new Set<number>());
                                if (active) s.delete(m);
                                else s.add(m);
                                setCustomTermsByType({ ...customTermsByType, [t]: s });
                              }}
                              aria-pressed={active}
                              aria-label={termChipAriaLabel(t, m)}
                            >
                              {termChipLabel(m)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                {!customHasAnyTerms && (
                  <div className="card p-3 text-sm text-slate-600 dark:text-slate-300">
                    Select at least one term (duration) for your selected securities.
                  </div>
                )}
              </div>
            ) : (
              <div className="card p-3 text-sm text-slate-600 dark:text-slate-300">
                Select at least one security type to build your custom ladder.
              </div>
            )}
          </div>
        )}

        <div className="card p-3 mb-4 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
          <Wand2 size={14} className="text-brand-600 dark:text-brand-300 mt-0.5 shrink-0" />
          <div>
            {mode === 'custom' ? (
              <>
                The generator allocates budget equally across your selected
                (type, term) pairs. Yields come from any custom value you enter
                in the table below — when blank, the generator uses a
                hard-coded reference yield for that (type, term) bucket. Your
                custom values are session-local and reset on page refresh.
              </>
            ) : (
              <>
                The generator uses a hard-coded reference yield for each
                (security type, term-months) bucket, and assigns them in
                sequence to your staggered ladder. Adjust any number below to
                override the reference yield for "what if" planning — your
                edits live until you refresh.
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Rung</th>
                <th>Security</th>
                <th>Term</th>
                <th className="text-right">Allocation</th>
                <th className="text-right">Yield (editable)</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {ladder.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
                    {mode === 'custom'
                      ? 'No rungs yet — pick at least one type and one term above.'
                      : 'No rungs — increase budget or rung count.'}
                  </td>
                </tr>
              ) : (
                ladder.map((r, i) => {
                  const k = `${r.securityType}:${r.termMonths}`;
                  const isOverride = k in overrides;
                  return (
                    <tr key={`${r.securityType}-${r.termMonths}-${i}`}>
                      <td className="font-semibold tabular-nums">#{i + 1}</td>
                      <td><TypeBadge type={r.securityType} /></td>
                      <td>{termChipLabel(r.termMonths)}</td>
                      <td className="text-right tabular-nums">{fmtUSD(r.monthlyCashValue, { cents: true })}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          className="input w-24 text-right tabular-nums"
                          value={(isOverride ? overrides[k] : r.estimatedYield).toFixed(2)}
                          onChange={(e) => applyOverride(r.securityType, r.termMonths, Number(e.target.value))}
                        />
                      </td>
                      <td className="text-xs text-slate-500 dark:text-slate-400">
                        {isOverride ? (
                          <button className="underline" onClick={() => dropOverride(r.securityType, r.termMonths)}>
                            custom (reset)
                          </button>
                        ) : (
                          <span>reference</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="label-eyebrow mb-1">Weighted Avg Yield</div>
            <div className="text-2xl font-semibold tabular-nums">
              {ladder.length === 0
                ? '—'
                : (
                    ladder.reduce(
                      (s, r) => s + r.estimatedYield * r.monthlyCashValue,
                      0,
                    ) / Math.max(1, ladder.reduce((s, r) => s + r.monthlyCashValue, 0))
                  ).toFixed(2) + '%'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Across all rungs, weighted by allocation.
            </div>
          </div>
          <div className="card p-4">
            <div className="label-eyebrow mb-1">Projected Maturity Cash Flow</div>
            <div className="text-2xl font-semibold tabular-nums">
              {fmtUSD(schedule.reduce((s, p) => s + p.amount, 0), { compact: true })}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Across {schedule.length} payment event{schedule.length === 1 ? '' : 's'}.
            </div>
          </div>
        </div>
      </Card>

      {/* Staggered schedule chart */}
      <Card accent="violet" eyebrow="Schedule" title="Stacked Maturity Schedule">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={schedule} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => termMonthLabel(v)}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
              <Tooltip
                content={<ChartTooltip valueFormatter={(v) => fmtUSD(v)} />}
                labelFormatter={(v: number) => termMonthLabel(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="amount" name="Maturity proceeds" radius={[6, 6, 0, 0]}>
                {schedule.map((p, i) => (
                  <Cell key={i} fill={SECURITY_TYPE_META[p.securityType]?.color ?? '#345dff'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <Layers size={12} />
        Strategy tip: Use equal allocations and stagger every 2-3 months for the steepest
        curve. Longer rungs earn more, but tying up cash for 30 years may not match your needs.
      </div>
    </div>
  );
}

function LadderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
