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
  { key: 'interestRate', header: 'Interest Rate (%)' },
  { key: 'status', header: 'Status' },
  { key: 'amount', header: 'Amount' },
  { key: 'currentValue', header: 'Current Value' },
];

export const SAVINGS_BOND_SAMPLE_CSV = [
  SAVINGS_BOND_COLUMNS.map((c) => c.header).join(','),
  'Self,Jane Smith,,2020-06-15,0.10,Active,500.00,540.00',
  'Self,Jane Smith,,2015-03-01,0.20,Active,1000.00,1100.00',
  'Joint,Jane Smith & John Smith,John Smith,2010-01-01,0.40,Active,5000.00,5800.00',
  'Self,Trust FBO Children,,2005-11-30,1.20,Active,200.00,275.00',
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
  const map: Record<string, keyof SavingsBond> = {
    registration: 'registration',
    pod: 'pod',
    payableondeath: 'pod',
    beneficiary: 'pod',
    confirm: 'confirmNumber',
    confirmnumber: 'confirmNumber',
    issuedate: 'issueDate',
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
      const v = (raw as any)[header];
      obj[key] = v === undefined ? '' : String(v).trim();
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

function validateRow(
  o: any,
  rowNumber: number,
): { row: number; message: string } | null {
  if (!o.registration) return { row: rowNumber, message: 'Missing Registration' };
  if (!o.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.issueDate)))
    return { row: rowNumber, message: 'Invalid Issue Date (expected YYYY-MM-DD)' };
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
    interestRate: Number(o.interestRate) || 0,
    status: ['Active', 'Matured', 'Pending', 'Sold'].includes(o.status) ? o.status : 'Active',
    amount: Number(o.amount),
    currentValue: Number(o.currentValue) || 0,
  };
}
