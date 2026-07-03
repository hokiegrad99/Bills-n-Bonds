import Papa from 'papaparse';
import type { Holding } from './types';

export const HOLDING_COLUMNS: { key: keyof Holding | 'id'; header: string }[] = [
  { key: 'securityType', header: 'Security Type' },
  { key: 'institution', header: 'Institution' },
  { key: 'termMonths', header: 'Term (Months)' },
  { key: 'confirmNumber', header: 'Confirm #' },
  { key: 'cusip', header: 'CUSIP' },
  { key: 'purchaseDate', header: 'Purchase Date' },
  { key: 'maturityDate', header: 'Maturity Date' },
  { key: 'faceValue', header: 'Face Value' },
  { key: 'purchasePrice', header: 'Purchase Price' },
  { key: 'highRate', header: 'Yield / Rate (%)' },
  { key: 'interestEarned', header: 'Interest Earned' },
  { key: 'taxYear', header: 'Tax Year' },
  { key: 'stateTaxExempt', header: 'State Tax Exempt' },
  { key: 'status', header: 'Status' },
  { key: 'autoReinvest', header: 'Auto-Reinvest' },
  { key: 'notes', header: 'Notes' },
];

export const SAMPLE_CSV = [
  HOLDING_COLUMNS.map((c) => c.header).join(','),
  'Bill,US Treasury,1,,912795XR4,2024-09-10,2024-10-10,10000,9965.00,5.25,35.00,2024,true,Active,false,Purchased at TreasuryDirect',
  'Note,US Treasury,24,,91282CHU0,2024-06-15,2026-06-15,5000,4840.00,4.50,225.00,2025,false,Active,true,',
  'TIPS,US Treasury,120,,91282CGK1,2024-04-15,2034-04-15,10000,9875.00,2.125,425.00,2034,true,Active,false,Inflation protection',
  'CD,Chase Bank,12,,,2024-08-20,2025-08-20,25000,25000.00,4.75,1187.50,2025,false,Active,false,Brokered CD',
].join('\n');

export function holdingsToCSV(holdings: Holding[]): string {
  const rows = holdings.map((h) =>
    HOLDING_COLUMNS.map((c) => {
      const v = (h as any)[c.key];
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v === undefined || v === null) return '';
      const s = String(v);
      // Quote if contains comma, quote, or newline
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','),
  );
  return [HOLDING_COLUMNS.map((c) => c.header).join(','), ...rows].join('\n');
}

function headerToKey(header: string): keyof Holding | undefined {
  const norm = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const map: Record<string, keyof Holding> = {
    securitytype: 'securityType',
    institution: 'institution',
    term: 'termMonths',
    termmonths: 'termMonths',
    confirm: 'confirmNumber',
    confirmnumber: 'confirmNumber',
    cusip: 'cusip',
    purchasedate: 'purchaseDate',
    maturitydate: 'maturityDate',
    facevalue: 'faceValue',
    purchaseprice: 'purchasePrice',
    yieldrate: 'highRate',
    highrate: 'highRate',
    yield: 'highRate',
    interestearned: 'interestEarned',
    taxyear: 'taxYear',
    statetaxexempt: 'stateTaxExempt',
    statetax: 'stateTaxExempt',
    status: 'status',
    autoreinvest: 'autoReinvest',
    notes: 'notes',
  };
  return map[norm];
}

export interface ParseResult {
  rows: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>[];
  errors: { row: number; message: string }[];
}

export function parseHoldingsCSV(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const errors: ParseResult['errors'] = [];

  parsed.data.forEach((raw, idx) => {
    const obj: any = {};
    for (const header of Object.keys(raw)) {
      const key = headerToKey(header);
      if (!key) continue;
      const v = (raw as any)[header];
      obj[key] = v === undefined ? '' : String(v).trim();
    }

    const validation = validateRow(obj, idx + 2); // row number including header
    if (validation) {
      errors.push(validation);
      return;
    }

    rows.push(coerceRow(obj));
  });

  return { rows, errors };
}

function validateRow(o: any, rowNumber: number): { row: number; message: string } | null {
  if (!o.securityType) return { row: rowNumber, message: 'Missing Security Type' };
  if (!['Bill', 'Note', 'Bond', 'TIPS', 'CD'].includes(o.securityType))
    return { row: rowNumber, message: `Invalid Security Type: ${o.securityType}` };
  if (!o.institution) return { row: rowNumber, message: 'Missing Institution' };
  if (!o.purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.purchaseDate)))
    return { row: rowNumber, message: 'Invalid Purchase Date (expected YYYY-MM-DD)' };
  if (!o.maturityDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.maturityDate)))
    return { row: rowNumber, message: 'Invalid Maturity Date (expected YYYY-MM-DD)' };
  if (Number(o.faceValue) <= 0) return { row: rowNumber, message: 'Face Value must be > 0' };
  return null;
}

function coerceRow(o: any): Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    securityType: o.securityType,
    institution: o.institution,
    termMonths: Number(o.termMonths) || 0,
    confirmNumber: o.confirmNumber || undefined,
    cusip: o.cusip || undefined,
    purchaseDate: o.purchaseDate,
    maturityDate: o.maturityDate,
    faceValue: Number(o.faceValue),
    purchasePrice: Number(o.purchasePrice) || Number(o.faceValue),
    highRate: Number(o.highRate) || 0,
    interestEarned: Number(o.interestEarned) || 0,
    taxYear: Number(o.taxYear) || new Date().getFullYear(),
    stateTaxExempt: ['true', '1', 'yes', 'y'].includes(String(o.stateTaxExempt).toLowerCase()),
    status: ['Active', 'Matured', 'Pending', 'Sold'].includes(o.status) ? o.status : 'Active',
    autoReinvest: ['true', '1', 'yes', 'y'].includes(String(o.autoReinvest).toLowerCase()),
    notes: o.notes || undefined,
  };
}
