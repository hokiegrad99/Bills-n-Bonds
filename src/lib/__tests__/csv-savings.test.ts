import { describe, it, expect } from 'vitest';
import {
  parseSavingsBondsCSV,
  savingsBondsToCSV,
  SAVINGS_BOND_SAMPLE_CSV,
} from '../csv-savings';
import type { SavingsBond } from '../types';

// Representative excerpt of the real "Import Savings Bond Inventory.csv":
// US-style dates, $ / % formatting, quoted amounts with commas, and the
// extra Security Type + Maturity Date columns.
const TREASURY_DIRECT_CSV = [
  'Registration,POD,Security Type,Confirm #,Issue Date,Maturity Date,Interest Rate,Status,Amount,Current Value',
  'Jonathan A Marshall,,Series I Savings Bond,IAAAQ,11/1/2021,11/1/2051,3.34%,Active,$200.00 ,$245.28 ',
  'Jonathan A Marshall,Vivian R Marshall,Series I Savings Bond,IAAH9,1/1/2026,1/1/2056,4.26%,Active,$500.00 ,$506.60 ',
  'Jonathan A Marshall,Vivian R Marshall,Series I Savings Bond,IAAD8,8/1/2024,8/1/2054,4.66%,Active,"$1,000.00 ","$1,071.20 "',
].join('\n');

describe('parseSavingsBondsCSV — TreasuryDirect export format', () => {
  it('parses the real export format with zero errors', () => {
    const { rows, errors } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
  });

  it('converts US-style M/D/YYYY issue dates to ISO YYYY-MM-DD', () => {
    const { rows } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(rows.map((r) => r.issueDate)).toEqual([
      '2021-11-01',
      '2026-01-01',
      '2024-08-01',
    ]);
  });

  it('converts Maturity Date to ISO as well', () => {
    const { rows } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(rows.map((r) => r.maturityDate)).toEqual([
      '2051-11-01',
      '2056-01-01',
      '2054-08-01',
    ]);
  });

  it('strips $, commas, % and trailing whitespace from numeric fields', () => {
    const { rows } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(rows[0].interestRate).toBe(3.34);
    expect(rows[0].amount).toBe(200);
    expect(rows[0].currentValue).toBe(245.28);
    // Quoted "$1,000.00 " with a thousands comma
    expect(rows[2].amount).toBe(1000);
    expect(rows[2].currentValue).toBe(1071.2);
  });

  it('ignores the Security Type column but keeps Maturity Date', () => {
    const { rows, errors } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(errors).toEqual([]);
    expect(rows[0]).not.toHaveProperty('securityType');
    expect(rows[0].maturityDate).toBe('2051-11-01');
  });

  it('keeps registration and pod verbatim', () => {
    const { rows } = parseSavingsBondsCSV(TREASURY_DIRECT_CSV);
    expect(rows[0].registration).toBe('Jonathan A Marshall');
    expect(rows[0].pod).toBe('');
    expect(rows[1].pod).toBe('Vivian R Marshall');
  });
});

describe('parseSavingsBondsCSV — back-compat with the native format', () => {
  it('still accepts ISO dates and plain numbers (maturity optional)', () => {
    const native = [
      'Registration,POD,Confirm #,Issue Date,Interest Rate (%),Status,Amount,Current Value',
      'Self,Jane Smith,,2020-06-15,0.10,Active,500.00,540.00',
    ].join('\n');
    const { rows, errors } = parseSavingsBondsCSV(native);
    expect(errors).toEqual([]);
    expect(rows[0].issueDate).toBe('2020-06-15');
    expect(rows[0].maturityDate).toBeUndefined();
    expect(rows[0].interestRate).toBe(0.1);
    expect(rows[0].amount).toBe(500);
  });

  it('rejects malformed dates with a clear error', () => {
    const bad = 'Registration,Issue Date,Amount\nSelf,not-a-date,100';
    const { rows, errors } = parseSavingsBondsCSV(bad);
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Invalid Issue Date');
  });
});

describe('SAVINGS_BOND_SAMPLE_CSV', () => {
  it('parses cleanly as a valid import', () => {
    const { rows, errors } = parseSavingsBondsCSV(SAVINGS_BOND_SAMPLE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.amount).toBeGreaterThan(0);
    }
  });
});

describe('savingsBondsToCSV — export', () => {
  it('exports Maturity Date between Issue Date and Rate', () => {
    const bond: SavingsBond = {
      id: 'x',
      registration: 'Self',
      pod: 'Jane Smith',
      issueDate: '2024-01-01',
      maturityDate: '2054-01-01',
      interestRate: 4,
      status: 'Active',
      amount: 500,
      currentValue: 540,
      createdAt: '',
      updatedAt: '',
    };
    const csv = savingsBondsToCSV([bond]);
    const [header, line] = csv.trim().split('\n');
    expect(header.split(',')).toEqual([
      'Registration',
      'POD',
      'Confirm #',
      'Issue Date',
      'Maturity Date',
      'Interest Rate (%)',
      'Status',
      'Amount',
      'Current Value',
    ]);
    expect(line).toBe('Self,Jane Smith,,2024-01-01,2054-01-01,4,Active,500,540');
  });

  it('round-trips Maturity Date through export → import', () => {
    const bond: SavingsBond = {
      id: 'x',
      registration: 'Self',
      pod: 'Jane Smith',
      issueDate: '2024-01-01',
      maturityDate: '2054-01-01',
      interestRate: 4,
      status: 'Active',
      amount: 500,
      currentValue: 540,
      createdAt: '',
      updatedAt: '',
    };
    const { rows, errors } = parseSavingsBondsCSV(savingsBondsToCSV([bond]));
    expect(errors).toEqual([]);
    expect(rows[0].maturityDate).toBe('2054-01-01');
  });
});
