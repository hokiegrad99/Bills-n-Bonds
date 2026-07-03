import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FilePlus2, FileUp, Search, Trash2, Upload, Save } from 'lucide-react';
import { useHoldings } from '../lib/storage';
import { useBackup } from '../lib/backup';
import type { Holding, SecurityType } from '../lib/types';
import { SECURITY_TYPES } from '../lib/types';
import { HoldingForm } from '../components/holdings/HoldingForm';
import { HoldingsTable } from '../components/holdings/HoldingsTable';
import { ImportDialog } from '../components/holdings/ImportDialog';
import { Modal } from '../components/ui/Modal';
import { ToggleRow } from '../components/ui/ToggleRow';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { effectiveStatus } from '../lib/calc';
import { holdingsToCSV } from '../lib/csv';
import { useToast } from '../components/ui/Toast';

export function HoldingsPage() {
  const {
    holdings,
    settings,
    setSettings,
    addHolding,
    updateHolding,
    deleteHolding,
    importHoldings,
  } = useHoldings();
  // Backup I/O now spans BOTH holdings and savingsBonds (v2 backup
  // format). The hook is the single source of truth for export/import.
  const { exportBackup, importBackup } = useBackup();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Holding | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Holding | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SecurityType | 'all'>('all');

  // Deep-link support: when the URL carries ?id=<holdingId>, open the
  // edit modal for that holding on mount or whenever the id changes.
  // This is how the Dashboard "Recent Activity" card links to the
  // matching row on this page; a stale id (e.g. holding was deleted)
  // is silently cleared instead of crashing.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('id');

  const clearFocusId = useCallback(() => {
    if (!searchParams.get('id')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!focusId) return;
    const match = holdings.find((h) => h.id === focusId);
    if (match) {
      setEditing(match);
      setShowForm(true);
    } else {
      // Holding no longer exists — drop the stale id so the URL stays clean.
      clearFocusId();
    }
  }, [focusId, holdings, clearFocusId]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    clearFocusId();
  }, [clearFocusId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holdings.filter((h) => {
      if (settings.hideMatured && effectiveStatus(h) === 'Matured') return false;
      if (typeFilter !== 'all' && h.securityType !== typeFilter) return false;
      if (!q) return true;
      return (
        h.institution.toLowerCase().includes(q) ||
        (h.cusip ?? '').toLowerCase().includes(q) ||
        h.securityType.toLowerCase().includes(q) ||
        (h.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [holdings, settings.hideMatured, search, typeFilter]);

  function exportCSV() {
    const csv = holdingsToCSV(holdings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnb-holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportBackup() {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }  function handleImportBackup() {
    // Confirm copy mentions savingsBonds explicitly so the user
    // understands the full scope of a restore. v1 backups (no
    // savingsBonds field) will not touch the user's current
    // savingsBonds; v2 backups (field present) will replace them
    // with the backup's snapshot. See `useBackup.importBackup`.
    // A fresh install (no holdings) skips the confirm since there's
    // nothing to lose — the file picker opens immediately.
    if (
      holdings.length > 0 &&
      !window.confirm(
        'Restoring a backup will replace all current holdings, plus any savings bonds the backup contains. Continue?',
      )
    ) {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = importBackup(String(reader.result));
        if (ok) {
          toast('Portfolio restored from backup', 'success');
        } else {
          toast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <div className="space-y-4">
      <Card
        accent="brand"
        eyebrow="Holdings"
        title={`${visible.length} of ${holdings.length} shown`}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setShowImport(true)}>
              <FileUp size={14} /> Import CSV
            </button>
            <button className="btn-secondary" onClick={exportCSV} disabled={!holdings.length}>
              <Download size={14} /> Export CSV
            </button>
            <button className="btn-secondary" onClick={handleExportBackup} disabled={!holdings.length} title="Download full backup (JSON)">
              <Save size={14} /> Backup
            </button>
            <button className="btn-secondary" onClick={handleImportBackup} title="Restore from JSON backup">
              <Upload size={14} /> Restore
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <FilePlus2 size={14} /> Add holding
            </button>
          </div>
        }
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                className="input pl-7"
                placeholder="Search institution, CUSIP, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="select w-40"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as SecurityType | 'all')}
            >
              <option value="all">All types</option>
              {SECURITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end">
            <ToggleRow
              label="Hide matured holdings"
              description="Matured rows stay in your data; they're just hidden from this view."
              checked={settings.hideMatured}
              onChange={(v) => setSettings({ hideMatured: v })}
            />
          </div>
        </div>
      </Card>

      <Card accent="accent" eyebrow="Table" title="My Securities" bodyClassName="p-0">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FilePlus2 size={20} />}
              title={holdings.length === 0 ? 'No holdings yet' : 'No rows match your filters'}
              description={
                holdings.length === 0
                  ? 'Add your first Treasury or CD to get started, or import from a CSV.'
                  : 'Try a different search or clear the type filter.'
              }
              action={
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                  Add holding
                </button>
              }
            />
          </div>
        ) : (
          <HoldingsTable
            holdings={visible}
            onEdit={(h) => { setEditing(h); setShowForm(true); }}
            onDelete={(h) => setConfirmDelete(h)}
          />
        )}
      </Card>

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editing ? 'Edit holding' : 'Add a new holding'}
        size="lg"
      >
        <HoldingForm
          initial={editing ?? undefined}
          onCancel={closeForm}
          onSubmit={(h) => {
            if (editing) {
              updateHolding(editing.id, h);
              toast('Holding updated', 'success');
            } else {
              addHolding(h);
              toast('Holding added', 'success');
            }
            closeForm();
          }}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this holding?"
        size="sm"
      >
        {confirmDelete && (
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3">
            <div>
              You're about to permanently delete this{' '}
              <strong>{confirmDelete.securityType}</strong> holding at{' '}
              <strong>{confirmDelete.institution}</strong> with face value{' '}
              <strong>${confirmDelete.faceValue.toLocaleString()}</strong>.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  deleteHolding(confirmDelete.id);
                  setConfirmDelete(null);
                  toast('Holding deleted', 'info');
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={(rows) => {
          const count = importHoldings(rows);
          toast(`Imported ${count} holding${count === 1 ? '' : 's'}`, 'success');
          return count;
        }}
      />
    </div>
  );
}
