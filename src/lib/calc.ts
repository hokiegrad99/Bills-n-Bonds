import type { Holding, SecurityType } from './types';
import { SECURITY_TYPES } from './types';

// ---------- Date helpers ----------

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setMonth(targetMonth);
  // Handle overflow when source day > days in target month (e.g. Jan 31 + 1 month).
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function toISODate(date: Date): string {
  // Use LOCAL components rather than UTC so the stored YYYY-MM-DD matches
  // the user's calendar date. Previously `date.toISOString().slice(0, 10)`
  // would shift the value one day earlier or later for users in negative-
  // offset timezones (e.g. late-evening PST storing the next UTC day).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}

export function isMatured(h: Holding, asOf: Date = new Date()): boolean {
  return fromISODate(h.maturityDate).getTime() <= asOf.getTime();
}

/**
 * True iff the holding's maturity date is within the next 7 calendar days
 * (inclusive of today). Both endpoints are normalised to local midnight so
 * `daysBetween`'s round cannot introduce a sub-day off-by-one.
 */
export function isWithin7Days(h: Holding, asOf: Date = new Date()): boolean {
  const asOfMidnight = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const daysToMaturity = daysBetween(asOfMidnight, fromISODate(h.maturityDate));
  return daysToMaturity >= 0 && daysToMaturity <= 7;
}

export function effectiveStatus(h: Holding, asOf: Date = new Date()): Holding['status'] {
  if (h.status === 'Sold') return 'Sold';
  if (h.status === 'Pending') return 'Pending';
  // Date-derived 'Pending': within [today, today+7] inclusive. Evaluated
  // BEFORE `isMatured` so the holding stays Pending for the FULL mat-date
  // day, flipping to Matured the day after.
  if (isWithin7Days(h, asOf)) return 'Pending';
  if (isMatured(h, asOf)) return 'Matured';
  return 'Active';
}

// ---------- Bill math (discount) ----------

/**
 * For a Treasury Bill: face value, discount rate, days to maturity.
 * Purchase price = Face * (1 - rate * days / 360).
 * Interest = Face - Purchase.
 */
export function billDiscountInterest(
  faceValue: number,
  discountRatePct: number,
  days: number,
): { purchasePrice: number; interest: number } {
  const purchasePrice = faceValue * (1 - (discountRatePct / 100) * (days / 360));
  const interest = faceValue - purchasePrice;
  return { purchasePrice, interest };
}

/**
 * Coupon-bearing (Note/Bond/TIPS/CD): simple interest approximation.
 * Interest to maturity approx = Face * (rate/100) * (years).
 */
export function couponInterestToMaturity(
  faceValue: number,
  ratePct: number,
  years: number,
): number {
  return faceValue * (ratePct / 100) * years;
}

export function termYears(termMonths: number): number {
  return termMonths / 12;
}

// ---------- Aggregations ----------

export interface PortfolioSummary {
  /**
   * Sum of face value for all holdings currently still outstanding. A
   * holding is treated as outstanding only when its effective status is
   * `Active` or `Pending` — both `Matured` (date passed OR manually
   * flagged) and `Sold` holdings are excluded because their principal
   * has been returned to the investor and no longer represents deployed
   * capital.
   */
  totalFaceValue: number;
  /**
   * Historical "money ever deployed" summed across ALL holdings
   * regardless of status. Intentionally kept UNFILTERED (unlike
   * `totalFaceValue`) so any cost-basis-vs-face-value comparison the
   * UI shows remains comparable for tax / realised-gain purposes.
   * Filter separately if a caller needs an outstanding-only figure.
   */
  totalCostBasis: number;
  /**
   * All-time interest accrued across EVERY holding regardless of status.
   * Matured and Sold holdings' interest has already been realised, so
   * excluding them would understate total return.
   */
  totalInterestEarned: number;
  totalInterestMTD: number;
  totalInterestYTD: number;
  activeCount: number;
  maturedCount: number;
  pendingCount: number;
  avgYieldActive: number;
  avgYieldMatured: number;
}

export function summarize(holdings: Holding[], now: Date = new Date()): PortfolioSummary {
  let totalFaceValue = 0;
  let totalCostBasis = 0;
  let totalInterestEarned = 0;
  let interestMTD = 0;
  let interestYTD = 0;
  let activeCount = 0;
  let maturedCount = 0;
  let pendingCount = 0;
  let yieldNumActive = 0;
  let yieldDenActive = 0;
  let yieldNumMatured = 0;
  let yieldDenMatured = 0;

  for (const h of holdings) {
    const eff = effectiveStatus(h, now);

    // Face value counts ONLY outstanding holdings. Both Matured and
    // Sold principal have been returned to the user, so neither
    // contributes to "currently deployed capital" on the Dashboard.
    if (eff !== 'Matured' && eff !== 'Sold') {
      totalFaceValue += h.faceValue;
    }

    // Cost basis is a sunk historical fact ("money ever deployed"), so
    // it stays summed across every holding regardless of status.
    totalCostBasis += h.purchasePrice;

    // All-time interest is a realized number — include every holding.
    totalInterestEarned += h.interestEarned;
    if (eff === 'Active') {
      activeCount++;
      yieldNumActive += h.faceValue * h.highRate;
      yieldDenActive += h.faceValue;
    } else if (eff === 'Matured') {
      maturedCount++;
      yieldNumMatured += h.faceValue * h.highRate;
      yieldDenMatured += h.faceValue;
    } else if (eff === 'Pending') {
      pendingCount++;
    }

    // Interest accrued falls on maturity date for bills & coupons.
    const maturity = fromISODate(h.maturityDate);
    if (
      maturity.getFullYear() === now.getFullYear() &&
      maturity.getMonth() === now.getMonth() &&
      maturity <= now
    ) {
      interestMTD += h.interestEarned;
    }
    if (maturity.getFullYear() === now.getFullYear() && maturity <= now) {
      interestYTD += h.interestEarned;
    }
  }

  return {
    totalFaceValue,
    totalCostBasis,
    totalInterestEarned,
    totalInterestMTD: interestMTD,
    totalInterestYTD: interestYTD,
    activeCount,
    maturedCount,
    pendingCount,
    avgYieldActive: yieldDenActive ? yieldNumActive / yieldDenActive : 0,
    avgYieldMatured: yieldDenMatured ? yieldNumMatured / yieldDenMatured : 0,
  };
}

// ---------- Sorting, grouping ----------

export function nextMaturity(holdings: Holding[], now: Date = new Date()): Holding | undefined {
  // Surface Active upcomings AND any date-derived Pending (≤7 days),
  // but DO NOT bubble explicit-Pending holdings whose mat-date is far
  // out (e.g. a user-flagged settlement delay maturing months later).
  const upcoming = holdings
    .filter((h) => {
      const eff = effectiveStatus(h, now);
      return eff === 'Active' || (eff === 'Pending' && isWithin7Days(h, now));
    })
    .sort((a, b) => fromISODate(a.maturityDate).getTime() - fromISODate(b.maturityDate).getTime());
  return upcoming[0];
}

export function upcomingMaturities(
  holdings: Holding[],
  days: number = 90,
  now: Date = new Date(),
): Holding[] {
  const limit = addDays(now, days);
  // Include Active and date-derived Pending; explicit-Pending far-out
  // holdings are still gated by the `mat <= limit` window so they
  // don't disturb the 90-day horizon.
  return holdings
    .filter((h) => {
      const eff = effectiveStatus(h, now);
      if (eff !== 'Active' && !(eff === 'Pending' && isWithin7Days(h, now))) return false;
      const mat = fromISODate(h.maturityDate);
      return mat >= now && mat <= limit;
    })
    .sort((a, b) => fromISODate(a.maturityDate).getTime() - fromISODate(b.maturityDate).getTime());
}

export function portfolioByType(holdings: Holding[], now: Date = new Date()) {
  const map = new Map<SecurityType, number>();
  for (const h of holdings) {
    // Match the same exclude-Matured-and-Sold rule used by
    // `summarize().totalFaceValue` so the Dashboard KPI and this pie
    // chart stay numerically consistent.
    const eff = effectiveStatus(h, now);
    if (eff === 'Matured' || eff === 'Sold') continue;
    map.set(h.securityType, (map.get(h.securityType) ?? 0) + h.faceValue);
  }
  return Array.from(map.entries()).map(([type, value]) => ({ type, value }));
}

/**
 * Bin terms into buckets used by the Dashboard "Portfolio by Term" chart.
 */
export function portfolioByTerm(holdings: Holding[], now: Date = new Date()) {
  const buckets = new Map<string, number>();
  const order = ['≤1M', '2-3M', '4-6M', '7-12M', '13-24M', '2-5Y', '5-10Y', '10Y+'];
  for (const h of holdings) {
    // Match the same exclude-Matured-and-Sold rule used by
    // `summarize().totalFaceValue` so the Dashboard KPI and this bar
    // chart stay numerically consistent.
    const eff = effectiveStatus(h, now);
    if (eff === 'Matured' || eff === 'Sold') continue;
    const m = h.termMonths;
    const key =
      m <= 1 ? '≤1M' :
      m <= 3 ? '2-3M' :
      m <= 6 ? '4-6M' :
      m <= 12 ? '7-12M' :
      m <= 24 ? '13-24M' :
      m <= 60 ? '2-5Y' :
      m <= 120 ? '5-10Y' : '10Y+';
    buckets.set(key, (buckets.get(key) ?? 0) + h.faceValue);
  }
  return order.map((k) => ({ bucket: k, value: buckets.get(k) ?? 0 }));
}

export function cashFlowProjection(
  holdings: Holding[],
  months: number = 24,
  now: Date = new Date(),
): { month: string; principal: number; interest: number }[] {
  const out: { month: string; principal: number; interest: number }[] = [];
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
    let principal = 0;
    let interest = 0;
    for (const h of holdings) {
      const mat = fromISODate(h.maturityDate);
      if (mat >= monthStart && mat <= monthEnd) {
        principal += h.faceValue;
        interest += h.interestEarned;
      }
    }
    out.push({ month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`, principal, interest });
  }
  return out;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------- Ladder planning ----------

export interface LadderRung {
  securityType: SecurityType;
  termMonths: number;
  estimatedYield: number;
  monthlyCashValue: number;
}

/**
 * Generate a ladder suggestion that staggers maturities to produce (roughly)
 * monthly cash flow while maximizing yield across a per-rung budget.
 *
 * Strategy:
 *   - Allocate equal share of `totalBudget` across `rungs` slots.
 *   - First rung buys shorter, lower-yielding instruments (monthly cash flow).
 *   - Subsequent rungs escalate in term / yield.
 *   - Yields come from the cached rates; user can override at runtime.
 */
export function suggestLadder(
  totalBudget: number,
  rungs: number,
  yieldsLookup: (type: SecurityType, termMonths: number) => number | null,
  startAtMonth: number = 0,
): LadderRung[] {
  const perRung = totalBudget / Math.max(1, rungs);
  const templates: { type: SecurityType; termMonths: number }[] = [];

  // Default ladder template: short then progressively longer.
  if (rungs <= 3) {
    for (let i = 0; i < rungs; i++) {
      templates.push({ type: 'Bill', termMonths: 1 + i * 3 });
    }
  } else {
    // 4+ rungs: mix bills, notes, bonds.
    const sequence: { type: SecurityType; termMonths: number }[] = [
      { type: 'Bill', termMonths: 1 },
      { type: 'Bill', termMonths: 3 },
      { type: 'Bill', termMonths: 6 },
      { type: 'TIPS', termMonths: 12 },
      { type: 'Note', termMonths: 24 },
      { type: 'Note', termMonths: 36 },
      { type: 'Note', termMonths: 60 },
      { type: 'Bond', termMonths: 120 },
      { type: 'Bond', termMonths: 240 },
      { type: 'Bond', termMonths: 360 },
    ];
    // Pick evenly-spaced entries from the sequence.
    const step = sequence.length / rungs;
    for (let i = 0; i < rungs; i++) {
      templates.push(sequence[Math.floor(i * step) % sequence.length]);
    }
  }

  return templates.map((t, idx) => {
    const override = yieldsLookup(t.type, t.termMonths);
    const fallback =
      t.type === 'Bill'
        ? 4.0 + Math.min(t.termMonths, 12) * 0.05
        : t.type === 'TIPS'
        ? 1.5
        : 4.2 + Math.min(t.termMonths / 12, 30) * 0.04;
    const y = override ?? fallback;
    return {
      securityType: t.type,
      termMonths: t.termMonths,
      estimatedYield: y,
      monthlyCashValue: perRung,
    };
  });
}

// ---------- Ladder customization ----------

/**
 * Common term buckets (months) per security type. Used by the Ladder page in
 * "Customize" mode and as the source of terms when looking up yields.
 */
export const TERMS_BY_TYPE: Record<SecurityType, number[]> = {
  Bill: [1, 1.5, 2, 3, 4.25, 6, 12],
  Note: [24, 36, 60, 84, 120],
  Bond: [240, 360],
  TIPS: [60, 120, 240, 360],
  CD: [6, 12, 24, 60],
};

/**
 * Build a ladder from explicit (securityType, term) selections. Each
 * combination becomes one rung; allocation = budget / number of selections.
 * Per-rung yield overrides and cache fallbacks resolve identically to
 * `suggestLadder`. Selections are flattened (NOT a cartesian product) so the
 * count = sum of terms chosen across each selected type.
 */
export function buildCustomLadder(
  types: SecurityType[],
  termsByType: Partial<Record<SecurityType, number[]>>,
  budget: number,
  yieldsLookup: (type: SecurityType, termMonths: number) => number | null,
): LadderRung[] {
  const selections: { type: SecurityType; term: number }[] = [];
  for (const t of types) {
    const terms = termsByType[t] ?? [];
    for (const m of terms) selections.push({ type: t, term: m });
  }
  // Stable display order: by security type then term length.
  selections.sort((a, b) => {
    if (a.type !== b.type) return SECURITY_TYPES.indexOf(a.type) - SECURITY_TYPES.indexOf(b.type);
    return a.term - b.term;
  });

  const per = selections.length ? budget / selections.length : 0;
  return selections.map(({ type, term }) => {
    const override = yieldsLookup(type, term);
    const fallback =
      type === 'Bill'
        ? 4.0 + Math.min(term, 12) * 0.05
        : type === 'TIPS'
        ? 1.5
        : 4.2 + Math.min(term / 12, 30) * 0.04;
    const y = override ?? fallback;
    return {
      securityType: type,
      termMonths: term,
      estimatedYield: y,
      monthlyCashValue: per,
    };
  });
}

/**
 * Schedule maturity cash events for a ladder.
 *
 * - `'one-shot'`: each rung places a single cash event at month =
 *   startAtMonth + termMonths. Calendar-based, no reinvestment. Used by the
 *   Ladder page's Customize mode.
 * - `'cyclic'`: each rung places a cash event at month =
 *   startAtMonth + i*monthStep, plus a follow-up event at month + cycle
 *   (when cycle > 12) to simulate a steady reinvestment cash flow. Used by
 *   the Ladder page's Smart Stagger mode.
 *
 * Both strategies collapse same-month events by summing amounts and carrying
 * the last-iterated securityType for the chart's colour coding.
 */
export function buildLadderSchedule(
  rungs: LadderRung[],
  strategy: 'one-shot' | 'cyclic',
  startAtMonth: number,
  monthStep: number = 1,
): { month: number; amount: number; securityType: SecurityType }[] {
  const out: { month: number; amount: number; securityType: SecurityType }[] = [];

  // Quantize fractional months to 0.01 precision so two emitted events at
  // the same logical offset collapse cleanly instead of producing a
  // floating-point key collision (e.g. 0.1 + 0.2 -> 0.30000000000000004).
  const key = (m: number) => Number(m.toFixed(2));

  if (strategy === 'one-shot') {
    rungs.forEach((r) => {
      out.push({
        month: key(startAtMonth + r.termMonths),
        amount: r.monthlyCashValue,
        securityType: r.securityType,
      });
    });
  } else {
    const cycle = rungs.length > 0 ? Math.max(...rungs.map((r) => r.termMonths)) : 0;
    for (let yr = 0; yr < 2; yr++) {
      rungs.forEach((r, i) => {
        const monthOffset = startAtMonth + i * monthStep;
        out.push({
          month: key(monthOffset),
          amount: r.monthlyCashValue,
          securityType: r.securityType,
        });
        if (yr === 0 && cycle > 12) {
          out.push({
            month: key(monthOffset + cycle),
            amount: r.monthlyCashValue,
            securityType: r.securityType,
          });
        }
      });
    }
  }

  // Collapse events that land on the SAME numeric offset into a single row.
  // Distinct fractional offsets stay distinct so e.g. 4-Week (1.0M) and
  // 6-Week (1.5M) get separate chart bars instead of merging.
  const acc = new Map<number, { amount: number; securityType: SecurityType }>();
  for (const p of out) {
    const prev = acc.get(p.month);
    acc.set(p.month, {
      amount: (prev?.amount ?? 0) + p.amount,
      securityType: p.securityType,
    });
  }
  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([month, v]) => ({ month, amount: v.amount, securityType: v.securityType }));
}
