import { describe, it, expect } from 'vitest';
import { parseBackup, BACKUP_VERSION } from '../backup';

describe('BACKUP_VERSION', () => {
  it('is 2 (bumped from v1 to include savingsBonds)', () => {
    expect(BACKUP_VERSION).toBe(2);
  });
});

describe('parseBackup', () => {
  it('returns null for non-JSON input', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup('')).toBeNull();
    expect(parseBackup('{')).toBeNull();
  });

  it('returns null for JSON missing a holdings array', () => {
    expect(parseBackup('{}')).toBeNull();
    expect(parseBackup('{"version": 2}')).toBeNull();
    expect(parseBackup('{"holdings": "not an array"}')).toBeNull();
    expect(parseBackup('{"holdings": null}')).toBeNull();
  });

  it('parses a v2 backup with both holdings and savingsBonds', () => {
    const json = JSON.stringify({
      version: 2,
      holdings: [{ id: 'h1' }, { id: 'h2' }],
      savingsBonds: [{ id: 's1' }],
      settings: { theme: 'dark', hideMatured: false },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.holdings).toEqual([{ id: 'h1' }, { id: 'h2' }]);
    expect(result!.savingsBonds).toEqual([{ id: 's1' }]);
    expect(result!.settings).toEqual({ theme: 'dark', hideMatured: false });
  });

  it('parses a v1 backup WITHOUT a savingsBonds field (back-compat)', () => {
    // v1 backups predate the savingsBonds feature entirely — the field
    // is absent. parseBackup must NOT fabricate an empty array; the
    // key is omitted from the result so the restore path can detect
    // "field absent" and leave the user's current savingsBonds alone
    // instead of silently wiping them.
    const json = JSON.stringify({
      version: 1,
      holdings: [{ id: 'h1' }],
      settings: { theme: 'light', hideMatured: true },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.holdings).toEqual([{ id: 'h1' }]);
    expect(result!.savingsBonds).toBeUndefined();
    expect(result!.settings).toEqual({ theme: 'light', hideMatured: true });
  });

  it('parses a v2 backup WITHOUT a savingsBonds field as "absent" too', () => {
    // A hand-crafted v2 backup that omits savingsBonds exercises the
    // same fallback path as a v1 backup — the key is not invented by
    // the parser. The restore flow's "absent" check then preserves
    // the user's current savingsBonds.
    const json = JSON.stringify({
      version: 2,
      holdings: [],
      settings: { theme: 'light', hideMatured: true },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.savingsBonds).toBeUndefined();
  });

  it('parses a backup with no version field as v1', () => {
    const json = JSON.stringify({ holdings: [] });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.savingsBonds).toBeUndefined();
  });

  it('parses a v2 backup with empty arrays', () => {
    const json = JSON.stringify({
      version: 2,
      holdings: [],
      savingsBonds: [],
      settings: { theme: 'light', hideMatured: true },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.holdings).toEqual([]);
    expect(result!.savingsBonds).toEqual([]);
  });

  it('parses a v2 backup with savingsBonds but no settings (partial)', () => {
    const json = JSON.stringify({
      version: 2,
      holdings: [],
      savingsBonds: [{ id: 's1' }],
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.savingsBonds).toEqual([{ id: 's1' }]);
    expect(result!.settings).toBeUndefined();
  });

  it('ignores non-array savingsBonds gracefully (defensive)', () => {
    // A malformed value (string/object/null) is treated like an absent
    // field: the result has no `savingsBonds` key and the restore path
    // leaves the user's current savingsBonds alone.
    const json = JSON.stringify({
      version: 2,
      holdings: [],
      savingsBonds: 'not an array',
      settings: { theme: 'light', hideMatured: true },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.savingsBonds).toBeUndefined();
  });

  it('treats explicit null savingsBonds as absent (defensive)', () => {
    // A hand-edited v2 backup with `savingsBonds: null` is
    // functionally equivalent to omitting the field — both signal
    // "I have no opinion about savingsBonds" and the restore path
    // must leave the user's current state alone.
    const json = JSON.stringify({
      version: 2,
      holdings: [],
      savingsBonds: null,
      settings: { theme: 'light', hideMatured: true },
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.savingsBonds).toBeUndefined();
  });

  it('preserves unknown future versions on the result (forward-compat)', () => {
    const json = JSON.stringify({
      version: 99,
      holdings: [],
      savingsBonds: [],
      settings: {},
      futureField: 'something',
    });
    const result = parseBackup(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(99);
    // Extra fields are dropped, not part of the Backup interface.
  });

  it('round-trips a v2 export through parseBackup', () => {
    const exported = JSON.stringify(
      {
        version: BACKUP_VERSION,
        holdings: [{ id: 'h1' }],
        savingsBonds: [{ id: 's1' }, { id: 's2' }],
        settings: { theme: 'dark', hideMatured: true },
      },
      null,
      2,
    );
    const result = parseBackup(exported);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(BACKUP_VERSION);
    expect(result!.holdings).toEqual([{ id: 'h1' }]);
    expect(result!.savingsBonds).toEqual([{ id: 's1' }, { id: 's2' }]);
    expect(result!.settings).toEqual({ theme: 'dark', hideMatured: true });
  });
});
