import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SavingsBond } from './types';

const SAVINGS_BONDS_KEY = 'bnb.savingsbonds.v1';

function loadSavingsBonds(): SavingsBond[] {
  try {
    const raw = localStorage.getItem(SAVINGS_BONDS_KEY);
    if (raw) return JSON.parse(raw) as SavingsBond[];
  } catch {
    /* ignore */
  }
  return [];
}

export type SavingsBondDraft = Omit<SavingsBond, 'id' | 'createdAt' | 'updatedAt'>;

interface SavingsBondsContextValue {
  savingsBonds: SavingsBond[];
  addSavingsBond: (b: SavingsBondDraft) => SavingsBond;
  updateSavingsBond: (id: string, patch: Partial<SavingsBond>) => void;
  deleteSavingsBond: (id: string) => void;
  /**
   * Bulk delete — used by the multi-select "Delete N selected" flow on
   * the Savings Bonds page. Single batch setState (not N individual
   * deletes) so the user sees one consistent re-render.
   */
  deleteSavingsBonds: (ids: string[]) => void;
  importSavingsBonds: (rows: SavingsBondDraft[]) => number;
  replaceAllSavingsBonds: (rows: SavingsBond[]) => void;
  clearAll: () => void;
}

const SavingsBondsContext = createContext<SavingsBondsContextValue | null>(null);

export function SavingsBondsProvider({ children }: { children: React.ReactNode }) {
  const [savingsBonds, setSavingsBonds] = useState<SavingsBond[]>(() => loadSavingsBonds());

  useEffect(() => {
    try {
      localStorage.setItem(SAVINGS_BONDS_KEY, JSON.stringify(savingsBonds));
    } catch {
      /* quota / private mode */
    }
  }, [savingsBonds]);

  const addSavingsBond: SavingsBondsContextValue['addSavingsBond'] = useCallback((b) => {
    const now = new Date().toISOString();
    const created: SavingsBond = {
      ...b,
      id: cryptoRandomId(),
      createdAt: now,
      updatedAt: now,
    };
    setSavingsBonds((bs) => [created, ...bs]);
    return created;
  }, []);

  const updateSavingsBond: SavingsBondsContextValue['updateSavingsBond'] = useCallback(
    (id, patch) => {
      setSavingsBonds((bs) =>
        bs.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b)),
      );
    },
    [],
  );

  const deleteSavingsBond: SavingsBondsContextValue['deleteSavingsBond'] = useCallback((id) => {
    setSavingsBonds((bs) => bs.filter((b) => b.id !== id));
  }, []);

  const deleteSavingsBonds: SavingsBondsContextValue['deleteSavingsBonds'] = useCallback(
    (ids) => {
      if (ids.length === 0) return;
      // Build a Set once so the O(N*M) .filter lookup stays O(N+M).
      const idSet = new Set(ids);
      setSavingsBonds((bs) => bs.filter((b) => !idSet.has(b.id)));
    },
    [],
  );

  const importSavingsBonds: SavingsBondsContextValue['importSavingsBonds'] = useCallback(
    (rows) => {
      const now = new Date().toISOString();
      const stamped: SavingsBond[] = rows.map((r) => ({
        ...r,
        id: cryptoRandomId(),
        createdAt: now,
        updatedAt: now,
      }));
      setSavingsBonds((bs) => [...stamped, ...bs]);
      return stamped.length;
    },
    [],
  );

  const replaceAllSavingsBonds: SavingsBondsContextValue['replaceAllSavingsBonds'] = useCallback(
    (rows) => {
      setSavingsBonds(rows);
    },
    [],
  );

  const clearAll = useCallback(() => setSavingsBonds([]), []);

  const value = useMemo<SavingsBondsContextValue>(
    () => ({
      savingsBonds,
      addSavingsBond,
      updateSavingsBond,
      deleteSavingsBond,
      deleteSavingsBonds,
      importSavingsBonds,
      replaceAllSavingsBonds,
      clearAll,
    }),
    [
      savingsBonds,
      addSavingsBond,
      updateSavingsBond,
      deleteSavingsBond,
      deleteSavingsBonds,
      importSavingsBonds,
      replaceAllSavingsBonds,
      clearAll,
    ],
  );

  return (
    <SavingsBondsContext.Provider value={value}>{children}</SavingsBondsContext.Provider>
  );
}

export function useSavingsBonds(): SavingsBondsContextValue {
  const ctx = useContext(SavingsBondsContext);
  if (!ctx) throw new Error('useSavingsBonds must be used within a SavingsBondsProvider');
  return ctx;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
