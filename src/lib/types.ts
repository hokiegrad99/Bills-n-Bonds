// ---------- Domain types ----------

export type SecurityType = 'Bill' | 'Note' | 'Bond' | 'TIPS' | 'CD';

/**
 * Categorizes a data-fetching error so the UI can show context-aware guidance.
 *
 * - `transient`  : 5xx server error or network timeout — worth retrying.
 * - `permanent`  : 4xx client error — retrying won't help.
 * - `network`    : fetch itself threw (DNS failure, CORS block, offline).
 * - `no-api-key` : FRED returned 400 and the URL has no `api_key=` param.
 */
export type FetchErrorKind = 'transient' | 'permanent' | 'network' | 'no-api-key';

export const SECURITY_TYPES: SecurityType[] = ['Bill', 'Note', 'Bond', 'TIPS', 'CD'];

export const SECURITY_TYPE_META: Record<
  SecurityType,
  { label: string; color: string; tailwind: string; ring: string; bg: string; icon: string }
> = {
  Bill: {
    label: 'Treasury Bill',
    color: '#3b82f6',
    tailwind: 'text-security-bill',
    ring: 'ring-security-bill/30',
    bg: 'bg-security-bill/10',
    icon: 'Banknote',
  },
  Note: {
    label: 'Treasury Note',
    color: '#10b981',
    tailwind: 'text-security-note',
    ring: 'ring-security-note/30',
    bg: 'bg-security-note/10',
    icon: 'ScrollText',
  },
  Bond: {
    label: 'Treasury Bond',
    color: '#8b5cf6',
    tailwind: 'text-security-bond',
    ring: 'ring-security-bond/30',
    bg: 'bg-security-bond/30',
    icon: 'Landmark',
  },
  TIPS: {
    label: 'TIPS',
    color: '#f59e0b',
    tailwind: 'text-security-tips',
    ring: 'ring-security-tips/30',
    bg: 'bg-security-tips/10',
    icon: 'TrendingUp',
  },
  CD: {
    label: 'Certificate of Deposit',
    color: '#ec4899',
    tailwind: 'text-security-cd',
    ring: 'ring-security-cd/30',
    bg: 'bg-security-cd/10',
    icon: 'PiggyBank',
  },
};

export type HoldingStatus = 'Active' | 'Matured' | 'Pending' | 'Sold';

export const HOLDING_STATUSES: HoldingStatus[] = ['Active', 'Matured', 'Pending', 'Sold'];

export interface Holding {
  id: string;
  securityType: SecurityType;
  institution: string;
  /** Term in months (e.g. 1/4/8/13/26/52 for bills, 24/60/120/240/360 for notes/bonds/CDs). */
  termMonths: number;
  confirmNumber?: string;
  cusip?: string;
  purchaseDate: string; // YYYY-MM-DD
  maturityDate: string; // YYYY-MM-DD
  faceValue: number;
  purchasePrice: number; // per 100 of face for bills, or dollars
  highRate: number; // % APR-equivalent yield at purchase
  /** Interest accrued/earned through today. For Bills, this is the discount gain. */
  interestEarned: number;
  taxYear: number;
  stateTaxExempt: boolean;
  status: HoldingStatus;
  autoReinvest: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- US Treasury API shapes ----------

/** Shape of an item from `/accounting/od/auction_query`. */
export interface TreasuryAuction {
  auction_date: string;
  issue_date?: string;
  maturity_date?: string;
  cusip?: string;
  security_type?: string; // "Bill", "Note", "Bond", "TIPS", "CMB", etc.
  security_term?: string; // e.g. "4-Week", "30-Year"
  t_bill_or_bond?: string;
  average_median_yield?: string;
  average_median_award_yield?: string;
  high_yield?: string;
  high_discount_rate?: string;
  high_investment_rate?: string;
  total_tendered?: string;
  total_accepted?: string;
  [k: string]: unknown;
}

/** Shape of an item from `/tvmt/yield_curve` (nominal). */
export interface YieldCurvePoint {
  new_date: string;
  bc_1month?: string;
  bc_2month?: string;
  bc_3month?: string;
  bc_6month?: string;
  bc_1year?: string;
  bc_2year?: string;
  bc_3year?: string;
  bc_5year?: string;
  bc_7year?: string;
  bc_10year?: string;
  bc_20year?: string;
  bc_30year?: string;
  [k: string]: string | undefined;
}

/** Shape of `/tvmt/real_yield_curve` (TIPS). */
export interface RealYieldCurvePoint {
  new_date: string;
  tc_5year?: string;
  tc_10year?: string;
  tc_20year?: string;
  tc_30year?: string;
  [k: string]: string | undefined;
}

// ---------- App state ----------

export type Theme = 'light' | 'dark';

export interface UserSettings {
  theme: Theme;
  /** Hide matured holdings by default in the Holdings table. */
  hideMatured: boolean;
  /** Cached timestamp of last successful Treasury API pull. */
  lastRatesRefresh?: string;
}

export interface CachedRates {
  fetchedAt: string;
  /**
   * True when ANY of yieldCurve / realYieldCurve / recentAuctions came
   * from the synthetic fallback rather than the live Treasury Fiscal
   * Data API. UI surfaces this as a global banner so the user can
   * distinguish modeled reference values from real data — these values
   * are NOT safe for trading or tax decisions.
   */
  isSynthetic?: boolean;
  /** When isSynthetic=true, message describing WHY live fetch failed. Cleared on next successful refresh. */
  fallbackReason?: string;
  /** Structured error category for context-aware UI messaging. */
  errorKind?: FetchErrorKind;
  /** Per (securityType, termMonths) -> yield %. */
  yieldByTerm: Record<string, number>;
  yieldByTermOverrides: Record<string, number>;
  /** Latest yield curve points (nominal + real) for charts. */
  yieldCurve: YieldCurvePoint[];
  realYieldCurve: RealYieldCurvePoint[];
  /** Recent auctions used for the Auctions page. */
  recentAuctions: TreasuryAuction[];
}

export interface FedOutlookIndicator {
  name: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'flat';
  description: string;
}

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
}

export interface TreasuryEtf {
  ticker: string;
  name: string;
  duration: 'Ultra-Short' | 'Short' | 'Intermediate' | 'Long';
  ytdReturn: number; // %
  yieldPct: number; // SEC yield, %
  Sharpe: number;
  riskScore: number; // 1-10 (lower = less risky)
}
