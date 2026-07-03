import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Holding, UserSettings } from './types';

const HOLDINGS_KEY = 'bnb.holdings.v1';
const SETTINGS_KEY = 'bnb.settings.v1';

const defaultSettings: UserSettings = {
  theme: 'light',
  hideMatured: true,
};

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultSettings;
}

function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY);
    if (raw) return JSON.parse(raw) as Holding[];
  } catch {
    /* ignore */
  }
  return [];
}

interface HoldingsContextValue {
  holdings: Holding[];
  settings: UserSettings;
  setSettings: (next: Partial<UserSettings>) => void;
  addHolding: (h: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => Holding;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  deleteHolding: (id: string) => void;
  importHoldings: (rows: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>[]) => number;
  replaceAllHoldings: (rows: Holding[]) => void;
  clearAll: () => void;
  resetSample: () => void;
  /** Export all holdings + settings as a JSON string for backup. */
  exportBackup: () => string;
  /** Restore holdings + settings from a JSON backup string. Returns true on success. */
  importBackup: (json: string) => boolean;
}

const HoldingsContext = createContext<HoldingsContextValue | null>(null);

export function HoldingsProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings());
  const [settings, setSettingsState] = useState<UserSettings>(() => loadSettings());

  useEffect(() => {
    try {
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
    } catch {
      /* quota / private mode */
    }
  }, [holdings]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const setSettings = useCallback((next: Partial<UserSettings>) => {
    setSettingsState((s) => ({ ...s, ...next }));
  }, []);

  const addHolding: HoldingsContextValue['addHolding'] = useCallback((h) => {
    const now = new Date().toISOString();
    const created: Holding = {
      ...h,
      id: cryptoRandomId(),
      createdAt: now,
      updatedAt: now,
    };
    setHoldings((hs) => [created, ...hs]);
    return created;
  }, []);

  const updateHolding: HoldingsContextValue['updateHolding'] = useCallback((id, patch) => {
    setHoldings((hs) =>
      hs.map((h) =>
        h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h,
      ),
    );
  }, []);

  const deleteHolding: HoldingsContextValue['deleteHolding'] = useCallback((id) => {
    setHoldings((hs) => hs.filter((h) => h.id !== id));
  }, []);

  const importHoldings: HoldingsContextValue['importHoldings'] = useCallback((rows) => {
    const now = new Date().toISOString();
    const stamped: Holding[] = rows.map((r) => ({
      ...r,
      id: cryptoRandomId(),
      createdAt: now,
      updatedAt: now,
    }));
    setHoldings((hs) => [...stamped, ...hs]);
    return stamped.length;
  }, []);

  const replaceAllHoldings: HoldingsContextValue['replaceAllHoldings'] = useCallback(
    (rows) => {
      setHoldings(rows);
    },
    [],
  );

  const clearAll = useCallback(() => setHoldings([]), []);

  const resetSample = useCallback(() => {
    try {
      localStorage.removeItem(HOLDINGS_KEY);
    } catch {
      /* ignore */
    }
    // Mark to allow sample-data seeder to run again.
    try {
      localStorage.removeItem('bnb.seeded.v1');
    } catch {
      /* ignore */
    }
    location.reload();
  }, []);

  const exportBackup = useCallback(() => {
    return JSON.stringify({ version: 1, holdings, settings }, null, 2);
  }, [holdings, settings]);

  const importBackup = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.holdings)) return false;
      setHoldings(parsed.holdings);
      if (parsed.settings) setSettingsState((s) => ({ ...s, ...parsed.settings }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<HoldingsContextValue>(
    () => ({
      holdings,
      settings,
      setSettings,
      addHolding,
      updateHolding,
      deleteHolding,
      importHoldings,
      replaceAllHoldings,
      clearAll,
      resetSample,
      exportBackup,
      importBackup,
    }),
    [
      holdings,
      settings,
      setSettings,
      addHolding,
      updateHolding,
      deleteHolding,
      importHoldings,
      replaceAllHoldings,
      clearAll,
      resetSample,
      exportBackup,
      importBackup,
    ],
  );

  return <HoldingsContext.Provider value={value}>{children}</HoldingsContext.Provider>;
}

export function useHoldings(): HoldingsContextValue {
  const ctx = useContext(HoldingsContext);
  if (!ctx) throw new Error('useHoldings must be used within a HoldingsProvider');
  return ctx;
}

function cryptoRandomId(): string {
  // crypto.randomUUID is widely available on modern browsers + GitHub Pages.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
