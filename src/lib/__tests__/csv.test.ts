import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { holdingsToCSV, parseHoldingsCSV, SAMPLE_CSV } from '../csv';
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

// Column order is fixed by HOLDING_COLUMNS: Security Type, Institution,
// Registration, POD, Term (Months), …
function cellOf(line: string, colIndex: number): string {
  return line.split(',')[colIndex];
}

// ---------- holdingsToCSV ----------

describe('holdingsToCSV — Registration/POD export', () => {
  it('includes Registration and POD columns in the header', () => {
    const csv = holdingsToCSV([makeHolding()]);
    const header = csv.trim().split('\n')[0];
    expect(header.split(',')).toEqual(
      expect.arrayContaining(['Registration', 'POD']),
    );
  });

  it('exports registration and pod values in their column positions', () => {
    const csv = holdingsToCSV([
      makeHolding({ registration: 'Joint', pod: 'Alice Smith' }),
    ]);
    const line = csv.trim().split('\n')[1];
    expect(cellOf(line, 2)).toBe('Joint'); // Registration
    expect(cellOf(line, 3)).toBe('Alice Smith'); // POD
  });

  it('exports empty cells for holdings without registration/pod', () => {
    const csv = holdingsToCSV([makeHolding({})]);
    const line = csv.trim().split('\n')[1];
    expect(cellOf(line, 2)).toBe('');
    expect(cellOf(line, 3)).toBe('');
  });

  it('quotes registration values containing commas', () => {
    const csv = holdingsToCSV([
      makeHolding({ registration: 'Smith, John', pod: 'Doe, Jane' }),
    ]);
    const line = csv.trim().split('\n')[1];
    // Raw CSV wraps both comma-containing values in double quotes.
    expect(line).toContain('"Smith, John"');
    expect(line).toContain('"Doe, Jane"');
    // And a real CSV parser reads them back as single cells.
    const cells = Papa.parse(line, { skipEmptyLines: true }).data[0] as string[];
    expect(cells[2]).toBe('Smith, John');
    expect(cells[3]).toBe('Doe, Jane');
  });
});

// ---------- parseHoldingsCSV ----------

describe('parseHoldingsCSV — Registration/POD import', () => {
  it('round-trips registration and pod through export → import', () => {
    const holdings = [
      makeHolding({ id: 'a', registration: 'Joint', pod: 'Alice Smith' }),
      makeHolding({ id: 'b', registration: 'Self' }),
      makeHolding({ id: 'c', pod: 'Bob Jones' }),
      makeHolding({ id: 'd' }),
    ];
    const { rows, errors } = parseHoldingsCSV(holdingsToCSV(holdings));
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.registration)).toEqual(['Joint', 'Self', undefined, undefined]);
    expect(rows.map((r) => r.pod)).toEqual(['Alice Smith', undefined, 'Bob Jones', undefined]);
  });

  it('maps the POD column via its aliases (payable on death / beneficiary)', () => {
    const header =
      'Security Type,Institution,Registration,Payable on Death,Term (Months),Purchase Date,Maturity Date,Face Value,Status';
    const body =
      'Bill,TreasuryDirect,Joint,Alice Smith,3,2024-01-15,2024-04-15,10000,Active';
    const { rows, errors } = parseHoldingsCSV(`${header}\n${body}`);
    expect(errors).toEqual([]);
    expect(rows[0].registration).toBe('Joint');
    expect(rows[0].pod).toBe('Alice Smith');

    const { rows: rows2 } = parseHoldingsCSV(
      `${header}\nBill,TreasuryDirect,Joint,Bob Jones,3,2024-01-15,2024-04-15,10000,Active`.replace(
        'Payable on Death',
        'Beneficiary',
      ),
    );
    expect(rows2[0].pod).toBe('Bob Jones');
  });

  it('parses legacy CSVs without Registration/POD columns', () => {
    const legacy =
      'Security Type,Institution,Term (Months),Purchase Date,Maturity Date,Face Value,Status\n' +
      'Bill,TreasuryDirect,3,2024-01-15,2024-04-15,10000,Active';
    const { rows, errors } = parseHoldingsCSV(legacy);
    expect(errors).toEqual([]);
    expect(rows[0].registration).toBeUndefined();
    expect(rows[0].pod).toBeUndefined();
  });

  it('trims whitespace from registration and pod', () => {
    const csv = holdingsToCSV([makeHolding({ registration: '  Joint  ', pod: '  Alice  ' })]);
    const { rows } = parseHoldingsCSV(csv);
    expect(rows[0].registration).toBe('Joint');
    expect(rows[0].pod).toBe('Alice');
  });

  it('parses quoted registration values containing commas', () => {
    const csv = holdingsToCSV([makeHolding({ registration: 'Smith, John', pod: 'Doe, Jane' })]);
    const { rows, errors } = parseHoldingsCSV(csv);
    expect(errors).toEqual([]);
    expect(rows[0].registration).toBe('Smith, John');
    expect(rows[0].pod).toBe('Doe, Jane');
  });
});

// ---------- SAMPLE_CSV ----------

describe('SAMPLE_CSV', () => {
  it('parses cleanly and each row defaults Registration to Self', () => {
    const { rows, errors } = parseHoldingsCSV(SAMPLE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.registration).toBe('Self');
    }
    expect(rows.every((r) => r.pod === undefined)).toBe(true);
  });
});
