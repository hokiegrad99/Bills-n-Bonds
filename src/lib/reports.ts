import type { Holding } from './types';
import { holdingsToCSV } from './csv';

/**
 * Tax Summary year scope. The UI no longer offers 'all' in tax mode
 * (summaries are per-year), but a leftover 'all' from standard mode is
 * treated defensively as "include every holding" so the report can
 * never silently empty out.
 */
export type TaxYearScope = number | 'all';

/** Holdings whose tax year matches the scope ('all' → everything). */
export function filterTaxSummary(holdings: Holding[], taxYear: TaxYearScope): Holding[] {
  return holdings.filter((h) => (taxYear === 'all' ? true : h.taxYear === taxYear));
}

/** Resolve a scope to a concrete year; 'all' falls back to the current year. */
export function normalizeTaxYear(taxYear: TaxYearScope, now: Date = new Date()): number {
  return taxYear === 'all' ? now.getFullYear() : taxYear;
}

/**
 * CSV for a Tax Summary export: rows are scoped to the tax year, never
 * to the standard report filters (status / types / institution).
 */
export function taxSummaryCSV(holdings: Holding[], taxYear: TaxYearScope): string {
  return holdingsToCSV(filterTaxSummary(holdings, taxYear));
}
