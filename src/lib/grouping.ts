// POD grouping shared by the Holdings page (and usable by Savings Bonds).
// Groups by Payable-on-Death beneficiary: alphabetical order, with the
// empty-POD group ("No POD") sorted to the end.

// Sentinel key for items with no POD, sorted to the end of the group list.
export const NO_POD_KEY = '__no_pod__';

export interface PODGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Group items by their `pod` field, trimmed. Groups sort alphabetically;
 * the empty-POD group (labelled "No POD") always sorts last. Input order
 * is preserved within each group.
 */
export function groupByPOD<T extends { pod?: string }>(items: T[]): PODGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.pod?.trim() || NO_POD_KEY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === NO_POD_KEY) return 1;
      if (b === NO_POD_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, groupItems]) => ({
      key,
      label: key === NO_POD_KEY ? 'No POD' : key,
      items: groupItems,
    }));
}
