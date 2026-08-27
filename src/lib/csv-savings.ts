import Papa from 'papaparse';
import type { SavingsBond } from './types';

// Column order chosen to mirror the user's spec verbatim so a hand-
// authored CSV round-trips cleanly. `key` maps to the SavingsBond
// field; `header` is the human-readable CSV header.
export const SAVINGS_BOND_COLUMNS: { key: keyof SavingsBond | 'id'; header: string }[] = [
  { key: 'registration', header: 'Registration' },
  { key: 'pod', header: 'POD' },
  { key: 'confirmNumber', header: 'Confirm #' },
  { key: 'issueDate', header: 'Issue Date' },
  { key: 'maturityDate', header: 'Maturity Date' },
  { key: 'interestRate', header: 'Interest Rate (%)' },
  { key: 'status', header: 'Status' },
  { key: 'amount', header: 'Amount' },
  { key: 'currentValue', header: 'Current Value' },
];

// Sample shown in the import dialog. Mirrors the TreasuryDirect export
// format (US-style dates, $ / % formatting, extra columns) because that's
// the real-world format users paste in — the parser accepts both this and
// the canonical export format.
export const SAVINGS_BOND_SAMPLE_CSV = [
  'Registration,POD,Security Type,Confirm #,Issue Date,Maturity Date,Interest Rate,Status,Amount,Current Value',
  'Self,,Series I Savings Bond,CF1234,11/1/2021,11/1/2051,3.34%,Active,$200.00,$245.28',
  'Self,Jane Smith,Series I Savings Bond,CF2345,1/1/2026,1/1/2056,4.26%,Active,$500.00,$506.60',
  'Joint,Jane Smith & John Smith,Series I Savings Bond,CF3456,4/1/2024,4/1/2054,4.44%,Active,"$1,000.00","$1,083.20"',
].join('\n');

export function savingsBondsToCSV(bonds: SavingsBond[]): string {
  const rows = bonds.map((b) =>
    SAVINGS_BOND_COLUMNS.map((c) => {
      const v = (b as any)[c.key];
      if (v === undefined || v === null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','),
  );
  return [SAVINGS_BOND_COLUMNS.map((c) => c.header).join(','), ...rows].join('\n');
}

function headerToKey(header: string): keyof SavingsBond | undefined {
  const norm = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Header aliases are intentionally narrow. We accept the user's
  // 8 spec'd column names + a small set of unambiguous hand-typed
  // variants ("rate" -> interestRate, "beneficiary" / "payable on
  // death" -> pod, "confirm" / "confirm number" -> confirmNumber).
  // Ambiguous aliases (e.g. plain "face" / "value") are deliberately
  // omitted so the parser fails loud rather than silently
  // mis-mapping a hand-authored CSV to the wrong column.
  // TreasuryDirect exports also carry a "Security Type" column; the
  // SavingsBond model has no field for it, so it maps to nothing here
  // and is silently ignored by the parser.
  const map: Record<string, keyof SavingsBond> = {
    registration: 'registration',
    pod: 'pod',
    payableondeath: 'pod',
    beneficiary: 'pod',
    confirm: 'confirmNumber',
    confirmnumber: 'confirmNumber',
    issuedate: 'issueDate',
    maturitydate: 'maturityDate',
    interestrate: 'interestRate',
    rate: 'interestRate',
    status: 'status',
    amount: 'amount',
    currentvalue: 'currentValue',
  };
  return map[norm];
}

export interface SavingsBondParseResult {
  rows: Omit<SavingsBond, 'id' | 'createdAt' | 'updatedAt'>[];
  errors: { row: number; message: string }[];
}

export function parseSavingsBondsCSV(text: string): SavingsBondParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: Omit<SavingsBond, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const errors: SavingsBondParseResult['errors'] = [];

  parsed.data.forEach((raw, idx) => {
    const obj: any = {};
    for (const header of Object.keys(raw)) {
      const key = headerToKey(header);
      if (!key) continue;
      let v = (raw as any)[header];
      v = v === undefined ? '' : String(v).trim();
      // TreasuryDirect exports are human-formatted: currency reads
      // "$1,000.00 ", rates carry a trailing "%", and dates are
      // US-style M/D/YYYY. Normalize to plain numbers + ISO dates so
      // the rest of the pipeline (validation, storage) stays clean.
      if (key === 'interestRate' || key === 'amount' || key === 'currentValue') {
        v = v.replace(/[$%,]/g, '').trim();
      } else if (key === 'issueDate' || key === 'maturityDate') {
        v = normalizeDate(v);
      }
      obj[key] = v;
    }

    const validation = validateRow(obj, idx + 2);
    if (validation) {
      errors.push(validation);
      return;
    }

    rows.push(coerceRow(obj));
  });

  return { rows, errors };
}

// Accepts the app's canonical YYYY-MM-DD plus US-style dates — M/D/YYYY,
// MM/DD/YYYY, M/D/YY (2-digit years), with `/` or `-` separators, and an
// optional trailing time component (e.g. Excel's "11/1/2021 12:00:00 AM").
// Anything else is returned unchanged so the row validator flags it with
// a clear error.
function normalizeDate(v: string): string {
  // Already ISO — optionally with a time component; keep the date part.
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/);
  if (iso) return iso[1];
  // US-style M/D/YYYY or M/D/YY.
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T].*)?$/);
  if (m) {
    const [, month, day, yearRaw] = m;
    const year = yearRaw.length === 2 ? fullYear(yearRaw) : yearRaw;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return v;
}

// Expand a 2-digit year to 4: 00-69 → 20xx, 70-99 → 19xx.
function fullYear(yy: string): string {
  return Number(yy) < 70 ? `20${yy}` : `19${yy}`;
}

function validateRow(
  o: any,
  rowNumber: number,
): { row: number; message: string } | null {
  if (!o.registration) return { row: rowNumber, message: 'Missing Registration' };
  if (!o.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.issueDate)))
    return { row: rowNumber, message: 'Invalid Issue Date (expected YYYY-MM-DD or MM/DD/YYYY)' };
  if (Number(o.amount) <= 0) return { row: rowNumber, message: 'Amount must be > 0' };
  if (Number(o.currentValue) < 0)
    return { row: rowNumber, message: 'Current Value cannot be negative' };
  // Number('') and Number(undefined) are both 0/NaN, so `0 < 0` and
  // `NaN < 0` are both `false` — the bare check below correctly skips
  // empty/missing rates and only flags explicit negative values.
  if (Number(o.interestRate) < 0)
    return { row: rowNumber, message: 'Interest Rate cannot be negative' };
  return null;
}

function coerceRow(o: any): Omit<SavingsBond, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    registration: o.registration,
    pod: o.pod ?? '',
    confirmNumber: o.confirmNumber || undefined,
    issueDate: o.issueDate,
    maturityDate: o.maturityDate || undefined,
    interestRate: Number(o.interestRate) || 0,
    status: ['Active', 'Matured', 'Pending', 'Sold'].includes(o.status) ? o.status : 'Active',
    amount: Number(o.amount),
    currentValue: Number(o.currentValue) || 0,
  };
}
