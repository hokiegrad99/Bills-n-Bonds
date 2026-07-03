import type { Holding } from './types';
import { toISODate } from './calc';

// Seed a friendly demo dataset on first visit so the app feels alive.
// Runs once via main.tsx side-effect import.

const SEED_FLAG = 'bnb.seeded.v1';
const HOLDINGS_KEY = 'bnb.holdings.v1';

function todayMinusMonths(m: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return toISODate(d);
}
function todayPlusMonths(m: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return toISODate(d);
}

const DEMO_HOLDINGS: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    securityType: 'Bill',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 1,
    cusip: '912797HG4',
    purchaseDate: todayMinusMonths(0),
    maturityDate: todayPlusMonths(1),
    faceValue: 10000,
    purchasePrice: 9960.00,
    highRate: 5.25,
    interestEarned: 40.00,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: true,
    notes: 'Auto-rollover TreasuryDirect ladder rung #1',
  },
  {
    securityType: 'Bill',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 3,
    cusip: '912797GH7',
    purchaseDate: todayMinusMonths(1),
    maturityDate: todayPlusMonths(2),
    faceValue: 10000,
    purchasePrice: 9895.00,
    highRate: 5.10,
    interestEarned: 105.00,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: true,
    notes: 'Q-quarterly ladder rung',
  },
  {
    securityType: 'Bill',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 6,
    cusip: '912797GK0',
    purchaseDate: todayMinusMonths(2),
    maturityDate: todayPlusMonths(4),
    faceValue: 15000,
    purchasePrice: 14700.00,
    highRate: 4.95,
    interestEarned: 300.00,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: false,
  },
  {
    securityType: 'Note',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 24,
    cusip: '91282CHU0',
    purchaseDate: todayMinusMonths(6),
    maturityDate: todayPlusMonths(18),
    faceValue: 5000,
    purchasePrice: 4840.00,
    highRate: 4.50,
    interestEarned: 112.50,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: false,
    notes: 'Mid-curve capture',
  },
  {
    securityType: 'TIPS',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 120,
    cusip: '91282CGK1',
    purchaseDate: todayMinusMonths(8),
    maturityDate: todayPlusMonths(112),
    faceValue: 10000,
    purchasePrice: 9875.00,
    highRate: 2.125,
    interestEarned: 142.00,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: false,
    notes: 'Inflation protection',
  },
  {
    securityType: 'CD',
    institution: 'Marcus by Goldman Sachs',
    termMonths: 12,
    purchaseDate: todayMinusMonths(3),
    maturityDate: todayPlusMonths(9),
    faceValue: 25000,
    purchasePrice: 25000.00,
    highRate: 4.75,
    interestEarned: 297.00,
    taxYear: new Date().getFullYear(),
    stateTaxExempt: false,
    status: 'Active',
    autoReinvest: false,
    notes: 'Brokered CD, FDIC insured',
  },
  // A matured holding to demonstrate the "hide matured" toggle.
  {
    securityType: 'Bill',
    institution: 'US Treasury (TreasuryDirect)',
    termMonths: 1,
    cusip: '912797FD5',
    purchaseDate: todayMinusMonths(4),
    maturityDate: todayMinusMonths(3),
    faceValue: 5000,
    purchasePrice: 4978.00,
    highRate: 4.95,
    interestEarned: 22.00,
    taxYear: new Date().getFullYear() - 1,
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: false,
    notes: 'Already matured (demonstrates toggle).',
  },
];

export function seedOnFirstVisit() {
  const seeded = localStorage.getItem(SEED_FLAG);
  if (seeded) return;
  if (localStorage.getItem(HOLDINGS_KEY)) {
    // Don't overwrite existing data.
    localStorage.setItem(SEED_FLAG, '1');
    return;
  }
  const now = new Date().toISOString();
  const rows: Holding[] = DEMO_HOLDINGS.map((h, i) => ({
    ...h,
    id: `seed-${i}`,
    createdAt: now,
    updatedAt: now,
  }));
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(rows));
  localStorage.setItem(SEED_FLAG, '1');
}

seedOnFirstVisit();
