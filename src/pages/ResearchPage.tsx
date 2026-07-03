import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Gauge,
  Newspaper,
  ShieldCheck,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useRates } from '../lib/rates-cache';
import { CPI_HISTORY, INDICATORS_SNAPSHOT, fetchCpiHistory, fetchMacroIndicators } from '../lib/treasury-api';
import { Card } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import type { NewsItem, TreasuryEtf } from '../lib/types';
import type { CpiPoint } from '../lib/treasury-api';

const NEWS: NewsItem[] = [
  {
    title: 'Treasury yields fall despite rate hike concerns',
    source: 'CNBC',
    publishedAt: '2026-06-23',
    url: 'https://www.cnbc.com/us-treasurys/',
    summary:
      'U.S. Treasury yields retreated slightly as investors balanced concerns over potential Federal Reserve rate hikes against the impact on global tech stocks; markets remain focused on upcoming inflation data.',
  },
  {
    title: 'Fed projections lift rate hike bets for 2026',
    source: 'Reuters',
    publishedAt: '2026-06-17',
    url: 'https://www.reuters.com/',
    summary:
      'New dot-plot projections from the June FOMC meeting showed nine Fed officials anticipate at least one rate hike by year-end 2026, marking a hawkish shift under new Chair Kevin Warsh.',
  },
  {
    title: '2-year Treasury note yield hits highest since Feb 2025',
    source: 'CNBC',
    publishedAt: '2026-06-22',
    url: 'https://www.cnbc.com/us-treasurys/',
    summary:
      'Stronger-than-expected economic signals pushed the 2-year Treasury yield — the bellwether for short-term Fed policy expectations — to its highest point in over a year.',
  },
  {
    title: 'Treasuries pare drop in oil-driven market move',
    source: 'Yahoo Finance',
    publishedAt: '2026-06-08',
    url: 'https://finance.yahoo.com/',
    summary:
      'Treasury yields saw significant volatility driven by energy sector concerns and fluctuating labor market data, reflecting a sensitive response to geopolitical and economic catalysts.',
  },
  {
    title: 'Brokered CD rates hold above 4% amid rate uncertainty',
    source: 'American Banker',
    publishedAt: '2026-06-05',
    url: 'https://www.americanbanker.com/',
    summary:
      'Multiple brokered platforms continue to quote 12-month CDs above 4.00%, offering a modest premium over comparable short-term Treasuries as the Fed holds rates steady.',
  },
];

const RECOMMENDATIONS = [
  {
    title: 'Self-liquidating TIPS ladder for retirement income',
    body:
      'Build a ladder of TIPS with staggered maturities to create a predictable, inflation-adjusted stream of income. Holding to maturity eliminates market-price risk and locks in the guaranteed real return.',
    source: 'Morningstar, Feb 2026',
  },
  {
    title: 'Pair TIPS ladder with an equity kicker',
    body:
      'A modest 15% equity allocation alongside a TIPS ladder preserves the safety of inflation-protected income while allowing the equity portion to appreciate over a 30-year horizon, creating a cushion for bequests or unexpected expenses.',
    source: 'Morningstar Retirement Income Research, 2026',
  },
  {
    title: 'Manage duration carefully amid hawkish Fed',
    body:
      'With the Fed signaling potential rate hikes under Chair Warsh, avoid over-extending duration in nominal bonds. Where inflation protection is the primary goal, TIPS are the default tool — provided you can hold to maturity.',
    source: 'Forbes, Jun 2026',
  },
];

const ETFS: TreasuryEtf[] = [
  { ticker: 'SHV',  name: '0-1 Year Treasury',    duration: 'Ultra-Short',    ytdReturn: 1.63, yieldPct: 3.53, Sharpe: 1.3, riskScore: 1 },
  { ticker: 'SHY',  name: '1-3 Year Treasury',    duration: 'Short',          ytdReturn: 0.42, yieldPct: 3.98, Sharpe: 1.0, riskScore: 2 },
  { ticker: 'IEI',  name: '3-7 Year Treasury',    duration: 'Intermediate',   ytdReturn: 0.03, yieldPct: 4.10, Sharpe: 0.8, riskScore: 4 },
  { ticker: 'GOVT', name: 'Broad US Treasury',    duration: 'Intermediate',   ytdReturn: 0.67, yieldPct: 4.31, Sharpe: 0.9, riskScore: 5 },
  { ticker: 'TLT',  name: '20+ Year Treasury',    duration: 'Long',           ytdReturn: 2.01, yieldPct: 4.84, Sharpe: 0.5, riskScore: 9 },
  { ticker: 'VGLT', name: 'Long Treasury',        duration: 'Long',           ytdReturn: 1.55, yieldPct: 4.60, Sharpe: 0.5, riskScore: 9 },
  { ticker: 'BIL',  name: '1-3 Month T-Bill',     duration: 'Ultra-Short',    ytdReturn: 0.80, yieldPct: 3.65, Sharpe: 1.4, riskScore: 1 },
  { ticker: 'VGIT', name: 'Intermediate Treasury', duration: 'Intermediate',   ytdReturn: 0.10, yieldPct: 4.29, Sharpe: 0.8, riskScore: 4 },
];

export function ResearchPage() {
  const { rates } = useRates();
  const [liveCpi, setLiveCpi] = useState<CpiPoint[]>(CPI_HISTORY);
  const [liveIndicators, setLiveIndicators] = useState(INDICATORS_SNAPSHOT);
  const [cpiIsLive, setCpiIsLive] = useState(false);
  const [indicatorsIsLive, setIndicatorsIsLive] = useState(false);

  // Fetch live CPI and macro indicators from FRED on mount.
  useEffect(() => {
    const ac = new AbortController();
    fetchCpiHistory(36, ac.signal).then((r) => {
      if (!r.isSynthetic && r.data.length > 0) {
        setLiveCpi(r.data);
        setCpiIsLive(true);
      }
    }).catch(() => {});
    fetchMacroIndicators(ac.signal).then((r) => {
      if (!r.isSynthetic) {
        // Merge live indicators with yield curve data for 10y/2y.
        setLiveIndicators((prev) => ({
          ...r.data,
          tenYearYield: prev.tenYearYield,
          twoYearYield: prev.twoYearYield,
        }));
        setIndicatorsIsLive(true);
      }
    }).catch(() => {});
    return () => ac.abort();
  }, []);

  const yieldCurve = rates.yieldCurve[0] ?? null;
  const realCurve = rates.realYieldCurve[0] ?? null;
  const yieldCurveHistory = rates.yieldCurve.slice(0, 12).reverse();

  // Update 10y/2y from yield curve when available.
  useEffect(() => {
    if (yieldCurve) {
      setLiveIndicators((prev) => ({
        ...prev,
        tenYearYield: Number(yieldCurve.bc_10year) || prev.tenYearYield,
        twoYearYield: Number(yieldCurve.bc_2year) || prev.twoYearYield,
      }));
    }
  }, [yieldCurve]);

  const curvePoints = useMemo(() => {
    if (!yieldCurve) return [];
    // Per-tenor real yields when available; otherwise null (so the line stays broken).
    const numOrNull = (v: string | undefined): number | null =>
      v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
    const realByTenor: Record<number, number | null> = realCurve
      ? {
          60: numOrNull(realCurve.tc_5year),
          120: numOrNull(realCurve.tc_10year),
          240: numOrNull(realCurve.tc_20year),
          360: numOrNull(realCurve.tc_30year),
        }
      : { 60: null, 120: null, 240: null, 360: null };
    const t = (m: number, k: keyof typeof yieldCurve) => ({
      tenorLabel: tenorLabel(m),
      yieldPct: Number((yieldCurve as any)[k]),
      realYieldPct: realByTenor[m] ?? null,
    });
    return [
      t(1, 'bc_1month'), t(3, 'bc_3month'), t(6, 'bc_6month'),
      t(12, 'bc_1year'), t(24, 'bc_2year'), t(36, 'bc_3year'),
      t(60, 'bc_5year'), t(120, 'bc_10year'), t(240, 'bc_20year'), t(360, 'bc_30year'),
    ];
  }, [yieldCurve, realCurve]);

  const cpiSeries = liveCpi.map((p) => ({
    date: p.date,
    YoY: p.yoy,
    CPI: p.cpi,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard
          label="10y / 2y Spread"
          value={
            yieldCurve
              ? (Number(yieldCurve.bc_10year) - Number(yieldCurve.bc_2year)).toFixed(0) + ' bp'
              : ((liveIndicators.tenYearYield - liveIndicators.twoYearYield) * 100).toFixed(0) + ' bp'
          }
          icon={Gauge}
          accent={
            yieldCurve && Number(yieldCurve.bc_10year) < Number(yieldCurve.bc_2year) ? 'rose' : 'accent'
          }
          trend={
            yieldCurve
              ? {
                  direction:
                    Number(yieldCurve.bc_10year) >= Number(yieldCurve.bc_2year) ? 'up' : 'down',
                  label: Number(yieldCurve.bc_10year) >= Number(yieldCurve.bc_2year) ? 'Positive' : 'Inverted',
                }
              : undefined
          }
          hint="Negative = recession signal"
        />
        <KPICard
          label="CPI (12m)"
          value={liveIndicators.cpiYoY.toFixed(1) + '%'}
          icon={Gauge}
          accent={liveIndicators.cpiYoY > 2.5 ? 'amber' : 'accent'}
          hint={`Core ${liveIndicators.coreCpiYoY.toFixed(1)}%${cpiIsLive ? ' · live' : ''}`}
        />
        <KPICard
          label="Fed Funds Target"
          value={`${liveIndicators.fedFundsTargetLow.toFixed(2)}–${liveIndicators.fedFundsTargetHigh.toFixed(2)}%`}
          icon={ShieldCheck}
          accent="brand"
          hint={`Upper bound of the FOMC range${indicatorsIsLive ? ' · live' : ''}`}
        />
        <KPICard
          label="Unemployment"
          value={liveIndicators.unemployment.toFixed(1) + '%'}
          icon={Brain}
          accent="violet"
          hint={`BLS U-3, most recent${indicatorsIsLive ? ' · live' : ''}`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <Card accent="amber" title="US Treasury Yield Curve" eyebrow="Latest snapshot" className="xl:col-span-2">
          {curvePoints.length === 0 ? (
            <EmptyHint message="Awaiting Treasury yield curve data…" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={curvePoints} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="tenorLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
                  <Line type="monotone" dataKey="yieldPct" name="Nominal" stroke="#345dff" strokeWidth={2.5} dot />
                  <Line
                    type="monotone"
                    dataKey="realYieldPct"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    name="10y Real (TIPS)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card accent="violet" title="Crossover Performance" eyebrow="Curve evolution" className="xl:col-span-1">
          {yieldCurveHistory.length === 0 ? (
            <EmptyHint message="Awaiting historical yield data…" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={yieldCurveHistory} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="new_date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="bc_2year" stroke="#10b981" dot={false} />
                  <Line type="monotone" dataKey="bc_10year" stroke="#8b5cf6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <Card accent="rose" title="CPI Year-over-Year" eyebrow="Headline · BLS" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={cpiSeries} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={2} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Target ~2%', fontSize: 10, position: 'right' }} />
                <Line type="monotone" dataKey="YoY" name="CPI YoY" stroke="#345dff" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card accent="brand" title="Fed Outlook & Key Indicators" eyebrow="Macro" className="xl:col-span-1">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <FedRow
              label="Fed Funds Target (high)"
              value={`${liveIndicators.fedFundsTargetHigh.toFixed(2)}%`}
              direction="flat"
              note="Upper bound of FOMC range."
            />
            <FedRow
              label="10y Treasury"
              value={`${liveIndicators.tenYearYield.toFixed(2)}%`}
              direction="down"
              note="From yield curve."
            />
            <FedRow
              label="2y Treasury"
              value={`${liveIndicators.twoYearYield.toFixed(2)}%`}
              direction="down"
              note="From yield curve."
            />
            <FedRow
              label="Headline CPI"
              value={`${liveIndicators.cpiYoY.toFixed(1)}%`}
              direction="down"
              note={cpiIsLive ? 'Live from FRED.' : 'Fallback; API key needed.'}
            />
            <FedRow
              label="Core CPI"
              value={`${liveIndicators.coreCpiYoY.toFixed(1)}%`}
              direction="flat"
              note="Approximate from headline CPI."
            />
            <FedRow
              label="U-3 Unemployment"
              value={`${liveIndicators.unemployment.toFixed(1)}%`}
              direction="up"
              note={indicatorsIsLive ? 'Live from FRED.' : 'Fallback; API key needed.'}
            />
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <Card accent="accent" title="Treasury ETF Risk-Reward" eyebrow="Scatter · StreetStats-style" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis type="number" dataKey="riskScore" name="Risk" domain={[0, 10]} tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="ytdReturn" name="YTD Return (%)" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <ZAxis type="number" dataKey="yieldPct" range={[60, 400]} name="Yield" />
                <Tooltip cursor={false} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(2)}%`} />} />
                <Scatter data={ETFS} fill="#345dff">
                  {ETFS.map((e, i) => (
                    <Cell key={i} fill={ETF_COLOR(e.duration)} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {ETFS.map((e) => (
              <div key={e.ticker} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ETF_COLOR(e.duration) }} />
                <span className="font-mono">{e.ticker}</span>
                <span className="text-slate-500 dark:text-slate-400 truncate">{e.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Inspired by{' '}
            <a className="underline" href="https://streetstats.finance/rates/treasury-ETF-risk-reward" target="_blank" rel="noreferrer noopener">
              streetstats.finance/rates/treasury-ETF-risk-reward
            </a>
            . Bubbles positioned by risk vs YTD return; bubble size = yield.
          </div>
        </Card>

        <Card accent="accent" title="News & Expert Recommendations" eyebrow="Market intelligence" className="xl:col-span-1">
          <div className="space-y-3">
            <div>
              <div className="label-eyebrow flex items-center gap-1.5 mb-1">
                <Newspaper size={12} /> Recent headlines
              </div>
              <ul className="space-y-2">
                {NEWS.map((n, i) => (
                  <li key={i}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm font-medium hover:underline"
                    >
                      {n.title}
                    </a>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {n.source} · {n.publishedAt}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{n.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="label-eyebrow flex items-center gap-1.5 mb-1">
                <Brain size={12} /> Recommendations
              </div>
              <ul className="space-y-2.5">
                {RECOMMENDATIONS.map((r, i) => (
                  <li key={i} className="card p-3">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{r.body}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{r.source}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function tenorLabel(months: number) {
  return months < 12 ? `${months}M` : `${Math.round(months / 12)}Y`;
}

function ETF_COLOR(d: TreasuryEtf['duration']) {
  return d === 'Ultra-Short' ? '#10b981' :
         d === 'Short' ? '#22c55e' :
         d === 'Intermediate' ? '#f59e0b' :
         '#8b5cf6';
}

function FedRow({
  label,
  value,
  direction,
  note,
}: {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'flat';
  note: string;
}) {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowUpRight;
  const cls =
    direction === 'up' ? 'text-accent-700 dark:text-accent-300' :
    direction === 'down' ? 'text-rose-700 dark:text-rose-300' :
    'text-slate-600 dark:text-slate-300';
  return (
    <li className="py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{note}</div>
      </div>
      <div className={`text-sm font-semibold tabular-nums inline-flex items-center ${cls}`}>
        <Icon size={12} className="mr-0.5" />
        {value}
      </div>
    </li>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="h-44 grid place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
      {message}
    </div>
  );
}
