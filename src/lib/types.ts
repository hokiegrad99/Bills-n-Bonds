// ---------- Domain types ----------

export type SecurityType = 'Bill' | 'Note' | 'Bond' | 'TIPS' | 'CD';

/**
 * Lifecycle of a holding on the Holdings page.
 * - `Active`  — outstanding, maturity date is more than 7 days out.
 * - `Pending` — effective within 7 days of maturity (or explicitly set).
 * - `Matured` — maturity date is in the past (or status was set).
 * - `Sold`    — principal has been returned to the user.
 */
export type HoldingStatus = 'Active' | 'Matured' | 'Pending' | 'Sold';

export const SECURITY_TYPES: SecurityType[] = ['Bill', 'Note', 'Bond', 'TIPS', 'CD'];
export const HOLDING_STATUSES: HoldingStatus[] = ['Active', 'Matured', 'Pending', 'Sold'];

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

// ---------- Savings Bonds ----------

/**
 * US Savings Bonds (Series EE / Series I) — separate from marketable
 * Holdings because they have no face value, no marketable CUSIP, and
 * a different lifecycle (no broker purchase / sale). Lives in its own
 * localStorage bucket (`bnb.savingsbonds.v1`) and its own page.
 *
 * Lifecycle reuses the existing HoldingStatus vocabulary so the UI
 * vocabulary stays consistent: Active (still earning), Matured
 * (past final maturity, typically 30 years for EE / I), Pending
 * (manually flagged for imminent redemption), Sold (redeemed).
 *
 * `pod` ("Payable on Death" beneficiary) drives the page's primary
 * grouping. Empty `pod` rows collect under a "No POD" heading at the
 * end of the group list.
 */
export interface SavingsBond {
  id: string;
  /** Owning name or "Self" / "Joint" / "Trust" / etc. */
  registration: string;
  /** Payable-on-Death beneficiary. Used as the primary group-by on the page. */
  pod: string;
  confirmNumber?: string;
  issueDate: string; // YYYY-MM-DD
  /** Annual interest rate at issue (Series I has a fixed component + semiannual inflation adjustment). */
  interestRate: number;
  status: HoldingStatus;
  /** Original face/issue amount in USD. */
  amount: number;
  /** Current redeemable value in USD. User-maintained (compounding handled outside this app). */
  currentValue: number;
  createdAt: string;
  updatedAt: string;
}

// ---------- App state ----------

export type Theme = 'light' | 'dark';

export interface UserSettings {
  theme: Theme;
  /** Hide matured holdings by default in the Holdings table. */
  hideMatured: boolean;
}
