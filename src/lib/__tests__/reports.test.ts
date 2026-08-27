import { describe, it, expect } from 'vitest';
import { filterTaxSummary, normalizeTaxYear, taxSummaryCSV } from '../reports';
import type { Holding } from '../types';

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

const SAMPLE = [
  makeHolding({ id: 'y2024', cusip: 'CUSIP-2024', taxYear: 2024 }),
  makeHolding({ id: 'y2025', cusip: 'CUSIP-2025', taxYear: 2025 }),
  makeHolding({ id: 'y2026', cusip: 'CUSIP-2026', taxYear: 2026 }),
  makeHolding({ id: 'y2026b', cusip: 'CUSIP-2026B', taxYear: 2026, status: 'Matured' }),
];

// ---------- filterTaxSummary ----------

describe('filterTaxSummary', () => {
  it('keeps only holdings whose tax year matches the scope', () => {
    const result = filterTaxSummary(SAMPLE, 2026);
    expect(result.map((h) => h.id).sort()).toEqual(['y2026', 'y2026b']);
  });

  it("treats 'all' as include-everything (regression: it used to return nothing)", () => {
    // Before the fix, `taxFiltered` mapped 'all' to an empty result, so
    // selecting "All years" in tax mode silently emptied the report.
    const result = filterTaxSummary(SAMPLE, 'all');
    expect(result).toHaveLength(SAMPLE.length);
    expect(result.map((h) => h.id).sort()).toEqual(['y2024', 'y2025', 'y2026', 'y2026b']);
  });

  it('filters by tax year regardless of status/maturity', () => {
    // A matured holding still belongs in its tax year's summary.
    const result = filterTaxSummary(SAMPLE, 2026);
    expect(result.some((h) => h.status === 'Matured')).toBe(true);
  });

  it('returns an empty array for no holdings', () => {
    expect(filterTaxSummary([], 2026)).toEqual([]);
    expect(filterTaxSummary([], 'all')).toEqual([]);
  });
});

// ---------- normalizeTaxYear ----------

describe('normalizeTaxYear', () => {
  it('passes a concrete year through unchanged', () => {
    expect(normalizeTaxYear(2024)).toBe(2024);
  });

  it("resolves 'all' to the current year", () => {
    const fixedNow = new Date(2026, 6, 1); // July 2026
    expect(normalizeTaxYear('all', fixedNow)).toBe(2026);
  });

  it('defaults to the real current year', () => {
    expect(normalizeTaxYear('all')).toBe(new Date().getFullYear());
  });
});

// ---------- taxSummaryCSV ----------

describe('taxSummaryCSV', () => {
  it('exports the header plus only matching-year rows', () => {
    const csv = taxSummaryCSV(SAMPLE, 2025);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Security Type');
    expect(lines).toHaveLength(2); // header + the single 2025 row
    expect(lines[1]).toContain('CUSIP-2025');
  });

  it('excludes other-year rows from the tax CSV (regression for fix #3)', () => {
    // Before the fix, tax-mode CSV export used the standard filters, so
    // with "All years" it dumped every holding while the preview showed none.
    const csv = taxSummaryCSV(SAMPLE, 2026);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + CUSIP-2026 + CUSIP-2026B
    expect(csv).not.toContain('CUSIP-2024');
    expect(csv).not.toContain('CUSIP-2025');
  });

  it("includes every row when the scope is 'all'", () => {
    const csv = taxSummaryCSV(SAMPLE, 'all');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(SAMPLE.length + 1);
  });

  it('produces a header-only CSV for empty holdings', () => {
    const csv = taxSummaryCSV([], 2026);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('CUSIP');
  });
});
