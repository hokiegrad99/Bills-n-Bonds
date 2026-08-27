import { describe, it, expect } from 'vitest';
import { groupByPOD, NO_POD_KEY } from '../grouping';
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

describe('groupByPOD', () => {
  it('returns an empty array for no items', () => {
    expect(groupByPOD([])).toEqual([]);
  });

  it('groups holdings by their POD value', () => {
    const groups = groupByPOD([
      makeHolding({ id: 'a', pod: 'Alice Smith' }),
      makeHolding({ id: 'b', pod: 'Bob Jones' }),
      makeHolding({ id: 'c', pod: 'Alice Smith' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Alice Smith', 'Bob Jones']);
    expect(groups[0].items.map((h) => h.id)).toEqual(['a', 'c']);
    expect(groups[1].items.map((h) => h.id)).toEqual(['b']);
  });

  it('trims whitespace when deriving the group key', () => {
    const groups = groupByPOD([
      makeHolding({ id: 'a', pod: '  Alice Smith  ' }),
      makeHolding({ id: 'b', pod: ' Alice Smith ' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Alice Smith');
    expect(groups[0].items).toHaveLength(2);
  });

  it('collects holdings with no POD into a single "No POD" group', () => {
    const groups = groupByPOD([
      makeHolding({ id: 'a' }),
      makeHolding({ id: 'b', pod: '' }),
      makeHolding({ id: 'c', pod: '   ' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('No POD');
    expect(groups[0].key).toBe(NO_POD_KEY);
    expect(groups[0].items.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts POD groups alphabetically with "No POD" always last', () => {
    // 'No POD' would sort first alphabetically ('N' < 'Z') — it must
    // still be pushed to the end, like the Savings Bonds page.
    const groups = groupByPOD([
      makeHolding({ id: 'z', pod: 'Zoe' }),
      makeHolding({ id: 'none' }),
      makeHolding({ id: 'a', pod: 'Alice' }),
      makeHolding({ id: 'm', pod: 'Bob' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Alice', 'Bob', 'Zoe', 'No POD']);
  });

  it('preserves input order within each group', () => {
    const groups = groupByPOD([
      makeHolding({ id: 'first', pod: 'Zoe' }),
      makeHolding({ id: 'second', pod: 'Alice' }),
      makeHolding({ id: 'third', pod: 'Zoe' }),
    ]);
    const zoe = groups.find((g) => g.label === 'Zoe')!;
    expect(zoe.items.map((h) => h.id)).toEqual(['first', 'third']);
  });

  it('uses the trimmed POD as the group key for real beneficiaries', () => {
    const groups = groupByPOD([makeHolding({ id: 'a', pod: 'Bob Jones' })]);
    expect(groups[0].key).toBe('Bob Jones');
    expect(groups[0].label).toBe('Bob Jones');
    expect(groups[0].key).not.toBe(NO_POD_KEY);
  });

  it('is stable across re-runs for the same input', () => {
    const holdings = [
      makeHolding({ id: 'a', pod: 'Zoe' }),
      makeHolding({ id: 'b' }),
      makeHolding({ id: 'c', pod: 'Alice' }),
    ];
    expect(JSON.stringify(groupByPOD(holdings))).toBe(JSON.stringify(groupByPOD(holdings)));
  });
});
