import { useCallback } from 'react';
import { useHoldings } from './storage';
import { useSavingsBonds } from './savings-storage';
import type { Holding, SavingsBond, UserSettings } from './types';

/**
 * Bumped from v1 → v2 to add an optional `savingsBonds` field. A v2
 * backup is `{ version: 2, holdings, savingsBonds, settings }`. A v1
 * backup (`{ version: 1, holdings, settings }` with no `savingsBonds`
 * field) is still readable via `parseBackup` — the missing array
 * defaults to `[]` so the restore flow never crashes on old files.
 */
export const BACKUP_VERSION = 2;

export interface Backup {
  version: number;
  holdings: Holding[];
  /**
   * `savingsBonds` is INTENTIONALLY optional on the parsed result.
   * A v1 backup (pre-feature) does not have the field, and the
   * restore path treats an absent `savingsBonds` as "don't touch
   * the user's current state" rather than "wipe to empty". This
   * matters for the migration path: a user who has added savings
   * bonds since their last v1 backup will not silently lose them
   * when restoring that older backup.
   *
   * A v2 backup with `savingsBonds: []` (explicitly empty) DOES
   * trigger a wipe — the user has signaled the backup is canonical
   * for savingsBonds too.
   */
  savingsBonds?: SavingsBond[];
  /**
   * Optional. A v1 backup, a hand-edited file, or a partial restore
   * may omit `settings` entirely; the import path handles that case
   * by leaving the user's current settings untouched.
   */
  settings?: UserSettings;
}

/**
 * Pure parser: validate a JSON backup string and return its parsed
 * form, or `null` if the input is not a valid backup.
 *
 * - v1 backups (no `savingsBonds` field) parse WITHOUT a
 *   `savingsBonds` key on the result. The hook uses the presence
 *   of the key to decide whether to overwrite the user's current
 *   state (see `Backup.savingsBonds` JSDoc).
 * - Future versions with extra fields are tolerated by ignoring them;
 *   `version` is preserved on the result so callers can choose how to
 *   react if they care.
 *
 * Splitting this out of the hook keeps it testable without React.
 */
export function parseBackup(json: string): Backup | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.holdings)) return null;
    const result: Backup = {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      holdings: parsed.holdings,
    };
    // Only set `savingsBonds` when the JSON has the field AND it's a
    // valid array. Anything else (missing, null, non-array) is treated
    // as "field absent" so the caller can skip touching the user's
    // current state instead of clobbering it.
    if (Array.isArray(parsed.savingsBonds)) {
      result.savingsBonds = parsed.savingsBonds;
    }
    if (parsed.settings) {
      result.settings = parsed.settings;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Unified backup hook — reads from BOTH the HoldingsProvider
 * (holdings + settings) and the SavingsBondsProvider (savingsBonds),
 * so a single Restore covers both entities as the user requested.
 *
 * Export writes a v2 JSON file. Import accepts v1 (back-compat) and
 * v2; both shapes round-trip through the same `parseBackup` entry.
 */
export function useBackup() {
  const { holdings, settings, setSettings, replaceAllHoldings } = useHoldings();
  const { savingsBonds, replaceAllSavingsBonds } = useSavingsBonds();

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      { version: BACKUP_VERSION, holdings, savingsBonds, settings },
      null,
      2,
    );
  }, [holdings, savingsBonds, settings]);

  const importBackup = useCallback((json: string): boolean => {
    const parsed = parseBackup(json);
    if (!parsed) return false;
    // Holdings is always replaced — the "Restore" action is a full
    // snapshot swap for the primary entity. SavingsBonds is only
    // replaced when the backup explicitly carries the field, so a
    // pre-feature v1 backup doesn't silently wipe savingsBonds the
    // user has added since (see Backup.savingsBonds JSDoc). Settings
    // is a partial merge so a missing/incomplete settings object
    // can't drop unrelated prefs (e.g. `hideMatured`).
    replaceAllHoldings(parsed.holdings);
    if (parsed.savingsBonds) {
      replaceAllSavingsBonds(parsed.savingsBonds);
    }
    if (parsed.settings) setSettings(parsed.settings);
    return true;
  }, [replaceAllHoldings, replaceAllSavingsBonds, setSettings]);

  return { exportBackup, importBackup, version: BACKUP_VERSION };
}

