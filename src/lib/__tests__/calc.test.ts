import { describe, it, expect } from 'vitest';
import {
  addMonths,
  toISODate,
  fromISODate,
  todayISO,
  daysBetween,
  monthsBetween,
  isMatured,
  isWithin7Days,
  effectiveStatus,
  billDiscountInterest,
  couponInterestToMaturity,
  termYears,
  summarize,
  nextMaturity,
  upcomingMaturities,
  portfolioByType,
  portfolioByTerm,
  cashFlowProjection,
  addDays,
  suggestLadder,
  buildCustomLadder,
  buildLadderSchedule,
} from '../calc';
import type { Holding, SecurityType } from '../types';

// ---------- Test fixtures ----------

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'test-1',
    securityType: 'Bill',
    institution: 'TreasuryDirect',
    termMonths: 3,
    purchaseDate: '2024-01-15',
    maturityDate: '2024-04-15',
    faceValue: 10000,
    purchasePrice: 9875,
    highRate: 5.0,
    interestEarned: 125,
    taxYear: 2024,
    stateTaxExempt: true,
    status: 'Active',
    autoReinvest: false,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// ---------- Date helpers ----------

describe('Date helpers', () => {
  describe('addMonths', () => {
    it('adds months correctly', () => {
      const base = new Date(2024, 0, 15); // Jan 15
      const result = addMonths(base, 3);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(15);
    });

    it('handles month overflow (Jan 31 + 1 month = Feb 28)', () => {
      const base = new Date(2024, 0, 31); // Jan 31
      const result = addMonths(base, 1);
      expect(result.getMonth()).toBe(1); // Feb
      expect(result.getDate()).toBe(29); // 2024 is a leap year
    });
  });

  describe('toISODate / fromISODate round-trip', () => {
    it('round-trips a date correctly', () => {
      const d = new Date(2024, 5, 15); // June 15, 2024
      const iso = toISODate(d);
      expect(iso).toBe('2024-06-15');
      const back = fromISODate(iso);
      expect(back.getFullYear()).toBe(2024);
      expect(back.getMonth()).toBe(5);
      expect(back.getDate()).toBe(15);
    });
  });

  describe('todayISO', () => {
    it('returns a YYYY-MM-DD string', () => {
      const t = todayISO();
      expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('daysBetween', () => {
    it('computes positive difference', () => {
      const a = new Date(2024, 0, 1);
      const b = new Date(2024, 0, 31);
      expect(daysBetween(a, b)).toBe(30);
    });

    it('returns negative for reversed order', () => {
      const a = new Date(2024, 0, 31);
      const b = new Date(2024, 0, 1);
      expect(daysBetween(a, b)).toBe(-30);
    });
  });

  describe('monthsBetween', () => {
    it('computes months between dates', () => {
      const from = new Date(2024, 0, 15);
      const to = new Date(2024, 6, 15);
      expect(monthsBetween(from, to)).toBe(6);
    });

    it('returns -1 when target day is before source day', () => {
      const from = new Date(2024, 0, 15);
      const to = new Date(2024, 6, 10);
      expect(monthsBetween(from, to)).toBe(5);
    });
  });

  describe('addDays', () => {
    it('adds days correctly', () => {
      const d = new Date(2024, 0, 1);
      const result = addDays(d, 30);
      expect(result.getDate()).toBe(31);
      expect(result.getMonth()).toBe(0);
    });
  });
});

// ---------- Maturity / status ----------

describe('Maturity and status', () => {
  describe('isMatured', () => {
    it('returns true when maturity date is in the past', () => {
      const h = makeHolding({ maturityDate: '2020-01-01' });
      expect(isMatured(h)).toBe(true);
    });

    it('returns false when maturity date is in the future', () => {
      const h = makeHolding({ maturityDate: '2099-12-31' });
      expect(isMatured(h)).toBe(false);
    });

    it('returns true for today (maturity date = today)', () => {
      const today = new Date();
      const iso = toISODate(today);
      const h = makeHolding({ maturityDate: iso });
      expect(isMatured(h)).toBe(true);
    });
  });

  describe('isWithin7Days', () => {
    it('returns true for tomorrow', () => {
      const tomorrow = addDays(new Date(), 1);
      const h = makeHolding({ maturityDate: toISODate(tomorrow) });
      expect(isWithin7Days(h)).toBe(true);
    });

    it('returns false for 30 days out', () => {
      const future = addDays(new Date(), 30);
      const h = makeHolding({ maturityDate: toISODate(future) });
      expect(isWithin7Days(h)).toBe(false);
    });
  });

  describe('effectiveStatus', () => {
    it('returns Active for future maturity', () => {
      const h = makeHolding({ maturityDate: '2099-12-31' });
      expect(effectiveStatus(h)).toBe('Active');
    });

    it('returns Matured for past maturity', () => {
      const h = makeHolding({ maturityDate: '2020-01-01' });
      expect(effectiveStatus(h)).toBe('Matured');
    });

    it('returns Pending for near-term maturity (within 7 days)', () => {
      const near = addDays(new Date(), 3);
      const h = makeHolding({ maturityDate: toISODate(near) });
      expect(effectiveStatus(h)).toBe('Pending');
    });

    it('returns Sold when explicitly set', () => {
      const h = makeHolding({ status: 'Sold', maturityDate: '2099-12-31' });
      expect(effectiveStatus(h)).toBe('Sold');
    });

    it('returns Pending when explicitly set and maturity is far out', () => {
      const h = makeHolding({ status: 'Pending', maturityDate: '2099-12-31' });
      expect(effectiveStatus(h)).toBe('Pending');
    });
  });
});

// ---------- Interest math ----------

describe('Interest math', () => {
  describe('billDiscountInterest', () => {
    it('computes discount correctly for a 26-week bill', () => {
      // Face $10,000, 5% discount, 182 days
      const { purchasePrice, interest } = billDiscountInterest(10000, 5.0, 182);
      // Purchase = 10000 * (1 - 0.05 * 182/360) = 10000 * (1 - 0.025278) = 9747.22
      expect(purchasePrice).toBeCloseTo(9747.22, 1);
      expect(interest).toBeCloseTo(252.78, 1);
      expect(purchasePrice + interest).toBeCloseTo(10000, 2);
    });

    it('returns zero interest for zero rate', () => {
      const { purchasePrice, interest } = billDiscountInterest(10000, 0, 182);
      expect(purchasePrice).toBe(10000);
      expect(interest).toBe(0);
    });
  });

  describe('couponInterestToMaturity', () => {
    it('computes coupon interest for a 2-year note', () => {
      const interest = couponInterestToMaturity(10000, 4.5, 2);
      expect(interest).toBe(900);
    });

    it('returns zero for zero rate', () => {
      expect(couponInterestToMaturity(10000, 0, 5)).toBe(0);
    });
  });

  describe('termYears', () => {
    it('converts months to years', () => {
      expect(termYears(24)).toBe(2);
      expect(termYears(6)).toBe(0.5);
    });
  });
});

// ---------- Aggregations ----------

describe('Portfolio aggregations', () => {
  describe('summarize', () => {
    it('computes totals correctly with mixed holdings', () => {
      const holdings = [
        makeHolding({ faceValue: 10000, interestEarned: 125, highRate: 5.0, maturityDate: '2099-12-31' }),
        makeHolding({ id: 'test-2', faceValue: 20000, interestEarned: 500, highRate: 4.0, maturityDate: '2099-12-31' }),
        makeHolding({ id: 'test-3', faceValue: 5000, interestEarned: 200, highRate: 3.0, maturityDate: '2020-01-01' }),
      ];
      const s = summarize(holdings);
      expect(s.totalFaceValue).toBe(30000); // excludes matured
      expect(s.totalInterestEarned).toBe(825); // includes all
      expect(s.activeCount).toBe(2);
      expect(s.maturedCount).toBe(1);
    });

    it('returns zeros for empty holdings', () => {
      const s = summarize([]);
      expect(s.totalFaceValue).toBe(0);
      expect(s.totalInterestEarned).toBe(0);
      expect(s.activeCount).toBe(0);
    });
  });

  describe('nextMaturity', () => {
    it('returns the soonest active holding', () => {
      const holdings = [
        makeHolding({ id: 'a', maturityDate: '2099-06-01' }),
        makeHolding({ id: 'b', maturityDate: '2099-03-01' }),
        makeHolding({ id: 'c', maturityDate: '2020-01-01' }), // matured
      ];
      const next = nextMaturity(holdings);
      expect(next?.id).toBe('b');
    });

    it('returns undefined for empty holdings', () => {
      expect(nextMaturity([])).toBeUndefined();
    });
  });

  describe('upcomingMaturities', () => {
    it('returns holdings maturing within N days', () => {
      const tomorrow = addDays(new Date(), 1);
      const in30 = addDays(new Date(), 30);
      const holdings = [
        makeHolding({ id: 'a', maturityDate: toISODate(tomorrow) }),
        makeHolding({ id: 'b', maturityDate: toISODate(in30) }),
        makeHolding({ id: 'c', maturityDate: '2020-01-01' }),
      ];
      const upcoming = upcomingMaturities(holdings, 60);
      expect(upcoming.length).toBe(2);
    });
  });

  describe('portfolioByType', () => {
    it('groups by security type, excluding matured', () => {
      const holdings = [
        makeHolding({ securityType: 'Bill', faceValue: 10000, maturityDate: '2099-12-31' }),
        makeHolding({ id: '2', securityType: 'Note', faceValue: 20000, maturityDate: '2099-12-31' }),
        makeHolding({ id: '3', securityType: 'Bill', faceValue: 5000, maturityDate: '2020-01-01' }),
      ];
      const byType = portfolioByType(holdings);
      expect(byType).toEqual([
        { type: 'Bill', value: 10000 },
        { type: 'Note', value: 20000 },
      ]);
    });
  });

  describe('portfolioByTerm', () => {
    it('bins into correct buckets', () => {
      const holdings = [
        makeHolding({ termMonths: 1, faceValue: 5000, maturityDate: '2099-12-31' }),
        makeHolding({ id: '2', termMonths: 6, faceValue: 10000, maturityDate: '2099-12-31' }),
        makeHolding({ id: '3', termMonths: 60, faceValue: 20000, maturityDate: '2099-12-31' }),
      ];
      const byTerm = portfolioByTerm(holdings);
      const buckets = byTerm.filter((b) => b.value > 0);
      expect(buckets).toEqual([
        { bucket: '≤1M', value: 5000 },
        { bucket: '4-6M', value: 10000 },
        { bucket: '2-5Y', value: 20000 },
      ]);
    });
  });

  describe('cashFlowProjection', () => {
    it('projects cash flow correctly', () => {
      const now = new Date(2024, 5, 1); // June 1, 2024
      const holdings = [
        makeHolding({ maturityDate: '2024-07-15', faceValue: 10000, interestEarned: 200 }),
        makeHolding({ id: '2', maturityDate: '2024-07-20', faceValue: 5000, interestEarned: 100 }),
      ];
      const cf = cashFlowProjection(holdings, 3, now);
      // July should have both
      expect(cf[1].principal).toBe(15000);
      expect(cf[1].interest).toBe(300);
      // June and August should be zero
      expect(cf[0].principal).toBe(0);
      expect(cf[2].principal).toBe(0);
    });
  });
});

// ---------- Ladder planning ----------

describe('Ladder planning', () => {
  const yieldsLookup = (_type: SecurityType, _term: number) => 4.5;

  describe('suggestLadder', () => {
    it('generates the requested number of rungs', () => {
      const ladder = suggestLadder(100000, 6, yieldsLookup);
      expect(ladder.length).toBe(6);
    });

    it('allocates budget equally across rungs', () => {
      const ladder = suggestLadder(60000, 6, yieldsLookup);
      for (const rung of ladder) {
        expect(rung.monthlyCashValue).toBe(10000);
      }
    });

    it('uses yields from lookup when available', () => {
      const customLookup = (type: SecurityType, term: number) => {
        if (type === 'Bill' && term === 1) return 5.25;
        return 4.0;
      };
      const ladder = suggestLadder(10000, 1, customLookup);
      // For 1 rung, suggestLadder picks Bill with 1-month term.
      expect(ladder[0].estimatedYield).toBe(5.25);
    });
  });

  describe('buildCustomLadder', () => {
    it('builds from explicit type/term selections', () => {
      const ladder = buildCustomLadder(
        ['Bill', 'Note'],
        { Bill: [3, 6], Note: [24] },
        30000,
        yieldsLookup,
      );
      expect(ladder.length).toBe(3);
      expect(ladder[0].monthlyCashValue).toBe(10000);
    });

    it('sorts by type then term', () => {
      const ladder = buildCustomLadder(
        ['Note', 'Bill'],
        { Note: [24], Bill: [3] },
        20000,
        yieldsLookup,
      );
      expect(ladder[0].securityType).toBe('Bill');
      expect(ladder[1].securityType).toBe('Note');
    });
  });

  describe('buildLadderSchedule', () => {
    it('generates one-shot schedule', () => {
      const rungs = [
        { securityType: 'Bill' as SecurityType, termMonths: 3, estimatedYield: 5.0, monthlyCashValue: 10000 },
        { securityType: 'Note' as SecurityType, termMonths: 24, estimatedYield: 4.5, monthlyCashValue: 10000 },
      ];
      const schedule = buildLadderSchedule(rungs, 'one-shot', 0);
      expect(schedule.length).toBe(2);
      expect(schedule[0].month).toBe(3);
      expect(schedule[1].month).toBe(24);
    });

    it('collapses same-month events', () => {
      const rungs = [
        { securityType: 'Bill' as SecurityType, termMonths: 6, estimatedYield: 5.0, monthlyCashValue: 10000 },
        { securityType: 'Bill' as SecurityType, termMonths: 6, estimatedYield: 5.0, monthlyCashValue: 5000 },
      ];
      const schedule = buildLadderSchedule(rungs, 'one-shot', 0);
      expect(schedule.length).toBe(1);
      expect(schedule[0].amount).toBe(15000);
    });
  });
});
